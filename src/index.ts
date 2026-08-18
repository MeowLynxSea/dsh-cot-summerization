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
 * covers whatever tail remains when the reasoning completes. Completed
 * segments are pushed to the frontend as they land; with `typewriter` on
 * they are revealed one character at a time instead (the single serial
 * stream then paces the reply and the landing behind the reveal). The Web
 * Client renders the result as the usual "Think" disclosure row. Settings
 * surface in the Web Client settings page under the `cot-summarizer`
 * namespace.
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
import { AdaptiveChunkController } from './adaptive.ts'
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

export const inject = ['settings', 'llm']

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
 * "喵~" style fillers count as boundaries (summaries from custom styles may
 * end clauses with 喵~ instead of punctuation).
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

/** Wait `ms` milliseconds; the pacing delay of the optional typewriter. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Atomic character queue for typewriter emission. Completed summary segments
 * are appended whole; the emitter pops one code point at a time from the head
 * (`for...of` iterates by code point, so surrogate pairs — emoji — stay
 * whole). Push and pop are only ever invoked from the single transform
 * generator thread, so the operations cannot interleave and need no locking.
 */
class CharQueue {
  private chars: string[] = []
  private head = 0

  get empty(): boolean {
    return this.head >= this.chars.length
  }

  /** Append a whole segment to the tail. */
  push(segment: string): void {
    if (segment === '') return
    // Compact once the consumed prefix grows: keeps memory bounded to the
    // un-emitted text plus one segment.
    if (this.head > 4096) {
      this.chars = this.chars.slice(this.head)
      this.head = 0
    }
    for (const char of segment) this.chars.push(char)
  }

  /** Pop the first un-emitted code point, or undefined when empty. */
  pop(): string | undefined {
    if (this.empty) return undefined
    const char = this.chars[this.head]
    this.head += 1
    return char
  }

  /** Pop the whole remaining content as one string (non-typewriter mode). */
  drainAll(): string {
    if (this.empty) return ''
    const text = this.chars.slice(this.head).join('')
    this.chars = []
    this.head = 0
    return text
  }
}

/**
 * Wrap one model stream: swallow every reasoning chunk, stream everything
 * else untouched, and emit the summarized reasoning in place of the raw
 * chain of thought.
 *
 * The replacement reasoning block reuses the index of the first raw
 * reasoning block, and its content grows segment by segment as partial
 * summaries land — the block-start is emitted with the first partial, so
 * the assembled message keeps the summary above the reply text. Completed
 * segments are queued and pushed to the frontend as they land — whole, or
 * one character per `typewriterIntervalMs` when `typewriter` is on (the
 * serial stream then paces everything downstream, see `drainQueue`). The
 * transform is index-safe for the session log's `BlockAssembler`: forwarded
 * blocks keep their indices verbatim, and the summary block never collides
 * with them because the raw reasoning index is freed by swallowing.
 *
 * Ordering guarantee (`streamReasoningBlock`, on by default): the Web
 * Client renders content blocks strictly in first-seen order, so a segment
 * summary settling after the reply already streamed would re-open the
 * reasoning block UNDER the reply. The preferred closing segment call is
 * awaited inline — bounded by `timeoutMs` — ahead of the first
 * reply chunk (and of the finish chunk); a call that misses the window
 * degrades in place (placeholder under `hide`, raw reasoning under
 * `pass-through`, landed summaries kept either way) and its late result is
 * dropped. Fire-and-forget midstream segments never wait. Verbatim short
 * chains on interleaved wire streams (a reply block opens before the
 * reasoning block closes) are deferred to just before the finish chunk as
 * one atomic Think row. The model-visible surface restore always rebuilds
 * the wire-exact order independently of any of this (see `./history.ts`).
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
 * @param now - clock injectable for deterministic tests; defaults to `Date.now`.
 */
