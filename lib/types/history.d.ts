/**
 * Raw-reasoning restoration for the model-visible surface.
 *
 * The stream transform hides the raw chain of thought from every consumer of
 * the `llm/stream` waterfall — including the agent loop, which assembles the
 * stream into the session's `assistant/message` event. Reasoning models
 * replay their prior reasoning on tool-call turns, so a summarized history
 * degrades multi-step reasoning. This module restores the original reasoning
 * on the MODEL-VISIBLE surface only: after the loop's summary message lands,
 * a replacement `assistant/message` event (surface `replace` op) is appended
 * carrying the raw reasoning. Replacement events are model-only by the
 * session surface contract — the human transcript (and the Web UI, which
 * folds append-origin events exclusively) keeps showing the summary.
 * @module dsh-cot-summerization/history
 */
import type { AssistantMessage, ContentBlock } from '@deepseek-ai/dsh-llm';
import type { SessionEvent, SessionEventMap, SurfaceIntent } from '@deepseek-ai/dsh-session';
/**
 * Raw-reasoning facts recorded while one model stream is rewritten. Populated
 * by {@link transformCoTStream} and consumed when the loop's assembled
 * assistant message lands on the session.
 */
export interface RawCoTCapture {
    /** Whether the upstream stream contained any reasoning at all. */
    sawReasoning: boolean;
    /** Whether the raw reasoning was forwarded verbatim (nothing to restore). */
    rawShown: boolean;
    /**
     * The assistant content assembled over the UNTOUCHED upstream stream — the
     * exact blocks the adapter produced, in wire order (a reasoning-first
     * stream stays reasoning-first). Set at the finish chunk; the replacement
     * message is rebuilt from these blocks, because the emitted stream reorders
     * them (the summary block opens late, so the loop's first-seen block order
     * differs from the wire) and adapters validate replay state against the
     * wire order ("block N does not match assistant content").
     */
    rawBlocks: ContentBlock[] | undefined;
    /** Adapter replay state from the terminal finish chunk, when present. */
    replayState: unknown;
}
/** A fresh capture for one model call. */
export declare function createRawCapture(): RawCoTCapture;
/**
 * Build the replacement assistant message for the model-visible surface: the
 * wire-exact upstream content (raw reasoning restored) with the adapter
 * replay state reattached (the streamed rewrite had to drop it because the
 * assembled content no longer matched it).
 *
 * @param message - the landed (summary) assistant message from the loop.
 * @param capture - raw facts recorded during the same model stream.
 * @returns the restored message, or undefined when nothing needs restoring
 *   (no reasoning, verbatim pass-through, or the text already matches).
 */
export declare function restoreRawAssistantMessage(message: AssistantMessage, capture: RawCoTCapture): AssistantMessage | undefined;
/** Structural slice of `Session` the restorer needs; keeps tests fake-friendly. */
export interface SessionLike {
    readonly id: string;
    append(type: 'assistant/message', data: SessionEventMap['assistant/message'], opts: SurfaceIntent): unknown;
}
/** Logger shape shared with the plugin entry. */
export type RestorerLog = (message: string, ...args: unknown[]) => void;
/** Handles the session event feed for raw-history restoration. */
export interface RawHistoryRestorer {
    /** Register the capture of the (single) active model stream for a session. */
    track(sessionId: string, capture: RawCoTCapture): void;
    /** Feed one `session/event`; schedules the surface replacement on the landed summary message. */
    handleSessionEvent(session: SessionLike, event: SessionEvent): void;
    /** Drop any tracker for a session (turn ended, stream abandoned, session disposed). */
    forget(sessionId: string): void;
}
/**
 * Create the raw-history restorer. Pure bookkeeping plus a deferred append:
 * the replacement cannot be appended inside the `session/event` dispatch
 * (append rejects reentrancy), so it lands in a microtask — still well before
 * the loop's next request, which can only happen after asynchronous tool
 * execution.
 */
export declare function createRawHistoryRestorer(log?: RestorerLog): RawHistoryRestorer;
