/**
 * dsh-cot-summerization — browser half. Registers the plugin's settings page
 * into the Web Client's settings shell (`settings.section` slot).
 *
 * The Web Client's generic settings transport only serves a fixed namespace
 * whitelist, so — like the vision toolkit — the page reads and writes its
 * namespace through a same-origin route (`/_dsh/cot-summarizer/settings`)
 * mounted by the host half. Provider/model dropdown options are served by a
 * second same-origin route from DSH's own LLM registry.
 * @module dsh-cot-summerization/client
 */

import { useEffect, useRef, useState } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { CotSummarizerConfig } from './config.ts'

const NS = 'cot-summarizer'
const SETTINGS_ROUTE = '/_dsh/cot-summarizer/settings'
const MODEL_OPTIONS_ROUTE = '/_dsh/cot-summarizer/model-options'

type LocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-cot-summerization settings page copy. */
    'cot-summarizer': LocaleKey
  }
}

const en: Record<string, string> = {
  nav: 'CoT Summary',
  settingsTitle: 'Chain-of-Thought Summarization',
  settingsIntro: 'Hide the model\'s raw chain of thought in the UI and stream a small-model summary in its place. With "Keep raw reasoning for the model" on, the Agent Loop still reasons over the original chain of thought.',
  enabled: 'Enabled',
  preserveRawForModel: 'Keep raw reasoning for the model',
  preserveRawForModelHint: 'Restore the original chain of thought in the model-visible history (Agent Loop performance is unaffected); only the Web UI shows the summary.',
  provider: 'Provider',
  providerHint: 'DSH provider route for the summarizer call. Choose "Current provider" to follow the provider of the current request.',
  providerCurrent: 'Current provider',
  model: 'Summarizer model',
  modelHint: 'Model used through DSH\'s LLM channel. Choose "Current model" to follow the model of the current request, or pick another model.',
  modelCurrent: 'Current model',
  modelOptionsFailed: 'Failed to load model options.',
  systemPrompt: 'Rewrite prompt',
  systemPromptHint: 'Override the prompt used to rewrite the raw reasoning. {maxSummaryChars} is substituted with the cap below.',
  language: 'Output language',
  languageHint: 'Force the language of the condensed chain of thought (e.g. 中文, English). Leave blank to follow the raw reasoning\'s language.',
  style: 'Thinking style',
  styleNone: 'Base (no extra style)',
  styleNative: 'Native (first-person thinking)',
  styleConcise: 'Concise & abstract',
  styleDescriptive: 'Descriptive (title + details)',
  styleWenyan: 'Classical Chinese (文言文)',
  styleCustom: 'Custom (write your own)',
  customStyle: 'Custom style prompt',
  customStyleHint: 'Appended to the summarization prompt: describe the tone, style, or format you want the summary to follow.',
  minReasoningChars: 'Minimum reasoning length',
  minReasoningCharsHint: 'Raw reasoning shorter than this (in characters) is shown verbatim without an API call.',
  maxSummaryChars: 'Summary length cap',
  maxSummaryCharsHint: 'Target maximum length of the summary, in characters.',
  incremental: 'Streaming summaries',
  incrementalHint: 'Summarize progressively while the raw chain of thought streams (near-realtime), instead of once at the end.',
  chunkChars: 'Chunk size (chars)',
  chunkCharsHint: 'Raw reasoning characters accumulated before each partial summary; splits prefer sentence boundaries so the summary grows smoothly.',
  chunkIntervalMs: 'Chunk interval (ms)',
  chunkIntervalMsHint: 'Maximum time between partial summaries on slow streams.',
  adaptiveChunk: 'Adaptive chunk size',
  adaptiveChunkHint: 'Dynamically size chunks from the live stream rate and summarizer RTT.',
  minChunkChars: 'Min adaptive chunk (chars)',
  minChunkCharsHint: 'Lower bound for the adaptive chunk size.',
  maxChunkChars: 'Max adaptive chunk (chars)',
  maxChunkCharsHint: 'Upper bound for the adaptive chunk size.',
  chunkSafetyFactor: 'Chunk RTT factor',
  chunkSafetyFactorHint: 'How many summarizer RTTs of streamed text one chunk should cover.',
  typewriter: 'Typewriter reveal',
  typewriterHint: 'Push the summary one character at a time instead of whole segments. The stream is serial, so the reply text and the landed message wait behind the reveal (roughly summary length × interval).',
  typewriterIntervalMs: 'Typewriter interval (ms)',
  typewriterIntervalMsHint: 'Delay between two revealed characters; 0 disables the delay.',
  streamReasoningBlock: 'Keep Think row above the reply',
  streamReasoningBlockHint: 'When the summary is not ready by the time the reply starts streaming, briefly hold the reply so the Think row never lands below it. Turn off for zero reply delay (a slow summary then trails the reply).',
  reasoningBlockWaitMs: 'Pre-reply wait (ms)',
  reasoningBlockWaitMsHint: 'Maximum time the reply is held back for the closing summary; afterwards the row degrades in place per the failure policy below.',
  timeoutMs: 'Request timeout (ms)',
  onError: 'On summarizer failure',
  onErrorHide: 'Hide reasoning',
  onErrorPassThrough: 'Pass raw reasoning through',
  onErrorDrop: 'Show nothing at all',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  loading: 'Loading…',
  unavailable: 'Settings are unavailable.',
  failed: 'Failed to save:',
}

