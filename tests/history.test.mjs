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
  return resolveConfig({ model: 'mini', ...overrides })
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
    // Real adapters carry the complete accumulated text in block-end.
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: RAW_A + RAW_B } },
    { type: 'block-start', index: 1, blockType: 'text' },
    { type: 'text-delta', index: 1, text: 'Answer.' },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'Answer.' } },
    { type: 'finish', reason: { kind: 'stop' }, replayState: { blocks: ['reasoning', 'text'] } },
  ]
}

/**
 * A pi-ai-style tool-call turn: the reasoning streams first on the wire, and
 * a deferred summarizer lands the summary only at finish, so the emitted
 * stream opens the tool call before the late-opening summary block and the
 * loop's landed message orders the blocks [tool-call, reasoning]. The
 * adapter's replay state describes the WIRE order [reasoning, tool-call];
 * the restored message must match the wire, not the landed order.
 */
function toolCallUpstream() {
  return [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: RAW_A },
    { type: 'reasoning-delta', index: 0, text: RAW_B },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: RAW_A + RAW_B } },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 1, id: 'call-1', name: 'bash', argumentsDelta: '{"command":"ls"}' },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-1', name: 'bash', arguments: '{"command":"ls"}' } },
    { type: 'finish', reason: { kind: 'tool-calls' }, replayState: { kind: 'pi-ai', blocks: [{ type: 'reasoning' }, { type: 'tool-call' }] } },
  ]
}

/**
 * The second field failure's shape: an INTERLEAVED wire stream — thinking
 * opens first, the tool call streams, then the thinking block closes — so
 * the short-CoT verbatim path re-emits the reasoning at its block-END, after
 * the tool call's block-start already passed. The loop's first-seen assembly
 * orders the blocks [tool-call, reasoning] while the wire (and its replay
 * state) is [reasoning, tool-call]. The finish must never carry the replay
 * state, and the restore must rebuild the wire order.
 */
function interleavedShortUpstream() {
  return [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: "Let's read the file." },
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 1, id: 'call-9', name: 'read', argumentsDelta: '{"path":"x"}' },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: "Let's read the file." } },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-9', name: 'read', arguments: '{"path":"x"}' } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 2 } },
    { type: 'finish', reason: { kind: 'tool-calls' }, replayState: { kind: 'pi-ai', blocks: [{ type: 'reasoning' }, { type: 'tool-call' }] } },
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
  assert.deepEqual(capture.rawBlocks.map((b) => b.type), ['reasoning', 'text'], 'the wire blocks are assembled over the upstream stream')
  assert.equal(capture.rawBlocks[0].text, RAW_A + RAW_B, 'the raw reasoning is captured verbatim')
  assert.equal(capture.rawBlocks[1].text, 'Answer.')
  assert.deepEqual(capture.replayState, { blocks: ['reasoning', 'text'] }, 'the finish replay state is captured')
  assert.ok(!('replayState' in out.at(-1)), 'the emitted finish still drops the replay state')
  const json = JSON.stringify(out)
  assert.ok(!json.includes('SECRET'), 'the raw chain of thought never leaks into the stream')
  console.log('ok - the transform captures the wire-exact blocks and replay state for restoration')
}

