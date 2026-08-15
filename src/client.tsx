/**
 * dsh-cot-summerization — browser half. Registers the plugin's settings page
 * into the Web Client's settings shell (`settings.section` slot).
 *
 * The Web Client's generic settings transport only serves a fixed namespace
 * whitelist, so — like the vision toolkit — the page reads and writes its
 * namespace through a same-origin route (`/_dsh/cot-summarizer/settings`)
 * mounted by the host half. The API key is never returned by the route;
 * leaving the field blank keeps the stored key.
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
  settingsIntro: 'Hide the model\'s raw chain of thought and show a small-model summary instead. The raw reasoning never reaches the session log or the UI.',
  enabled: 'Enabled',
  baseUrl: 'Base URL',
  baseUrlHint: 'Any Chat Completions-compatible endpoint.',
  apiKey: 'API key',
  apiKeyConfiguredPlaceholder: 'Configured; leave blank to keep it',
  apiKeyPlaceholder: 'Paste the API key',
  apiKeyHint: 'Sent as the Authorization bearer for summarizer requests. Never shown again after saving.',
  model: 'Summarizer model',
  modelHint: 'The "small model" that summarizes the raw reasoning.',
  systemPrompt: 'Summarization prompt',
  systemPromptHint: 'Override the default prompt. {maxSummaryChars} is substituted with the cap below.',
  minReasoningChars: 'Minimum reasoning length',
  minReasoningCharsHint: 'Raw reasoning shorter than this (in characters) is shown verbatim without an API call.',
  maxSummaryChars: 'Summary length cap',
  maxSummaryCharsHint: 'Target maximum length of the summary, in characters.',
  timeoutMs: 'Request timeout (ms)',
  onError: 'On summarizer failure',
  onErrorHide: 'Hide reasoning',
  onErrorPassThrough: 'Pass raw reasoning through',
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
  settingsIntro: '隐藏模型的原始思维链，改为展示小模型生成的摘要。原始推理不会进入会话日志或界面。',
  enabled: '启用',
  baseUrl: '接口地址',
  baseUrlHint: '任意兼容 Chat Completions 的接口地址。',
  apiKey: 'API 密钥',
  apiKeyConfiguredPlaceholder: '已配置，留空保持不变',
  apiKeyPlaceholder: '粘贴 API 密钥',
  apiKeyHint: '总结请求会以 Bearer 形式携带该密钥。保存后不再显示。',
  model: '总结模型',
  modelHint: '用于总结原始思维链的“小模型”。',
  systemPrompt: '总结提示词',
  systemPromptHint: '覆盖默认提示词。{maxSummaryChars} 会被替换为下方的长度上限。',
  minReasoningChars: '最短推理长度',
  minReasoningCharsHint: '短于该长度（字符数）的原始思维链直接展示，不调用接口。',
  maxSummaryChars: '摘要长度上限',
  maxSummaryCharsHint: '摘要的目标最大长度（字符数）。',
  timeoutMs: '请求超时（毫秒）',
  onError: '总结失败时',
  onErrorHide: '隐藏思维链',
  onErrorPassThrough: '展示原始思维链',
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
  apiKeyConfigured: boolean
  revision: number
}

async function fetchView(): Promise<SettingsView> {
  const response = await fetch(SETTINGS_ROUTE)
  const data: unknown = await response.json()
  if (!isOk(data)) throw new Error(errorMessage(data) ?? 'settings request failed')
  return data.value as SettingsView
}

async function saveView(revision: number, value: Record<string, unknown>): Promise<SettingsView> {
  const response = await fetch(SETTINGS_ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision: revision, value }),
  })
  const data: unknown = await response.json()
  if (!isOk(data)) throw new Error(errorMessage(data) ?? 'settings save failed')
  return data.value as SettingsView
}

function isOk(data: unknown): data is { ok: true; value: SettingsView } {
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

/** One labeled form row. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="dshc-field">
      <span className="dshc-field-label">{label}</span>
      {children}
      {hint !== undefined && <span className="dshc-field-hint">{hint}</span>}
    </label>
  )
}

/** The plugin's settings page, served by the host route. */
function SettingsSection({ t }: SettingsSectionProps) {
  const [view, setView] = useState<SettingsView>()
  const [error, setError] = useState<string>()
  const [draft, setDraft] = useState<CotSummarizerConfig>({})
  const [apiKeyDraft, setApiKeyDraft] = useState('')
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
    if (apiKeyDraft.trim() !== '') value.apiKey = apiKeyDraft.trim()
    void saveView(view.revision, value).then((next) => {
      setView(next)
      setDraft(next.settings)
      setApiKeyDraft('')
      setSaving(false)
      setSaved(true)
      if (savedTimer.current !== undefined) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => { setSaved(false) }, 2000)
    }).catch((reason: unknown) => {
      setSaving(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }

  return (
    <section className="dshc-section">
      <div className="dshc-head">
        <h3>{t('settingsTitle')}</h3>
        <p>{t('settingsIntro')}</p>
      </div>
      <div className="dshc-grid">
        <Field label={t('enabled')}>
          <input
            type="checkbox"
            checked={draft.enabled ?? true}
            onChange={(event) => { set('enabled', event.target.checked) }}
          />
        </Field>
        <Field label={t('baseUrl')} hint={t('baseUrlHint')}>
          <input
            type="text"
            value={draft.baseUrl ?? ''}
            onChange={(event) => { set('baseUrl', event.target.value) }}
          />
        </Field>
        <Field label={t('apiKey')} hint={t('apiKeyHint')}>
          <input
            type="password"
            value={apiKeyDraft}
            placeholder={view.apiKeyConfigured ? t('apiKeyConfiguredPlaceholder') : t('apiKeyPlaceholder')}
            onChange={(event) => { setApiKeyDraft(event.target.value) }}
          />
        </Field>
        <Field label={t('model')} hint={t('modelHint')}>
          <input
            type="text"
            value={draft.model ?? ''}
            onChange={(event) => { set('model', event.target.value) }}
          />
        </Field>
        <Field label={t('systemPrompt')} hint={t('systemPromptHint')}>
          <textarea
            rows={5}
            value={draft.systemPrompt ?? ''}
            onChange={(event) => { set('systemPrompt', event.target.value) }}
          />
        </Field>
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
            value={draft.maxSummaryChars ?? 800}
            onChange={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed)) set('maxSummaryChars', parsed)
            }}
          />
        </Field>
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
.dshc-section { padding: 0 4px 12px; }
.dshc-head h3 { margin: 0 0 4px; font-size: 15px; }
.dshc-head p { margin: 0 0 14px; color: var(--ds-text-secondary, #667); font-size: 12px; line-height: 1.5; }
.dshc-grid { display: grid; gap: 14px; }
.dshc-field { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.dshc-field-label { font-weight: 600; }
.dshc-field input[type="text"], .dshc-field input[type="password"], .dshc-field input[type="number"], .dshc-field select, .dshc-field textarea {
  width: 100%; box-sizing: border-box; padding: 6px 8px; border: 1px solid var(--ds-border, #d4d4d8);
  border-radius: 6px; background: var(--ds-surface, #fff); color: inherit; font: inherit;
}
.dshc-field input[type="checkbox"] { width: 18px; height: 18px; }
.dshc-field-hint { color: var(--ds-text-secondary, #667); font-size: 11px; line-height: 1.4; }
.dshc-actions { display: flex; align-items: center; gap: 10px; margin-top: 16px; }
.dshc-save { padding: 6px 16px; border: 0; border-radius: 6px; background: var(--ds-accent, #4f7cff); color: #fff; font: inherit; font-size: 13px; cursor: pointer; }
.dshc-save:disabled { opacity: 0.6; cursor: default; }
.dshc-saved { color: var(--ds-accent, #4f7cff); font-size: 12px; }
.dshc-error { color: #d33; font-size: 12px; }
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
