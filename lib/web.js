/**
 * Web-profile routes for the cot-summarizer settings page. The Web Client's
 * generic settings transport serves only a fixed namespace whitelist
 * (`WEB_SETTINGS_NAMESPACES` in dsh-host-apiproxy), so this plugin exposes
 * its own namespace through a same-origin route — the pattern the vision
 * toolkit uses. The route reads and writes the same `cot-summarizer` settings
 * namespace, so hand-edited settings.yaml and the Web page stay in sync.
 * @module dsh-cot-summerization/web
 */
import { COT_SUMMARIZER_SETTINGS_NAMESPACE } from "./config.js";
/** Exact route used by the browser Settings page. */
export const COT_SUMMARIZER_SETTINGS_ROUTE = '/_dsh/cot-summarizer/settings';
/** Exact route used by the browser to fetch DSH provider/model options. */
export const COT_SUMMARIZER_MODEL_OPTIONS_ROUTE = '/_dsh/cot-summarizer/model-options';
function responseJson(res, status, body) {
    const bytes = Buffer.from(JSON.stringify(body));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.writeHead(status);
    res.end(bytes);
}
function requestError(res, status, code, message) {
    responseJson(res, status, { ok: false, error: { code, message } });
}
async function readJson(req, maxBytes = 64 * 1024) {
    const contentType = req.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json')
        throw new TypeError('Content-Type must be application/json');
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += part.length;
        if (bytes > maxBytes)
            throw new RangeError(`request body exceeds ${maxBytes} bytes`);
        chunks.push(part);
    }
    if (chunks.length === 0)
        throw new TypeError('request body is empty');
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
/** Accept state-changing requests only from the DSH Web application's origin. */
export function sameOriginPost(req) {
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite === 'cross-site')
        return false;
    const origin = req.headers.origin;
    if (origin === undefined)
        return fetchSite === 'same-origin' || fetchSite === 'same-site' || fetchSite === 'none';
    const host = req.headers.host;
    if (host === undefined)
        return false;
    try {
        const parsed = new URL(origin);
        return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.host === host;
    }
    catch {
        return false;
    }
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function publicMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
/** Same-origin settings handler for the cot-summarizer namespace. */
export class CotSummarizerWebBackend {
    ctx;
    scope;
    constructor(ctx, scope) {
        this.ctx = ctx;
        this.scope = scope;
    }
    /** Current view: resolved settings plus the revision. */
    view() {
        const current = this.scope.get();
        const descriptors = this.ctx.settings.describe();
        const revision = descriptors.find((entry) => String(entry.ns) === String(COT_SUMMARIZER_SETTINGS_NAMESPACE))?.revision ?? 0;
        return {
            settings: current,
            revision,
        };
    }
    /** Provider/model options from DSH's own LLM registry, for dropdowns. */
    async modelOptions() {
        const providers = this.ctx.llm.listProviders().map((provider) => ({ id: provider.id, name: provider.name }));
        const entries = await Promise.all(providers.map(async (provider) => {
            let models = [];
            try {
                const discovered = await this.ctx.llm.listModels(provider.id);
                models = discovered.map((model) => ({ id: model.id, name: model.name }));
            }
            catch (error) {
                this.ctx.logger.warn('cot-summarizer: failed to list models for provider %s: %s', provider.id, publicMessage(error));
            }
            return [provider.id, models];
        }));
        return {
            providers,
            modelsByProvider: Object.fromEntries(entries),
        };
    }
    /** Handle the exact model-options route. */
    async handleModelOptions(req, res) {
        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            requestError(res, 405, 'method-not-allowed', 'Use GET');
            return;
        }
        try {
            responseJson(res, 200, { ok: true, value: await this.modelOptions() });
        }
        catch (error) {
            this.ctx.logger.warn('cot-summarizer model options failed: %s', publicMessage(error));
            requestError(res, 503, 'model-options-unavailable', 'cot-summarizer model options are unavailable');
        }
    }
    /** Handle the exact Settings route. */
    async handle(req, res) {
        if (req.method === 'GET') {
            try {
                responseJson(res, 200, { ok: true, value: this.view() });
            }
            catch (error) {
                this.ctx.logger.warn('cot-summarizer Settings snapshot failed: %s', publicMessage(error));
                requestError(res, 503, 'settings-unavailable', 'cot-summarizer Settings are unavailable');
            }
            return;
        }
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'GET, POST');
            requestError(res, 405, 'method-not-allowed', 'Use GET or POST');
            return;
        }
        if (!sameOriginPost(req)) {
            requestError(res, 403, 'origin-rejected', 'The request must originate from this DSH Web application');
            return;
        }
        let parsed;
        try {
            parsed = await readJson(req);
        }
        catch (error) {
            requestError(res, error instanceof RangeError ? 413 : 400, 'invalid-request', publicMessage(error));
            return;
        }
        if (!isRecord(parsed) || !isRecord(parsed.value)) {
            requestError(res, 400, 'invalid-request', 'request value must be an object');
            return;
        }
        const patch = parsed.value;
        try {
            await this.scope.update(patch);
            responseJson(res, 200, { ok: true, value: this.view() });
        }
        catch (error) {
            this.ctx.logger.warn('cot-summarizer Settings save failed: %s', publicMessage(error));
            requestError(res, 422, 'settings-rejected', publicMessage(error));
        }
    }
}
/**
 * Attach the settings route whenever a webServer service is present.
 * @param ctx - plugin context owning the route effect.
 * @param scope - the cot-summarizer settings scope.
 */
export function installCotSummarizerWeb(ctx, scope) {
    const backend = new CotSummarizerWebBackend(ctx, scope);
    ctx.inject(['webServer'], (webCtx) => {
        webCtx.effect(() => webCtx.webServer.register({
            kind: 'exact',
            path: COT_SUMMARIZER_SETTINGS_ROUTE,
            handler: (req, res) => { void backend.handle(req, res); },
        }), 'dsh-cot-summerization: Settings route');
        webCtx.effect(() => webCtx.webServer.register({
            kind: 'exact',
            path: COT_SUMMARIZER_MODEL_OPTIONS_ROUTE,
            handler: (req, res) => { void backend.handleModelOptions(req, res); },
        }), 'dsh-cot-summerization: Model options route');
    });
}
