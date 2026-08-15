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
 * @returns the summarizer's reply, trimmed.
 */
export async function summarizeCoT(raw, cfg, callerSignal) {
    if (cfg.model === '')
        throw new SummarizeError('summarizer model is not configured');
    const url = chatCompletionsUrl(cfg.baseUrl);
    const headers = { 'content-type': 'application/json' };
    if (cfg.apiKey !== '')
        headers.authorization = `Bearer ${cfg.apiKey}`;
    const signal = callerSignal !== undefined
        ? AbortSignal.any([callerSignal, AbortSignal.timeout(cfg.timeoutMs)])
        : AbortSignal.timeout(cfg.timeoutMs);
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: cfg.model,
                messages: [
                    { role: 'system', content: cfg.systemPrompt },
                    { role: 'user', content: raw },
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
