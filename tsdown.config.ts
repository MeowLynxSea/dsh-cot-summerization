/**
 * Client bundle build: emits `lib/client.js` in the Web Client's module
 * handoff format — `window.__ModuleLoader__.load({ id, factory })`. The
 * factory receives the platform `require` (module table) and returns the
 * bundle exports. Platform modules (react, cordis, ui-slots, ...) stay
 * external and resolve through that table; everything else inlines.
 * @module dsh-cot-summerization/tsdown
 */

import type { UserConfig } from 'tsdown'

/** The module specifiers the Web shell shares into the frozen module table. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots', '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
] as const

/** Externals resolved from the loader module table (plus the runtime client exemption). */
const CLIENT_EXTERNALS: readonly string[] = [...PLATFORM_MODULES, '@deepseek-ai/dsh-client-runtime/client']

export default {
  name: 'dsh-cot-summerization/client',
  entry: { client: 'src/client.tsx' },
  // Browser bundle lands as lib/client.js next to the node half (tsc emits
  // lib/types and the ESM lib/client.js; this pass overwrites the .js only).
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  clean: false,
  sourcemap: false,
  deps: {
    // The loader module table's shared modules resolve through that table and
    // must never be inlined into the bundle.
    neverBundle: [...CLIENT_EXTERNALS],
    // Anything not in the loader module table inlines (type-only imports were
    // already erased by tsc, so only runtime values reach this rule).
    alwaysBundle: (id: string): boolean => !CLIENT_EXTERNALS.includes(id),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "dsh-cot-summerization", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
} satisfies UserConfig
