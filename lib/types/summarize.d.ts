/**
 * Summarizer client: one streaming LLM call through DSH's own `ctx.llm`
 * channel. The raw chain of thought is sent as the user turn; the model
 * reply is the displayed summary. Routing through `ctx.llm` means the
 * provider/model/credentials come from DSH's existing configuration and
 * other plugins (statistics, logging, routing) can observe the call.
 * @module dsh-cot-summerization/summarize
 */
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ResolvedCotSummarizerConfig } from './config.ts';
/** A summarizer call failed; `message` is safe to surface in logs and placeholders. */
export declare class SummarizeError extends Error {
    constructor(message: string);
}
/** The subset of `ctx.llm` needed by the summarizer, injectable for tests. */
export interface DshLlmLike {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
/** Options for one summarizer call beyond the raw text itself. */
export interface SummarizeOptions {
    /**
     * Previous partial summary of the same chain of thought. When present, the
     * raw text is ONLY the newly arrived reasoning segment; the model reads the
     * previous summary for continuity and style but must NOT repeat it, so the
     * appended output grows the block without ever depending on verbatim
     * reproduction of earlier text.
     */
    previousSummary?: string;
}
/**
 * Summarize a raw chain of thought through DSH's LLM channel. Throws
 * {@link SummarizeError} on transport or protocol failure; callers decide
 * whether to hide or pass through on error.
 * @param raw - the raw chain-of-thought text.
 * @param cfg - resolved plugin configuration.
 * @param llm - the DSH LLM service (`ctx.llm`) used to place the call.
 * @param provider - provider route to use; normally the intercepted request's
 *   provider unless the plugin settings override it.
 * @param model - model id to use; normally the intercepted request's model
 *   unless the plugin settings override it.
 * @param callerSignal - cancellation from the model call being transformed;
 *   combined with the configured timeout.
 * @param options - incremental-extension context for partial summaries.
 * @returns the summarizer's reply, trimmed.
 */
export declare function summarizeCoT(raw: string, cfg: ResolvedCotSummarizerConfig, llm: DshLlmLike, provider: string, model: string, callerSignal?: AbortSignal, options?: SummarizeOptions): Promise<string>;