const zh: Record<string, string> = {
  nav: '思维链总结',
  settingsTitle: '思维链总结（CoT Summarization）',
  settingsIntro: '在界面中隐藏模型的原始思维链，改为流式展示小模型生成的摘要。开启"模型历史保留原文"时，Agent Loop 仍基于原始思维链推理。',
  enabled: '启用',
  preserveRawForModel: '模型历史保留原文',
  preserveRawForModelHint: '在模型可见历史中恢复原始思维链（Agent Loop 推理不受影响），仅 Web 界面显示摘要。',
  provider: '提供方',
  providerHint: '用于总结调用的 DSH 提供方路由。选择“当前提供方”则跟随当前请求的提供方。',
  providerCurrent: '当前提供方',
  model: '总结模型',
  modelHint: '通过 DSH 的 LLM 通道使用的模型。选择“当前模型”则跟随当前请求的模型，也可选择其他模型。',
  modelCurrent: '当前模型',
  modelOptionsFailed: '模型选项加载失败。',
  systemPrompt: '重写提示词',
  systemPromptHint: '覆盖用于重写原始推理的默认提示词。{maxSummaryChars} 会被替换为下方的长度上限。',
  language: '输出语言',
  languageHint: '强制缩略思维链使用的语言（如：中文、English）。留空则跟随原始推理的语言。',
  style: '思维链风格',
  styleNone: '基础（无额外风格）',
  styleNative: '原生（第一人称思考过程）',
  styleConcise: '简洁（高度抽象）',
  styleDescriptive: '描述型（标题+说明）',
  styleWenyan: '文言',
  styleCustom: '自定义（自己写风格）',
  customStyle: '自定义风格提示',
  customStyleHint: '追加到总结提示词末尾：描述你希望摘要遵循的语气、风格或格式。',
  minReasoningChars: '最短推理长度',
  minReasoningCharsHint: '短于该长度（字符数）的原始思维链直接展示，不调用接口。',
  maxSummaryChars: '摘要长度上限',
  maxSummaryCharsHint: '摘要的目标最大长度（字符数）。',
  incremental: '流式分批总结',
  incrementalHint: '思维链流式输出过程中分批调用总结（接近实时），而不是结束后一次性总结。',
  chunkChars: '分块大小（字符）',
  chunkCharsHint: '每累积多少字符的原始推理触发一次阶段性总结；切分优先选择句子边界，摘要会平滑增长。',
  chunkIntervalMs: '分块间隔（毫秒）',
  chunkIntervalMsHint: '流式较慢时，两次阶段性总结之间的最大时间间隔。',
  adaptiveChunk: '自适应分块',
  adaptiveChunkHint: '根据实时流速率和总结器 RTT 动态调整分块大小。',
  minChunkChars: '自适应最小分块（字符）',
  minChunkCharsHint: '自适应分块的下限。',
  maxChunkChars: '自适应最大分块（字符）',
  maxChunkCharsHint: '自适应分块的上限。',
  chunkSafetyFactor: '分块 RTT 系数',
  chunkSafetyFactorHint: '一个分块大约覆盖多少个总结器 RTT 的流式文本。',
  typewriter: '逐字推送',
  typewriterHint: '摘要按字逐个推送到前端，而不是整段推送。由于流是串行的，回复正文与落库会随之等待（约 摘要字数×间隔）。',
  typewriterIntervalMs: '逐字间隔（毫秒）',
  typewriterIntervalMsHint: '每两个字之间的推送间隔；0 表示不延迟。',
  streamReasoningBlock: '思考行始终在回复上方',
  streamReasoningBlockHint: '当回复开始流动而摘要尚未就绪时，短暂停住回复，保证 Think 折叠行不会掉到回复下方。关闭后回复零等待（慢的摘要会落在回复之后）。',
  reasoningBlockWaitMs: '回复前等待（毫秒）',
  reasoningBlockWaitMsHint: '为收尾段摘要停住回复的最长时间；超时后按下方“总结失败时”策略在原位置降级。',
  timeoutMs: '请求超时（毫秒）',
  onError: '总结失败时',
  onErrorHide: '隐藏思维链（显示占位符）',
  onErrorPassThrough: '展示原始思维链',
  onErrorDrop: '悄无声息（什么都不显示）',
  save: '保存',
  saving: '保存中…',
  saved: '已保存',
  loading: '加载中…',
  unavailable: '设置不可用。',
  failed: '保存失败：',
}

