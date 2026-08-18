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

test('streamReasoningBlock and reasoningBlockWaitMs have settings UI controls', () => {
  // Both fields exist in the config schema with defaults; without a control
  // the user cannot perceive or tune the pre-reply ordering fix.
  for (const field of ['streamReasoningBlock', 'reasoningBlockWaitMs']) {
    assert.match(source, new RegExp(`draft\\.${field}`),
      `settings UI must bind draft.${field}`)
    for (const key of [field, `${field}Hint`]) {
      const occurrences = source.split(key).length - 1
      assert.ok(occurrences >= 3, `${key} must appear in EN locale, ZH locale, and the view (found ${occurrences})`)
    }
  }
  // The wait input is gated on the toggle (same pattern as adaptiveChunk).
  assert.match(source, /draft\.streamReasoningBlock !== false &&/,
    'the wait input renders only while streamReasoningBlock is on')
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
