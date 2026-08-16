/**
 * dsh-cot-summerization — DeepSeek Harness bundle: hide the model's raw
 * chain of thought and display a summary produced by a small model.
 *
 * The plugin wraps the `llm/stream` waterfall. Raw reasoning deltas are
 * swallowed (they never reach the session log chunks, the landed transcript
 * message, or the UI). While the raw chain of thought streams, the collected
 * reasoning is summarized segment by segment — trigger points prefer sentence
 * boundaries and are throttled by character volume and elapsed time. Each partial
 * call summarizes ONLY the newly arrived reasoning segment (the previous summary
 * is passed as continuity context but never needs to be reproduced), so the
 * replacement reasoning block grows reliably as segments land; a final call
 * covers whatever tail remains when the reasoning completes. Completed
 * segments are pushed to the frontend as they land; with `typewriter` on
 * they are revealed one character at a time instead (the single serial
 * stream then paces the reply and the landing behind the reveal). The Web
 * Client renders the result as the usual "Think" disclosure row. Settings
 * surface in the Web Client settings page under the `cot-summarizer`
 * namespace.
 *
 * Reasoning models replay their prior reasoning on tool-call turns, so a
 * summarized history would degrade multi-step reasoning. When
 * `preserveRawForModel` is on (default), the raw chain of thought is restored
 * on the MODEL-VISIBLE session surface after the loop's summary message
 * lands — a replacement `assistant/message` event that shadows the summary
 * node for the model while the append-origin transcript (and the UI) keeps
 * showing the summary. See `./history.ts`.
 * @module dsh-cot-summerization
 */
import { BlockAssembler, isAgentLoopRequest } from '@deepseek-ai/dsh-llm';
import { Config, COT_SUMMARIZER_SETTINGS_NAMESPACE, resolveConfig, } from "./config.js";
import { summarizeCoT } from "./summarize.js";
import { AdaptiveChunkController } from "./adaptive.js";
import { installCotSummarizerWeb } from "./web.js";
import { createRawCapture, createRawHistoryRestorer } from "./history.js";
export { createRawCapture, createRawHistoryRestorer, restoreRawAssistantMessage, } from "./history.js";
export const name = 'dsh-cot-summerization';
export { Config };
export const inject = ['settings', 'llm'];
/** Placeholder reasoning text shown when summarization fails under `hide`. */
export const UNAVAILABLE_PLACEHOLDER = '[CoT summary unavailable]';
/** Reasoning text ending a sentence punctuation or a newline is a natural split point. */
const SENTENCE_END = /[.?!。！？…]$/;
function endsAtBoundary(text) {
    if (text.endsWith('\n'))
        return true;
    const trimmed = text.trimEnd();
    if (trimmed === '')
        return false;
    return SENTENCE_END.test(trimmed);
}
/**
 * Split text into sentence-ish units, keeping the boundary. Tilde and
 * "喵~" style fillers count as boundaries (summaries from custom styles may
 * end clauses with 喵~ instead of punctuation).
 */
function splitSentences(text) {
    return text.split(/(?<=[。！？!?…\n~～])/);
}
/** Normalize a sentence for duplicate comparison: strip whitespace and filler. */
function normalizeSentence(sentence) {
    return sentence.replace(/[\s喵~〜～]+/g, '').toLowerCase();
}
/** Bigram-overlap similarity in [0, 1] between two normalized sentences. */
function sentenceSimilarity(a, b) {
    if (a === b)
        return 1;
    const bigrams = (s) => {
        const out = new Set();
        for (let i = 0; i < s.length - 1; i++)
            out.add(s.slice(i, i + 2));
        return out;
    };
    const A = bigrams(a);
    const B = bigrams(b);
    if (A.size === 0 || B.size === 0)
        return 0;
    let common = 0;
    for (const gram of A)
        if (B.has(gram))
            common += 1;
    return (2 * common) / (A.size + B.size);
}
/**
 * Length of the longest common substring of two normalized sentences. A
 * restatement often keeps one contiguous core ("永远凑不齐，故无有限步保证")
 * while varying the prefix, which bigram similarity waters down.
 */
function longestCommonSubstring(a, b) {
    let best = 0;
    const row = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
        let prev = 0;
        for (let j = 1; j <= b.length; j++) {
            const current = row[j];
            if (a[i - 1] === b[j - 1]) {
                row[j] = prev + 1;
                if (row[j] > best)
                    best = row[j];
            }
            else {
                row[j] = 0;
            }
            prev = current;
        }
    }
    return best;
}
/**
 * Drop sentences from a segment result that already appear (verbatim or
 * near-verbatim) in the emitted summary — segment calls tend to restate the
 * running conclusion, which reads as duplication. Short fragments pass
 * through untouched.
 */
