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
 * covers whatever tail remains when the reasoning completes. The Web Client
 * renders the result as the usual "Think" disclosure row. Settings surface
 * in the Web Client settings page under the `cot-summarizer` namespace.
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

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
// Type-only import activates the session Events declaration (`session/event`).
import type {} from '@deepseek-ai/dsh-session'
import { BlockAssembler, isAgentLoopRequest } from '@deepseek-ai/dsh-llm'
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
import { createRawCapture, createRawHistoryRestorer, type RawCoTCapture } from './history.ts'

export {
  createRawCapture,
  createRawHistoryRestorer,
  restoreRawAssistantMessage,
  type RawCoTCapture,
  type RawHistoryRestorer,
  type SessionLike,
} from './history.ts'

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
 * Length of the longest common substring of two normalized sentences. A
 * restatement often keeps one contiguous core ("永远凑不齐，故无有限步保证")
 * while varying the prefix, which bigram similarity waters down.
 */
function longestCommonSubstring(a: string, b: string): number {
  let best = 0
  const row = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    let prev = 0
    for (let j = 1; j <= b.length; j++) {
      const current = row[j]
      if (a[i - 1] === b[j - 1]) {
        row[j] = prev + 1
        if (row[j] > best) best = row[j]
      } else {
        row[j] = 0
      }
      prev = current
    }
  }
  return best
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
    if (norm.length < 8) {
      kept.push(part)
      continue
    }
    const duplicate = existing.some((s) => (
      sentenceSimilarity(s, norm) >= 0.65 || longestCommonSubstring(s, norm) >= 12
    ))
    if (!duplicate) kept.push(part)
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
 */
export async function* transformCoTStream(
  upstream: AsyncIterable<StreamChunk>,
  cfg: ResolvedCotSummarizerConfig,
  summarize: SummarizeFn,
  callerSignal: AbortSignal | undefined,
  log: (message: string, ...args: unknown[]) => void = () => {},
  capture: RawCoTCapture | undefined = undefined,
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
  /** The raw segment handed to the in-flight call, for echo detection. */
  let pendingSegment = ''
  /**
   * Assembly over the UNTOUCHED upstream stream — the wire-exact blocks the
   * adapter produced. The replacement message for the model-visible surface
   * is rebuilt from these (the emitted stream reorders blocks, and adapters
   * validate replay state against the wire order).
   */
  const rawAssembler = new BlockAssembler()

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
    pendingSegment = segment
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
    const segment = pendingSegment
    pending = undefined
    pendingSettled = false
    if (error !== null) {
      log('cot-summarizer: %s', error instanceof Error ? error.message : String(error))
      return
    }
    // Echo guard: a summarizer that returns the raw segment (near-verbatim)
    // instead of summarizing would leak the hidden reasoning into the block.
    if (segment.length >= 200) {
      const normResult = normalizeSentence(result)
      const normSegment = normalizeSentence(segment)
      if (sentenceSimilarity(normSegment, normResult) >= 0.85
        || longestCommonSubstring(normSegment, normResult) >= 40) {
        log('cot-summarizer: dropped a summary that echoes the raw reasoning')
        return
      }
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
    // Every upstream chunk — including the swallowed reasoning — feeds the
    // wire-exact assembly the surface restoration replays.
    rawAssembler.push(chunk)
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
          if (capture !== undefined) capture.sawReasoning = true
          if (summaryIndex === -1) summaryIndex = chunk.index
          continue
        }
        yield chunk
        continue
      }
      case 'reasoning-delta': {
        sawReasoning = true
        if (capture !== undefined) capture.sawReasoning = true
        rawCoT += chunk.text
        maybeFirePartial()
        continue
      }
      case 'block-end': {
        if (chunk.block.type === 'reasoning') {
          sawReasoning = true
          if (capture !== undefined) capture.sawReasoning = true
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
        if (capture !== undefined) {
          capture.replayState = chunk.replayState
          capture.rawBlocks = rawAssembler.blocks()
        }
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
        // The stream was rewritten (raw reasoning swallowed): even the
        // verbatim re-emissions re-open the reasoning block at block-end or
        // finish time — AFTER later blocks already opened, so the loop's
        // first-seen assembly can reorder blocks against the adapter's wire.
        // Adapters validate replay state against the wire ("block N does not
        // match assistant content"), so the finish NEVER carries it here; the
        // captured state travels exclusively on the surface-restored message,
        // whose content is the wire-exact upstream assembly.
        const { replayState: _replayState, ...finishWithoutReplay } = chunk
        yield finishWithoutReplay
        return
      }
    }
  }
  // A stream that ended without a finish chunk still assembled raw content
  // the loop may land as a message.
  if (capture !== undefined && capture.rawBlocks === undefined) capture.rawBlocks = rawAssembler.blocks()
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
  // Raw-history restoration: loop-built requests carry a sessionId, and their
  // landed summary messages get a model-only surface replacement carrying the
  // raw chain of thought (the UI transcript is unaffected).
  const restorer = createRawHistoryRestorer((message, ...args) => {
    ctx.logger.warn(message, ...args)
  })
  const sessionListener = ctx.on('session/event', (session, event) => {
    restorer.handleSessionEvent(session, event)
  })
  const disposeListener = ctx.on('session/disposed', (session) => {
    restorer.forget(String(session.id))
  })
  const listener = ctx.on('llm/stream', async function* (
    options: GenerateOptions,
    next: () => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    // Only agent-loop requests land in a session transcript; other llm/stream
    // callers (session titles, compaction, one-shots) never render a Think
    // row, may run concurrently with the loop's own call on the SAME session
    // id (a title call would overwrite the loop's tracker and silently skip
    // restoration), and pay a pointless summarizer round trip.
    if (!cfg.enabled || !isAgentLoopRequest(options)) {
      yield* next()
      return
    }
    let capture: RawCoTCapture | undefined
    if (cfg.preserveRawForModel && options.sessionId !== undefined) {
      capture = createRawCapture()
      restorer.track(String(options.sessionId), capture)
    }
    yield* transformCoTStream(next(), cfg, summarizeCoT, options.signal, (message, ...args) => {
      ctx.logger.warn(message, ...args)
    }, capture)
  })
  return () => {
    watch()
    listener()
    sessionListener()
    disposeListener()
  }
}
