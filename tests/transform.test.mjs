/**
 * Unit tests for the CoT stream transform. Runs against the built lib via
 * `node tests/transform.test.mjs`. Uses the real BlockAssembler from
 * @deepseek-ai/dsh-llm to prove the emitted chunk sequence assembles into the
 * intended message.
 *
 * Timing-dependent triggers are kept deterministic: tests run far faster than
 * `chunkIntervalMs` (default 6000), so only the volume + sentence-boundary
 * trigger fires.
 */
import assert from 'node:assert/strict'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { transformCoTStream, UNAVAILABLE_PLACEHOLDER } from '../lib/index.js'
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
  return { blocks: assembler.blocks(), finish: assembler.finish, usage: assembler.usage }
}

/** One reasoning sentence of ~34 chars ending at a sentence boundary. */
function sentence(i) {
  return `SECRET step ${i}: user wants a plan. `
}

/**
 * A typical stream: a reasoning block (index 0) with `count` sentences, then
 * the reply text block (index 1), then usage and a finish carrying replay
 * state.
 */
function streamingUpstream(count = 6) {
  const chunks = [{ type: 'block-start', index: 0, blockType: 'reasoning' }]
  for (let i = 0; i < count; i++) chunks.push({ type: 'reasoning-delta', index: 0, text: sentence(i) })
  chunks.push({ type: 'block-end', index: 0, block: { type: 'reasoning', text: 'raw' } })
  chunks.push({ type: 'block-start', index: 1, blockType: 'text' })
  chunks.push({ type: 'text-delta', index: 1, text: 'Here is the answer.' })
  chunks.push({ type: 'block-end', index: 1, block: { type: 'text', text: 'Here is the answer.' } })
  chunks.push({ type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } })
  chunks.push({ type: 'finish', reason: { kind: 'stop' }, replayState: { blocks: ['reasoning', 'text'] } })
  return chunks
}

/**
 * A summarizer mock that obeys the extension contract: every call re-issues
 * its previous summary and appends a marker, exactly like the real prompt
 * asks.
 */
function prefixMock() {
  const calls = []
  const summarize = async (raw, _cfg, _signal, options) => {
    calls.push({ raw, previous: options?.previousSummary })
    return `${options?.previousSummary ?? ''}[${calls.length}]`
  }
  return { summarize, calls }
}

function reasoningText(out) {
  return out.filter((c) => c.type === 'reasoning-delta').map((c) => c.text).join('')
}

async function testStreamingPartials() {
  const config = cfg({ chunkChars: 60 })
  const { summarize, calls } = prefixMock()
  const out = await collect(transformCoTStream(streamingUpstream(), config, summarize))

  // 6 sentences of 34 chars: partials fire at 68/136/204 chars (sentence
  // boundaries), plus one final call over the complete raw.
  assert.equal(calls.length, 4, 'three partials and one final call')
  assert.equal(calls[0].previous, undefined)
  assert.equal(calls[1].previous, '[1]')
  assert.equal(calls[2].previous, '[1][2]')
  assert.equal(calls[3].previous, '[1][2][3]')
  assert.ok(calls[3].raw.includes('SECRET step 5'), 'the final call receives the complete raw')

  // The raw reasoning never leaks, everything else passes through.
  const json = JSON.stringify(out)
  assert.ok(!json.includes('SECRET'), 'raw chain of thought must not appear in the output')
  assert.ok(out.some((c) => c.type === 'text-delta' && c.text === 'Here is the answer.'))
  assert.ok(out.some((c) => c.type === 'usage'))
  assert.equal(out.at(-1).type, 'finish')
  assert.ok(!('replayState' in out.at(-1)), 'replay state dropped after stream rewrite')

  // The summary grows incrementally and lands as one reasoning block whose
  // text is the final call's result (the partials are its prefixes).
  const text = reasoningText(out)
  assert.equal(text, '[1][2][3][4]')
  const firstBlockStart = out.findIndex((c) => c.type === 'block-start' && c.blockType === 'reasoning')
  const replyBlockStart = out.findIndex((c) => c.type === 'block-start' && c.blockType === 'text')
  assert.ok(firstBlockStart !== -1 && firstBlockStart < replyBlockStart, 'summary block opens before the reply')

  const { blocks } = assemble(out)
  assert.deepEqual(blocks.map((b) => b.type), ['reasoning', 'text'])
  assert.equal(blocks[0].text, '[1][2][3][4]')
  console.log('ok - near-realtime partial summaries grow the Think row above the reply')
}

