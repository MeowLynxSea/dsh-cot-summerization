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
import type { Context } from '@deepseek-ai/cordis';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import { Config, type CotSummarizerConfig, type ResolvedCotSummarizerConfig } from './config.ts';
export declare const name = "dsh-cot-summerization";
export { Config };
export declare const inject: string[];
/** Placeholder reasoning text shown when summarization fails under `hide`. */
export declare const UNAVAILABLE_PLACEHOLDER = "[CoT summary unavailable]";
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
export declare function transformCoTStream(upstream: AsyncIterable<StreamChunk>, cfg: ResolvedCotSummarizerConfig, summarize: (raw: string, cfg: ResolvedCotSummarizerConfig, signal: AbortSignal | undefined) => Promise<string>, callerSignal: AbortSignal | undefined, log?: (message: string, ...args: unknown[]) => void): AsyncGenerator<StreamChunk>;
/** Plugin entry: register settings, then wrap every streaming model call. */
export declare function apply(ctx: Context, config?: CotSummarizerConfig): () => void;
