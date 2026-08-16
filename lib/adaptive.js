/**
 * Adaptive chunk sizing for streaming CoT summarization.
 *
 * The fixed `chunkChars` trigger is a one-size-fits-all knob: on a fast
 * stream with a slow summarizer it fires too often (requests pile up and the
 * tail is left unsummarized), while on a slow stream with a fast summarizer
 * it makes the UI wait too long for the first summary. This module sizes the
 * effective chunk from two live measurements:
 *
 * - stream rate: EWMA of raw reasoning characters per millisecond;
 * - summarizer RTT: EWMA of the wall time of one summarizer call.
 *
 * The effective chunk target is `rate × rtt × safetyFactor`, clamped to
 * `[minChunkChars, maxChunkChars]`. Intuitively, we want the next chunk to be
 * large enough that by the time the in-flight summarizer returns, the stream
 * has not already accumulated a large backlog; the safety factor adds margin
 * so we do not immediately fire another call.
 * @module dsh-cot-summerization/adaptive
 */
const DEFAULT_RATE_ALPHA = 0.3;
const DEFAULT_RTT_ALPHA = 0.3;
/**
 * Pure adaptive-chunk formula. Returns the base chunk when either measurement
 * is missing, otherwise clamps `rate × rtt × safetyFactor`.
 * @param baseChunkChars - configured chunk size.
 * @param streamRate - chars per millisecond (EWMA).
 * @param rtt - summarizer round-trip time in milliseconds (EWMA).
 * @param safetyFactor - multiplier, typically >= 1.
 * @param minChunkChars - lower clamp.
 * @param maxChunkChars - upper clamp.
 * @returns the effective chunk size in characters.
 */
export function computeAdaptiveChunkChars(baseChunkChars, streamRate, rtt, safetyFactor = 2, minChunkChars = 64, maxChunkChars = 2000) {
    if (streamRate <= 0 || rtt <= 0) {
        return Math.round(Math.min(maxChunkChars, Math.max(minChunkChars, baseChunkChars)));
    }
    const target = streamRate * rtt * safetyFactor;
    return Math.round(Math.min(maxChunkChars, Math.max(minChunkChars, target)));
}
/**
 * Live estimator feeding {@link computeAdaptiveChunkChars}. One instance per
 * streamed model call; it is intentionally small and dependency-free.
 */
export class AdaptiveChunkController {
    options;
    ewmaRate = 0;
    ewmaRtt = 0;
    lastDeltaAt;
    rateAlpha;
    rttAlpha;
    constructor(options) {
        this.options = options;
        this.rateAlpha = options.rateAlpha ?? DEFAULT_RATE_ALPHA;
        this.rttAlpha = options.rttAlpha ?? DEFAULT_RTT_ALPHA;
    }
    /**
     * Feed one raw reasoning delta. The stream rate is estimated from the gap
     * between deltas; deltas delivered in the same millisecond do not move the
     * estimate (they are bursts, not throughput evidence).
     * @param chars - length of the delta in characters.
     * @param at - timestamp in milliseconds.
     */
    recordDelta(chars, at) {
        if (chars <= 0)
            return;
        if (this.lastDeltaAt !== undefined && at > this.lastDeltaAt) {
            const instant = chars / (at - this.lastDeltaAt);
            this.ewmaRate = this.ewmaRate === 0
                ? instant
                : this.rateAlpha * instant + (1 - this.rateAlpha) * this.ewmaRate;
        }
        this.lastDeltaAt = at;
    }
    /**
     * Feed one completed summarizer call's wall time.
     * @param rtt - round-trip time in milliseconds.
     */
    recordRtt(rtt) {
        if (rtt <= 0)
            return;
        this.ewmaRtt = this.ewmaRtt === 0
            ? rtt
            : this.rttAlpha * rtt + (1 - this.rttAlpha) * this.ewmaRtt;
    }
    /** Current effective chunk size; falls back to the base until both measurements exist. */
    currentChunkChars() {
        return computeAdaptiveChunkChars(this.options.baseChunkChars, this.ewmaRate, this.ewmaRtt, this.options.safetyFactor, this.options.minChunkChars, this.options.maxChunkChars);
    }
}
