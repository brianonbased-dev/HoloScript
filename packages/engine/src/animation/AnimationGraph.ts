/**
 * AnimationGraph.ts
 *
 * State machine-driven animation blending system.
 * Supports weighted transitions, blend trees, and animation layers.
 *
 * @module animation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AnimationClip {
  id: string;
  name: string;
  duration: number; // Seconds
  loop: boolean;
  speed: number;
  tracks: AnimationTrack[];
}

export interface AnimationTrack {
  targetProperty: string; // e.g. "position.x", "rotation.y"
  keyframes: Keyframe[];
  interpolation: 'linear' | 'step' | 'cubic';
}

export interface Keyframe {
  time: number;
  value: number;
  inTangent?: number;
  outTangent?: number;
}

export interface AnimationState {
  id: string;
  clipId: string;
  speed: number;
  loop: boolean;
  currentTime: number;
  weight: number; // Blend weight (0-1)
  isPlaying: boolean;
}

export interface AnimationTransition {
  id: string;
  fromState: string;
  toState: string;
  duration: number; // Transition blend time (seconds)
  condition: TransitionCondition;
  interruptible: boolean;
}

export type TransitionCondition =
  | {
      type: 'parameter';
      name: string;
      comparator: '>' | '<' | '==' | '!=';
      value: number | boolean;
    }
  | { type: 'finished' } // Triggers when animation ends
  | { type: 'trigger'; name: string };

export interface BlendNode {
  type: 'clip' | 'blend1d' | 'blend2d';
  clipId?: string;
  parameter?: string; // Blend parameter name (for blend1d/2d)
  children?: { position: number; node: BlendNode }[];
  children2D?: { position: { x: number; y: number }; node: BlendNode }[];
}

export interface AnimationLayer {
  id: string;
  weight: number;
  blendMode: 'override' | 'additive';
  mask?: string[]; // Affected bone/property names (empty = all)
  graph: AnimationGraphInstance;
}

// =============================================================================
// ANIMATION GRAPH
// =============================================================================

export interface AnimationGraphInstance {
  states: Map<string, AnimationState>;
  transitions: AnimationTransition[];
  currentState: string;
  parameters: Map<string, number | boolean>;
  activeTransition: {
    from: string;
    to: string;
    progress: number;
    duration: number;
  } | null;
}

export class AnimationGraph {
  private clips: Map<string, AnimationClip> = new Map();
  private layers: AnimationLayer[] = [];
  private defaultGraph: AnimationGraphInstance;

  constructor() {
    this.defaultGraph = {
      states: new Map(),
      transitions: [],
      currentState: '',
      parameters: new Map(),
      activeTransition: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Clip Management
  // ---------------------------------------------------------------------------

  addClip(clip: AnimationClip): void {
    this.clips.set(clip.id, clip);
  }

  getClip(id: string): AnimationClip | undefined {
    return this.clips.get(id);
  }

  removeClip(id: string): boolean {
    return this.clips.delete(id);
  }

  getClipIds(): string[] {
    return [...this.clips.keys()];
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  addState(
    id: string,
    clipId: string,
    options: Partial<{ speed: number; loop: boolean }> = {}
  ): AnimationState {
    const state: AnimationState = {
      id,
      clipId,
      speed: options.speed ?? 1,
      loop: options.loop ?? true,
      currentTime: 0,
      weight: 0,
      isPlaying: false,
    };
    this.defaultGraph.states.set(id, state);
    if (this.defaultGraph.states.size === 1) {
      this.defaultGraph.currentState = id;
      state.weight = 1;
      state.isPlaying = true;
    }
    return state;
  }

  getState(id: string): AnimationState | undefined {
    return this.defaultGraph.states.get(id);
  }

  getCurrentState(): string {
    return this.defaultGraph.currentState;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  addTransition(transition: AnimationTransition): void {
    this.defaultGraph.transitions.push(transition);
  }

  // ---------------------------------------------------------------------------
  // Parameters
  // ---------------------------------------------------------------------------

  setParameter(name: string, value: number | boolean): void {
    this.defaultGraph.parameters.set(name, value);
  }

  getParameter(name: string): number | boolean | undefined {
    return this.defaultGraph.parameters.get(name);
  }

  setTrigger(name: string): void {
    this.defaultGraph.parameters.set(name, true);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): Map<string, number> {
    const graph = this.defaultGraph;
    const output = new Map<string, number>();

    // Check for transitions
    if (!graph.activeTransition) {
      for (const t of graph.transitions) {
        if (t.fromState !== graph.currentState) continue;
        if (this.evaluateCondition(t.condition, graph)) {
          graph.activeTransition = {
            from: t.fromState,
            to: t.toState,
            progress: 0,
            duration: t.duration,
          };
          // Start target state
          const toState = graph.states.get(t.toState);
          if (toState) {
            toState.currentTime = 0;
            toState.isPlaying = true;
          }
          // Clear triggers
          if (t.condition.type === 'trigger') {
            graph.parameters.delete(t.condition.name);
          }
          break;
        }
      }
    }

    // Process active transition
    if (graph.activeTransition) {
      graph.activeTransition.progress += dt / graph.activeTransition.duration;

      const fromState = graph.states.get(graph.activeTransition.from);
      const toState = graph.states.get(graph.activeTransition.to);
      const blend = Math.min(1, graph.activeTransition.progress);

      if (fromState) fromState.weight = 1 - blend;
      if (toState) toState.weight = blend;

      if (graph.activeTransition.progress >= 1) {
        // Transition complete
        if (fromState) {
          fromState.weight = 0;
          fromState.isPlaying = false;
        }
        if (toState) toState.weight = 1;
        graph.currentState = graph.activeTransition.to;
        graph.activeTransition = null;
      }
    }

    // Advance all playing states and sample
    for (const [, state] of graph.states) {
      if (!state.isPlaying) continue;

      const clip = this.clips.get(state.clipId);
      if (!clip) continue;

      state.currentTime += dt * state.speed;
      if (state.loop) {
        state.currentTime %= clip.duration;
      } else {
        state.currentTime = Math.min(state.currentTime, clip.duration);
      }

      // Sample tracks
      for (const track of clip.tracks) {
        const value = this.sampleTrack(track, state.currentTime);
        const existing = output.get(track.targetProperty) || 0;
        output.set(track.targetProperty, existing + value * state.weight);
      }
    }

    return output;
  }

  // ---------------------------------------------------------------------------
  // Layers
  // ---------------------------------------------------------------------------

  addLayer(layer: AnimationLayer): void {
    this.layers.push(layer);
  }

  getLayers(): AnimationLayer[] {
    return [...this.layers];
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private evaluateCondition(
    condition: TransitionCondition,
    graph: AnimationGraphInstance
  ): boolean {
    switch (condition.type) {
      case 'finished': {
        const currentState = graph.states.get(graph.currentState);
        if (!currentState) return false;
        const clip = this.clips.get(currentState.clipId);
        return clip ? currentState.currentTime >= clip.duration : false;
      }
      case 'trigger':
        return graph.parameters.get(condition.name) === true;
      case 'parameter': {
        const val = graph.parameters.get(condition.name);
        if (val === undefined) return false;
        switch (condition.comparator) {
          case '>':
            return (val as number) > (condition.value as number);
          case '<':
            return (val as number) < (condition.value as number);
          case '==':
            return val === condition.value;
          case '!=':
            return val !== condition.value;
        }
        return false;
      }
    }
  }

  private sampleTrack(track: AnimationTrack, time: number): number {
    const kfs = track.keyframes;
    if (kfs.length === 0) return 0;
    if (kfs.length === 1 || time <= kfs[0].time) return kfs[0].value;
    if (time >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

    // Find surrounding keyframes
    let i = 0;
    while (i < kfs.length - 1 && kfs[i + 1].time < time) i++;

    const kf0 = kfs[i];
    const kf1 = kfs[i + 1];
    const t = (time - kf0.time) / (kf1.time - kf0.time);

    switch (track.interpolation) {
      case 'step':
        return kf0.value;
      case 'cubic': {
        // Hermite interpolation
        const t2 = t * t;
        const t3 = t2 * t;
        const h1 = 2 * t3 - 3 * t2 + 1;
        const h2 = t3 - 2 * t2 + t;
        const h3 = -2 * t3 + 3 * t2;
        const h4 = t3 - t2;
        const dt = kf1.time - kf0.time;
        return (
          h1 * kf0.value +
          h2 * (kf0.outTangent || 0) * dt +
          h3 * kf1.value +
          h4 * (kf1.inTangent || 0) * dt
        );
      }
      case 'linear':
      default:
        return kf0.value + (kf1.value - kf0.value) * t;
    }
  }
}