async function testRestoreKeepsWireOrder() {
  // The exact field failure: previously the landed message ordered the
  // blocks [tool-call, reasoning] when the summarizer round trip outlasted
  // the tool-call chunks, while the replay state describes the WIRE order
  // [reasoning, tool-call] — and the adapter rejected the next request
  // ("block 0 does not match assistant content", INVALID_REPLAY_STATE).
  // The pre-reply close now keeps the landed order matching the wire:
  // with a zero wait window the late summary degrades to the placeholder
  // but the reasoning block still lands FIRST. The restored message must
  // carry the WIRE order regardless (the placeholder/summary never enters
  // the model-visible surface).
  const capture = createRawCapture()
  const deferredSummary = async () => {
    await new Promise((resolve) => setTimeout(resolve, 50))
    return 'I will run a command.'
  }
  const out = await collect(transformCoTStream(toolCallUpstream(), cfg({ minReasoningChars: 10, timeoutMs: 1 }),
    deferredSummary, undefined, () => {}, capture))
  const { blocks } = assemble(out)
  assert.deepEqual(blocks.map((b) => b.type), ['reasoning', 'tool-call'],
    'the reasoning block stays above the tool call — a summary that misses the wait window degrades to the placeholder, never to a trailing Think row')
  assert.equal(blocks[0].text, UNAVAILABLE_PLACEHOLDER, 'the late segment summary is dropped for ordering')
  const landed = assembledMessage(blocks)

  const restored = restoreRawAssistantMessage(landed, capture)
  assert.notEqual(restored, undefined)
  assert.deepEqual(restored.content.map((b) => b.type), ['reasoning', 'tool-call'],
    'the restored message keeps the adapter wire order')
  assert.equal(restored.content[0].text, RAW_A + RAW_B)
  assert.equal(restored.content[1].name, 'bash')
  assert.deepEqual(restored.source.replayState, { kind: 'pi-ai', blocks: [{ type: 'reasoning' }, { type: 'tool-call' }] },
    'the replay state rides the wire-exact content')
  console.log('ok - the restore rebuilds the wire order a replay state validates against')
}

async function testRestoreMessage() {
  const capture = createRawCapture()
  capture.sawReasoning = true
  capture.rawBlocks = [{ type: 'reasoning', text: RAW_A + RAW_B }, { type: 'text', text: 'Answer.' }]
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

  // Nothing to restore in the empty / identical cases.
  const empty = createRawCapture()
  empty.sawReasoning = true
  empty.rawBlocks = [{ type: 'text', text: 'Answer.' }]
  assert.equal(restoreRawAssistantMessage(landed, empty), undefined, 'no raw reasoning means no restoration')
  const identical = createRawCapture()
  identical.sawReasoning = true
  identical.rawBlocks = [{ type: 'reasoning', text: 'summarized.' }]
  assert.equal(restoreRawAssistantMessage(assembledMessage([{ type: 'reasoning', text: 'summarized.' }]), identical),
    undefined, 'matching content means no surface churn')
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
  capture.rawBlocks = [{ type: 'reasoning', text: RAW_A }]
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
  const mmCapture = createRawCapture()
  mmCapture.sawReasoning = true
  mmCapture.rawBlocks = [{ type: 'reasoning', text: RAW_A }]
  restorer.track('mm', mmCapture)
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
  const abCapture = createRawCapture()
  abCapture.sawReasoning = true
  abCapture.rawBlocks = [{ type: 'reasoning', text: RAW_A }]
  restorer.track('ab', abCapture)
  restorer.handleSessionEvent(abandoned, chunkEvent(1, 0))
  restorer.handleSessionEvent(abandoned, { type: 'turn/end', seq: 8, time: 1, data: { turn: 1, reason: { kind: 'aborted' } } })
  restorer.handleSessionEvent(abandoned, messageEvent(landed, 9, 1, 0))
  await drainMicrotasks()
  assert.equal(abandoned.appends.length, 0, 'no restoration after the tracker was dropped at turn end')

  // A refused append (surface no longer valid) is contained and logged.
  const refusing = fakeSession('rf', true)
  const logs = []
  const refusingRestorer = createRawHistoryRestorer((message, ...args) => { logs.push(message, ...args) })
  const rfCapture = createRawCapture()
  rfCapture.sawReasoning = true
  rfCapture.rawBlocks = [{ type: 'reasoning', text: RAW_A }]
  refusingRestorer.track('rf', rfCapture)
  refusingRestorer.handleSessionEvent(refusing, chunkEvent(1, 0))
  refusingRestorer.handleSessionEvent(refusing, messageEvent(landed, 3))
  await drainMicrotasks()
  assert.equal(logs.length, 2)
  assert.match(logs.join(' '), /surface rejected/)
  console.log('ok - the restorer guards against self-loops, mismatches, and refused appends')
}

