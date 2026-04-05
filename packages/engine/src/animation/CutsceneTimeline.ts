/**
 * CutsceneTimeline.ts
 *
 * Sequenced animation/event timeline for cutscenes.
 * Supports parallel tracks, timed events, camera control, and dialogue cues.
 *
 * @module animation
 */

// =============================================================================
// TYPES
// =============================================================================

export type TimelineEventType =
  | 'animation'
  | 'camera'
  | 'dialogue'
  | 'audio'
  | 'effect'
  | 'wait'
  | 'callback';

export interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  startTime: number; // Seconds from timeline start
  duration: number; // Duration in seconds
  data: Record<string, unknown>;
}

export interface TimelineTrack {
  id: string;
  name: string;
  targetEntity?: string;
  events: TimelineEvent[];
  muted: boolean;
}

export interface CutsceneDefinition {
  id: string;
  name: string;
  duration: number; // Total cutscene duration
  tracks: TimelineTrack[];
  loop: boolean;
}

export interface CutsceneState {
  definition: CutsceneDefinition;
  currentTime: number;
  isPlaying: boolean;
  isPaused: boolean;
  speed: number;
  activeEvents: Set<string>; // Currently active event IDs
  completedEvents: Set<string>;
  triggeredCallbacks: string[];
}

// =============================================================================
// CUTSCENE TIMELINE
// =============================================================================

export class CutsceneTimeline {
  private cutscenes: Map<string, CutsceneState> = new Map();
  private callbacks: Map<string, () => void> = new Map();

  // ---------------------------------------------------------------------------
  // Cutscene Management
  // ---------------------------------------------------------------------------

  load(definition: CutsceneDefinition): string {
    this.cutscenes.set(definition.id, {
      definition,
      currentTime: 0,
      isPlaying: false,
      isPaused: false,
      speed: 1,
      activeEvents: new Set(),
      completedEvents: new Set(),
      triggeredCallbacks: [],
    });
    return definition.id;
  }

  play(id: string, startTime: number = 0): boolean {
    const state = this.cutscenes.get(id);
    if (!state) return false;
    state.isPlaying = true;
    state.isPaused = false;
    state.currentTime = startTime;
    state.activeEvents.clear();
    state.completedEvents.clear();
    state.triggeredCallbacks = [];
    return true;
  }

  pause(id: string): void {
    const state = this.cutscenes.get(id);
    if (state) state.isPaused = true;
  }

  resume(id: string): void {
    const state = this.cutscenes.get(id);
    if (state) state.isPaused = false;
  }

  stop(id: string): void {
    const state = this.cutscenes.get(id);
    if (!state) return;
    state.isPlaying = false;
    state.isPaused = false;
    state.currentTime = 0;
    state.activeEvents.clear();
  }

  setSpeed(id: string, speed: number): void {
    const state = this.cutscenes.get(id);
    if (state) state.speed = Math.max(0, speed);
  }

  seek(id: string, time: number): void {
    const state = this.cutscenes.get(id);
    if (!state) return;
    state.currentTime = Math.max(0, Math.min(time, state.definition.duration));
    // Reset triggered events that are now in the future
    state.completedEvents.clear();
    state.activeEvents.clear();
    state.triggeredCallbacks = [];
  }

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  registerCallback(callbackId: string, fn: () => void): void {
    this.callbacks.set(callbackId, fn);
  }

  unregisterCallback(callbackId: string): void {
    this.callbacks.delete(callbackId);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): Map<string, TimelineEvent[]> {
    const activeEventsPerCutscene = new Map<string, TimelineEvent[]>();

    for (const [id, state] of this.cutscenes) {
      if (!state.isPlaying || state.isPaused) continue;

      state.currentTime += dt * state.speed;

      // Check for completion
      if (state.currentTime >= state.definition.duration) {
        if (state.definition.loop) {
          state.currentTime %= state.definition.duration;
          state.completedEvents.clear();
          state.triggeredCallbacks = [];
        } else {
          state.currentTime = state.definition.duration;
          state.isPlaying = false;
        }
      }

      const currentActive: TimelineEvent[] = [];

      for (const track of state.definition.tracks) {
        if (track.muted) continue;

        for (const event of track.events) {
          const eventEnd = event.startTime + event.duration;
          const isActive = state.currentTime >= event.startTime && state.currentTime < eventEnd;

          if (isActive) {
            state.activeEvents.add(event.id);
            currentActive.push(event);

            // Trigger callbacks
            if (event.type === 'callback' && !state.triggeredCallbacks.includes(event.id)) {
              const callbackId = event.data.callbackId as string;
              const fn = this.callbacks.get(callbackId);
              if (fn) fn();
              state.triggeredCallbacks.push(event.id);
            }
          } else if (state.currentTime >= eventEnd) {
            state.activeEvents.delete(event.id);
            state.completedEvents.add(event.id);
          }
        }
      }

      activeEventsPerCutscene.set(id, currentActive);
    }

    return activeEventsPerCutscene;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getState(id: string): CutsceneState | undefined {
    return this.cutscenes.get(id);
  }

  isPlaying(id: string): boolean {
    return this.cutscenes.get(id)?.isPlaying ?? false;
  }

  getCurrentTime(id: string): number {
    return this.cutscenes.get(id)?.currentTime ?? 0;
  }

  getProgress(id: string): number {
    const state = this.cutscenes.get(id);
    if (!state) return 0;
    return state.currentTime / state.definition.duration;
  }

  removeCutscene(id: string): boolean {
    return this.cutscenes.delete(id);
  }
}

// =============================================================================
// CUTSCENE BUILDER (helper)
// =============================================================================

export class CutsceneBuilder {
  private tracks: TimelineTrack[] = [];
  private eventCounter = 0;
  private id: string;
  private name: string;

  constructor(id: string, name: string) {
    this.id = id;
    this.name = name;
  }

  addTrack(name: string, targetEntity?: string): CutsceneBuilder {
    this.tracks.push({
      id: `track_${this.tracks.length}`,
      name,
      targetEntity,
      events: [],
      muted: false,
    });
    return this;
  }

  addEvent(
    trackIndex: number,
    type: TimelineEventType,
    startTime: number,
    duration: number,
    data: Record<string, unknown> = {}
  ): CutsceneBuilder {
    if (trackIndex < this.tracks.length) {
      this.tracks[trackIndex].events.push({
        id: `event_${this.eventCounter++}`,
        type,
        startTime,
        duration,
        data,
      });
    }
    return this;
  }

  build(): CutsceneDefinition {
    const maxEnd = this.tracks.reduce(
      (max, track) => Math.max(max, ...track.events.map((e) => e.startTime + e.duration)),
      0
    );

    return {
      id: this.id,
      name: this.name,
      duration: maxEnd,
      tracks: this.tracks,
      loop: false,
    };
  }
}

