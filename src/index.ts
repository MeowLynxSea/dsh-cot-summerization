/**
 * dsh-cot-summerization — DeepSeek Harness bundle: hide the model's raw
 * chain of thought and display a summary produced by a small model.
 *
 * The plugin wraps the `llm/stream` waterfall. Raw reasoning deltas are
 * swallowed (they never reach the session log, the model history, or the
 * UI). While the raw chain of thought streams, the collected reasoning is
 * summarized segment by segment — trigger points prefer sentence boundaries
 * and are throttled by character volume and elapsed time. Each partial call
 * summarizes ONLY the newly arrived reasoning segment (the previous summary
 * is passed as continuity context but never needs to be reproduced), so the
 * replacement reasoning block grows reliably as segments land; a final call
 * covers whatever tail remains when the reasoning completes. The Web Client
 * renders the result as the usual "Think" disclosure row. Settings surface
 * in the Web Client settings page under the `cot-summarizer` namespace.
 * @module dsh-cot-summerization
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  Config,
  COT_SUMMARIZER_SETTINGS_NAMESPACE,
  resolveConfig,
  type CotSummarizerConfig,
  type ResolvedCotSummarizerConfig,
} from './config.ts'
import { summarizeCoT, type SummarizeOptions } from './summarize.ts'
import { installCotSummarizerWeb } from './web.ts'

export const name = 'dsh-cot-summerization'

export { Config }

export const inject = ['settings']

/** Placeholder reasoning text shown when summarization fails under `hide`. */
export const UNAVAILABLE_PLACEHOLDER = '[CoT summary unavailable]'

/** A summarizer call, with the incremental-extension option. */
export type SummarizeFn = (
  raw: string,
  cfg: ResolvedCotSummarizerConfig,
  signal: AbortSignal | undefined,
  options?: SummarizeOptions,
) => Promise<string>

/** Reasoning text ending a sentence punctuation or a newline is a natural split point. */
const SENTENCE_END = /[.?!。！？…]$/

function endsAtBoundary(text: string): boolean {
  if (text.endsWith('\n')) return true
  const trimmed = text.trimEnd()
  if (trimmed === '') return false
  return SENTENCE_END.test(trimmed)
}

/**
 * Split text into sentence-ish units, keeping the boundary. Tilde and
 * "喵~" style fillers count as boundaries (catgirl-style summaries end
 * clauses with 喵~ instead of punctuation).
 */
function splitSentences(text: string): string[] {
  return text.split(/(?<=[。！？!?…\n~～])/)
}

/** Normalize a sentence for duplicate comparison: strip whitespace and filler. */
function normalizeSentence(sentence: string): string {
  return sentence.replace(/[\s喵~〜～]+/g, '').toLowerCase()
}

/** Bigram-overlap similarity in [0, 1] between two normalized sentences. */
function sentenceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  const bigrams = (s: string): Set<string> => {
    const out = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
    return out
  }
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let common = 0
  for (const gram of A) if (B.has(gram)) common += 1
  return (2 * common) / (A.size + B.size)
}

/**
 * Drop sentences from a segment result that already appear (verbatim or
 * near-verbatim) in the emitted summary — segment calls tend to restate the
 * running conclusion, which reads as duplication. Short fragments pass
 * through untouched.
 */
function dedupeSentences(result: string, emitted: string): string {
  if (emitted === '') return result
  const existing = splitSentences(emitted)
    .map(normalizeSentence)
    .filter((s) => s.length >= 8)
  if (existing.length === 0) return result
  const kept: string[] = []
  for (const part of splitSentences(result)) {
    const norm = normalizeSentence(part)
    if (norm.length < 8 || !existing.some((s) => sentenceSimilarity(s, norm) >= 0.7)) {
      kept.push(part)
    }
  }
  return kept.join('')
}

/**
 * Wrap one model stream: swallow every reasoning chunk, stream everything
 * else untouched, and emit the summarized reasoning in place of the raw
 * chain of thought.
 *
 * The replacement reasoning block reuses the index of the first raw
 * reasoning block, and its content grows segment by segment as partial
 * summaries land — the block-start is emitted with the first partial, so
 * the assembled message keeps the summary above the reply text. The
 * transform is index-safe for the session log's `BlockAssembler`: forwarded
 * blocks keep their indices verbatim, and the summary block never collides
 * with them because the raw reasoning index is freed by swallowing.
 * @param upstream - the inner stream from `next()`.
 * @param cfg - resolved configuration captured at listener invocation.
 * @param summarize - summarizer call, injectable for tests.
 * @param callerSignal - the model call's abort signal, when present.
 */
