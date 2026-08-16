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
export interface AdaptiveChunkOptions {
    /** The configured/fallback chunk size used until measurements exist. */
    baseChunkChars: number;
    /** Lower bound for the effective chunk size. */
    minChunkChars: number;
    /** Upper bound for the effective chunk size. */
    maxChunkChars: number;
    /** How many RTTs of streamed text a chunk should cover. */
    safetyFactor: number;
    /** EWMA smoothing for stream rate, in `(0, 1]`; default 0.3. */
    rateAlpha?: number;
    /** EWMA smoothing for summarizer RTT, in `(0, 1]`; default 0.3. */
    rttAlpha?: number;
}
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
export declare function computeAdaptiveChunkChars(baseChunkChars: number, streamRate: number, rtt: number, safetyFactor?: number, minChunkChars?: number, maxChunkChars?: number): number;
/**
 * Live estimator feeding {@link computeAdaptiveChunkChars}. One instance per
 * streamed model call; it is intentionally small and dependency-free.
 */
export declare class AdaptiveChunkController {
    private readonly options;
    private ewmaRate;
    private ewmaRtt;
    private lastDeltaAt;
    private readonly rateAlpha;
    private readonly rttAlpha;
    constructor(options: AdaptiveChunkOptions);
    /**
     * Feed one raw reasoning delta. The stream rate is estimated from the gap
     * between deltas; deltas delivered in the same millisecond do not move the
     * estimate (they are bursts, not throughput evidence).
     * @param chars - length of the delta in characters.
     * @param at - timestamp in milliseconds.
     */
    recordDelta(chars: number, at: number): void;
    /**
     * Feed one completed summarizer call's wall time.
     * @param rtt - round-trip time in milliseconds.
     */
    recordRtt(rtt: number): void;
    /** Current effective chunk size; falls back to the base until both measurements exist. */
    currentChunkChars(): number;
}
