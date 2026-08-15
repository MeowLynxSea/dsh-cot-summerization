/**
 * dsh-cot-summerization — browser half. Registers the plugin's settings page
 * into the Web Client's settings shell (`settings.section` slot) and renders
 * the `cot-summarizer` namespace through the standard settings-scope
 * transport: every field write goes through `scope.set`, lands in the Host
 * settings document, and applies live.
 * @module dsh-cot-summerization/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
type LocaleKey = keyof typeof en;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** dsh-cot-summerization settings page copy. */
        'cot-summarizer': LocaleKey;
    }
}
declare const en: Record<string, string>;
/** Required services: the slot registry and the locale seat. */
export declare const inject: string[];
/** Browser plugin entry: register the settings page for the cot-summarizer namespace. */
export declare function apply(ctx: ClientContext): void;
export {};
