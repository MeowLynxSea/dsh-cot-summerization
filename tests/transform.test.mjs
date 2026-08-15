/**
 * Unit tests for the CoT stream transform. Runs against the built lib via
 * `node tests/transform.test.mjs`. Uses the real BlockAssembler from
 * @deepseek-ai/dsh-llm to prove the emitted chunk sequence assembles into the
 * intended message.
 */
import assert from 'node:assert/strict'
import { BlockAssembler } from '@deepseek-ai/dsh-llm'
import { transformCoTStream, UNAVAILABLE_PLACEHOLDER } from '../lib/index.js'
import { resolveConfig } from '../lib/config.js'

/** A resolved config with the given partial overrides. */
function cfg(overrides = {}) {
  return resolveConfig({ baseUrl: 'https://example.test/v1', model: 'mini', apiKey: 'k', ...overrides })
}

function run(upstream, config, summarize, signal) {
  return transformCoTStream(upstream, config, summarize, signal)
}

const chunks = (...items) => items

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

/** A typical stream: reasoning block (index 1) interleaved with text (index 0). */
function typicalUpstream() {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'block-start', index: 1, blockType: 'reasoning' },
    { type: 'text-delta', index: 0, text: 'Hello' },
    { type: 'reasoning-delta', index: 1, text: 'SECRET step one: the user wants a plan ' },
    { type: 'text-delta', index: 0, text: ' world' },
    { type: 'reasoning-delta', index: 1, text: 'SECRET step two: then execute it carefully' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello world' } },
    { type: 'block-end', index: 1, block: { type: 'reasoning', text: 'SECRET step one: the user wants a plan SECRET step two: then execute it carefully' } },
    { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } },
    { type: 'finish', reason: { kind: 'stop' }, replayState: { blocks: ['text', 'reasoning'] } },
  ]
}

async function testReplaceWithSummary() {
  const config = cfg()
  const calls = []
  const summarize = async (raw) => { calls.push(raw); return 'SUMMARIZED THINKING' }
  const out = await collect(run(typicalUpstream(), config, summarize))

  // Raw reasoning never leaks.
  const json = JSON.stringify(out)
  assert.ok(!json.includes('SECRET'), 'raw chain of thought must not appear in the output')
  // Everything else passes through.
  assert.ok(out.some(c => c.type === 'text-delta' && c.text === 'Hello'))
  assert.ok(out.some(c => c.type === 'usage'))
  assert.equal(out.at(-1).type, 'finish')
  // The rewritten stream must drop the adapter replay state: it describes the
  // original blocks and would be rejected on the next request.
  assert.ok(!('replayState' in out.at(-1)), 'replay state dropped after stream rewrite')
  // The summary arrives as one reasoning block before finish.
  const reasoning = out.filter(c => c.type === 'reasoning-delta')
  assert.equal(reasoning.length, 1)
  assert.equal(reasoning[0].text, 'SUMMARIZED THINKING')
  assert.equal(calls.length, 1)
  assert.ok(calls[0].includes('SECRET'), 'summarizer receives the raw reasoning')

  // The assembled message keeps block order: text, then summarized reasoning.
  const { blocks, finish } = assemble(out)
  assert.deepEqual(blocks.map(b => b.type), ['text', 'reasoning'])
  assert.equal(blocks[1].text, 'SUMMARIZED THINKING')
  assert.equal(finish.kind, 'stop')
  console.log('ok - replaces raw reasoning with the summary, order preserved')
}

async function testNoReasoningPassThrough() {
  const upstream = [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text: 'plain' },
    { type: 'block-end', index: 0, block: { type: 'text', text: 'plain' } },
    { type: 'finish', reason: { kind: 'stop' }, replayState: { blocks: ['text'] } },
  ]
  let summarized = false
  const out = await collect(run(upstream, cfg(), async () => { summarized = true; return 'x' }))
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
  const out = await collect(run(upstream, cfg({ minReasoningChars: 100 }), async () => { summarized = true; return 'x' }))
  const reasoning = out.filter(c => c.type === 'reasoning-delta')
  assert.equal(reasoning.length, 1)
  assert.equal(reasoning[0].text, 'short thought')
  assert.equal(summarized, false)
  console.log('ok - short reasoning is shown verbatim without a summarizer call')
}

async function testErrorHide() {
  const out = await collect(run(typicalUpstream(), cfg(), async () => { throw new Error('boom') }))
  const reasoning = out.filter(c => c.type === 'reasoning-delta')
  assert.equal(reasoning.length, 1)
  assert.equal(reasoning[0].text, UNAVAILABLE_PLACEHOLDER)
  const json = JSON.stringify(out)
  assert.ok(!json.includes('SECRET'))
  console.log('ok - on error under hide mode, placeholder shown and raw reasoning stays hidden')
}

async function testErrorPassThrough() {
  const out = await collect(run(typicalUpstream(), cfg({ onError: 'pass-through' }), async () => { throw new Error('boom') }))
  const reasoning = out.filter(c => c.type === 'reasoning-delta')
  assert.equal(reasoning.length, 1)
  assert.ok(reasoning[0].text.includes('SECRET step one'))
  console.log('ok - on error under pass-through mode, raw reasoning is forwarded')
}

async function testAbortedCallerSkipsSummary() {
  const controller = new AbortController()
  controller.abort()
  const out = await collect(run(typicalUpstream(), cfg(), async () => 'never', controller.signal))
  const reasoning = out.filter(c => c.type === 'reasoning-delta')
  assert.equal(reasoning.length, 0, 'no reasoning block after abort')
  assert.equal(out.at(-1).type, 'finish')
  console.log('ok - aborted call emits no replacement reasoning')
}

await testReplaceWithSummary()
await testNoReasoningPassThrough()
await testShortReasoningPassedVerbatim()
await testErrorHide()
await testErrorPassThrough()
await testAbortedCallerSkipsSummary()
console.log('all transform tests passed')
