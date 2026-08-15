/**
 * dsh-cot-summerization — DeepSeek Harness bundle: hide the model's raw
 * chain of thought and display a summary produced by a small model.
 *
 * The plugin wraps the `llm/stream` waterfall. Raw reasoning deltas are
 * swallowed (they never reach the session log, the model history, or the
 * UI). While the raw chain of thought streams, the collected reasoning is
 * summarized in natural chunks — trigger points prefer sentence boundaries
 * and are throttled by character volume and elapsed time. Each partial call
 * re-summarizes everything seen so far and must keep its previous partial
 * summary verbatim as a prefix, so the replacement reasoning block grows
 * smoothly instead of jumping; a final call on the completed reasoning
 * closes it. The Web Client renders the result as the usual "Think"
 * disclosure row. Settings surface in the Web Client settings page under
 * the `cot-summarizer` namespace.
 * @module dsh-cot-summerization
 */
import type { Context } from '@deepseek-ai/cordis';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import { Config, type CotSummarizerConfig, type ResolvedCotSummarizerConfig } from './config.ts';
import { type SummarizeOptions } from './summarize.ts';
export declare const name = "dsh-cot-summerization";
export { Config };
export declare const inject: string[];
/** Placeholder reasoning text shown when summarization fails under `hide`. */
export declare const UNAVAILABLE_PLACEHOLDER = "[CoT summary unavailable]";
/** A summarizer call, with the incremental-extension option. */
export type SummarizeFn = (raw: string, cfg: ResolvedCotSummarizerConfig, signal: AbortSignal | undefined, options?: SummarizeOptions) => Promise<string>;
/**
 * Wrap one model stream: swallow every reasoning chunk, stream everything
 * else untouched, and emit the summarized reasoning in place of the raw
 * chain of thought.
 *
 * The replacement reasoning block reuses the index of the first raw
 * reasoning block, and its content grows incrementally as partial summaries
 * land — the block-start is emitted with the first partial, so the
 * assembled message keeps the summary above the reply text. The transform
 * is index-safe for the session log's `BlockAssembler`: forwarded blocks
 * keep their indices verbatim, and the summary block never collides with
 * them because the raw reasoning index is freed by swallowing.
 * @param upstream - the inner stream from `next()`.
 * @param cfg - resolved configuration captured at listener invocation.
 * @param summarize - summarizer call, injectable for tests.
 * @param callerSignal - the model call's abort signal, when present.
 */
export declare function transformCoTStream(upstream: AsyncIterable<StreamChunk>, cfg: ResolvedCotSummarizerConfig, summarize: SummarizeFn, callerSignal: AbortSignal | undefined, log?: (message: string, ...args: unknown[]) => void): AsyncGenerator<StreamChunk>;
/** Plugin entry: register settings, then wrap every streaming model call. */
export declare function apply(ctx: Context, config?: CotSummarizerConfig): () => void;