function dedupeSentences(result, emitted) {
    if (emitted === '')
        return result;
    const existing = splitSentences(emitted)
        .map(normalizeSentence)
        .filter((s) => s.length >= 8);
    if (existing.length === 0)
        return result;
    const kept = [];
    for (const part of splitSentences(result)) {
        const norm = normalizeSentence(part);
        if (norm.length < 8) {
            kept.push(part);
            continue;
        }
        const duplicate = existing.some((s) => (sentenceSimilarity(s, norm) >= 0.65 || longestCommonSubstring(s, norm) >= 12));
        if (!duplicate)
            kept.push(part);
    }
    return kept.join('');
}
/** Wait `ms` milliseconds; the pacing delay of the optional typewriter. */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Atomic character queue for typewriter emission. Completed summary segments
 * are appended whole; the emitter pops one code point at a time from the head
 * (`for...of` iterates by code point, so surrogate pairs — emoji — stay
 * whole). Push and pop are only ever invoked from the single transform
 * generator thread, so the operations cannot interleave and need no locking.
 */
class CharQueue {
    chars = [];
    head = 0;
    get empty() {
        return this.head >= this.chars.length;
    }
    /** Append a whole segment to the tail. */
    push(segment) {
        if (segment === '')
            return;
        // Compact once the consumed prefix grows: keeps memory bounded to the
        // un-emitted text plus one segment.
        if (this.head > 4096) {
            this.chars = this.chars.slice(this.head);
            this.head = 0;
        }
        for (const char of segment)
            this.chars.push(char);
    }
    /** Pop the first un-emitted code point, or undefined when empty. */
    pop() {
        if (this.empty)
            return undefined;
        const char = this.chars[this.head];
        this.head += 1;
        return char;
    }
    /** Pop the whole remaining content as one string (non-typewriter mode). */
    drainAll() {
        if (this.empty)
            return '';
        const text = this.chars.slice(this.head).join('');
        this.chars = [];
        this.head = 0;
        return text;
    }
}
/**
 * Wrap one model stream: swallow every reasoning chunk, stream everything
 * else untouched, and emit the summarized reasoning in place of the raw
 * chain of thought.
 *
 * The replacement reasoning block reuses the index of the first raw
 * reasoning block, and its content grows segment by segment as partial
 * summaries land — the block-start is emitted with the first partial, so
 * the assembled message keeps the summary above the reply text. Completed
 * segments are queued and pushed to the frontend as they land — whole, or
 * one character per `typewriterIntervalMs` when `typewriter` is on (the
 * serial stream then paces everything downstream, see `drainQueue`). The
 * transform is index-safe for the session log's `BlockAssembler`: forwarded
 * blocks keep their indices verbatim, and the summary block never collides
 * with them because the raw reasoning index is freed by swallowing.
 *
 * When `capture` is supplied, the raw reasoning (per upstream block) and the
 * finish chunk's replay state are recorded into it, so the raw chain of
 * thought can later be restored on the model-visible session surface while
 * the UI keeps the summary — see `./history.ts`.
 * @param upstream - the inner stream from `next()`.
 * @param cfg - resolved configuration captured at listener invocation.
 * @param summarize - summarizer call, injectable for tests.
 * @param callerSignal - the model call's abort signal, when present.
 * @param log - warning sink for transform-level failures.
 * @param capture - raw-reasoning recorder for surface restoration, when tracked.
 * @param now - clock injectable for deterministic tests; defaults to `Date.now`.
 */
