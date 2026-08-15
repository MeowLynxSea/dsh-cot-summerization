/**
 * Web-profile routes for the cot-summarizer settings page. The Web Client's
 * generic settings transport serves only a fixed namespace whitelist
 * (`WEB_SETTINGS_NAMESPACES` in dsh-host-apiproxy), so this plugin exposes
 * its own namespace through a same-origin route — the pattern the vision
 * toolkit uses. The route reads and writes the same `cot-summarizer` settings
 * namespace, so hand-edited settings.yaml and the Web page stay in sync.
 * @module dsh-cot-summerization/web
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { SettingsScope } from '@deepseek-ai/dsh-settings'
// Type-only import activates the optional webServer Context declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { CotSummarizerConfig } from './config.ts'
import { COT_SUMMARIZER_SETTINGS_NAMESPACE } from './config.ts'

/** Exact route used by the browser Settings page. */
export const COT_SUMMARIZER_SETTINGS_ROUTE = '/_dsh/cot-summarizer/settings'

/** Response payload of the settings route. */
export interface CotSummarizerSettingsView {
  /** Resolved configuration; the API key is never serialized. */
  settings: CotSummarizerConfig & { apiKey?: string }
  /** Whether a non-empty API key is currently configured. */
  apiKeyConfigured: boolean
  /** Namespace revision fencing the next write. */
  revision: number
}

function responseJson(res: ServerResponse, status: number, body: unknown): void {
  const bytes = Buffer.from(JSON.stringify(body))
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Content-Length', String(bytes.length))
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
  res.writeHead(status)
  res.end(bytes)
}

function requestError(res: ServerResponse, status: number, code: string, message: string): void {
  responseJson(res, status, { ok: false, error: { code, message } })
}

async function readJson(req: IncomingMessage, maxBytes = 64 * 1024): Promise<unknown> {
  const contentType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new TypeError('Content-Type must be application/json')
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += part.length
    if (bytes > maxBytes) throw new RangeError(`request body exceeds ${maxBytes} bytes`)
    chunks.push(part)
  }
  if (chunks.length === 0) throw new TypeError('request body is empty')
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

/** Accept state-changing requests only from the DSH Web application's origin. */
export function sameOriginPost(req: IncomingMessage): boolean {
  const fetchSite = req.headers['sec-fetch-site']
  if (fetchSite === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none'
  const host = req.headers.host
  if (host === undefined) return false
  try {
    const parsed = new URL(origin)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host
  } catch {
    return false
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function publicMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

/** Same-origin settings handler for the cot-summarizer namespace. */
export class CotSummarizerWebBackend {
  constructor(
    private readonly ctx: Context,
    private readonly scope: SettingsScope<CotSummarizerConfig>,
  ) {}

  /** Current view: resolved settings (without the API key) plus the revision. */
  private view(): CotSummarizerSettingsView {
    const current = this.scope.get()
    const descriptors = this.ctx.settings.describe()
    const revision = descriptors.find((entry) => String(entry.ns) === String(COT_SUMMARIZER_SETTINGS_NAMESPACE))?.revision ?? 0
    const { apiKey, ...settings } = current
    return {
      settings: settings as CotSummarizerConfig & { apiKey?: string },
      apiKeyConfigured: apiKey !== undefined && apiKey !== '',
      revision,
    }
  }

  /** Handle the exact Settings route. */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === 'GET') {
      try {
        responseJson(res, 200, { ok: true, value: this.view() })
      } catch (error) {
        this.ctx.logger.warn('cot-summarizer Settings snapshot failed: %s', publicMessage(error))
        requestError(res, 503, 'settings-unavailable', 'cot-summarizer Settings are unavailable')
      }
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      requestError(res, 405, 'method-not-allowed', 'Use GET or POST')
      return
    }
    if (!sameOriginPost(req)) {
      requestError(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application')
      return
    }
    let parsed: unknown
    try {
      parsed = await readJson(req)
    } catch (error) {
      requestError(res, error instanceof RangeError ? 413 : 400, 'invalid-request', publicMessage(error))
      return
    }
    if (!isRecord(parsed) || !isRecord(parsed.value)) {
      requestError(res, 400, 'invalid-request', 'request value must be an object')
      return
    }
    const patch = parsed.value as Record<string, unknown>
    // An empty API key in the form means "keep the stored key".
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim() === '') {
      delete patch.apiKey
    }
    try {
      await this.scope.update(patch)
      responseJson(res, 200, { ok: true, value: this.view() })
    } catch (error) {
      this.ctx.logger.warn('cot-summarizer Settings save failed: %s', publicMessage(error))
      requestError(res, 422, 'settings-rejected', publicMessage(error))
    }
  }
}

/**
 * Attach the settings route whenever a webServer service is present.
 * @param ctx - plugin context owning the route effect.
 * @param scope - the cot-summarizer settings scope.
 */
export function installCotSummarizerWeb(ctx: Context, scope: SettingsScope<CotSummarizerConfig>): void {
  const backend = new CotSummarizerWebBackend(ctx, scope)
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: COT_SUMMARIZER_SETTINGS_ROUTE,
      handler: (req, res) => { void backend.handle(req, res) },
    }), 'dsh-cot-summerization: Web routes')
  })
}
