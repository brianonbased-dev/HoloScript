/**
 * Beatmap Trait
 *
 * Declarative beat-timeline scene orchestration. Maps discrete cue points
 * (in beats) to named scene events, fired deterministically from a BPM
 * timeline. Replaces ad-hoc `on 'beat'` handler chains with manual
 * beatCount math that accumulate redundant state across every
 * music/performance/rhythmic example.
 *
 * Canonical use: examples/cross-domain/concert-venue.refreshed.holo —
 *   @beatmap { bpm: 128, sync_to: 'AudioAnalysis',
 *              cues: [
 *                { beat: 0,  event: 'intro' },
 *                { beat: 16, event: 'fog_roll' },
 *                { beat: 32, event: 'spot_reveal' },
 *                { beat: 64, event: 'show_start' }
 *              ] }
 *
 * Determinism contract:
 *   - On each tick, the trait derives `currentBeat` from elapsed time
 *     × (bpm / 60). Same `(bpm, elapsed)` → same beat, byte-for-byte.
 *   - Cue firing is monotonic: each cue fires AT MOST ONCE per attach.
 *     A `beatmap_reset` event clears fired-cues and rewinds elapsed to 0.
 *   - Fires "all cues whose beat is in the (lastBeat, currentBeat]
 *     half-open interval" — this guarantees no cue is skipped on slow
 *     ticks (delta = 5s at 128 BPM = 10.67 beats; 4 cues might span the
 *     interval and ALL fire on that single tick).
 *   - Cues are sorted by beat at attach time; out-of-order author input
 *     is normalised once, not on every tick.
 *
 * External sync sources (sync_to):
 *   - 'internal' (default): trait drives its own clock from delta.
 *   - 'AudioAnalysis': trait listens for `audio_beat_tick { beat }` events
 *     and uses the supplied beat directly (overrides internal clock).
 *     This lets a real audio analyser drive the timeline when one is wired.
 *
 * Trait usage in .holo composition:
 *
 *   object "ConcertController" {
 *     @beatmap {
 *       bpm: 128
 *       sync_to: 'internal'
 *       loop: false
 *       cues: [
 *         { beat: 0,  event: 'intro' },
 *         { beat: 16, event: 'fog_roll' },
 *         { beat: 32, event: 'spot_reveal' },
 *         { beat: 64, event: 'show_start' }
 *       ]
 *     }
 *   }
 *
 * Trait name: beatmap
 * Category: music-performance
 * Compile targets: all
 *
 * @version 1.0.0
 * @cites task_1778061290860_2o3c (A-009 example-driven request),
 *        examples/cross-domain/concert-venue.refreshed.holo
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface BeatmapCue {
  /** Beat number on which to fire (0 = first beat at attach). */
  beat: number;
  /** Event name to emit on cue. */
  event: string;
  /** Optional payload merged into the emitted event. */
  payload?: Record<string, unknown>;
}

export type BeatmapSyncSource = 'internal' | 'AudioAnalysis';

export interface BeatmapConfig {
  /** Beats per minute. Drives the internal clock when sync_to === 'internal'. */
  bpm: number;
  /** Where the beat clock comes from. 'internal' = derive from delta. */
  sync_to: BeatmapSyncSource;
  /** Cue list. Sorted by beat at attach; out-of-order author input is fine. */
  cues: BeatmapCue[];
  /**
   * If true, when the timeline passes the last cue's beat, elapsed is wrapped
   * back to 0 and fired-cues are cleared so the loop replays.
   */
  loop: boolean;
  /** Whether to emit a beatmap_attached event on attach. */
  emit_attach_event: boolean;
  /**
   * If true, cue firing is gated by whether `beat` is strictly > lastBeat.
   * On the very first tick after attach, cues with beat === 0 fire (they
   * are in the half-open interval (-Infinity, currentBeat]). Set false to
   * skip beat-0 cues, e.g. when chained to an external trigger.
   */
  fire_initial_cues: boolean;
}

interface BeatmapState {
  /** Cumulative wall-clock elapsed seconds since attach (or last reset). */
  elapsedSeconds: number;
  /** Last computed beat value (used to derive the half-open firing window). */
  lastBeat: number;
  /** Cue list sorted by beat at attach. */
  sortedCues: BeatmapCue[];
  /** Set of cue indices that have already fired this loop iteration. */
  firedCueIndices: Set<number>;
  /** Maximum beat across all cues — used for loop wraparound. */
  maxCueBeat: number;
}