async function testIncrementalOff() {
  const { summarize, calls } = prefixMock()
  const out = await collect(transformCoTStream(streamingUpstream(), cfg({ incremental: false, chunkChars: 60 }), summarize))
  assert.equal(calls.length, 1, 'incremental off means exactly one summary call')
  assert.equal(calls[0].previous, undefined)
  assert.equal(reasoningText(out), '[1]')
  console.log('ok - incremental off collapses to a single end-of-stream summary')
}

async function testNoReasoningPassThrough() {
  const upstream = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'plain' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'plain' } },
    { type: 'finish', reason: { kind: 'stop' }, replayState: { blocks: ['text'] } },
  ]
  let summarized = false
  const out = await collect(transformCoTStream(upstream, cfg(), async () => { summarized = true; return 'x' }))
  assert.deepEqual(out, upstream, 'untouched stream keeps the adapter replay state')
  assert.equal(summarized, false, 'no summarizer call without reasoning')
  console.log('ok - no-reasoning stream passes through untouched')
}

async function testShortReasoningPassedVerbatim() {
  const upstream = [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: 'short thought' },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'short thought' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  let summarized = false
  const out = await collect(transformCoTStream(upstream, cfg({ minReasoningChars: 100 }),
    async () => { summarized = true; return 'x' }))
  const deltas = out.filter((c) => c.type === 'reasoning-delta')
  assert.equal(deltas.length, 1)
  assert.equal(deltas[0].text, 'short thought')
  assert.equal(summarized, false)
  const { blocks } = assemble(out)
  assert.deepEqual(blocks.map((b) => b.type), ['reasoning'])
  console.log('ok - short reasoning is shown verbatim in a Think row without a summarizer call')
}

async function testErrorHide() {
  const out = await collect(transformCoTStream(streamingUpstream(), cfg({ chunkChars: 60 }),
    async () => { throw new Error('boom') }))
  const deltas = out.filter((c) => c.type === 'reasoning-delta')
  assert.equal(deltas.length, 1)
  assert.equal(deltas[0].text, UNAVAILABLE_PLACEHOLDER)
  const json = JSON.stringify(out)
  assert.ok(!json.includes('SECRET'))
  console.log('ok - on error under hide mode, placeholder shown and raw reasoning stays hidden')
}

async function testErrorPassThrough() {
  const out = await collect(transformCoTStream(streamingUpstream(), cfg({ chunkChars: 60, onError: 'pass-through' }),
    async () => { throw new Error('boom') }))
  const deltas = out.filter((c) => c.type === 'reasoning-delta')
  assert.equal(deltas.length, 1)
  assert.ok(deltas[0].text.includes('SECRET step 0'))
  assert.ok(deltas[0].text.includes('SECRET step 5'), 'the full raw reasoning is forwarded on pass-through')
  console.log('ok - on error under pass-through mode, the raw reasoning is forwarded')
}

async function testAbortedShowsPartialsOnly() {
  const controller = new AbortController()
  controller.abort()
  const upstream = [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: sentence(0) },
    { type: 'reasoning-delta', index: 0, text: sentence(1) },
    { type: 'reasoning-delta', index: 0, text: sentence(2) },
    { type: 'reasoning-delta', index: 0, text: sentence(3) },
    { type: 'finish', reason: { kind: 'aborted' }, replayState: { blocks: ['reasoning'] } },
  ]
  const calls = []
  const out = await collect(transformCoTStream(upstream, cfg({ chunkChars: 60 }), async (raw, _cfg, _signal, options) => {
    calls.push(raw)
    return `${options?.previousSummary ?? ''}[x]`
  }, controller.signal))
  assert.equal(calls.length, 2, 'partials fired during reasoning, no final call after abort')
  assert.ok(reasoningText(out).endsWith('[x]'), 'landed partial summaries are kept on abort')
  assert.equal(out.at(-1).type, 'finish')
  assert.equal(out.at(-1).reason.kind, 'aborted')
  assert.ok(!('replayState' in out.at(-1)))
  console.log('ok - abort keeps landed partials and never runs the final call')
}

