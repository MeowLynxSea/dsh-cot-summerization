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
import { createAssistantMessage } from '@deepseek-ai/dsh-llm';
import { isAppendSurfaceEvent } from '@deepseek-ai/dsh-session';
/** A fresh capture for one model call. */
export function createRawCapture() {
    return { sawReasoning: false, rawShown: false, rawBlocks: undefined, replayState: undefined };
}
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
export function restoreRawAssistantMessage(message, capture) {
    if (!capture.sawReasoning || capture.rawShown)
        return undefined;
    const rawBlocks = capture.rawBlocks;
    if (rawBlocks === undefined)
        return undefined;
    const rawReasoning = rawBlocks
        .filter((block) => block.type === 'reasoning')
        .map((block) => block.text)
        .join('');
    if (rawReasoning === '')
        return undefined;
    if (message.source.kind !== 'model')
        return undefined;
    const landedReasoning = message.content
        .filter((block) => block.type === 'reasoning')
        .map((block) => block.text)
        .join('');
    if (landedReasoning === rawReasoning)
        return undefined;
    return createAssistantMessage({
        content: rawBlocks,
        source: {
            provider: message.source.provider,
            model: message.source.model,
            ...capture.replayState === undefined ? {} : { replayState: capture.replayState },
        },
    });
}
/**
 * Create the raw-history restorer. Pure bookkeeping plus a deferred append:
 * the replacement cannot be appended inside the `session/event` dispatch
 * (append rejects reentrancy), so it lands in a microtask — still well before
 * the loop's next request, which can only happen after asynchronous tool
 * execution.
 */
export function createRawHistoryRestorer(log = () => { }) {
    const trackers = new Map();
    return {
        track(sessionId, capture) {
            trackers.set(sessionId, { capture });
        },
        handleSessionEvent(session, event) {
            const key = String(session.id);
            const tracker = trackers.get(key);
            if (tracker !== undefined && event.type === 'assistant/chunk') {
                tracker.turn = event.data.turn;
                tracker.step = event.data.step;
                return;
            }
            if (event.type === 'turn/end') {
                // The turn closed: either the message already landed (tracker
                // consumed) or the stream aborted (nothing to restore).
                trackers.delete(key);
                return;
            }
            if (event.type !== 'assistant/message')
                return;
            // Replacement events (including this restorer's own) are not
            // append-origin and must never trigger another restore.
            if (!isAppendSurfaceEvent(event))
                return;
            if (tracker === undefined)
                return;
            if (tracker.turn === undefined || tracker.turn !== event.data.turn || tracker.step !== event.data.step)
                return;
            trackers.delete(key);
            const replacement = restoreRawAssistantMessage(event.data.message, tracker.capture);
            if (replacement === undefined)
                return;
            const seq = event.seq;
            const { turn, step } = event.data;
            queueMicrotask(() => {
                try {
                    session.append('assistant/message', { turn, step, message: replacement }, {
                        surfaceOp: { op: 'replace', start: seq, end: seq },
                        sourceEventSeqs: [seq],
                    });
                }
                catch (error) {
                    log('cot-summarizer: restoring the raw reasoning on the model-visible surface failed: %s', error instanceof Error ? error.message : String(error));
                }
            });
        },
        forget(sessionId) {
            trackers.delete(sessionId);
        },
    };
}
