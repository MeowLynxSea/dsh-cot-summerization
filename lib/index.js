/**
 * dsh-cot-summerization — DeepSeek Harness bundle: hide the model's raw
 * chain of thought and display a summary produced by a small model.
 *
 * The plugin wraps the `llm/stream` waterfall. Raw reasoning deltas are
 * swallowed (they never reach the session log, the model history, or the
 * UI); when the stream finishes, the collected reasoning is summarized
 * through the configured Chat Completions endpoint and emitted as a single
 * replacement reasoning block. The Web Client renders it as the usual
 * "Think" disclosure row. Settings surface in the Web Client settings page
 * under the `cot-summarizer` namespace.
 * @module dsh-cot-summerization
 */
import { writeFileSync } from 'node:fs';
import { Config, COT_SUMMARIZER_SETTINGS_NAMESPACE, resolveConfig, } from "./config.js";
import { SummarizeError, summarizeCoT } from "./summarize.js";
export const name = 'dsh-cot-summerization';
export { Config };
export const inject = ['settings'];
/** Placeholder reasoning text shown when summarization fails under `hide`. */
export const UNAVAILABLE_PLACEHOLDER = '[CoT summary unavailable]';
/** Build the replacement reasoning block triplet for one index. */
function reasoningBlocks(index, text) {
    return [
        { type: 'block-start', index, blockType: 'reasoning' },
        { type: 'reasoning-delta', index, text },
        { type: 'block-end', index, block: { type: 'reasoning', text } },
    ];
}
/**
 * Decide what reasoning text to publish for the collected raw chain of
 * thought: the summary, the raw text (short input or pass-through mode), or
 * the unavailable placeholder.
 */
async function replacementReasoning(rawCoT, cfg, summarize, callerSignal, log) {
    const trimmed = rawCoT.trim();
    if (trimmed === '')
        return undefined;
    if (callerSignal?.aborted === true)
        return undefined;
    if (trimmed.length < cfg.minReasoningChars)
        return trimmed;
    try {
        return await summarize(trimmed, cfg, callerSignal);
    }
    catch (error) {
        if (error instanceof SummarizeError || error instanceof Error) {
            log('cot-summarizer: %s', error.message);
        }
        else {
            log('cot-summarizer: unknown summarizer failure: %s', String(error));
        }
        if (cfg.onError === 'pass-through')
            return trimmed;
        return UNAVAILABLE_PLACEHOLDER;
    }
}
/**
 * Wrap one model stream: swallow every reasoning chunk, stream everything
 * else untouched, and emit the summarized reasoning right before `finish`.
 *
 * The transform is index-safe for the session log's `BlockAssembler`: the
 * upstream indices of forwarded blocks are preserved verbatim, and the
 * replacement block gets a fresh index above the highest seen one, so the
 * assembled message keeps the original block order with the summarized
 * reasoning in place of the raw reasoning.
 * @param upstream - the inner stream from `next()`.
 * @param cfg - resolved configuration captured at listener invocation.
 * @param summarize - summarizer call, injectable for tests.
 * @param callerSignal - the model call's abort signal, when present.
 */
export async function* transformCoTStream(upstream, cfg, summarize, callerSignal, log = () => { }) {
    let rawCoT = '';
    let sawReasoning = false;
    let maxIndex = -1;
    for await (const chunk of upstream) {
        switch (chunk.type) {
            case 'block-start': {
                if (chunk.blockType === 'reasoning') {
                    sawReasoning = true;
                    continue;
                }
                maxIndex = Math.max(maxIndex, chunk.index);
                yield chunk;
                continue;
            }
            case 'reasoning-delta': {
                sawReasoning = true;
                rawCoT += chunk.text;
                continue;
            }
            case 'block-end': {
                if (chunk.block.type === 'reasoning') {
                    sawReasoning = true;
                    continue;
                }
                maxIndex = Math.max(maxIndex, chunk.index);
                yield chunk;
                continue;
            }
            case 'text-delta':
            case 'tool-call-delta': {
                maxIndex = Math.max(maxIndex, chunk.index);
                yield chunk;
                continue;
            }
            case 'usage': {
                yield chunk;
                continue;
            }
            case 'finish': {
                if (sawReasoning) {
                    const replacement = await replacementReasoning(rawCoT, cfg, summarize, callerSignal, log);
                    if (replacement !== undefined) {
                        yield* reasoningBlocks(maxIndex + 1, replacement);
                    }
                }
                yield chunk;
                return;
            }
        }
    }
}
/** Plugin entry: register settings, then wrap every streaming model call. */
export function apply(ctx, config = {}) {
    try {
        writeFileSync('/tmp/cot-host-applied.txt', new Date().toISOString(), 'utf8');
    }
    catch {
        // diagnostics only
    }
    ctx.logger.warn('cot-summarizer: host plugin apply (config %o)', config);
    const scope = ctx.settings.register(COT_SUMMARIZER_SETTINGS_NAMESPACE, Config, {
        base: config,
        applies: 'live',
        validate: (value) => {
            resolveConfig(value);
        },
    });
    let cfg = resolveConfig(scope.get());
    const watch = scope.watch((next) => {
        try {
            cfg = resolveConfig(next);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            ctx.logger.warn('cot-summarizer: keeping the previous generation after a refused Settings change. %s', message);
        }
    });
    const listener = ctx.on('llm/stream', async function* (options, next) {
        if (!cfg.enabled) {
            yield* next();
            return;
        }
        yield* transformCoTStream(next(), cfg, summarizeCoT, options.signal, (message, ...args) => {
            ctx.logger.warn(message, ...args);
        });
    });
    return () => {
        watch();
        listener();
    };
}