export async function* transformCoTStream(
  upstream: AsyncIterable<StreamChunk>,
  cfg: ResolvedCotSummarizerConfig,
  summarize: SummarizeFn,
  callerSignal: AbortSignal | undefined,
  log: (message: string, ...args: unknown[]) => void = () => {},
  capture: RawCoTCapture | undefined = undefined,
  now: () => number = Date.now,
): AsyncGenerator<StreamChunk> {
  let rawCoT = ''
  let sawReasoning = false
  /** Any reasoning delta ever seen, even before `minReasoningChars` filtering. */
  let sawAnyReasoning = false
  let reasoningDone = false
  let summaryIndex = -1
  let summaryStarted = false
  let summaryClosed = false
  let rawShown = false
  let emitted = ''
  /** Completed segments awaiting emission; drained whole or per character. */
  const queue = new CharQueue()
  /** Raw length already handed to a summarizer call; the next segment starts here. */
  let lastSegmentStart = 0
  let lastTriggerAt = now()
  let pending: Promise<string> | undefined
  let pendingSettled = false
  let pendingError: unknown = null
  /** When the in-flight summarizer call started, for RTT measurement. */
  let pendingStartedAt = 0
  /** The raw segment handed to the in-flight call, for echo detection. */
  let pendingSegment = ''
  /** Adaptive chunk controller; only present when the feature is enabled. */
  const adaptive = cfg.adaptiveChunk
    ? new AdaptiveChunkController({
        baseChunkChars: cfg.chunkChars,
        minChunkChars: cfg.minChunkChars,
        maxChunkChars: cfg.maxChunkChars,
        safetyFactor: cfg.chunkSafetyFactor,
      })
    : undefined
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
   * once it settles. The raw text before this segment is passed along as a
   * bounded context tail so later segments can resolve references to files,
   * sections, or earlier decisions instead of collapsing into terse fragments.
   */
  const fire = (): void => {
    const segment = rawCoT.slice(lastSegmentStart)
    const previousRaw = rawCoT.slice(0, lastSegmentStart).slice(-2000)
    lastSegmentStart = rawCoT.length
    const at = now()
    lastTriggerAt = at
    pendingStartedAt = at
    pendingError = null
    pendingSettled = false
    pendingSegment = segment
    const options = emitted === '' && previousRaw === ''
      ? undefined
      : {
          previousSummary: emitted === '' ? undefined : emitted,
          previousRaw: previousRaw === '' ? undefined : previousRaw,
        }
    pending = summarize(segment, cfg, callerSignal, options)
      .then((result) => {
        pendingSettled = true
        return result
      }, (error: unknown) => {
        pendingSettled = true
        pendingError = error
        return ''
      })
  }

  /**
   * Append a text tail to the replacement reasoning block. The text lands in
   * the queue and in `emitted` (dedup continuity and the block-end payload use
   * the full string) but is pushed to the frontend only by {@link drainQueue}.
   */
  function enqueue(tail: string): void {
    if (tail === '') return
    emitted += tail
    queue.push(tail)
  }

  /**
   * Push the queued summary text to the frontend. With the typewriter off, the
   * whole queued content goes out as a single `reasoning-delta` (identical to
   * the pre-typewriter emission); with it on, one code point per
   * `typewriterIntervalMs` so the Think row reveals the summary character by
   * character. The block opens lazily with its first character. Because the
   * transform yields on a single serial stream, pacing blocks the reply text,
   * the finish chunk, and the landed message behind the reveal — the
   * documented trade-off of the typewriter.
   */
  async function* drainQueue(): AsyncGenerator<StreamChunk> {
    if (queue.empty) return
    if (!cfg.typewriter) {
      if (!summaryStarted) {
        summaryStarted = true
        yield { type: 'block-start', index: blockIndex(), blockType: 'reasoning' }
      }
      const text = queue.drainAll()
      yield { type: 'reasoning-delta', index: blockIndex(), text }
      return
    }
    while (!queue.empty) {
      // An aborted call is being torn down; the consumer stops pulling right
      // after the next chunk, so stop emitting rather than pace the tail.
      if (callerSignal?.aborted === true) return
      const char = queue.pop()
      if (char === undefined) return
      if (!summaryStarted) {
        summaryStarted = true
        yield { type: 'block-start', index: blockIndex(), blockType: 'reasoning' }
      }
      if (cfg.typewriterIntervalMs > 0) await sleep(cfg.typewriterIntervalMs)
      yield { type: 'reasoning-delta', index: blockIndex(), text: char }
    }
  }

  /** Deadline (per `now`) for completing the preferred pre-reply segment call. */
  let preReplyDeadlineAt: number | undefined
  /** Arm the pre-reply wait window; only the preferred segment call gets one. */
  const armPreReplyDeadline = (): void => {
    if (cfg.streamReasoningBlock && preReplyDeadlineAt === undefined) {
      preReplyDeadlineAt = now() + cfg.timeoutMs
    }
  }
  /** The reasoning phase is closed and the wait window has expired. */
  const preReplyDeadlinePassed = (): boolean =>
    reasoningDone
    && preReplyDeadlineAt !== undefined
    && now() >= preReplyDeadlineAt

  /**
   * Keep the Think disclosure row above the reply even when the summarizer is
   * slow. Without this, a segment summary that settles after the reply (or the
   * finish chunk) already passed re-opens the reasoning block at the tail —
   * the Web Client renders message content blocks strictly in first-seen
   * order, so the Think row would land underneath the reply.
   *
   * The moment a TEXT / TOOL-CALL block opens (or the finish chunk arrives)
   * while the reasoning phase is already closed, the preferred segment call
   * is unfolded inline: it is awaited up to `timeoutMs`, its
   * result folded, the queue drained, and the block closed with
   * `assembleReasoningEnd` — all BEFORE the triggering chunk is forwarded.
   * Waiting grants the segment-continuity invariant (folding order can never
   * invert), and the index is freed upstream so the assembler accepts any
   * emission order.
   *
   * When the call has not settled by the deadline the block is closed
   * immediately with the assembled text (full raw under `pass-through` —
   * but only when NO summary segment ever landed — the placeholder under
   * `hide`, whatever already streamed under `drop`). A `drop` close with
   * nothing emitted skips the Think row entirely — the block never opens.
   * Late segment results are DROPPED either way, which strictly dominates
   * the previous behavior of emitting them above the landed message at
   * stream end. Everything produced by this helper stays in correct stream
   * order — as in-order consumers expect — so no recovery emission rides
   * the finish.
   */
  function assembleReasoningEnd(): string {
    if (rawShown) return rawCoT.trim()
    if (cfg.onError === 'pass-through' && emitted === '') {
      // Backfill ONLY the never-summarized case: replacing an already
      // streamed summary with the full raw chain would flash the hidden
      // reasoning over content the user already read, and it would erase
      // landed work. With segments on screen the landed text simply stays
      // (identical to `drop` for the tail).
      const trimmed = rawCoT.trim()
      if (trimmed !== '') return trimmed
    }
    if (cfg.onError === 'drop') return emitted
    return emitted === '' ? UNAVAILABLE_PLACEHOLDER : emitted
  }

  /**
   * Await the in-flight segment call up to the wait deadline, fold its
   * result when it lands in time, drain the queue, and close the reasoning
   * block. Idempotent; the no-op switch cases leave the flags alone so a
   * later trigger of the same or another kind still runs the full sequence.
   */
  async function* streamReasoningBlock(): AsyncGenerator<StreamChunk> {
    if (summaryClosed) return
    if (cfg.streamReasoningBlock && pending !== undefined && !pendingSettled) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const timeout = new Promise<'timeout'>((resolve) => {
          const waitMs = Math.max(0, cfg.timeoutMs)
          timer = setTimeout(() => resolve('timeout'), waitMs)
        })
        const winner = await Promise.race([pending.then(() => 'settled' as const), timeout])
        if (winner === 'settled') yield* foldPending()
      } finally {
        if (timer !== undefined) clearTimeout(timer)
      }
    }
    yield* drainQueue()
    // Deliver whatever the final block text adds beyond the already-drained
    // queue (the placeholder under `hide`, the raw reasoning under
    // `pass-through`): a streaming consumer must SEE the fallback even
    // though it only materializes at close time. Still ahead of the reply
    // and the finish chunk, so the live order stays intact. Under `drop`
    // with nothing emitted there is nothing to show: no Think row at all.
    const endText = assembleReasoningEnd()
    if (endText === '' && !summaryStarted) {
      summaryClosed = true
      return
    }
    if (!summaryStarted) {
      summaryStarted = true
      yield { type: 'block-start', index: blockIndex(), blockType: 'reasoning' }
    }
    if (endText !== emitted) {
      const tail = endText.startsWith(emitted) ? endText.slice(emitted.length) : endText
      if (tail !== '') yield { type: 'reasoning-delta', index: blockIndex(), text: tail }
    }
    summaryClosed = true
    yield { type: 'block-end', index: blockIndex(), block: { type: 'reasoning', text: endText } }
  }

  /** Show the raw reasoning verbatim in its own Think row (short input / pass-through). */
  function* emitRawReasoning(text: string): Generator<StreamChunk> {
    if (summaryStarted) return
    const index = blockIndex()
    rawShown = true
    summaryStarted = true
    summaryClosed = true
    yield { type: 'block-start', index, blockType: 'reasoning' }
    yield { type: 'reasoning-delta', index, text }
    yield { type: 'block-end', index, block: { type: 'reasoning', text } }
  }

  /**
   * Fold the in-flight call's result into the stream: each segment summary
   * is appended to the emission queue (segments never depend on each other,
   * so a rewritten or failed segment cannot stall the stream), with
   * sentences that repeat the already-emitted summary dropped. Blocks only
   * while the call is still running (callers invoke it after the call
   * settled, or at the terminal finish where blocking is unavoidable).
   * Failures are logged and skipped; the end-of-stream fallback policy
   * lives in the finish handler.
   */
  async function* foldPending(): AsyncGenerator<StreamChunk> {
    if (pending === undefined) return
    const result = await pending
    adaptive?.recordRtt(now() - pendingStartedAt)
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
    // Apply it to shorter segments too — with a relative threshold for small
    // inputs — because a short raw reasoning echoed verbatim is still a leak.
    if (segment.length >= 24) {
      const normResult = normalizeSentence(result)
      const normSegment = normalizeSentence(segment)
      const similarity = sentenceSimilarity(normSegment, normResult)
      const lcs = longestCommonSubstring(normSegment, normResult)
      const lcsThreshold = Math.max(16, Math.min(40, Math.floor(segment.length * 0.75)))
      if (similarity >= 0.85 || lcs >= lcsThreshold) {
        log('cot-summarizer: dropped a summary that echoes the raw reasoning')
        return
      }
    }
    const deduped = dedupeSentences(result, emitted)
    if (deduped !== '') enqueue(deduped)
  }

  /** Current volume threshold: configured chunk size, or the adaptive estimate. */
  const currentChunkChars = (): number => adaptive?.currentChunkChars() ?? cfg.chunkChars

  /** Decide whether another segment call is due, given the raw text just grew. */
  const maybeFirePartial = (): void => {
    if (pending !== undefined || !cfg.incremental) return
    const since = rawCoT.length - lastSegmentStart
    if (since < cfg.minReasoningChars) return
    const elapsed = now() - lastTriggerAt
    const byVolume = since >= currentChunkChars() && endsAtBoundary(rawCoT)
    const byTime = elapsed >= cfg.chunkIntervalMs
      && since >= Math.max(cfg.minReasoningChars, 64)
      && (endsAtBoundary(rawCoT) || elapsed >= cfg.chunkIntervalMs * 2)
    if (byVolume || byTime) fire()
  }

  /** Whether an un-summarized tail of the raw reasoning is still pending. */
  const hasUnsummarizedTail = (): boolean =>
    !rawShown && rawCoT.trim().length >= cfg.minReasoningChars && rawCoT.length > lastSegmentStart

  /** The exact chunk kinds the reply-suppression predicate matches. */
  const isReplyChunk = (c: StreamChunk): boolean =>
    c.type === 'text-delta' || c.type === 'tool-call-delta'
    || (c.type === 'block-start' && (c.blockType === 'text' || c.blockType === 'tool-call'))
  /**
   * True between the first interleaved reply chunk and the raw reasoning's
   * block-end. The verbatim short-CoT emission opens its block AT the
   * block-end — which on such streams lands after the interleaved chunks —
   * so verbatim streams suppress too, deferring the emission to the finish
   * (see `rawShown`). With streamReasoningBlock on the summary path
   * suppresses once the reasoning phase is closed and not yet displayed.
   */
  let replyInterleaved = false

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
    // Completed segments go out here — whole (typewriter off) or one code
    // point per interval (typewriter on). Queued text always precedes the
    // current upstream chunk, so the summary block keeps opening before the
    // reply.
    yield* drainQueue()
    // Reply-suppression trigger: a text / tool-call chunk arrives while the
    // reasoning phase is closed. The raw call's preferred wait window may
    // still be running (fast reply streams) or already expired — either way
    // the Think row must close ABOVE this chunk (see `streamReasoningBlock`,
    // which waits out the grace time first). The verbatim short-CoT path
    // opens its block at the raw reasoning's block-END, which an interleaved
    // adapter can close after the tool call's block-start: emit it ahead of
    // the interleaved chunk instead, keeping every Think row first-seen.
    if (isReplyChunk(chunk) && sawAnyReasoning && !reasoningDone) replyInterleaved = true
    const suppressReply = cfg.streamReasoningBlock && isReplyChunk(chunk)
      && reasoningDone && !summaryClosed
    if (suppressReply) yield* streamReasoningBlock()
    switch (chunk.type) {
      case 'block-start': {
        if (chunk.blockType === 'reasoning') {
          sawReasoning = true
          sawAnyReasoning = true
          if (capture !== undefined) capture.sawReasoning = true
          // All upstream reasoning blocks are merged into ONE Think row
          // (occupying the first block's index), so its content grows with
          // segment summaries even across interleaved reply blocks; the
          // close above a reply is permanent for the stream.
          if (summaryIndex === -1) summaryIndex = chunk.index
          continue
        }
        yield chunk
        continue
      }
      case 'reasoning-delta': {
        sawReasoning = true
        sawAnyReasoning = true
        if (capture !== undefined) capture.sawReasoning = true
        rawCoT += chunk.text
        adaptive?.recordDelta(chunk.text.length, now())
        maybeFirePartial()
        continue
      }
      case 'block-end': {
        if (chunk.block.type === 'reasoning') {
          sawReasoning = true
          sawAnyReasoning = true
          if (capture !== undefined) capture.sawReasoning = true
          if (!reasoningDone) {
            reasoningDone = true
            const trimmed = rawCoT.trim()
            if (trimmed === '') {
              // nothing to summarize
            } else if (trimmed.length < cfg.minReasoningChars) {
              rawShown = true
              // An interleaved adapter may have already streamed a reply
              // chunk past this point: the Think row is then DEFERRED to
              // the finish (where it still lands ahead of it) instead of
              // reopening after the reply.
              if (!replyInterleaved) yield* emitRawReasoning(trimmed)
            } else if (pending === undefined && hasUnsummarizedTail() && !summaryClosed) {
              // Reasoning complete: the final call covers the remaining
              // tail. Under streamReasoningBlock it is awaited inline
              // (bounded by `timeoutMs`) so its summary joins the
              // block ABOVE the reply instead of trailing under it;
              // otherwise it folds in the background while the reply
              // streams. This is the call whose late settle would push the
              // Think row under the reply — the only one that earns a wait
              // window.
              if (cfg.streamReasoningBlock) {
                fire()
                armPreReplyDeadline()
                yield* streamReasoningBlock()
              } else {
                fire()
              }
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
        // Terminal pre-reply-close trigger: the model skipped the reply and
        // answered with reasoning alone. Text-stream consumers get their
        // Think row before finish too (folded after the replay guard so the
        // passthrough shape stays byte-identical).
        if (cfg.streamReasoningBlock
          && !sawReasoning
          && sawAnyReasoning
          && preReplyDeadlinePassed()
        ) yield* streamReasoningBlock()
        if (!sawReasoning) {
          yield chunk
          return
        }
        // A deferred verbatim short-CoT emission whose reply never arrived:
        // land it now, still ahead of the finish chunk.
        if (rawShown && !summaryStarted && !summaryClosed && rawCoT.trim() !== '') {
          yield* emitRawReasoning(rawCoT.trim())
        }
        // The reasoning all fit below `minReasoningChars` — never even the
        // placeholder. Close the already-opened Think row so the stream ends
        // with every opened block closed.
        if (cfg.streamReasoningBlock && summaryStarted && !summaryClosed && emitted === '') {
          summaryClosed = true
          yield { type: 'block-end', index: blockIndex(), block: { type: 'reasoning', text: '' } }
        }
        const aborted = callerSignal?.aborted === true
        if (!aborted) {
          // Under streamReasoningBlock an open unclosed block (deadline
          // never armed or never passed — e.g. the tail call is still
          // running at finish) is closed WITH the same grace wait and the
          // assembled fallback, keeping the landed block ahead of finish
          // and cutting the stream's worst-case tail latency from a full
          // summarizer timeout to `timeoutMs`. A block that
          // never opened (placeholder path) is closed below.
          if (cfg.streamReasoningBlock && summaryStarted && !summaryClosed) {
            yield* streamReasoningBlock()
          }
          if (pending !== undefined && !summaryClosed) yield* foldPending()
          const trimmed = rawCoT.trim()
          if (hasUnsummarizedTail() && !summaryClosed) {
            // The reasoning never closed (an error finish) or a tail remained:
            // run the final segment call now.
            fire()
            yield* foldPending()
          }
          if (cfg.streamReasoningBlock && !summaryClosed) {
            // A block that never opened (no landed segment) gets the same
            // graceful close — echo-guard rejections included — so the
            // placeholder/pass-through fallback reaches streaming consumers
            // ahead of the finish chunk.
            yield* streamReasoningBlock()
          }
          if (emitted === '' && !rawShown && !summaryClosed && trimmed.length >= cfg.minReasoningChars) {
            // Every summarizer call failed and nothing was shown yet: apply
            // the configured failure policy. Under `drop` the Think row
            // stays closed — nothing is shown at all.
            if (cfg.onError === 'pass-through') {
              yield* emitRawReasoning(trimmed)
            } else if (cfg.onError !== 'drop') {
              enqueue(UNAVAILABLE_PLACEHOLDER)
            }
          }
          // The queue must be empty before the block closes: with the
          // typewriter on this paces the reveal here and therefore delays the
          // finish chunk (and the landed message) — the documented trade-off.
          yield* drainQueue()
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
    // Route the summarizer through DSH's own LLM channel. The provider/model
    // come from the plugin settings when set, otherwise they follow the
    // intercepted request's provider/model — so credentials and provider
    // configuration stay unified with DSH, and other plugins see the call.
    const summarize: SummarizeFn = (raw, resolvedCfg, signal, summarizeOptions) => {
      const provider = resolvedCfg.provider !== '' ? resolvedCfg.provider : options.provider
      const model = resolvedCfg.model !== '' ? resolvedCfg.model : options.model
      return summarizeCoT(raw, resolvedCfg, ctx.llm, provider, model, signal, summarizeOptions)
    }
    yield* transformCoTStream(next(), cfg, summarize, options.signal, (message, ...args) => {
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
