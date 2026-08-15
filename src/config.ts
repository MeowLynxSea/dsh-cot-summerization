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

import z from '@deepseek-ai/schemastery'
import type Schema from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'

/** Settings document namespace owned by this plugin. */
export const COT_SUMMARIZER_SETTINGS_NAMESPACE = settingsNamespace('cot-summarizer')

/** Default provider endpoint; every field is user-overridable in settings. */
export const DEFAULT_BASE_URL = 'https://api.deepseek.com/v1'
export const DEFAULT_MODEL = 'deepseek-chat'

/** Selectable summary styles; `none` keeps the plain prompt, `custom` uses `customStyle`. */
export const SUMMARY_STYLES = ['none', 'first-person', 'rigorous', 'catgirl', 'segmented', 'custom'] as const
export type SummaryStyle = (typeof SUMMARY_STYLES)[number]

/**
 * System-prompt fragments appended when a preset style is selected. They
 * come after the user's own prompt (and the language override), so an
 * explicit style wins over prompt copy that contradicts it.
 */
export const STYLE_PROMPTS: Record<Exclude<SummaryStyle, 'none' | 'custom'>, string> = {
  'first-person': 'Write the summary from the assistant\'s first-person perspective, using "I will" / "I need to" openings where natural (for example: "I will first analyze the constraints, then derive the algorithm.").',
  rigorous: 'Write in a rigorous, precise, formal style: use exact technical terms, state every condition and conclusion explicitly, avoid casual or vague wording.',
  catgirl: 'Write in an adorable catgirl persona (喵~): playful, warm and lively, with catgirl interjections and expressions, while keeping the content accurate and complete.',
  segmented: 'Structure the summary in segments: each segment is a short paragraph title line, followed by a blank line, followed by the detailed explanation of that part, followed by a blank line before the next segment.',
}

/**
 * Default summarization prompt. `{maxSummaryChars}` is replaced with the
 * configured summary length cap; custom prompts may use the same placeholder.
 */
export const DEFAULT_SYSTEM_PROMPT = `You summarize the hidden chain of thought of an AI assistant so it can be shown to the user.

Given the raw reasoning, write a concise summary in the SAME language as the raw reasoning. Keep the final conclusion, the key reasoning steps, and any important caveats. Present it as a clean, condensed line of thinking; do not quote or echo the raw reasoning verbatim, and do not mention that the original reasoning was hidden or summarized.

Output ONLY the summary text. No preamble, no markdown headings, no bullet lists. Keep it under {maxSummaryChars} characters.`

/** Full user-facing configuration; every field defaults at the schema boundary. */
export interface CotSummarizerConfig {
  /** Master switch; when off, streams pass through untouched. */
  enabled?: boolean
  /** Chat Completions base URL, e.g. `https://api.deepseek.com/v1`. */
  baseUrl?: string
  /** API key for the summarizer endpoint. */
  apiKey?: string
  /** Summarizer model name. */
  model?: string
  /** Summarization system prompt; `{maxSummaryChars}` is substituted. */
  systemPrompt?: string
  /**
   * Force the summary language as free text (e.g. `中文`, `English`); when
   * blank the summary follows the raw reasoning's language.
   */
  language?: string
  /** Presentation style preset appended to the summarization prompt. */
  style?: SummaryStyle
  /** Free-text style prompt used when `style` is `custom`. */
  customStyle?: string
  /** Raw reasoning shorter than this is shown verbatim without a summarizer call. */
  minReasoningChars?: number
  /** Target summary length cap, substituted into the default prompt. */
  maxSummaryChars?: number
  /** Summarizer request timeout in milliseconds. */
  timeoutMs?: number
  /** Behavior when the summarizer call fails: hide the reasoning or pass it through. */
  onError?: 'hide' | 'pass-through'
  /**
   * Summarize progressively while the raw chain of thought streams (near-realtime),
   * instead of one summary after the stream ends.
   */
  incremental?: boolean
  /**
   * Raw reasoning characters accumulated before each partial summary call.
   * Splits prefer sentence boundaries, so the growing summary reads smoothly.
   */
  chunkChars?: number
  /** Maximum time between partial summary calls while the stream is slow. */
  chunkIntervalMs?: number
}

/** Configuration schema with documented defaults. */
export const Config: Schema<CotSummarizerConfig> = z.object({
  enabled: z.boolean().default(true),
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
  onError: z.union(['hide', 'pass-through'] as const).default('hide'),
  incremental: z.boolean().default(true),
  chunkChars: z.number().default(300),
  chunkIntervalMs: z.number().default(4000),
})

/** Configuration after static validation, with every default materialized. */
export interface ResolvedCotSummarizerConfig {
  enabled: boolean
  baseUrl: string
  apiKey: string
  model: string
  systemPrompt: string
  language: string
  style: SummaryStyle
  customStyle: string
  minReasoningChars: number
  maxSummaryChars: number
  timeoutMs: number
  onError: 'hide' | 'pass-through'
  incremental: boolean
  chunkChars: number
  chunkIntervalMs: number
}

/**
 * Validate and normalize a config object (partial inputs receive the same
 * defaults the schemastery schema applies). Configuration mistakes fail loud
 * at plugin load (the earliest resolvable point).
 * @param config - parsed config with defaults applied.
 * @returns the fully defaulted, validated configuration.
 */
export function resolveConfig(config: CotSummarizerConfig = {}): ResolvedCotSummarizerConfig {
  const enabled = config.enabled ?? true
  const minReasoningChars = config.minReasoningChars ?? 32
  const maxSummaryChars = config.maxSummaryChars ?? 800
  const timeoutMs = config.timeoutMs ?? 30000
  const onError = config.onError ?? 'hide'
  const incremental = config.incremental ?? true
  const chunkChars = config.chunkChars ?? 300
  const chunkIntervalMs = config.chunkIntervalMs ?? 4000
  const language = (config.language ?? '').trim()
  const style = config.style ?? 'none'
  const customStyle = (config.customStyle ?? '').trim()

  if (minReasoningChars < 0) throw new Error('cot-summarizer: minReasoningChars must be >= 0')
  if (maxSummaryChars < 1) throw new Error('cot-summarizer: maxSummaryChars must be >= 1')
  if (timeoutMs < 1 || timeoutMs > 600000) throw new Error('cot-summarizer: timeoutMs must be within [1, 600000]')
  if (chunkChars < 1) throw new Error('cot-summarizer: chunkChars must be >= 1')
  if (chunkIntervalMs < 500 || chunkIntervalMs > 600000) {
    throw new Error('cot-summarizer: chunkIntervalMs must be within [500, 600000]')
  }
  if (!SUMMARY_STYLES.includes(style)) {
    throw new Error(`cot-summarizer: unknown summary style "${String(style)}"`)
  }

  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  if (baseUrl === '') throw new Error('cot-summarizer: baseUrl must not be empty')

  let systemPrompt = (config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT).replace('{maxSummaryChars}', String(maxSummaryChars))
  if (language !== '') systemPrompt += `\n\nWrite the summary in ${language}.`
  if (style === 'custom') {
    if (customStyle !== '') systemPrompt += `\n\n${customStyle}`
  } else if (style !== 'none') {
    systemPrompt += `\n\n${STYLE_PROMPTS[style]}`
  }

  return {
    enabled,
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
  }
}