export interface BeatmapTickResult {
  /** Beat value at end of this tick. */
  currentBeat: number;
  /** Cues that fired during this tick (in sorted order). */
  firedCues: BeatmapCue[];
  /** Whether the timeline wrapped around due to loop=true this tick. */
  looped: boolean;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Convert elapsed seconds to a beat value at the given BPM.
 *
 * Pure function — exposed so tests can pin determinism without going
 * through the trait handler lifecycle.
 *
 *   beat = elapsedSeconds × (bpm / 60)
 *
 * For bpm = 128, elapsed = 0.46875 → beat = 1 exactly.
 */
export function elapsedToBeat(elapsedSeconds: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return elapsedSeconds * (bpm / 60);
}

/**
 * Normalise the author-supplied cue list: sort by beat ascending, stable
 * for equal-beat cues (preserves authoring order for simultaneous events).
 */
export function sortCues(cues: BeatmapCue[]): BeatmapCue[] {
  // Decorate-sort-undecorate to guarantee stability across engines whose
  // Array.prototype.sort is not specified to be stable on older targets.
  const decorated = cues.map((c, i) => ({ cue: c, idx: i }));
  decorated.sort((a, b) => {
    if (a.cue.beat !== b.cue.beat) return a.cue.beat - b.cue.beat;
    return a.idx - b.idx;
  });
  return decorated.map((d) => d.cue);
}

/**
 * Find the indices of all cues whose beat is in the half-open interval
 * (lastBeat, currentBeat]. Returns indices into the sorted cue list.
 *
 * Pure function — drives the firing logic and is unit-testable in
 * isolation. Boundary chosen as half-open so cues fire EXACTLY ONCE
 * across consecutive ticks even when the tick lands precisely on a
 * cue beat.
 */
export function findCuesInInterval(
  sortedCues: BeatmapCue[],
  lastBeat: number,
  currentBeat: number
): number[] {
  if (currentBeat < lastBeat) return [];
  const out: number[] = [];
  for (let i = 0; i < sortedCues.length; i++) {
    const b = sortedCues[i].beat;
    if (b > lastBeat && b <= currentBeat) {
      out.push(i);
    }
  }
  return out;
}

// =============================================================================
// HANDLER
// =============================================================================

export const beatmapHandler: TraitHandler<BeatmapConfig> = {
  name: 'beatmap',

  defaultConfig: {
    bpm: 120,
    sync_to: 'internal',
    cues: [],
    loop: false,
    emit_attach_event: true,
    fire_initial_cues: true,
  },

  onAttach(node, config, context) {
    const sortedCues = sortCues(config.cues || []);
    const maxCueBeat = sortedCues.length > 0 ? sortedCues[sortedCues.length - 1].beat : 0;

    const state: BeatmapState = {
      elapsedSeconds: 0,
      // lastBeat starts at -Infinity so the first tick's half-open interval
      // (-Infinity, currentBeat] catches a cue at beat 0 IFF
      // fire_initial_cues is true.
      lastBeat: config.fire_initial_cues ? Number.NEGATIVE_INFINITY : 0,
      sortedCues,
      firedCueIndices: new Set<number>(),
      maxCueBeat,
    };
    (node as unknown as Record<string, unknown>).__beatmapState = state;

    if (config.emit_attach_event) {
      context.emit?.('beatmap_attached', {
        node,
        bpm: config.bpm,
        syncTo: config.sync_to,
        cueCount: sortedCues.length,
        maxCueBeat,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('beatmap_detached', { node });
    delete (node as unknown as Record<string, unknown>).__beatmapState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as unknown as Record<string, unknown>).__beatmapState as
      | BeatmapState
      | undefined;
    if (!state) return;

    // External sync: do not advance the internal clock. The handler waits
    // for `audio_beat_tick { beat }` events instead. See onEvent.
    if (config.sync_to !== 'internal') return;

    state.elapsedSeconds += delta;
    const currentBeat = elapsedToBeat(state.elapsedSeconds, config.bpm);

    fireCuesInWindow(node, config, context, state, currentBeat);
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__beatmapState as
      | BeatmapState
      | undefined;
    if (!state) return;

    if (event.type === 'beatmap_reset') {
      state.elapsedSeconds = 0;
      state.lastBeat = config.fire_initial_cues ? Number.NEGATIVE_INFINITY : 0;
      state.firedCueIndices.clear();
      context.emit?.('beatmap_reset_done', { node });
      return;
    }

    if (event.type === 'beatmap_query') {
      context.emit?.('beatmap_response', {
        queryId: event.queryId,
        node,
        elapsedSeconds: state.elapsedSeconds,
        currentBeat:
          config.sync_to === 'internal'
            ? elapsedToBeat(state.elapsedSeconds, config.bpm)
            : state.lastBeat,
        firedCueCount: state.firedCueIndices.size,
        cueCount: state.sortedCues.length,
        maxCueBeat: state.maxCueBeat,
      });
      return;
    }

    if (event.type === 'audio_beat_tick' && config.sync_to === 'AudioAnalysis') {
      // External clock supplies the beat directly. Mirror it into elapsed
      // for query consistency: elapsed = beat × (60 / bpm).
      const externalBeat = (event.beat as number) ?? state.lastBeat;
      state.elapsedSeconds = config.bpm > 0 ? externalBeat * (60 / config.bpm) : 0;
      fireCuesInWindow(node, config, context, state, externalBeat);
      return;
    }
  },
};

// =============================================================================
// INTERNAL: CUE FIRING
// =============================================================================

function fireCuesInWindow(
  node: unknown,
  config: BeatmapConfig,
  context: { emit?: (event: string, data: unknown) => void },
  state: BeatmapState,
  currentBeat: number
): void {
  const indices = findCuesInInterval(state.sortedCues, state.lastBeat, currentBeat);
  for (const idx of indices) {
    if (state.firedCueIndices.has(idx)) continue;
    const cue = state.sortedCues[idx];
    state.firedCueIndices.add(idx);
    context.emit?.(cue.event, {
      node,
      beat: cue.beat,
      cueIndex: idx,
      currentBeat,
      ...(cue.payload || {}),
    });
  }
  state.lastBeat = currentBeat;

  // Loop wraparound: when the timeline passes the last cue beat AND
  // loop=true, rewind elapsed to 0 and clear fired set so the loop
  // replays on the next tick.
  if (
    config.loop &&
    state.maxCueBeat > 0 &&
    currentBeat >= state.maxCueBeat &&
    state.firedCueIndices.size === state.sortedCues.length
  ) {
    state.elapsedSeconds = 0;
    state.lastBeat = config.fire_initial_cues ? Number.NEGATIVE_INFINITY : 0;
    state.firedCueIndices.clear();
    context.emit?.('beatmap_looped', { node, atBeat: currentBeat });
  }
}

export default beatmapHandler;