type T = (key: LocaleKey) => string

interface SettingsView {
  settings: CotSummarizerConfig
  revision: number
}

interface CotSummarizerModelOption {
  id: string
  name?: string
}

interface CotSummarizerModelOptions {
  providers: CotSummarizerModelOption[]
  modelsByProvider: Record<string, CotSummarizerModelOption[]>
}

async function fetchView(): Promise<SettingsView> {
  const response = await fetch(SETTINGS_ROUTE)
  const data: unknown = await response.json()
  if (!isOk<SettingsView>(data)) throw new Error(errorMessage(data) ?? 'settings request failed')
  return data.value
}

async function fetchModelOptions(): Promise<CotSummarizerModelOptions> {
  const response = await fetch(MODEL_OPTIONS_ROUTE)
  const data: unknown = await response.json()
  if (!isOk<CotSummarizerModelOptions>(data)) throw new Error(errorMessage(data) ?? 'model options request failed')
  return data.value
}

async function saveView(revision: number, value: Record<string, unknown>): Promise<SettingsView> {
  const response = await fetch(SETTINGS_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: revision, value }),
  })
  const data: unknown = await response.json()
  if (!isOk<SettingsView>(data)) throw new Error(errorMessage(data) ?? 'settings save failed')
  return data.value
}

function isOk<T>(data: unknown): data is { ok: true; value: T } {
  return typeof data === 'object' && data !== null && (data as { ok?: unknown }).ok === true
}

function errorMessage(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const error = (data as { error?: { message?: unknown } }).error
  return typeof error?.message === 'string' ? error.message : undefined
}

interface SettingsInjected {
  t: T
}

type SettingsSectionProps = PropsRuntime<'settings.section'> & SettingsInjected

/**
 * One labeled form row. Rendered as a `<div>` (not `<label>`) because the
 * children may include another interactive `<label>` (the Switch). Nested
 * `<label>`s are invalid HTML: the outer label would hijack clicks aimed at
 * the switch and could toggle twice or behave unpredictably. Form controls
 * are already self-describing, and the label text is a sibling rather than
 * an associated control.
 */
function Field({ label, hint, inline = false, children }: { label: string; hint?: string; inline?: boolean; children: React.ReactNode }) {
  if (inline) {
    // Boolean settings: label (+hint) on the left, the switch pinned to the
    // right edge of the same row — one scannable line instead of a stack.
    return (
      <div className="dshc-field dshc-field-inline">
        <div className="dshc-field-text">
          <span className="dshc-field-label">{label}</span>
          {hint !== undefined && <span className="dshc-field-hint">{hint}</span>}
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="dshc-field">
      <span className="dshc-field-label">{label}</span>
      {children}
      {hint !== undefined && <span className="dshc-field-hint">{hint}</span>}
    </div>
  )
}

/** Toggle switch styled with the host theme; the native checkbox keeps form semantics. */
function Switch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="dshc-switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => { onChange(event.target.checked) }}
      />
      <span className="dshc-switch-track" aria-hidden="true" />
    </label>
  )
}