async function testVerbatimStreamRestoresWireOrder() {
  // Short reasoning passes through verbatim for DISPLAY. On an interleaved
  // wire stream (the tool call opens before the reasoning block closes) the
  // verbatim row once landed spliced INTO the reply or after the finish —
  // the second field failure (session.jsonl seq 166-172: landed
  // [tool-call, reasoning] + replayState → INVALID_REPLAY_STATE at the next
  // request, and no replacement followed because rawShown used to skip
  // restoration). The verbatim emission now stays WHOLE and ahead of the
  // finish chunk, the finish still drops the replay state, and the surface
  // restore lands the wire-exact message with it.
  const capture = createRawCapture()
  const out = await collect(transformCoTStream(interleavedShortUpstream(), cfg({ minReasoningChars: 32 }),
    async () => { throw new Error('must not be called for short reasoning') }, undefined, () => {}, capture))

  const last = out.at(-1)
  assert.equal(last.type, 'finish')
  assert.ok(!('replayState' in last), 'a touched stream never carries the finish replay state')
  const { blocks } = assemble(out)
  assert.deepEqual(blocks.map((b) => b.type), ['tool-call', 'reasoning'],
    'an interleaved wire order keeps the tool call first-seen; the verbatim row lands whole ahead of the finish')
  // The whole verbatim Think row is emitted atomically between the last
  // tool-call chunk and the finish — never spliced into the reply.
  const toolEnd = out.findIndex((c) => c.type === 'block-end' && c.block?.type === 'tool-call')
  const reasoningStart = out.findIndex((c) => c.type === 'block-start' && c.blockType === 'reasoning')
  assert.ok(toolEnd !== -1 && reasoningStart > toolEnd, 'the verbatim row opens only after the tool call closed')

  const landed = assembledMessage(blocks, { kind: 'pi-ai', blocks: [{ type: 'reasoning' }, { type: 'tool-call' }] })
  const restored = restoreRawAssistantMessage(landed, capture)
  assert.notEqual(restored, undefined, 'verbatim pass-through still restores the wire order')
  assert.deepEqual(restored.content.map((b) => b.type), ['reasoning', 'tool-call'])
  assert.deepEqual(restored.source.replayState, { kind: 'pi-ai', blocks: [{ type: 'reasoning' }, { type: 'tool-call' }] })
  console.log('ok - verbatim short-CoT streams strip the replay state and restore the wire order')
}

async function testIdenticalContentSkipsRestore() {
  // A landed message that already equals the wire assembly AND carries the
  // captured replay state needs no surface churn; identical content whose
  // replay state was stripped from the finish still gets a replacement that
  // only re-attaches the state.
  const capture = createRawCapture()
  capture.sawReasoning = true
  capture.rawBlocks = [{ type: 'reasoning', text: RAW_A }, { type: 'text', text: 'Answer.' }]
  const identical = assembledMessage(capture.rawBlocks)
  assert.equal(restoreRawAssistantMessage(identical, capture), undefined,
    'wire-identical content with no captured state never produces a replacement')

  capture.replayState = { kind: 'pi-ai' }
  assert.notEqual(restoreRawAssistantMessage(identical, capture), undefined,
    'identical content missing its stripped replay state still gets the state re-attached')

  const withState = assembledMessage(capture.rawBlocks, { kind: 'pi-ai' })
  assert.equal(restoreRawAssistantMessage(withState, capture), undefined,
    'identical content already carrying the state is left alone')

  const reordered = assembledMessage([{ type: 'text', text: 'Answer.' }, { type: 'reasoning', text: RAW_A }])
  assert.notEqual(restoreRawAssistantMessage(reordered, capture), undefined,
    'reordered content still gets the wire-order replacement')
  console.log('ok - the restore decision compares the full content and the replay state')
}

async function testPlaceholderStillRestores() {
  // Under onError: hide the UI shows a placeholder; the model-visible
  // surface still gets the raw chain of thought (locate the reasoning block
  // by type).
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
await testRestoreKeepsWireOrder()
await testRestoreMessage()
await testRestorerLandsReplacement()
await testRestorerGuards()
await testVerbatimStreamRestoresWireOrder()
await testIdenticalContentSkipsRestore()
await testPlaceholderStillRestores()
console.log('all history tests passed')
