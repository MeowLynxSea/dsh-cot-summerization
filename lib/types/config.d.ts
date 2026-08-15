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
import type Schema from '@deepseek-ai/schemastery';
/** Settings document namespace owned by this plugin. */
export declare const COT_SUMMARIZER_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Default provider endpoint; every field is user-overridable in settings. */
export declare const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
export declare const DEFAULT_MODEL = "deepseek-chat";
/** Selectable summary styles; `none` keeps the plain prompt, `custom` uses `customStyle`. */
export declare const SUMMARY_STYLES: readonly ["none", "first-person", "rigorous", "catgirl", "segmented", "custom"];
export type SummaryStyle = (typeof SUMMARY_STYLES)[number];
/**
 * System-prompt fragments appended when a preset style is selected. They
 * come after the user's own prompt (and the language override), so an
 * explicit style wins over prompt copy that contradicts it.
 */
export declare const STYLE_PROMPTS: Record<Exclude<SummaryStyle, 'none' | 'custom'>, string>;
/**
 * Default summarization prompt. `{maxSummaryChars}` is replaced with the
 * configured summary length cap; custom prompts may use the same placeholder.
 */
export declare const DEFAULT_SYSTEM_PROMPT = "You summarize the hidden chain of thought of an AI assistant so it can be shown to the user.\n\nGiven the raw reasoning, write a concise summary in the SAME language as the raw reasoning. Keep the final conclusion, the key reasoning steps, and any important caveats. Present it as a clean, condensed line of thinking; do not quote or echo the raw reasoning verbatim, and do not mention that the original reasoning was hidden or summarized.\n\nOutput ONLY the summary text. No preamble, no markdown headings, no bullet lists. Keep it under {maxSummaryChars} characters.";
/** Full user-facing configuration; every field defaults at the schema boundary. */
export interface CotSummarizerConfig {
    /** Master switch; when off, streams pass through untouched. */
    enabled?: boolean;
    /** Chat Completions base URL, e.g. `https://api.deepseek.com/v1`. */
    baseUrl?: string;
    /** API key for the summarizer endpoint. */
    apiKey?: string;
    /** Summarizer model name. */
    model?: string;
    /** Summarization system prompt; `{maxSummaryChars}` is substituted. */
    systemPrompt?: string;
    /**
     * Force the summary language as free text (e.g. `中文`, `English`); when
     * blank the summary follows the raw reasoning's language.
     */
    language?: string;
    /** Presentation style preset appended to the summarization prompt. */
    style?: SummaryStyle;
    /** Free-text style prompt used when `style` is `custom`. */
    customStyle?: string;
    /** Raw reasoning shorter than this is shown verbatim without a summarizer call. */
    minReasoningChars?: number;
    /** Target summary length cap, substituted into the default prompt. */
    maxSummaryChars?: number;
    /** Summarizer request timeout in milliseconds. */
    timeoutMs?: number;
    /** Behavior when the summarizer call fails: hide the reasoning or pass it through. */
    onError?: 'hide' | 'pass-through';
    /**
     * Summarize progressively while the raw chain of thought streams (near-realtime),
     * instead of one summary after the stream ends.
     */
    incremental?: boolean;
    /**
     * Raw reasoning characters accumulated before each partial summary call.
     * Splits prefer sentence boundaries, so the growing summary reads smoothly.
     */
    chunkChars?: number;
    /** Maximum time between partial summary calls while the stream is slow. */
    chunkIntervalMs?: number;
}
/** Configuration schema with documented defaults. */
export declare const Config: Schema<CotSummarizerConfig>;
/** Configuration after static validation, with every default materialized. */
export interface ResolvedCotSummarizerConfig {
    enabled: boolean;
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    language: string;
    style: SummaryStyle;
    customStyle: string;
    minReasoningChars: number;
    maxSummaryChars: number;
    timeoutMs: number;
    onError: 'hide' | 'pass-through';
    incremental: boolean;
    chunkChars: number;
    chunkIntervalMs: number;
}
/**
 * Validate and normalize a config object (partial inputs receive the same
 * defaults the schemastery schema applies). Configuration mistakes fail loud
 * at plugin load (the earliest resolvable point).
 * @param config - parsed config with defaults applied.
 * @returns the fully defaulted, validated configuration.
 */
export declare function resolveConfig(config?: CotSummarizerConfig): ResolvedCotSummarizerConfig;
