/**
 * Tests for the raw-history restoration: the capture recorded while one model
 * stream is rewritten, the pure message restore, and the session-event
 * restorer that lands the model-only surface replacement. Runs against the
 * built lib via `node tests/history.test.mjs`.
 */
import assert from 'node:assert/strict'
import { BlockAssembler, createAssistantMessage } from '@deepseek-ai/dsh-llm'
import {
  createRawCapture,
  createRawHistoryRestorer,
  restoreRawAssistantMessage,
  transformCoTStream,
  UNAVAILABLE_PLACEHOLDER,
} from '../lib/index.js'
import { resolveConfig } from '../lib/config.js'

/** A resolved config with the given partial overrides. */
function cfg(overrides = {}) {
  return resolveConfig({ baseUrl: 'https://example.test/v1', model: 'mini', apiKey: 'k', ...overrides })
}

async function collect(gen) {
  const out = []
  for await (const chunk of gen) out.push(chunk)
  return out
}

/** Assemble a chunk list the same way the agent loop does. */
function assemble(list) {
  const assembler = new BlockAssembler()
  for (const chunk of list) assembler.push(chunk)
  return { blocks: assembler.blocks(), finish: assembler.finish }
}

const RAW_A = 'SECRET raw reasoning part one. '
const RAW_B = 'SECRET raw reasoning part two.'

/** A summarizing upstream with one reasoning block and a reply. */
function summarizingUpstream() {
  return [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: RAW_A },
    { type: 'reasoning-delta', index: 0, text: RAW_B },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'raw' } },
    { type: 'block-start', index: 1, blockType: 'text' },
    { type: 'text-delta', index: 1, text: 'Answer.' },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'Answer.' } },
    { type: 'finish', reason: { kind: 'stop' }, replayState: { blocks: ['reasoning', 'text'] } },
  ]
}

/** The assistant message the loop would assemble from a chunk list. */
function assembledMessage(blocks, replayState) {
  return createAssistantMessage({
    content: blocks,
    source: { provider: 'deepseek', model: 'reasoner', ...(replayState === undefined ? {} : { replayState }) },
  })
}

/** A landed assistant/message event like the agent loop appends. */
function messageEvent(message, seq, turn = 1, step = 0, surfaceOp = 'append') {
  return { type: 'assistant/message', seq, time: 1, data: { turn, step, message }, surfaceOp }
}

/** A logged assistant/chunk event like the agent loop appends. */
function chunkEvent(turn, step) {
  return { type: 'assistant/chunk', seq: 1, time: 1, data: { turn, step, chunk: { type: 'usage', usage: {} } } }
}

/** A session double that records appends (or refuses them). */
function fakeSession(id, refuseAppends = false) {
  const appends = []
  return {
    id,
    appends,
    append(type, data, opts) {
      if (refuseAppends) throw new Error('surface rejected the replacement')
      appends.push({ type, data, opts })
      return { seq: -1 }
    },
  }
}

/** Drain the microtask queue plus one macrotask turn. */
async function drainMicrotasks() {
  await new Promise((resolve) => queueMicrotask(resolve))
  await new Promise((resolve) => setTimeout(resolve, 0))
}

async function testCaptureRecordsRaw() {
  const capture = createRawCapture()
  const out = await collect(transformCoTStream(summarizingUpstream(), cfg({ minReasoningChars: 10 }),
    async () => 'summarized.', undefined, () => {}, capture))

  assert.equal(capture.sawReasoning, true)
  assert.equal(capture.rawShown, false)
  assert.equal(capture.rawReasoning.length, 1, 'one raw block recorded')
  assert.equal(capture.rawReasoning[0], RAW_A + RAW_B, 'the raw text is captured verbatim')
  assert.deepEqual(capture.replayState, { blocks: ['reasoning', 'text'] }, 'the finish replay state is captured')
  assert.ok(!('replayState' in out.at(-1)), 'the emitted finish still drops the replay state')
  const json = JSON.stringify(out)
  assert.ok(!json.includes('SECRET'), 'the raw chain of thought never leaks into the stream')
  console.log('ok - the transform captures the raw reasoning and replay state for restoration')
}

