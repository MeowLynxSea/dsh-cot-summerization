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
import type { Context } from '@deepseek-ai/cordis';
import type { StreamChunk } from '@deepseek-ai/dsh-llm';
import { Config, type CotSummarizerConfig, type ResolvedCotSummarizerConfig } from './config.ts';
import { type SummarizeOptions } from './summarize.ts';
import { type RawCoTCapture } from './history.ts';
export { createRawCapture, createRawHistoryRestorer, restoreRawAssistantMessage, type RawCoTCapture, type RawHistoryRestorer, type SessionLike, } from './history.ts';
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
 * Ordering guarantee (`streamReasoningBlock`, on by default): the Web
 * Client renders content blocks strictly in first-seen order, so a segment
 * summary settling after the reply already streamed would re-open the
 * reasoning block UNDER the reply. The preferred closing segment call is
 * awaited inline — bounded by `timeoutMs` — ahead of the first
 * reply chunk (and of the finish chunk); a call that misses the window
 * degrades in place (placeholder under `hide`, raw reasoning under
 * `pass-through`, landed summaries kept either way) and its late result is
 * dropped. Fire-and-forget midstream segments never wait. Verbatim short
 * chains on interleaved wire streams (a reply block opens before the
 * reasoning block closes) are deferred to just before the finish chunk as
 * one atomic Think row. The model-visible surface restore always rebuilds
 * the wire-exact order independently of any of this (see `./history.ts`).
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
export declare function transformCoTStream(upstream: AsyncIterable<StreamChunk>, cfg: ResolvedCotSummarizerConfig, summarize: SummarizeFn, callerSignal: AbortSignal | undefined, log?: (message: string, ...args: unknown[]) => void, capture?: RawCoTCapture | undefined, now?: () => number): AsyncGenerator<StreamChunk>;
/** Plugin entry: register settings, then wrap every streaming model call. */
export declare function apply(ctx: Context, config?: CotSummarizerConfig): () => void;