/** The plugin's settings page, served by the host route. */
function SettingsSection({ t }: SettingsSectionProps) {
  const [view, setView] = useState<SettingsView>()
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<CotSummarizerConfig>({})
  const [modelOptions, setModelOptions] = useState<CotSummarizerModelOptions>()
  const [modelOptionsError, setModelOptionsError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    let cancelled = false
    void fetchView().then((next) => {
      if (cancelled) return
      setView(next)
      setDraft(next.settings)
    }).catch((reason: unknown) => {
      if (cancelled) return
      setError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchModelOptions().then((options) => {
      if (cancelled) return
      setModelOptions(options)
    }).catch((reason: unknown) => {
      if (cancelled) return
      setModelOptionsError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => () => { if (savedTimer.current !== undefined) clearTimeout(savedTimer.current) }, [])

  if (view === undefined) {
    return <p>{error !== undefined ? `${t('unavailable')} ${error}` : t('loading')}</p>
  }

  const set = (field: keyof CotSummarizerConfig, value: unknown): void => {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setSaved(false)
  }

  const save = (): void => {
    setSaving(true)
    setError(undefined)
    const value: Record<string, unknown> = { ...draft }
    void saveView(view.revision, value).then((next) => {
      setView(next)
      setDraft(next.settings)
      setSaving(false)
      setSaved(true)
      if (savedTimer.current !== undefined) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => { setSaved(false) }, 2000)
    }).catch((reason: unknown) => {
      setSaving(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  const selectedProvider = draft.provider ?? ''
  const providerModels = selectedProvider !== '' && modelOptions !== undefined
    ? (modelOptions.modelsByProvider[selectedProvider] ?? [])
    : []
  const currentModel = draft.model ?? ''
  const hasCustomModel = currentModel !== '' && !providerModels.some((model) => model.id === currentModel)

  return (
    <section className="dshc-section">
      <div className="dshc-head">
        <h3>{t('settingsTitle')}</h3>
        <p>{t('settingsIntro')}</p>
      </div>
      <div className="dshc-grid">
        <Field label={t('enabled')} inline>
          <Switch
            checked={draft.enabled ?? true}
            onChange={(checked) => { set('enabled', checked) }}
          />
        </Field>
        <Field label={t('preserveRawForModel')} hint={t('preserveRawForModelHint')} inline>
          <Switch
            checked={draft.preserveRawForModel ?? true}
            onChange={(checked) => { set('preserveRawForModel', checked) }}
          />
        </Field>
        <Field label={t('incremental')} hint={t('incrementalHint')} inline>
          <Switch
            checked={draft.incremental ?? true}
            onChange={(checked) => { set('incremental', checked) }}
          />
        </Field>
        <Field label={t('typewriter')} hint={t('typewriterHint')} inline>
          <Switch
            checked={draft.typewriter ?? false}
            onChange={(checked) => { set('typewriter', checked) }}
          />
        </Field>
        {draft.typewriter === true && (
          <Field label={t('typewriterIntervalMs')} hint={t('typewriterIntervalMsHint')}>
            <input
              type="number"
              min={0}
              max={2000}
              value={draft.typewriterIntervalMs ?? 15}
              onChange={(event) => {
                const parsed = Number(event.target.value)
                if (Number.isFinite(parsed)) set('typewriterIntervalMs', parsed)
              }}
            />
          </Field>
        )}
        <Field label={t('provider')} hint={modelOptionsError !== undefined ? `${t('providerHint')} ${t('modelOptionsFailed')} ${modelOptionsError}` : t('providerHint')}>
          <select
            value={selectedProvider}
            onChange={(event) => {
              const nextProvider = event.target.value
              setDraft((previous) => {
                const next = { ...previous, provider: nextProvider }
                const current = next.model ?? ''
                if (nextProvider !== '' && modelOptions !== undefined && current !== '') {
                  const models = modelOptions.modelsByProvider[nextProvider] ?? []
                  if (!models.some((model) => model.id === current)) next.model = ''
                }
                return next
              })
              setSaved(false)
            }}
          >
            <option value="">{t('providerCurrent')}</option>
            {modelOptions?.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name || provider.id}</option>
            ))}
          </select>
        </Field>
        <Field label={t('model')} hint={modelOptionsError !== undefined ? `${t('modelHint')} ${t('modelOptionsFailed')} ${modelOptionsError}` : t('modelHint')}>
          <select
            value={currentModel}
            onChange={(event) => { set('model', event.target.value) }}
          >
            <option value="">{t('modelCurrent')}</option>
            {providerModels.map((model) => (
              <option key={model.id} value={model.id}>{model.name || model.id}</option>
            ))}
            {hasCustomModel && (
              <option value={currentModel}>{currentModel} (custom)</option>
            )}
          </select>
        </Field>
        <Field label={t('systemPrompt')} hint={t('systemPromptHint')}>
          <textarea
            rows={5}
            value={draft.systemPrompt ?? ''}
            onChange={(event) => { set('systemPrompt', event.target.value) }}
          />
        </Field>
        <Field label={t('language')} hint={t('languageHint')}>
          <input
            type="text"
            value={draft.language ?? '中文'}
            placeholder="中文 / English"
            onChange={(event) => { set('language', event.target.value) }}
          />
        </Field>
        <Field label={t('style')}>
          <select
            value={draft.style ?? 'native'}
            onChange={(event) => { set('style', event.target.value) }}
          >
            <option value="none">{t('styleNone')}</option>
            <option value="native">{t('styleNative')}</option>
            <option value="concise">{t('styleConcise')}</option>
            <option value="descriptive">{t('styleDescriptive')}</option>
            <option value="wenyan">{t('styleWenyan')}</option>
            <option value="custom">{t('styleCustom')}</option>
          </select>
        </Field>
        {draft.style === 'custom' && (
          <Field label={t('customStyle')} hint={t('customStyleHint')}>
            <textarea
              rows={3}
              value={draft.customStyle ?? ''}
              onChange={(event) => { set('customStyle', event.target.value) }}
            />
          </Field>
        )}
        <Field label={t('minReasoningChars')} hint={t('minReasoningCharsHint')}>
          <input
            type="number"
            min={0}
            value={draft.minReasoningChars ?? 32}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed)) set('minReasoningChars', parsed)
            }}
          />
        </Field>
        <Field label={t('maxSummaryChars')} hint={t('maxSummaryCharsHint')}>
          <input
            type="number"
            min={1}
            value={draft.maxSummaryChars ?? 50}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed)) set('maxSummaryChars', parsed)
            }}
          />
        </Field>
        <Field label={t('chunkChars')} hint={t('chunkCharsHint')}>
          <input
            type="number"
            min={1}
            value={draft.chunkChars ?? 500}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed)) set('chunkChars', parsed)
            }}
          />
        </Field>
        <Field label={t('chunkIntervalMs')} hint={t('chunkIntervalMsHint')}>
          <input
            type="number"
            min={500}
            value={draft.chunkIntervalMs ?? 8000}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed)) set('chunkIntervalMs', parsed)
            }}
          />
        </Field>
        <Field label={t('adaptiveChunk')} hint={t('adaptiveChunkHint')} inline>
          <Switch
            checked={draft.adaptiveChunk ?? true}
            onChange={(checked) => { set('adaptiveChunk', checked) }}
          />
        </Field>
        {draft.adaptiveChunk === true && (
          <>
            <Field label={t('minChunkChars')} hint={t('minChunkCharsHint')}>
              <input
                type="number"
                min={1}
                value={draft.minChunkChars ?? 64}
                onChange={(event) => {
                  const parsed = Number(event.target.value)
                  if (Number.isFinite(parsed)) set('minChunkChars', parsed)
                }}
              />
            </Field>
            <Field label={t('maxChunkChars')} hint={t('maxChunkCharsHint')}>
              <input
                type="number"
                min={1}
                value={draft.maxChunkChars ?? 2000}
                onChange={(event) => {
                  const parsed = Number(event.target.value)
                  if (Number.isFinite(parsed)) set('maxChunkChars', parsed)
                }}
              />
            </Field>
            <Field label={t('chunkSafetyFactor')} hint={t('chunkSafetyFactorHint')}>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={draft.chunkSafetyFactor ?? 2}
                onChange={(event) => {
                  const parsed = Number(event.target.value)
                  if (Number.isFinite(parsed)) set('chunkSafetyFactor', parsed)
                }}
              />
            </Field>
          </>
        )}
        <Field label={t('streamReasoningBlock')} hint={t('streamReasoningBlockHint')} inline>
          <Switch
            checked={draft.streamReasoningBlock ?? true}
            onChange={(checked) => { set('streamReasoningBlock', checked) }}
          />
        </Field>
        {draft.streamReasoningBlock !== false && (
          <Field label={t('reasoningBlockWaitMs')} hint={t('reasoningBlockWaitMsHint')}>
            <input
              type="number"
              min={0}
              max={60000}
              value={draft.reasoningBlockWaitMs ?? 3000}
              onChange={(event) => {
                const parsed = Number(event.target.value)
                if (Number.isFinite(parsed)) set('reasoningBlockWaitMs', parsed)
              }}
            />
          </Field>
        )}
        <Field label={t('timeoutMs')}>
          <input
            type="number"
            min={1}
            value={draft.timeoutMs ?? 30000}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed)) set('timeoutMs', parsed)
            }}
          />
        </Field>
        <Field label={t('onError')}>
          <select
            value={draft.onError ?? 'hide'}
            onChange={(event) => { set('onError', event.target.value) }}
          >
            <option value="hide">{t('onErrorHide')}</option>
            <option value="pass-through">{t('onErrorPassThrough')}</option>
            <option value="drop">{t('onErrorDrop')}</option>
          </select>
        </Field>
      </div>
      <div className="dshc-actions">
        <button type="button" className="dshc-save" disabled={saving} onClick={save}>
          {saving ? t('saving') : t('save')}
        </button>
        {saved && <span className="dshc-saved">{t('saved')}</span>}
        {error !== undefined && <span className="dshc-error">{t('failed')} {error}</span>}
      </div>
    </section>
  )
}