async function testCaptureMultiBlock() {
  const capture = createRawCapture()
  const upstream = [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: RAW_A },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'raw1' } },
    { type: 'block-start', index: 1, blockType: 'text' },
    { type: 'text-delta', index: 1, text: 'Hi' },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'Hi' } },
    { type: 'block-start', index: 2, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 2, text: RAW_B },
    { type: 'block-end', index: 2, block: { type: 'reasoning', text: 'raw2' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  await collect(transformCoTStream(upstream, cfg({ minReasoningChars: 10 }), async () => 's.', undefined, () => {}, capture))
  assert.deepEqual(capture.rawReasoning, [RAW_A, RAW_B], 'each upstream reasoning block is captured separately')
  console.log('ok - multi-reasoning-block streams capture one raw text per block')
}

async function testRestoreMessage() {
  const capture = createRawCapture()
  capture.sawReasoning = true
  capture.rawReasoning = [RAW_A + RAW_B]
  capture.replayState = { blocks: ['reasoning', 'text'] }
  const landed = assembledMessage(
    [{ type: 'reasoning', text: 'summarized.' }, { type: 'text', text: 'Answer.' }],
    undefined,
  )

  const restored = restoreRawAssistantMessage(landed, capture)
  assert.notEqual(restored, undefined)
  assert.equal(restored.content[0].type, 'reasoning')
  assert.equal(restored.content[0].text, RAW_A + RAW_B, 'the reasoning block carries the raw chain of thought')
  assert.equal(restored.content[1].text, 'Answer.', 'the reply text is untouched')
  assert.deepEqual(restored.source.replayState, { blocks: ['reasoning', 'text'] }, 'the replay state is reattached')
  assert.equal(restored.source.provider, 'deepseek')
  assert.notEqual(restored.id, landed.id, 'the replacement message gets a fresh identity')

  // Multi-block raws concatenate into the single emitted summary block.
  const multi = createRawCapture()
  multi.sawReasoning = true
  multi.rawReasoning = [RAW_A, RAW_B]
  const restoredMulti = restoreRawAssistantMessage(landed, multi)
  assert.equal(restoredMulti.content[0].text, RAW_A + RAW_B)

  // Nothing to restore in the pass-through / empty / identical cases.
  const rawShown = { ...capture, rawShown: true }
  assert.equal(restoreRawAssistantMessage(landed, rawShown), undefined, 'verbatim streams need no restoration')
  const empty = createRawCapture()
  empty.sawReasoning = true
  assert.equal(restoreRawAssistantMessage(landed, empty), undefined, 'no raw text means no restoration')
  const identical = createRawCapture()
  identical.sawReasoning = true
  identical.rawReasoning = ['summarized.']
  assert.equal(restoreRawAssistantMessage(landed, identical), undefined, 'matching text means no surface churn')
  console.log('ok - the restore rebuilds the message with raw reasoning and the replay state')
}

async function testRestorerLandsReplacement() {
  // End-to-end through the transform: capture, then feed the session events
  // the loop would append for the same stream.
  const capture = createRawCapture()
  const out = await collect(transformCoTStream(summarizingUpstream(), cfg({ minReasoningChars: 10 }),
    async () => 'summarized.', undefined, () => {}, capture))
  const { blocks } = assemble(out)
  const landed = assembledMessage(blocks)

  const session = fakeSession('s1')
  const logs = []
  const restorer = createRawHistoryRestorer((message) => { logs.push(message) })
  restorer.track('s1', capture)

  restorer.handleSessionEvent(session, chunkEvent(1, 0))
  restorer.handleSessionEvent(session, messageEvent(landed, 7))
  await drainMicrotasks()

  assert.equal(logs.length, 0, 'the happy path logs nothing')
  assert.equal(session.appends.length, 1, 'exactly one replacement event is appended')
  const [append] = session.appends
  assert.equal(append.type, 'assistant/message')
  assert.deepEqual(append.opts.surfaceOp, { op: 'replace', start: 7, end: 7 }, 'the landed message node is replaced')
  assert.deepEqual(append.opts.sourceEventSeqs, [7], 'the replacement cites the shadowed node')
  assert.equal(append.data.turn, 1)
  assert.equal(append.data.step, 0)
  assert.equal(append.data.message.content[0].text, RAW_A + RAW_B, 'the model-visible message carries the raw reasoning')
  assert.deepEqual(append.data.message.source.replayState, { blocks: ['reasoning', 'text'] })
  assert.equal(append.data.usage, undefined, 'usage stays on the original event only')

  // The loop's own next append (turn/end) after the restore finds no tracker.
  restorer.handleSessionEvent(session, { type: 'turn/end', seq: 9, time: 1, data: { turn: 1, reason: { kind: 'completed' } } })
  await drainMicrotasks()
  assert.equal(session.appends.length, 1)
  console.log('ok - the restorer lands one model-only replacement carrying the raw chain of thought')
}

async function testRestorerGuards() {
  const capture = createRawCapture()
  capture.sawReasoning = true
  capture.rawReasoning = [RAW_A]
  const landed = assembledMessage([{ type: 'reasoning', text: 's.' }])

  // Replacement-shaped events must never trigger another restore.
  const looping = fakeSession('loop')
  const restorer = createRawHistoryRestorer()
  restorer.track('loop', capture)
  restorer.handleSessionEvent(looping, chunkEvent(1, 0))
  restorer.handleSessionEvent(looping, messageEvent(landed, 3, 1, 0, 'append'))
  await drainMicrotasks()
  assert.equal(looping.appends.length, 1)
  const replacement = looping.appends[0]
  const replacementEvent = messageEvent(replacement.data.message, 4, 1, 0, { op: 'replace', start: 3, end: 3 })
  restorer.handleSessionEvent(looping, replacementEvent)
  await drainMicrotasks()
  assert.equal(looping.appends.length, 1, 'a replacement event is not append-origin and never restores again')

  // A turn/step mismatch (a different stream's message) does not restore.
  const mismatched = fakeSession('mm')
  restorer.track('mm', { ...createRawCapture(), sawReasoning: true, rawReasoning: [RAW_A] })
  restorer.handleSessionEvent(mismatched, chunkEvent(1, 0))
  restorer.handleSessionEvent(mismatched, messageEvent(landed, 5, 2, 0))
  await drainMicrotasks()
  assert.equal(mismatched.appends.length, 0, 'a message from another turn never restores')

  // Untracked sessions are ignored.
  const stranger = fakeSession('other')
  restorer.handleSessionEvent(stranger, chunkEvent(1, 0))
  restorer.handleSessionEvent(stranger, messageEvent(landed, 6))
  await drainMicrotasks()
  assert.equal(stranger.appends.length, 0)

  // turn/end drops an abandoned tracker (aborted stream, no message landed).
  const abandoned = fakeSession('ab')
  restorer.track('ab', { ...createRawCapture(), sawReasoning: true, rawReasoning: [RAW_A] })
  restorer.handleSessionEvent(abandoned, chunkEvent(1, 0))
  restorer.handleSessionEvent(abandoned, { type: 'turn/end', seq: 8, time: 1, data: { turn: 1, reason: { kind: 'aborted' } } })
  restorer.handleSessionEvent(abandoned, messageEvent(landed, 9, 1, 0))
  await drainMicrotasks()
  assert.equal(abandoned.appends.length, 0, 'no restoration after the tracker was dropped at turn end')

  // A refused append (surface no longer valid) is contained and logged.
  const refusing = fakeSession('rf', true)
  const logs = []
  const refusingRestorer = createRawHistoryRestorer((message, ...args) => { logs.push(message, ...args) })
  refusingRestorer.track('rf', { ...createRawCapture(), sawReasoning: true, rawReasoning: [RAW_A] })
  refusingRestorer.handleSessionEvent(refusing, chunkEvent(1, 0))
  refusingRestorer.handleSessionEvent(refusing, messageEvent(landed, 3))
  await drainMicrotasks()
  assert.equal(logs.length, 2)
  assert.match(logs.join(' '), /surface rejected/)
  console.log('ok - the restorer guards against self-loops, mismatches, and refused appends')
}

async function testVerbatimStreamsKeepReplayState() {
  // A stream that ends up showing the raw reasoning verbatim (short input)
  // assembles content identical to upstream, so the finish chunk keeps the
  // adapter replay state and no surface restoration is needed.
  const capture = createRawCapture()
  const upstream = [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: 'short thought' },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'short thought' } },
    { type: 'finish', reason: { kind: 'stop' }, replayState: { blocks: ['reasoning'] } },
  ]
  const out = await collect(transformCoTStream(upstream, cfg({ minReasoningChars: 100 }),
    async () => 'x', undefined, () => {}, capture))

  assert.deepEqual(out.at(-1).replayState, { blocks: ['reasoning'] }, 'verbatim streams keep the replay state')
  assert.equal(capture.rawShown, true)
  const { blocks } = assemble(out)
  const restored = restoreRawAssistantMessage(assembledMessage(blocks), capture)
  assert.equal(restored, undefined, 'verbatim pass-through never restores')
  console.log('ok - verbatim pass-through keeps the replay state and skips restoration')
}

