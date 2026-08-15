/**
 * Summarizer client: one non-streaming Chat Completions call against a
 * user-configured endpoint. The raw chain of thought is sent as the user
 * turn; the model reply is the displayed summary.
 * @module dsh-cot-summerization/summarize
 */
import type { ResolvedCotSummarizerConfig } from './config.ts';
/** A summarizer call failed; `message` is safe to surface in logs and placeholders. */
export declare class SummarizeError extends Error {
    constructor(message: string);
}
/** Options for one summarizer call beyond the raw text itself. */
export interface SummarizeOptions {
    /**
     * Previous partial summary of the same raw chain of thought. When present,
     * the summarizer must reproduce it verbatim as the start of its output and
     * only extend it, so the replacement block grows smoothly instead of
     * jumping between partial calls.
     */
    previousSummary?: string;
}
/**
 * Normalize a configured base URL into the endpoint used for POST
 * `/chat/completions`. Accepts bases with or without a trailing path.
 * @param baseUrl - configured base URL.
 * @returns the full chat completions URL.
 */
export declare function chatCompletionsUrl(baseUrl: string): string;
/**
 * Summarize a raw chain of thought through the configured Chat Completions
 * endpoint. Throws {@link SummarizeError} on transport or protocol failure;
 * callers decide whether to hide or pass through on error.
 * @param raw - the raw chain-of-thought text.
 * @param cfg - resolved plugin configuration.
 * @param callerSignal - cancellation from the model call being transformed;
 *   combined with the configured timeout.
 * @param options - incremental-extension context for partial summaries.
 * @returns the summarizer's reply, trimmed.
 */
export declare function summarizeCoT(raw: string, cfg: ResolvedCotSummarizerConfig, callerSignal?: AbortSignal, options?: SummarizeOptions): Promise<string>;