async function testDeviatingFinalSkipped() {
  const calls = []
  const summarize = async (raw, _cfg, _signal, options) => {
    calls.push(raw.length)
    if (calls.length === 4) return 'COMPLETELY REWRITTEN SUMMARY'
    return `${options?.previousSummary ?? ''}[${calls.length}]`
  }
  const out = await collect(transformCoTStream(streamingUpstream(), cfg({ chunkChars: 60 }), summarize))
  assert.equal(calls.length, 4)
  const text = reasoningText(out)
  assert.equal(text, '[1][2][3]', 'a rewritten final is skipped; the last partial stays')
  console.log('ok - a final result that rewrites the summary is skipped without corrupting the block')
}

async function testDeviatingFinalCommonPrefix() {
  // 14 sentences; chunkChars 34 fires a partial at every sentence, so the
  // emitted prefix is long enough for the common-prefix fallback to apply.
  const calls = []
  const summarize = async (raw, _cfg, _signal, options) => {
    calls.push(raw.length)
    if (calls.length === 15) return `${options.previousSummary.slice(0, 23)}Z REVISED`
    return `${options?.previousSummary ?? ''}[${calls.length}]`
  }
  const out = await collect(transformCoTStream(streamingUpstream(14), cfg({ chunkChars: 34 }), summarize))
  const text = reasoningText(out)
  assert.ok(text.endsWith('Z REVISED'), 'the tail beyond the common prefix is appended')
  console.log('ok - a final sharing a long common prefix appends its tail')
}

async function testMultiReasoningBlocks() {
  const upstream = [
    { type: 'block-start', index: 0, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 0, text: sentence(0) },
    { type: 'reasoning-delta', index: 0, text: sentence(1) },
    { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'raw1' } },
    { type: 'block-start', index: 1, blockType: 'text' },
    { type: 'text-delta', index: 1, text: 'Hi' },
    { type: 'block-end', index: 1, block: { type: 'text', text: 'Hi' } },
    { type: 'block-start', index: 2, blockType: 'reasoning' },
    { type: 'reasoning-delta', index: 2, text: sentence(2) },
    { type: 'reasoning-delta', index: 2, text: sentence(3) },
    { type: 'block-end', index: 2, block: { type: 'reasoning', text: 'raw2' } },
    { type: 'finish', reason: { kind: 'stop' } },
  ]
  const calls = []
  const summarize = async (raw, _cfg, _signal, options) => {
    calls.push(raw)
    return `${options?.previousSummary ?? ''}[${calls.length}]`
  }
  const out = await collect(transformCoTStream(upstream, cfg({ chunkChars: 60 }), summarize))
  assert.ok(calls.length >= 3, 'partial + early final + complete re-summary')
  assert.ok(calls.at(-1).includes('SECRET step 3'), 'the last call covers both reasoning blocks')
  const text = reasoningText(out)
  assert.ok(text.endsWith(`[${calls.length}]`), 'the block ends with the complete summary')
  const { blocks } = assemble(out)
  assert.deepEqual(blocks.map((b) => b.type), ['reasoning', 'text'], 'both raw reasoning blocks swallowed')
  console.log('ok - multi-reasoning-block streams re-summarize over the complete raw')
}

await testStreamingPartials()
await testIncrementalOff()
await testNoReasoningPassThrough()
await testShortReasoningPassedVerbatim()
await testErrorHide()
await testErrorPassThrough()
await testAbortedShowsPartialsOnly()
await testDeviatingFinalSkipped()
await testDeviatingFinalCommonPrefix()
await testMultiReasoningBlocks()
console.log('all transform tests passed')
