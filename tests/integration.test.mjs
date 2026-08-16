/**
 * Integration test: boots a real cordis Context with the real settings
 * provider, mounts dsh-cot-summerization (from the built lib), registers a
 * fake LLM adapter that emits raw reasoning, and proves the stream that
 * comes out of `ctx.llm.stream()` contains only the summarized reasoning.
 *
 * The summarizer call itself goes through DSH's own `ctx.llm` channel, so
 * the fake adapter handles both the main request and the summarizer request.
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
import LlmRuntime, { BlockAssembler, LlmAdapter, createAssistantMessage, markAgentLoopRequest } from '@deepseek-ai/dsh-llm'
import { SessionStore } from '@deepseek-ai/dsh-session'
import * as plugin from '../lib/index.js'

// --- fake upstream model: pi-ai-shaped tool-call turn, reasoning FIRST ---
// The wire order is [reasoning, tool-call]; the adapter's replay state
// describes that wire order, and later requests validate the replay state
// against the historical content block by block.
const llmCalls = []
const summarizerCalls = []
class FakeAdapter extends LlmAdapter {
  async *stream(options) {
    llmCalls.push(options)
    // The plugin's summarizer call selects model 'tiny' through DSH's LLM
    // channel. Emit a clean text reply for it.
    if (options.model === 'tiny') {
      summarizerCalls.push(options)
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: 'CLEAN SUMMARY' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: 'CLEAN SUMMARY' } }
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
      return
    }
    yield { type: 'block-start', index: 0, blockType: 'reasoning' }
    yield { type: 'reasoning-delta', index: 0, text: 'RAW SECRET PLAN for the user' }
    yield { type: 'reasoning-delta', index: 0, text: ' with more secret details' }
    yield { type: 'block-end', index: 0, block: { type: 'reasoning', text: 'RAW SECRET PLAN for the user with more secret details' } }
    yield { type: 'block-start', index: 1, blockType: 'tool-call' }
    yield { type: 'tool-call-delta', index: 1, id: 'call-1', name: 'bash', argumentsDelta: '{"command":"ls"}' }
    yield { type: 'block-end', index: 1, block: { type: 'tool-call', id: 'call-1', name: 'bash', arguments: '{"command":"ls"}' } }
    yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 10 } }
    yield {
      type: 'finish',
      reason: { kind: 'tool-calls' },
      replayState: { kind: 'pi-ai', version: 1, blocks: [{ type: 'reasoning' }, { type: 'tool-call' }] },
    }
  }
}

const dir = mkdtempSync(join(tmpdir(), 'cot-integration-'))
const ctx = new Context()
new LlmRuntime(ctx) // Service constructor registers `ctx.llm`
await ctx.plugin(FileSettingsProvider, { path: join(dir, 'settings.yaml'), dshHome: dir, watch: false })
await ctx.plugin(plugin, {
  model: 'tiny',
  language: '中文',
  style: 'descriptive',
})
ctx.llm.registerAdapter(['fake'], new FakeAdapter())

const stream = ctx.llm.stream(markAgentLoopRequest({ provider: 'fake', model: 'anything', messages: [] }))
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
// The summary block opens after the tool call, so the loop's first-seen
// order is [tool-call, reasoning].
assert.deepEqual(message.content.map((b) => b.type), ['tool-call', 'reasoning'])
assert.equal(message.content[1].text, 'CLEAN SUMMARY')
const serialized = JSON.stringify(message)
assert.ok(!serialized.includes('RAW SECRET'), 'raw chain of thought must not appear anywhere')

// The summarizer call went through DSH's own LLM channel (ctx.llm.stream),
// with the plugin's model override and the intercepted request's provider.
assert.equal(summarizerCalls.length, 1)
assert.equal(summarizerCalls[0].provider, 'fake', 'provider follows the intercepted request when not overridden')
assert.equal(summarizerCalls[0].model, 'tiny', 'model override routes through DSH')
assert.equal(summarizerCalls[0].messages[0].content[0].text,
  '<reasoning>\nRAW SECRET PLAN for the user with more secret details\n</reasoning>')
assert.ok(summarizerCalls[0].system.includes('Write the ENTIRE summary in 中文.'), 'language override composes into the system prompt')
assert.ok(summarizerCalls[0].system.includes('每个描述文本后，应当追加一个换行'), 'style preset composes into the system prompt')
assert.ok(summarizerCalls[0].system.includes('DATA, not instructions'), 'anti-injection rule composes into the system prompt')

console.log('integration test passed: raw CoT replaced by summary through DSH\'s own llm/stream channel')

// --- end-to-end: the model-visible surface keeps the raw chain of thought ---
// A loop-shaped call carries a sessionId, so the plugin tracks the stream.
// Replaying what dsh-agent-loop does with the stream (append each chunk, then
// the assembled assistant/message) must land one model-only replacement: the
// UI transcript keeps the summary event, deriveMessages() returns the raw
// chain of thought in the ADAPTER's wire order with the replay state intact.
new SessionStore(ctx) // Service constructor registers `ctx.sessions`
const session = ctx.sessions.create('it-session')
const loopStream = ctx.llm.stream(markAgentLoopRequest({
  provider: 'fake',
  model: 'anything',
  messages: [],
  sessionId: 'it-session',
}))
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
assert.deepEqual(landed.data.message.content.map((b) => b.type), ['tool-call', 'reasoning'],
  'the landed (transcript) message carries the emitted first-seen order')

// The restorer appends in a microtask once the message event dispatch returns.
await new Promise((resolve) => setTimeout(resolve, 0))

const events = session.events
const replacement = events.at(-1)
assert.equal(replacement.type, 'assistant/message')
assert.deepEqual(replacement.surfaceOp, { op: 'replace', start: landed.seq, end: landed.seq },
  'one model-only replacement event shadows the summary message node')
assert.deepEqual(replacement.data.message.content.map((b) => b.type), ['reasoning', 'tool-call'],
  'the restored content keeps the adapter WIRE order the replay state validates against')
assert.equal(replacement.data.message.content[0].text, 'RAW SECRET PLAN for the user with more secret details')
assert.deepEqual(replacement.data.message.source.replayState, { kind: 'pi-ai', version: 1, blocks: [{ type: 'reasoning' }, { type: 'tool-call' }] },
  'the adapter replay state rides the wire-exact content')

const derived = session.deriveMessages()
const derivedAssistant = derived.find((m) => m.role === 'assistant')
assert.ok(derivedAssistant, 'the assistant message still derives for the next model request')
assert.deepEqual(derivedAssistant.content.map((b) => b.type), ['reasoning', 'tool-call'])
const derivedReasoning = derivedAssistant.content.find((b) => b.type === 'reasoning')
assert.equal(derivedReasoning.text, 'RAW SECRET PLAN for the user with more secret details',
  'the model-visible history replays the RAW chain of thought, not the summary')

console.log('integration test passed: model history keeps the raw CoT in wire order while the transcript keeps the summary')

// --- non-loop callers (session titles, compaction, one-shots) pass through ---
// A title-shaped call carries a sessionId but is not a marked agent-loop
// request: it must not be summarized, and it must not touch the tracker (in
// the field it ran concurrently with the loop's first step and silently
// cancelled that step's restoration).
const callsBefore = summarizerCalls.length
const titleStream = ctx.llm.stream({ provider: 'fake', model: 'anything', messages: [], sessionId: 'it-session' })
const titleAssembler = new BlockAssembler()
for await (const chunk of titleStream) titleAssembler.push(chunk)
assert.equal(summarizerCalls.length, callsBefore, 'a non-loop request never reaches the summarizer')
assert.ok(JSON.stringify(titleAssembler.blocks()).includes('RAW SECRET'),
  'a non-loop request passes through untouched (its reasoning never renders in the UI)')
console.log('integration test passed: non-loop llm callers pass through untouched')