async function testPlaceholderStillRestores() {
  // Under onError: hide the UI shows a placeholder; the model-visible
  // surface still gets the raw chain of thought. With no partial summary
  // landed, the placeholder block opens after the streamed reply, so locate
  // the reasoning block by type.
  const capture = createRawCapture()
  const out = await collect(transformCoTStream(summarizingUpstream(), cfg({ minReasoningChars: 10 }),
    async () => { throw new Error('boom') }, undefined, () => {}, capture))
  const { blocks } = assemble(out)
  const reasoning = blocks.find((block) => block.type === 'reasoning')
  assert.equal(reasoning.text, UNAVAILABLE_PLACEHOLDER)
  const restored = restoreRawAssistantMessage(assembledMessage(blocks), capture)
  assert.notEqual(restored, undefined)
  const restoredReasoning = restored.content.find((block) => block.type === 'reasoning')
  assert.equal(restoredReasoning.text, RAW_A + RAW_B)
  console.log('ok - a hidden (placeholder) step still restores the raw reasoning for the model')
}

await testCaptureRecordsRaw()
await testCaptureMultiBlock()
await testRestoreMessage()
await testRestorerLandsReplacement()
await testRestorerGuards()
await testVerbatimStreamsKeepReplayState()
await testPlaceholderStillRestores()
console.log('all history tests passed')