export async function* transformCoTStream(
  upstream: AsyncIterable<StreamChunk>,
  cfg: ResolvedCotSummarizerConfig,
  summarize: SummarizeFn,
  callerSignal: AbortSignal | undefined,
  log: (message: string, ...args: unknown[]) => void = () => {},
): AsyncGenerator<StreamChunk> {
  let rawCoT = ''
  let sawReasoning = false
  let reasoningDone = false
  let summaryIndex = -1
  let summaryStarted = false
  let summaryClosed = false
  let rawShown = false
  let emitted = ''
  /** Raw length already handed to a summarizer call; the next segment starts here. */
  let lastSegmentStart = 0
  let lastTriggerAt = Date.now()
  let pending: Promise<string> | undefined
  let pendingSettled = false
  let pendingError: unknown = null

  /** The index the replacement block occupies: the first raw reasoning block's. */
  const blockIndex = (): number => (summaryIndex === -1 ? 0 : summaryIndex)

  /**
   * Start one summarizer call over the raw segment accumulated since the
   * last call. The call runs concurrently with the upstream stream (never
   * paused); its result is folded into the block at the next chunk boundary
   * once it settles.
   */
  const fire = (): void => {
    const segment = rawCoT.slice(lastSegmentStart)
    lastSegmentStart = rawCoT.length
    lastTriggerAt = Date.now()
    pendingError = null
    pendingSettled = false
    pending = summarize(segment, cfg, callerSignal, emitted === '' ? undefined : { previousSummary: emitted })
      .then((result) => {
        pendingSettled = true
        return result
      }, (error: unknown) => {
        pendingSettled = true
        pendingError = error
        return ''
      })
  }

  /** Emit a text tail into the replacement reasoning block, opening it lazily. */
  function* emitTail(tail: string): Generator<StreamChunk> {
    if (!summaryStarted) {
      summaryStarted = true
      yield { type: 'block-start', index: blockIndex(), blockType: 'reasoning' }
    }
    emitted += tail
    yield { type: 'reasoning-delta', index: blockIndex(), text: tail }
  }

  /** Show the raw reasoning verbatim in its own Think row (short input / pass-through). */
  function* emitRawReasoning(text: string): Generator<StreamChunk> {
    if (summaryStarted) return
    const index = blockIndex()
    rawShown = true
    yield { type: 'block-start', index, blockType: 'reasoning' }
    yield { type: 'reasoning-delta', index, text }
    yield { type: 'block-end', index, block: { type: 'reasoning', text } }
  }

  /**
   * Fold the in-flight call's result into the stream: each segment summary
   * is appended as-is (segments never depend on each other, so a rewritten
   * or failed segment cannot stall the stream), with sentences that repeat
   * the already-emitted summary dropped. Blocks only while the call is still
   * running (callers invoke it after the call settled, or at the terminal
   * finish where blocking is unavoidable). Failures are logged and skipped;
   * the end-of-stream fallback policy lives in the finish handler.
   */
  async function* foldPending(): AsyncGenerator<StreamChunk> {
    if (pending === undefined) return
    const result = await pending
    const error = pendingError
    pending = undefined
    pendingSettled = false
    if (error !== null) {
      log('cot-summarizer: %s', error instanceof Error ? error.message : String(error))
      return
    }
    const deduped = dedupeSentences(result, emitted)
    if (deduped !== '') yield* emitTail(deduped)
  }

  /** Decide whether another segment call is due, given the raw text just grew. */
  const maybeFirePartial = (): void => {
    if (pending !== undefined || !cfg.incremental) return
    const since = rawCoT.length - lastSegmentStart
    if (since < cfg.minReasoningChars) return
    const elapsed = Date.now() - lastTriggerAt
    const byVolume = since >= cfg.chunkChars && endsAtBoundary(rawCoT)
    const byTime = elapsed >= cfg.chunkIntervalMs
      && since >= Math.max(cfg.minReasoningChars, 64)
      && (endsAtBoundary(rawCoT) || elapsed >= cfg.chunkIntervalMs * 2)
    if (byVolume || byTime) fire()
  }

  /** Whether an un-summarized tail of the raw reasoning is still pending. */
  const hasUnsummarizedTail = (): boolean =>
    !rawShown && rawCoT.trim().length >= cfg.minReasoningChars && rawCoT.length > lastSegmentStart

  for await (const chunk of upstream) {
    // A settled summarizer call is folded at the next chunk boundary so the
    // upstream stream is never paused for it (concurrency stays at one).
    if (pendingSettled) {
      yield* foldPending()
      // The reasoning phase ended while the call was in flight: the remaining
      // tail is handed to the next call now that the slot is free.
      if (reasoningDone && pending === undefined && hasUnsummarizedTail()) fire()
    }
    switch (chunk.type) {
      case 'block-start': {
        if (chunk.blockType === 'reasoning') {
          sawReasoning = true
          if (summaryIndex === -1) summaryIndex = chunk.index
          continue
        }
        yield chunk
        continue
      }
      case 'reasoning-delta': {
        sawReasoning = true
        rawCoT += chunk.text
        maybeFirePartial()
        continue
      }
      case 'block-end': {
        if (chunk.block.type === 'reasoning') {
          sawReasoning = true
          if (!reasoningDone) {
            reasoningDone = true
            const trimmed = rawCoT.trim()
            if (trimmed === '') {
              // nothing to summarize
            } else if (trimmed.length < cfg.minReasoningChars) {
              yield* emitRawReasoning(trimmed)
            } else if (pending === undefined && hasUnsummarizedTail()) {
              // Reasoning complete: one final call covers the remaining tail
              // while the reply streams (folded at a later boundary, so the
              // reply is never delayed).
              fire()
            }
          }
          continue
        }
        yield chunk
        continue
      }
      case 'text-delta':
      case 'tool-call-delta':
      case 'usage': {
        yield chunk
        continue
      }
      case 'finish': {
        if (!sawReasoning) {
          yield chunk
          return
        }
        const aborted = callerSignal?.aborted === true
        if (!aborted) {
          if (pending !== undefined) yield* foldPending()
          const trimmed = rawCoT.trim()
          if (hasUnsummarizedTail()) {
            // The reasoning never closed (an error finish) or a tail remained:
            // run the final segment call now.
            fire()
            yield* foldPending()
          }
          if (emitted === '' && !rawShown && trimmed.length >= cfg.minReasoningChars) {
            // Every summarizer call failed and nothing was shown yet: apply
            // the configured failure policy.
            if (cfg.onError === 'pass-through') {
              yield* emitRawReasoning(trimmed)
            } else {
              yield* emitTail(UNAVAILABLE_PLACEHOLDER)
            }
          }
        }
        if (summaryStarted && !summaryClosed) {
          summaryClosed = true
          yield { type: 'block-end', index: blockIndex(), block: { type: 'reasoning', text: emitted } }
        }
        // The stream was rewritten (raw reasoning swallowed), so the
        // adapter's lossless replay state no longer matches the assembled
        // assistant content — dropping it keeps later requests from
        // rejecting the historical message ("replay state does not match").
        const { replayState: _replayState, ...finishWithoutReplay } = chunk
        yield finishWithoutReplay
        return
      }
    }
  }
}

/** Plugin entry: register settings, then wrap every streaming model call. */
export function apply(ctx: Context, config: CotSummarizerConfig = {}): () => void {
  const scope = ctx.settings.register(COT_SUMMARIZER_SETTINGS_NAMESPACE, Config, {
    base: config,
    applies: 'live',
    validate: (value) => {
      resolveConfig(value)
    },
  })
  installCotSummarizerWeb(ctx, scope)
  let cfg: ResolvedCotSummarizerConfig = resolveConfig(scope.get())
  const watch = scope.watch((next) => {
    try {
      cfg = resolveConfig(next)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger.warn('cot-summarizer: keeping the previous generation after a refused Settings change. %s', message)
    }
  })
  const listener = ctx.on('llm/stream', async function* (
    options: GenerateOptions,
    next: () => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    if (!cfg.enabled) {
      yield* next()
      return
    }
    yield* transformCoTStream(next(), cfg, summarizeCoT, options.signal, (message, ...args) => {
      ctx.logger.warn(message, ...args)
    })
  })
  return () => {
    watch()
    listener()
  }
}