export async function* transformCoTStream(upstream, cfg, summarize, callerSignal, log = () => { }, capture = undefined, now = Date.now) {
    let rawCoT = '';
    let sawReasoning = false;
    let reasoningDone = false;
    let summaryIndex = -1;
    let summaryStarted = false;
    let summaryClosed = false;
    let rawShown = false;
    let emitted = '';
    /** Completed segments awaiting emission; drained whole or per character. */
    const queue = new CharQueue();
    /** Raw length already handed to a summarizer call; the next segment starts here. */
    let lastSegmentStart = 0;
    let lastTriggerAt = now();
    let pending;
    let pendingSettled = false;
    let pendingError = null;
    /** When the in-flight summarizer call started, for RTT measurement. */
    let pendingStartedAt = 0;
    /** The raw segment handed to the in-flight call, for echo detection. */
    let pendingSegment = '';
    /** Adaptive chunk controller; only present when the feature is enabled. */
    const adaptive = cfg.adaptiveChunk
        ? new AdaptiveChunkController({
            baseChunkChars: cfg.chunkChars,
            minChunkChars: cfg.minChunkChars,
            maxChunkChars: cfg.maxChunkChars,
            safetyFactor: cfg.chunkSafetyFactor,
        })
        : undefined;
    /**
     * Assembly over the UNTOUCHED upstream stream — the wire-exact blocks the
     * adapter produced. The replacement message for the model-visible surface
     * is rebuilt from these (the emitted stream reorders blocks, and adapters
     * validate replay state against the wire order).
     */
    const rawAssembler = new BlockAssembler();
    /** The index the replacement block occupies: the first raw reasoning block's. */
    const blockIndex = () => (summaryIndex === -1 ? 0 : summaryIndex);
    /**
     * Start one summarizer call over the raw segment accumulated since the
     * last call. The call runs concurrently with the upstream stream (never
     * paused); its result is folded into the block at the next chunk boundary
     * once it settles.
     */
    const fire = () => {
        const segment = rawCoT.slice(lastSegmentStart);
        lastSegmentStart = rawCoT.length;
        const at = now();
        lastTriggerAt = at;
        pendingStartedAt = at;
        pendingError = null;
        pendingSettled = false;
        pendingSegment = segment;
        pending = summarize(segment, cfg, callerSignal, emitted === '' ? undefined : { previousSummary: emitted })
            .then((result) => {
            pendingSettled = true;
            return result;
        }, (error) => {
            pendingSettled = true;
            pendingError = error;
            return '';
        });
    };
    /**
     * Append a text tail to the replacement reasoning block. The text lands in
     * the queue and in `emitted` (dedup continuity and the block-end payload use
     * the full string) but is pushed to the frontend only by {@link drainQueue}.
     */
    function enqueue(tail) {
        if (tail === '')
            return;
        emitted += tail;
        queue.push(tail);
    }
    /**
     * Push the queued summary text to the frontend. With the typewriter off, the
     * whole queued content goes out as a single `reasoning-delta` (identical to
     * the pre-typewriter emission); with it on, one code point per
     * `typewriterIntervalMs` so the Think row reveals the summary character by
     * character. The block opens lazily with its first character. Because the
     * transform yields on a single serial stream, pacing blocks the reply text,
     * the finish chunk, and the landed message behind the reveal — the
     * documented trade-off of the typewriter.
     */
    async function* drainQueue() {
        if (queue.empty)
            return;
        if (!cfg.typewriter) {
            if (!summaryStarted) {
                summaryStarted = true;
                yield { type: 'block-start', index: blockIndex(), blockType: 'reasoning' };
            }
            const text = queue.drainAll();
            yield { type: 'reasoning-delta', index: blockIndex(), text };
            return;
        }
        while (!queue.empty) {
            // An aborted call is being torn down; the consumer stops pulling right
            // after the next chunk, so stop emitting rather than pace the tail.
            if (callerSignal?.aborted === true)
                return;
            const char = queue.pop();
            if (char === undefined)
                return;
            if (!summaryStarted) {
                summaryStarted = true;
                yield { type: 'block-start', index: blockIndex(), blockType: 'reasoning' };
            }
            if (cfg.typewriterIntervalMs > 0)
                await sleep(cfg.typewriterIntervalMs);
            yield { type: 'reasoning-delta', index: blockIndex(), text: char };
        }
    }
    /** Show the raw reasoning verbatim in its own Think row (short input / pass-through). */
    function* emitRawReasoning(text) {
        if (summaryStarted)
            return;
        const index = blockIndex();
        rawShown = true;
        yield { type: 'block-start', index, blockType: 'reasoning' };
        yield { type: 'reasoning-delta', index, text };
        yield { type: 'block-end', index, block: { type: 'reasoning', text } };
    }
    /**
     * Fold the in-flight call's result into the stream: each segment summary
     * is appended to the emission queue (segments never depend on each other,
     * so a rewritten or failed segment cannot stall the stream), with
     * sentences that repeat the already-emitted summary dropped. Blocks only
     * while the call is still running (callers invoke it after the call
     * settled, or at the terminal finish where blocking is unavoidable).
     * Failures are logged and skipped; the end-of-stream fallback policy
     * lives in the finish handler.
     */
    async function* foldPending() {
        if (pending === undefined)
            return;
        const result = await pending;
        adaptive?.recordRtt(now() - pendingStartedAt);
        const error = pendingError;
        const segment = pendingSegment;
        pending = undefined;
        pendingSettled = false;
        if (error !== null) {
            log('cot-summarizer: %s', error instanceof Error ? error.message : String(error));
            return;
        }
        // Echo guard: a summarizer that returns the raw segment (near-verbatim)
        // instead of summarizing would leak the hidden reasoning into the block.
        if (segment.length >= 200) {
            const normResult = normalizeSentence(result);
            const normSegment = normalizeSentence(segment);
            if (sentenceSimilarity(normSegment, normResult) >= 0.85
                || longestCommonSubstring(normSegment, normResult) >= 40) {
                log('cot-summarizer: dropped a summary that echoes the raw reasoning');
                return;
            }
        }
        const deduped = dedupeSentences(result, emitted);
        if (deduped !== '')
            enqueue(deduped);
    }
    /** Current volume threshold: configured chunk size, or the adaptive estimate. */
    const currentChunkChars = () => adaptive?.currentChunkChars() ?? cfg.chunkChars;
    /** Decide whether another segment call is due, given the raw text just grew. */
    const maybeFirePartial = () => {
        if (pending !== undefined || !cfg.incremental)
            return;
        const since = rawCoT.length - lastSegmentStart;
        if (since < cfg.minReasoningChars)
            return;
        const elapsed = now() - lastTriggerAt;
        const byVolume = since >= currentChunkChars() && endsAtBoundary(rawCoT);
        const byTime = elapsed >= cfg.chunkIntervalMs
            && since >= Math.max(cfg.minReasoningChars, 64)
            && (endsAtBoundary(rawCoT) || elapsed >= cfg.chunkIntervalMs * 2);
        if (byVolume || byTime)
            fire();
    };
    /** Whether an un-summarized tail of the raw reasoning is still pending. */
    const hasUnsummarizedTail = () => !rawShown && rawCoT.trim().length >= cfg.minReasoningChars && rawCoT.length > lastSegmentStart;
    for await (const chunk of upstream) {
        // Every upstream chunk — including the swallowed reasoning — feeds the
        // wire-exact assembly the surface restoration replays.
        rawAssembler.push(chunk);
        // A settled summarizer call is folded at the next chunk boundary so the
        // upstream stream is never paused for it (concurrency stays at one).
        if (pendingSettled) {
            yield* foldPending();
            // The reasoning phase ended while the call was in flight: the remaining
            // tail is handed to the next call now that the slot is free.
            if (reasoningDone && pending === undefined && hasUnsummarizedTail())
                fire();
        }
        // Completed segments go out here — whole (typewriter off) or one code
        // point per interval (typewriter on). Queued text always precedes the
        // current upstream chunk, so the summary block keeps opening before the
        // reply.
        yield* drainQueue();
        switch (chunk.type) {
            case 'block-start': {
                if (chunk.blockType === 'reasoning') {
                    sawReasoning = true;
                    if (capture !== undefined)
                        capture.sawReasoning = true;
                    if (summaryIndex === -1)
                        summaryIndex = chunk.index;
                    continue;
                }
                yield chunk;
                continue;
            }
            case 'reasoning-delta': {
                sawReasoning = true;
                if (capture !== undefined)
                    capture.sawReasoning = true;
                rawCoT += chunk.text;
                adaptive?.recordDelta(chunk.text.length, now());
                maybeFirePartial();
                continue;
            }
            case 'block-end': {
                if (chunk.block.type === 'reasoning') {
                    sawReasoning = true;
                    if (capture !== undefined)
                        capture.sawReasoning = true;
                    if (!reasoningDone) {
                        reasoningDone = true;
                        const trimmed = rawCoT.trim();
                        if (trimmed === '') {
                            // nothing to summarize
                        }
                        else if (trimmed.length < cfg.minReasoningChars) {
                            yield* emitRawReasoning(trimmed);
                        }
                        else if (pending === undefined && hasUnsummarizedTail()) {
                            // Reasoning complete: one final call covers the remaining tail
                            // while the reply streams (folded at a later boundary, so the
                            // reply is never delayed).
                            fire();
                        }
                    }
                    continue;
                }
                yield chunk;
                continue;
            }
            case 'text-delta':
            case 'tool-call-delta':
            case 'usage': {
                yield chunk;
                continue;
            }
            case 'finish': {
                if (capture !== undefined) {
                    capture.replayState = chunk.replayState;
                    capture.rawBlocks = rawAssembler.blocks();
                }
                if (!sawReasoning) {
                    yield chunk;
                    return;
                }
                const aborted = callerSignal?.aborted === true;
                if (!aborted) {
                    if (pending !== undefined)
                        yield* foldPending();
                    const trimmed = rawCoT.trim();
                    if (hasUnsummarizedTail()) {
                        // The reasoning never closed (an error finish) or a tail remained:
                        // run the final segment call now.
                        fire();
                        yield* foldPending();
                    }
                    if (emitted === '' && !rawShown && trimmed.length >= cfg.minReasoningChars) {
                        // Every summarizer call failed and nothing was shown yet: apply
                        // the configured failure policy.
                        if (cfg.onError === 'pass-through') {
                            yield* emitRawReasoning(trimmed);
                        }
                        else {
                            enqueue(UNAVAILABLE_PLACEHOLDER);
                        }
                    }
                    // The queue must be empty before the block closes: with the
                    // typewriter on this paces the reveal here and therefore delays the
                    // finish chunk (and the landed message) — the documented trade-off.
                    yield* drainQueue();
                }
                if (summaryStarted && !summaryClosed) {
                    summaryClosed = true;
                    yield { type: 'block-end', index: blockIndex(), block: { type: 'reasoning', text: emitted } };
                }
                // The stream was rewritten (raw reasoning swallowed): even the
                // verbatim re-emissions re-open the reasoning block at block-end or
                // finish time — AFTER later blocks already opened, so the loop's
                // first-seen assembly can reorder blocks against the adapter's wire.
                // Adapters validate replay state against the wire ("block N does not
                // match assistant content"), so the finish NEVER carries it here; the
                // captured state travels exclusively on the surface-restored message,
                // whose content is the wire-exact upstream assembly.
                const { replayState: _replayState, ...finishWithoutReplay } = chunk;
                yield finishWithoutReplay;
                return;
            }
        }
    }
    // A stream that ended without a finish chunk still assembled raw content
    // the loop may land as a message.
    if (capture !== undefined && capture.rawBlocks === undefined)
        capture.rawBlocks = rawAssembler.blocks();
}
/** Plugin entry: register settings, then wrap every streaming model call. */
export function apply(ctx, config = {}) {
    const scope = ctx.settings.register(COT_SUMMARIZER_SETTINGS_NAMESPACE, Config, {
        base: config,
        applies: 'live',
        validate: (value) => {
            resolveConfig(value);
        },
    });
    installCotSummarizerWeb(ctx, scope);
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
    // Raw-history restoration: loop-built requests carry a sessionId, and their
    // landed summary messages get a model-only surface replacement carrying the
    // raw chain of thought (the UI transcript is unaffected).
    const restorer = createRawHistoryRestorer((message, ...args) => {
        ctx.logger.warn(message, ...args);
    });
    const sessionListener = ctx.on('session/event', (session, event) => {
        restorer.handleSessionEvent(session, event);
    });
    const disposeListener = ctx.on('session/disposed', (session) => {
        restorer.forget(String(session.id));
    });
    const listener = ctx.on('llm/stream', async function* (options, next) {
        // Only agent-loop requests land in a session transcript; other llm/stream
        // callers (session titles, compaction, one-shots) never render a Think
        // row, may run concurrently with the loop's own call on the SAME session
        // id (a title call would overwrite the loop's tracker and silently skip
        // restoration), and pay a pointless summarizer round trip.
        if (!cfg.enabled || !isAgentLoopRequest(options)) {
            yield* next();
            return;
        }
        let capture;
        if (cfg.preserveRawForModel && options.sessionId !== undefined) {
            capture = createRawCapture();
            restorer.track(String(options.sessionId), capture);
        }
        // Route the summarizer through DSH's own LLM channel. The provider/model
        // come from the plugin settings when set, otherwise they follow the
        // intercepted request's provider/model — so credentials and provider
        // configuration stay unified with DSH, and other plugins see the call.
        const summarize = (raw, resolvedCfg, signal, summarizeOptions) => {
            const provider = resolvedCfg.provider !== '' ? resolvedCfg.provider : options.provider;
            const model = resolvedCfg.model !== '' ? resolvedCfg.model : options.model;
            return summarizeCoT(raw, resolvedCfg, ctx.llm, provider, model, signal, summarizeOptions);
        };
        yield* transformCoTStream(next(), cfg, summarize, options.signal, (message, ...args) => {
            ctx.logger.warn(message, ...args);
        }, capture);
    });
    return () => {
        watch();
        listener();
        sessionListener();
        disposeListener();
    };
}
