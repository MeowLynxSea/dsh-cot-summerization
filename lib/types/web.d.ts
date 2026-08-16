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
/** Exact route used by the browser to fetch DSH provider/model options. */
export declare const COT_SUMMARIZER_MODEL_OPTIONS_ROUTE = "/_dsh/cot-summarizer/model-options";
/** Response payload of the settings route. */
export interface CotSummarizerSettingsView {
    /** Resolved configuration. */
    settings: CotSummarizerConfig;
    /** Namespace revision fencing the next write. */
    revision: number;
}
/** One selectable provider or model entry. */
export interface CotSummarizerModelOption {
    id: string;
    name?: string;
}
/** Provider/model options exposed from DSH's LLM registry for the dropdown UI. */
export interface CotSummarizerModelOptions {
    providers: CotSummarizerModelOption[];
    modelsByProvider: Record<string, CotSummarizerModelOption[]>;
}
/** Accept state-changing requests only from the DSH Web application's origin. */
export declare function sameOriginPost(req: IncomingMessage): boolean;
/** Same-origin settings handler for the cot-summarizer namespace. */
export declare class CotSummarizerWebBackend {
    private readonly ctx;
    private readonly scope;
    constructor(ctx: Context, scope: SettingsScope<CotSummarizerConfig>);
    /** Current view: resolved settings plus the revision. */
    private view;
    /** Provider/model options from DSH's own LLM registry, for dropdowns. */
    modelOptions(): Promise<CotSummarizerModelOptions>;
    /** Handle the exact model-options route. */
    handleModelOptions(req: IncomingMessage, res: ServerResponse): Promise<void>;
    /** Handle the exact Settings route. */
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
}
/**
 * Attach the settings route whenever a webServer service is present.
 * @param ctx - plugin context owning the route effect.
 * @param scope - the cot-summarizer settings scope.
 */
export declare function installCotSummarizerWeb(ctx: Context, scope: SettingsScope<CotSummarizerConfig>): void;