const STYLES = `
.dshc-section { padding: 0 4px 16px; color: var(--dsw-alias-label-primary); }
.dshc-head { margin-bottom: 20px; }
.dshc-head h3 { margin: 0 0 6px; font-size: 15px; }
.dshc-head p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
.dshc-grid { display: grid; gap: 20px; }
.dshc-field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
.dshc-field-label { font-weight: 600; }
.dshc-field input[type="text"], .dshc-field input[type="password"], .dshc-field input[type="number"], .dshc-field select, .dshc-field textarea {
  width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); font: inherit;
}
.dshc-field input[type="text"]:focus, .dshc-field input[type="password"]:focus, .dshc-field input[type="number"]:focus, .dshc-field select:focus, .dshc-field textarea:focus {
  outline: none; border-color: var(--dsw-alias-border-l4);
}
.dshc-field-inline {
  flex-direction: row; align-items: center; justify-content: space-between; gap: 16px;
  padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
}
.dshc-field-text { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.dshc-field-inline .dshc-field-hint { font-size: 12px; }
.dshc-field-inline .dshc-switch { flex: none; }
.dshc-switch { position: relative; display: inline-flex; width: 38px; height: 22px; cursor: pointer; }
.dshc-switch input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
.dshc-switch-track { position: absolute; inset: 0; border-radius: 999px; background: var(--dsw-alias-border-l2); transition: background 0.15s ease; }
.dshc-switch-track::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--dsw-alias-label-primary-foreground); box-shadow: 0 1px 2px rgb(0 0 0 / 0.25); transition: transform 0.15s ease; }
.dshc-switch input:checked + .dshc-switch-track { background: var(--dsw-alias-button-primary-fill); }
.dshc-switch input:checked + .dshc-switch-track::after { transform: translateX(16px); }
.dshc-switch input:focus-visible + .dshc-switch-track { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dshc-field-hint { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
.dshc-actions { display: flex; align-items: center; gap: 12px; margin-top: 24px; }
.dshc-save { padding: 8px 18px; border: 0; border-radius: 8px; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 13px; cursor: pointer; }
.dshc-save:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.dshc-save:disabled { opacity: 0.6; cursor: default; }
.dshc-saved { color: var(--dsw-alias-state-success-primary); font-size: 12px; }
.dshc-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
`

/** Required services: the slot registry and the locale seat. */
export const inject = ['slots', 'locale']

/** Browser plugin entry: register the settings page for the cot-summarizer namespace. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-cot-summerization: locale')
  ctx.effect(() => {
    const style = document.createElement('style')
    style.textContent = STYLES
    document.head.append(style)
    return () => { style.remove() }
  }, 'dsh-cot-summerization: styles')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'cot-summarizer',
    order: 31,
    label: () => t('nav'),
    inject: () => ({ t }),
  }, SettingsSection))
}
