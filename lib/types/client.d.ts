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
