/**
 * Web-profile routes for the cot-summarizer settings page. The Web Client's
 * generic settings transport serves only a fixed namespace whitelist
 * (`WEB_SETTINGS_NAMESPACES` in dsh-host-apiproxy), so this plugin exposes
 * its own namespace through a same-origin route — the pattern the vision
 * toolkit uses. The route reads and writes the same `cot-summarizer` settings
 * namespace, so hand-edited settings.yaml and the Web page stay in sync.
 * @module dsh-cot-summerization/web
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import type { SettingsScope } from '@deepseek-ai/dsh-settings';
import type { CotSummarizerConfig } from './config.ts';
/** Exact route used by the browser Settings page. */
export declare const COT_SUMMARIZER_SETTINGS_ROUTE = "/_dsh/cot-summarizer/settings";
/** Response payload of the settings route. */
export interface CotSummarizerSettingsView {
    /** Resolved configuration; the API key is never serialized. */
    settings: CotSummarizerConfig & {
        apiKey?: string;
    };
    /** Whether a non-empty API key is currently configured. */
    apiKeyConfigured: boolean;
    /** Namespace revision fencing the next write. */
    revision: number;
}
/** Accept state-changing requests only from the DSH Web application's origin. */
export declare function sameOriginPost(req: IncomingMessage): boolean;
/** Same-origin settings handler for the cot-summarizer namespace. */
export declare class CotSummarizerWebBackend {
    private readonly ctx;
    private readonly scope;
    constructor(ctx: Context, scope: SettingsScope<CotSummarizerConfig>);
    /** Current view: resolved settings (without the API key) plus the revision. */
    private view;
    /** Handle the exact Settings route. */
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
/**
 * Attach the settings route whenever a webServer service is present.
 * @param ctx - plugin context owning the route effect.
 * @param scope - the cot-summarizer settings scope.
 */
export declare function installCotSummarizerWeb(ctx: Context, scope: SettingsScope<CotSummarizerConfig>): void;
