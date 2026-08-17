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

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}
