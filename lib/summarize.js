/**
 * Summarizer client: one non-streaming Chat Completions call against a
 * user-configured endpoint. The raw chain of thought is sent as the user
 * turn; the model reply is the displayed summary.
 * @module dsh-cot-summerization/summarize
 */
/** A summarizer call failed; `message` is safe to surface in logs and placeholders. */
export class SummarizeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SummarizeError';
    }
}
/**
 * Instruction used when a previous partial summary exists: summarize only
 * the new reasoning segment as a natural continuation. `{segmentChars}` is
 * replaced with the per-segment length budget derived from the summary cap.
 */
const SEGMENT_INSTRUCTION = `The chain of thought below is streaming, and this message contains ONLY the reasoning that arrived since the previous summary. Your previous summary so far is quoted at the end — read it for continuity and style, but do NOT repeat it.

Summarize the new reasoning below concisely, in the SAME language as the new reasoning. Your output will be appended directly after the previous summary, so it must read as a seamless continuation of it. Do not quote the raw reasoning verbatim and do not mention the summarization process.

Output ONLY the summary of the new reasoning, at most {segmentChars} characters.`;
/**
 * Normalize a configured base URL into the endpoint used for POST
 * `/chat/completions`. Accepts bases with or without a trailing path.
 * @param baseUrl - configured base URL.
 * @returns the full chat completions URL.
 */
export function chatCompletionsUrl(baseUrl) {
    const base = baseUrl.trim().replace(/\/+$/, '');
    if (base === '')
        throw new SummarizeError('summarizer base URL is empty');
    if (base.endsWith('/chat/completions'))
        return base;
    return `${base}/chat/completions`;
}
/** Read a non-streaming Chat Completions response into its message text. */
function extractContent(data) {
    if (typeof data !== 'object' || data === null) {
        throw new SummarizeError('summarizer returned a non-object response');
    }
    const choices = data.choices;
    if (!Array.isArray(choices) || choices.length === 0) {
        throw new SummarizeError('summarizer response has no choices');
    }
    const message = choices[0]?.message;
    const content = message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
        throw new SummarizeError('summarizer returned empty content');
    }
    return content.trim();
}
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
export async function summarizeCoT(raw, cfg, callerSignal, options) {
    if (cfg.model === '')
        throw new SummarizeError('summarizer model is not configured');
    const url = chatCompletionsUrl(cfg.baseUrl);
    const headers = { 'content-type': 'application/json' };
    if (cfg.apiKey !== '')
        headers.authorization = `Bearer ${cfg.apiKey}`;
    const signal = callerSignal !== undefined
        ? AbortSignal.any([callerSignal, AbortSignal.timeout(cfg.timeoutMs)])
        : AbortSignal.timeout(cfg.timeoutMs);
    const userContent = options?.previousSummary === undefined
        ? raw
        : `${SEGMENT_INSTRUCTION.replace('{segmentChars}', String(Math.max(80, Math.floor(cfg.maxSummaryChars / 4))))}\n\nNew reasoning to summarize:\n\n${raw}\n\nPrevious summary so far (do not repeat it):\n\n${options.previousSummary}`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: cfg.model,
                messages: [
                    { role: 'system', content: cfg.systemPrompt },
                    { role: 'user', content: userContent },
                ],
                temperature: 0.3,
            }),
            signal,
        });
    }
    catch (error) {
        if (callerSignal?.aborted === true)
            throw error;
        throw new SummarizeError(`summarizer request failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!response.ok) {
        throw new SummarizeError(`summarizer returned HTTP ${response.status}`);
    }
    let data;
    try {
        data = await response.json();
    }
    catch {
        throw new SummarizeError('summarizer returned invalid JSON');
    }
    return extractContent(data);
}
