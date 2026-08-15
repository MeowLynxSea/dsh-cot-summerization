/**
 * Integration test: boots a real cordis Context with the real settings
 * provider, mounts dsh-cot-summerization (from the built lib), registers a
 * fake LLM adapter that emits raw reasoning, and proves the stream that
 * comes out of `ctx.llm.stream()` contains only the summarized reasoning.
 *
 * Run from the package directory (devDependencies resolve from the local
 * node_modules): node tests/integration.test.mjs
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { FileSettingsProvider } from '@deepseek-ai/dsh-settings-file'
import LlmRuntime, { BlockAssembler, LlmAdapter, createAssistantMessage } from '@deepseek-ai/dsh-llm'
import { SessionStore } from '@deepseek-ai/dsh-session'
import * as plugin from '../lib/index.js'

// --- fake Chat Completions summarizer endpoint ---
const summaryCalls = []
globalThis.fetch = async (url, init) => {
  summaryCalls.push({ url: String(url), body: JSON.parse(init.body) })
  return new Response(JSON.stringify({ choices: [{ message: { content: 'CLEAN SUMMARY' } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

// --- fake upstream model: interleaved reasoning + text ---
class FakeAdapter extends LlmAdapter {
  async *stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'block-start', index: 1, blockType: 'reasoning' }
    yield { type: 'text-delta', index: 0, text: 'Hi there' }
    yield { type: 'reasoning-delta', index: 1, text: 'RAW SECRET PLAN for the user' }
    yield { type: 'reasoning-delta', index: 1, text: ' with more secret details' }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Hi there' } }
    yield { type: 'block-end', index: 1, block: { type: 'reasoning', text: 'RAW SECRET PLAN for the user with more secret details' } }
    yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 10 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'cot-integration-'))
const ctx = new Context()
new LlmRuntime(ctx) // Service constructor registers `ctx.llm`
await ctx.plugin(FileSettingsProvider, { path: join(dir, 'settings.yaml'), dshHome: dir, watch: false })
await ctx.plugin(plugin, {
  baseUrl: 'https://summarizer.test/v1',
  apiKey: 'secret-key',
  model: 'tiny',
  language: '中文',
  style: 'segmented',
})
ctx.llm.registerAdapter(['fake'], new FakeAdapter())

const stream = ctx.llm.stream({ provider: 'fake', model: 'anything', messages: [] })
const assembler = new BlockAssembler()
for await (const chunk of stream) assembler.push(chunk)
const message = assembler.message()
rmSync(dir, { recursive: true, force: true })

// The settings namespace is registered and surfaces to the Web settings page.
const described = ctx.settings.describe()
const cot = described.find((d) => d.ns === 'cot-summarizer')
assert.ok(cot, 'cot-summarizer namespace must be registered for the Web settings page')
assert.equal(cot.value.model, 'tiny', 'settings surface the resolved configuration')

// The assembled assistant message has the summary, not the raw reasoning.
assert.deepEqual(message.content.map((b) => b.type), ['text', 'reasoning'])
assert.equal(message.content[1].text, 'CLEAN SUMMARY')
const serialized = JSON.stringify(message)
assert.ok(!serialized.includes('RAW SECRET'), 'raw chain of thought must not appear anywhere')

// The summarizer endpoint received one proper Chat Completions request with
// the composed prompt (language override + segmented style preset).
assert.equal(summaryCalls.length, 1)
assert.equal(summaryCalls[0].url, 'https://summarizer.test/v1/chat/completions')
assert.equal(summaryCalls[0].body.model, 'tiny')
assert.equal(summaryCalls[0].body.messages[1].content, 'RAW SECRET PLAN for the user with more secret details')
assert.ok(summaryCalls[0].body.messages[0].content.includes('Write the summary in 中文.'), 'language override composes into the system prompt')
assert.ok(summaryCalls[0].body.messages[0].content.includes('标题：说明'), 'style preset composes into the system prompt')

console.log('integration test passed: raw CoT replaced by summary through the real llm/stream waterfall')

// --- end-to-end: the model-visible surface keeps the raw chain of thought ---
// A loop-shaped call carries a sessionId, so the plugin tracks the stream.
// Replaying what dsh-agent-loop does with the stream (append each chunk, then
// the assembled assistant/message) must land one model-only replacement: the
// UI transcript keeps the summary event, deriveMessages() returns the raw.
new SessionStore(ctx) // Service constructor registers `ctx.sessions`
const session = ctx.sessions.create('it-session')
const loopStream = ctx.llm.stream({
  provider: 'fake',
  model: 'anything',
  messages: [],
  sessionId: 'it-session',
})
const loopAssembler = new BlockAssembler()
const chunkSeqs = []
for await (const chunk of loopStream) {
  chunkSeqs.push(session.append('assistant/chunk', { turn: 1, step: 0, chunk }).seq)
  loopAssembler.push(chunk)
}
// The real loop assembles the assistant message with a model provenance
// (BlockAssembler.message() would stamp a plugin source, which the restore
// correctly refuses to touch).
const loopMessage = createAssistantMessage({
  content: loopAssembler.blocks(),
  source: { provider: 'fake', model: 'anything' },
})
const landed = session.append('assistant/message', {
  turn: 1,
  step: 0,
  message: loopMessage,
}, { surfaceOp: 'append', sourceEventSeqs: chunkSeqs })
assert.equal(landed.data.message.content.at(-1).text, 'CLEAN SUMMARY',
  'the append-origin event (the UI transcript) keeps the summary')

// The restorer appends in a microtask once the message event dispatch returns.
await new Promise((resolve) => setTimeout(resolve, 0))

const events = session.events
const replacement = events.at(-1)
assert.equal(replacement.type, 'assistant/message')
assert.deepEqual(replacement.surfaceOp, { op: 'replace', start: landed.seq, end: landed.seq },
  'one model-only replacement event shadows the summary message node')

const derived = session.deriveMessages()
const derivedAssistant = derived.find((m) => m.role === 'assistant')
assert.ok(derivedAssistant, 'the assistant message still derives for the next model request')
const derivedReasoning = derivedAssistant.content.find((b) => b.type === 'reasoning')
assert.equal(derivedReasoning.text, 'RAW SECRET PLAN for the user with more secret details',
  'the model-visible history replays the RAW chain of thought, not the summary')

console.log('integration test passed: model history keeps the raw CoT while the transcript keeps the summary')
