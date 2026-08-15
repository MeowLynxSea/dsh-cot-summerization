/**
 * Plugin configuration: whether the transform is active, the Chat
 * Completions-compatible summarizer endpoint, the summarization prompt, and
 * fallback behavior when the summarizer call fails. The `cot-summarizer`
 * settings namespace renders in the Web Client settings page.
 *
 * Fields are intentionally flat (no nested `provider` object): the Web
 * settings surface writes preference rows through the client settings-scope
 * transport, which addresses one scalar field per write.
 * @module dsh-cot-summerization/config
 */
import z from '@deepseek-ai/schemastery';
import { settingsNamespace } from '@deepseek-ai/dsh-settings';
/** Settings document namespace owned by this plugin. */
export const COT_SUMMARIZER_SETTINGS_NAMESPACE = settingsNamespace('cot-summarizer');
/** Default provider endpoint; every field is user-overridable in settings. */
export const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_MODEL = 'deepseek-chat';
/** Selectable summary styles; `none` keeps the plain prompt, `custom` uses `customStyle`. */
export const SUMMARY_STYLES = ['none', 'first-person', 'rigorous', 'catgirl', 'segmented', 'custom'];
/**
 * System-prompt fragments appended when a preset style is selected. They
 * come after the user's own prompt (and the language override), so an
 * explicit style wins over prompt copy that contradicts it.
 */
export const STYLE_PROMPTS = {
    'first-person': 'Write the summary from the assistant\'s first-person perspective, using "I will" / "I need to" openings where natural (for example: "I will first analyze the constraints, then derive the algorithm.").',
    rigorous: 'Write in a rigorous, precise, formal style: use exact technical terms, state every condition and conclusion explicitly, avoid casual or vague wording.',
    catgirl: 'Write in an adorable catgirl persona (喵~): playful, warm and lively, with catgirl interjections and expressions, while keeping the content accurate and complete.',
    segmented: `Structure the summary in segments. Each segment is exactly: a title on its own line, a line break, the detailed explanation, a line break. Segments are separated by a blank line.

Example:
思路分析

先考虑最坏情况：摸三颗各不同，第四颗必重复。

结论

至少需要 4 次。

Rules: the title and the explanation are NEVER on the same line (forbidden: "标题：说明"). The character limit must not break this structure — if they conflict, keep the structure and shorten the explanation instead. End the whole output with a line break.`,
};
/**
 * Default summarization prompt. `{maxSummaryChars}` is replaced with the
 * configured summary length cap; custom prompts may use the same placeholder.
 */
export const DEFAULT_SYSTEM_PROMPT = `You summarize the hidden chain of thought of an AI assistant so it can be shown to the user.

Given the raw reasoning, write a concise summary in the SAME language as the raw reasoning. Keep the final conclusion, the key reasoning steps, and any important caveats. Present it as a clean, condensed line of thinking; do not quote or echo the raw reasoning verbatim, and do not mention that the original reasoning was hidden or summarized.

Output ONLY the summary text. No preamble, no markdown headings, no bullet lists. Keep it under {maxSummaryChars} characters.`;
/** Configuration schema with documented defaults. */
export const Config = z.object({
    enabled: z.boolean().default(true),
    preserveRawForModel: z.boolean().default(true),
    baseUrl: z.string().default(DEFAULT_BASE_URL),
    apiKey: z.string().default(''),
    model: z.string().default(DEFAULT_MODEL),
    systemPrompt: z.string().default(DEFAULT_SYSTEM_PROMPT),
    language: z.string().default(''),
    style: z.union(SUMMARY_STYLES).default('none'),
    customStyle: z.string().default(''),
    minReasoningChars: z.number().default(32),
    maxSummaryChars: z.number().default(800),
    timeoutMs: z.number().default(30000),
    onError: z.union(['hide', 'pass-through']).default('hide'),
    incremental: z.boolean().default(true),
    chunkChars: z.number().default(300),
    chunkIntervalMs: z.number().default(4000),
});
/**
 * Validate and normalize a config object (partial inputs receive the same
 * defaults the schemastery schema applies). Configuration mistakes fail loud
 * at plugin load (the earliest resolvable point).
 * @param config - parsed config with defaults applied.
 * @returns the fully defaulted, validated configuration.
 */
export function resolveConfig(config = {}) {
    const enabled = config.enabled ?? true;
    const preserveRawForModel = config.preserveRawForModel ?? true;
    const minReasoningChars = config.minReasoningChars ?? 32;
    const maxSummaryChars = config.maxSummaryChars ?? 800;
    const timeoutMs = config.timeoutMs ?? 30000;
    const onError = config.onError ?? 'hide';
    const incremental = config.incremental ?? true;
    const chunkChars = config.chunkChars ?? 300;
    const chunkIntervalMs = config.chunkIntervalMs ?? 4000;
    const language = (config.language ?? '').trim();
    const style = config.style ?? 'none';
    const customStyle = (config.customStyle ?? '').trim();
    if (minReasoningChars < 0)
        throw new Error('cot-summarizer: minReasoningChars must be >= 0');
    if (maxSummaryChars < 1)
        throw new Error('cot-summarizer: maxSummaryChars must be >= 1');
    if (timeoutMs < 1 || timeoutMs > 600000)
        throw new Error('cot-summarizer: timeoutMs must be within [1, 600000]');
    if (chunkChars < 1)
        throw new Error('cot-summarizer: chunkChars must be >= 1');
    if (chunkIntervalMs < 500 || chunkIntervalMs > 600000) {
        throw new Error('cot-summarizer: chunkIntervalMs must be within [500, 600000]');
    }
    if (!SUMMARY_STYLES.includes(style)) {
        throw new Error(`cot-summarizer: unknown summary style "${String(style)}"`);
    }
    const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
    if (baseUrl === '')
        throw new Error('cot-summarizer: baseUrl must not be empty');
    let systemPrompt = (config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT).replace('{maxSummaryChars}', String(maxSummaryChars));
    if (language !== '')
        systemPrompt += `\n\nWrite the summary in ${language}.`;
    if (style === 'custom') {
        if (customStyle !== '')
            systemPrompt += `\n\n${customStyle}`;
    }
    else if (style !== 'none') {
        systemPrompt += `\n\n${STYLE_PROMPTS[style]}`;
    }
    return {
        enabled,
        preserveRawForModel,
        baseUrl,
        apiKey: config.apiKey ?? '',
        model: (config.model ?? DEFAULT_MODEL).trim(),
        systemPrompt,
        language,
        style,
        customStyle,
        minReasoningChars,
        maxSummaryChars,
        timeoutMs,
        onError,
        incremental,
        chunkChars,
        chunkIntervalMs,
    };
}
