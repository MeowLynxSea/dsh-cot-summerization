/**
 * Structural regression tests for the client settings UI.
 *
 * The React components behind the settings page live in `src/client.tsx`,
 * which compiles to a `window.__ModuleLoader__` browser bundle and so cannot
 * be imported from Node. These checks therefore assert on the source markup
 * structure that guards the reported bug: `Field` may not render a `<label>`
 * when its children can include `Switch`, which itself renders a `<label>` —
 * nested `<label>`s are invalid HTML and cause double/erratic toggling.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'src', 'client.tsx'), 'utf8')

test('Field renders a <div>, not a <label>, so it never wraps the Switch label', () => {
  // The Field root must be a div; the old buggy implementation used
  // `<label className="dshc-field">`, nesting a label inside a label.
  assert.match(source, /<div\s+className="dshc-field">/, 'Field root should be a <div className="dshc-field">')
  assert.doesNotMatch(source, /<label\s+className="dshc-field">/, 'Field must not render <label className="dshc-field">')
})

test('Switch keeps its own <label> for click semantics', () => {
  assert.match(source, /<label\s+className="dshc-switch">/, 'Switch should keep its own <label className="dshc-switch">')
})

test('Field and Switch are defined separately (no label wrapping a label)', () => {
  // Extract the Field body and make sure it contains no nested <label>.
  const fieldStart = source.indexOf('function Field(')
  assert.ok(fieldStart >= 0, 'Field component exists')
  const switchStart = source.indexOf('function Switch(')
  assert.ok(switchStart > fieldStart, 'Switch is defined after Field')

  const fieldBody = source.slice(fieldStart, switchStart)
  assert.doesNotMatch(fieldBody, /<label\b/, 'Field body must not emit any <label> element')
})

test('the onError dropdown renders every policy the config schema accepts', () => {
  // Config/schema accept hide | pass-through | drop; the settings UI must
  // render one <option> per policy (a missing option makes the documented
  // policy unselectable from the Web settings page).
  for (const policy of ['hide', 'pass-through', 'drop']) {
    assert.match(source, new RegExp(`<option value="${policy}">`),
      `onError <select> must render an option for "${policy}"`)
  }
  // ...and each option needs its translation key in both locales.
  for (const key of ['onErrorHide', 'onErrorPassThrough', 'onErrorDrop']) {
    const occurrences = source.split(key).length - 1
    assert.ok(occurrences >= 3, `${key} must appear in EN locale, ZH locale, and the <select> (found ${occurrences})`)
  }
})

test('streamReasoningBlock has a settings UI control (wait window folds into timeoutMs)', () => {
  // The field exists in the config schema with a default; without a control
  // the user cannot perceive or tune the pre-reply ordering fix. Its wait
  // window is NOT a separate setting — it reuses timeoutMs, so no
  // reasoningBlockWaitMs control or config key may exist anywhere.
  assert.match(source, /draft\.streamReasoningBlock/, 'settings UI must bind draft.streamReasoningBlock')
  for (const key of ['streamReasoningBlock', 'streamReasoningBlockHint']) {
    const occurrences = source.split(key).length - 1
    assert.ok(occurrences >= 3, `${key} must appear in EN locale, ZH locale, and the view (found ${occurrences})`)
  }
  assert.doesNotMatch(source, /reasoningBlockWaitMs/,
    'the pre-reply wait reuses timeoutMs — no separate reasoningBlockWaitMs UI or key')
})

test('no reasoningBlockWaitMs remains in config or transform sources', () => {
  for (const file of ['config.ts', 'index.ts']) {
    const target = readFileSync(join(here, '..', 'src', file), 'utf8')
    assert.doesNotMatch(target, /reasoningBlockWaitMs/,
      `src/${file} must not reference the removed reasoningBlockWaitMs setting`)
  }
})

test('edits autosave via a dirty flag and a debounce, with no manual save button', () => {
  // The page saves on its own: a draft change must flip a dirty flag that a
  // debounced timer flushes — and there must be no Save button left to click.
  assert.match(source, /useEffect\(\(\) => \{[^]*?\}\s*,\s*\[draft, ready\]\)/,
    'an effect keyed on [draft, ready] must drive the autosave')
  assert.match(source, /state\.dirty = true/, 'a draft change must mark the autosave dirty')
  assert.match(source, /state\.debounce = setTimeout\(/, 'the autosave must debounce the flush')
  assert.doesNotMatch(source, /<button\b/, 'there must be no manual save <button>')
  assert.doesNotMatch(source, /<button/, 'there must be no manual save button at all')
})

test('only one save request is in flight at a time', () => {
  // flushSave must guard re-entry so rapid edits cannot overlap POSTs.
  const flushStart = source.indexOf('const flushSave')
  assert.ok(flushStart >= 0, 'flushSave exists')
  const flushBody = source.slice(flushStart, source.indexOf('\n  }\n', flushStart))
  assert.match(flushBody, /if \(state\.savingNow\) return/, 'flushSave must bail out while a save is in flight')
})

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}
