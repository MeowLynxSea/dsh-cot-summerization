/**
 * dsh-cot-summerization — browser half. Registers the plugin's settings page
 * into the Web Client's settings shell (`settings.section` slot) and renders
 * the `cot-summarizer` namespace through the standard settings-scope
 * transport: every field write goes through `scope.set`, lands in the Host
 * settings document, and applies live.
 * @module dsh-cot-summerization/client
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { CotSummarizerConfig } from './config.ts'

const NS = 'cot-summarizer'

type LocaleKey = keyof typeof en

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** dsh-cot-summerization settings page copy. */
    'cot-summarizer': LocaleKey
  }
}

type T = (key: LocaleKey) => string

const en: Record<string, string> = {
  nav: 'CoT Summary',
  settingsTitle: 'Chain-of-Thought Summarization',
  settingsIntro: 'Hide the model\'s raw chain of thought and show a small-model summary instead. The raw reasoning never reaches the session log or the UI.',
  enabled: 'Enabled',
  baseUrl: 'Base URL',
  baseUrlHint: 'Any Chat Completions-compatible endpoint.',
  apiKey: 'API key',
  apiKeyHint: 'Sent as the Authorization bearer for summarizer requests.',
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
  save: 'Saved',
  saving: 'Saving…',
  loading: 'Loading…',
  unavailable: 'Settings are unavailable in this connection.',
}

const zh: Record<string, string> = {
  nav: '思维链总结',
  settingsTitle: '思维链总结（CoT Summarization）',
  settingsIntro: '隐藏模型的原始思维链，改为展示小模型生成的摘要。原始推理不会进入会话日志或界面。',
  enabled: '启用',
  baseUrl: '接口地址',
  baseUrlHint: '任意兼容 Chat Completions 的接口地址。',
  apiKey: 'API 密钥',
  apiKeyHint: '总结请求会以 Bearer 形式携带该密钥。',
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
  save: '已保存',
  saving: '保存中…',
  loading: '加载中…',
  unavailable: '当前连接下设置不可用。',
}

interface SettingsInjected {
  scope: SettingsScope<CotSummarizerConfig>
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

/** The plugin's settings page bound to the `cot-summarizer` namespace. */
function SettingsSection({ scope, t }: SettingsSectionProps) {
  if (scope === undefined || t === undefined) return null
  const snapshot = useSyncExternalStore(
    (listener) => scope.subscribe(listener),
    () => scope.getSnapshot(),
  )
  const [saved, setSaved] = useState<string>()
  const [saving, setSaving] = useState<string>()
  const savedTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => { if (savedTimer.current !== undefined) clearTimeout(savedTimer.current) }, [])

  const save = (field: keyof CotSummarizerConfig & string, value: unknown): void => {
    setSaving(field)
    void scope.set(field, value).then(() => {
      setSaving(undefined)
      setSaved(field)
      if (savedTimer.current !== undefined) clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => { setSaved(undefined) }, 1500)
    }).catch(() => { setSaving(undefined) })
  }

  if (snapshot.status === 'loading') return <p>{t('loading')}</p>
  if (snapshot.status === 'unavailable') return <p>{t('unavailable')}</p>

  const value = snapshot.value ?? {}

  const mark = (field: keyof CotSummarizerConfig & string): string | undefined => {
    if (saving === field) return t('saving')
    if (saved === field) return t('save')
    return undefined
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
            checked={value.enabled ?? true}
            onChange={(event) => { save('enabled', event.target.checked) }}
          />
          {mark('enabled') !== undefined && <span className="dshc-saved">{mark('enabled')}</span>}
        </Field>
        <Field label={t('baseUrl')} hint={t('baseUrlHint')}>
          <input
            type="text"
            defaultValue={value.baseUrl ?? ''}
            onBlur={(event) => { if (event.target.value.trim() !== '') save('baseUrl', event.target.value.trim()) }}
          />
          {mark('baseUrl') !== undefined && <span className="dshc-saved">{mark('baseUrl')}</span>}
        </Field>
        <Field label={t('apiKey')} hint={t('apiKeyHint')}>
          <input
            type="password"
            defaultValue={value.apiKey ?? ''}
            onBlur={(event) => { if (event.target.value !== '') save('apiKey', event.target.value) }}
          />
          {mark('apiKey') !== undefined && <span className="dshc-saved">{mark('apiKey')}</span>}
        </Field>
        <Field label={t('model')} hint={t('modelHint')}>
          <input
            type="text"
            defaultValue={value.model ?? ''}
            onBlur={(event) => { if (event.target.value.trim() !== '') save('model', event.target.value.trim()) }}
          />
          {mark('model') !== undefined && <span className="dshc-saved">{mark('model')}</span>}
        </Field>
        <Field label={t('systemPrompt')} hint={t('systemPromptHint')}>
          <textarea
            rows={5}
            defaultValue={value.systemPrompt ?? ''}
            onBlur={(event) => { if (event.target.value.trim() !== '') save('systemPrompt', event.target.value) }}
          />
          {mark('systemPrompt') !== undefined && <span className="dshc-saved">{mark('systemPrompt')}</span>}
        </Field>
        <Field label={t('minReasoningChars')} hint={t('minReasoningCharsHint')}>
          <input
            type="number"
            min={0}
            defaultValue={value.minReasoningChars ?? 32}
            onBlur={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed) && parsed >= 0) save('minReasoningChars', parsed)
            }}
          />
          {mark('minReasoningChars') !== undefined && <span className="dshc-saved">{mark('minReasoningChars')}</span>}
        </Field>
        <Field label={t('maxSummaryChars')} hint={t('maxSummaryCharsHint')}>
          <input
            type="number"
            min={1}
            defaultValue={value.maxSummaryChars ?? 800}
            onBlur={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed) && parsed >= 1) save('maxSummaryChars', parsed)
            }}
          />
          {mark('maxSummaryChars') !== undefined && <span className="dshc-saved">{mark('maxSummaryChars')}</span>}
        </Field>
        <Field label={t('timeoutMs')}>
          <input
            type="number"
            min={1}
            defaultValue={value.timeoutMs ?? 30000}
            onBlur={(event) => {
              const parsed = Number(event.target.value)
              if (Number.isFinite(parsed) && parsed >= 1) save('timeoutMs', parsed)
            }}
          />
          {mark('timeoutMs') !== undefined && <span className="dshc-saved">{mark('timeoutMs')}</span>}
        </Field>
        <Field label={t('onError')}>
          <select
            defaultValue={value.onError ?? 'hide'}
            onChange={(event) => { save('onError', event.target.value) }}
          >
            <option value="hide">{t('onErrorHide')}</option>
            <option value="pass-through">{t('onErrorPassThrough')}</option>
          </select>
          {mark('onError') !== undefined && <span className="dshc-saved">{mark('onError')}</span>}
        </Field>
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
.dshc-saved { color: var(--ds-accent, #4f7cff); font-size: 11px; }
`

/** Required services: the slot registry, the locale seat, and the settings transport. */
export const inject = ['slots', 'locale', 'settingsScope']

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
  const scope = ctx.settingsScope.bind<CotSummarizerConfig>({ namespace: NS })
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'cot-summarizer',
    order: 31,
    label: () => t('nav'),
    inject: () => ({ scope, t }),
  }, SettingsSection))
}
