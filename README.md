# dsh-cot-summerization

DeepSeek Harness plugin that hides the model's raw chain of thought (CoT) and
shows a **summarized** chain of thought instead, produced by a small model
through any Chat Completions-compatible API.

- Raw reasoning deltas are swallowed at the `llm/stream` waterfall — they never
  reach the session log, the derived model history, or the UI.
- When the model response finishes, the collected raw reasoning is sent to the
  configured summarizer endpoint, and the summary is emitted as a normal
  reasoning block. The Web Client renders it in the usual collapsible
  "Think" row.
- Configuration lives in the `cot-summarizer` settings namespace and is
  editable in the Web Client settings page.

## Install

From a git repository (e.g. after publishing to GitHub):

```sh
dsh plugin add github:MeowLynxSea/dsh-cot-summerization
```

Or from a local checkout:

```sh
cd ~/.dsh/profiles/web
pnpm add file:/path/to/dsh-cot-summerization
```

The bundle patch is applied automatically; the plugin joins the profile layer
stack as entry `cot-summarizer`. To disable the plugin later, patch it out in
the profile's `cordis.patch.yml`.

## Configuration

Settings namespace: `cot-summarizer` (Web Client → Settings). Example:

```yaml
cot-summarizer:
  enabled: true
  baseUrl: https://api.deepseek.com/v1   # any Chat Completions base URL
  apiKey: ""                              # API key for the summarizer
  model: deepseek-chat                    # the "small model"
  systemPrompt: ""                        # optional custom prompt; {maxSummaryChars} is substituted
  minReasoningChars: 32                   # shorter reasoning is shown verbatim, no API call
  maxSummaryChars: 800                    # summary length cap in the default prompt
  timeoutMs: 30000                        # summarizer request timeout
  onError: hide                           # hide | pass-through — behavior when summarization fails
```

The default `systemPrompt` instructs the summarizer to keep the conclusion, the
key reasoning steps, and important caveats, in the same language as the raw
reasoning, without echoing it verbatim.

## Behavior notes

- A stream without reasoning (non-thinking models) passes through untouched.
- Short reasoning (under `minReasoningChars`) is shown verbatim to avoid an
  API round-trip for trivia.
- On summarizer failure, `hide` (default) shows `[CoT summary unavailable]`;
  `pass-through` shows the raw reasoning.
- The summarizer request is cancelled when the model call itself is aborted,
  and is bounded by `timeoutMs`.

## Development

```sh
npm install
npm run build    # tsc → lib/
npm test         # node tests/transform.test.mjs
```

The package declares `dsh.bundle.patch` (see `cordis.patch.yml`) so `dsh plugin`
reconciliation treats it as a bundle; dependencies install straight from the committed `lib/` build output
dependency, The `lib/` build output is committed, so git, registry, and path installs need no build step.
