/**
 * Plugin configuration: whether the transform is active, the Chat
 * Completions-compatible summarizer endpoint, the summarization prompt, and
 * fallback behavior when the summarizer call fails. The `cot-summarizer`
 * settings namespace renders in the Web Client settings page.
 * @module dsh-cot-summerization/config
 */
import type Schema from '@deepseek-ai/schemastery';
/** Settings document namespace owned by this plugin. */
export declare const COT_SUMMARIZER_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
/** Default provider endpoint; every field is user-overridable in settings. */
export declare const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
export declare const DEFAULT_MODEL = "deepseek-chat";
/**
 * Default summarization prompt. `{maxSummaryChars}` is replaced with the
 * configured summary length cap; custom prompts may use the same placeholder.
 */
export declare const DEFAULT_SYSTEM_PROMPT = "You summarize the hidden chain of thought of an AI assistant so it can be shown to the user.\n\nGiven the raw reasoning, write a concise summary in the SAME language as the raw reasoning. Keep the final conclusion, the key reasoning steps, and any important caveats. Present it as a clean, condensed line of thinking; do not quote or echo the raw reasoning verbatim, and do not mention that the original reasoning was hidden or summarized.\n\nOutput ONLY the summary text. No preamble, no markdown headings, no bullet lists. Keep it under {maxSummaryChars} characters.";
/** Full user-facing configuration; every field defaults at the schema boundary. */
export interface CotSummarizerConfig {
    /** Master switch; when off, streams pass through untouched. */
    enabled?: boolean;
    provider?: {
        /** Chat Completions base URL, e.g. `https://api.deepseek.com/v1`. */
        baseUrl?: string;
        /** API key for the summarizer endpoint. */
        apiKey?: string;
        /** Summarizer model name. */
        model?: string;
    };
    /** Summarization system prompt; `{maxSummaryChars}` is substituted. */
    systemPrompt?: string;
    /** Raw reasoning shorter than this is shown verbatim without a summarizer call. */
    minReasoningChars?: number;
    /** Target summary length cap, substituted into the default prompt. */
    maxSummaryChars?: number;
    /** Summarizer request timeout in milliseconds. */
    timeoutMs?: number;
    /** Behavior when the summarizer call fails: hide the reasoning or pass it through. */
    onError?: 'hide' | 'pass-through';
}
/** Configuration schema with documented defaults. */
export declare const Config: Schema<CotSummarizerConfig>;
/** Configuration after static validation, with every default materialized. */
export interface ResolvedCotSummarizerConfig {
    enabled: boolean;
    provider: {
        baseUrl: string;
        apiKey: string;
        model: string;
    };
    systemPrompt: string;
    minReasoningChars: number;
    maxSummaryChars: number;
    timeoutMs: number;
    onError: 'hide' | 'pass-through';
}
/**
 * Validate and normalize a config object (partial inputs receive the same
 * defaults the schemastery schema applies). Configuration mistakes fail loud
 * at plugin load (the earliest resolvable point).
 * @param config - parsed config with defaults applied.
 * @returns the fully defaulted, validated configuration.
 */
export declare function resolveConfig(config?: CotSummarizerConfig): ResolvedCotSummarizerConfig;
