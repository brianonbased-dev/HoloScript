/**
 * StateSnapshot.ts
 *
 * Captures runtime state beyond the scene graph:
 * animation progress, particle emitter state, scroll offsets, focus state.
 */

export interface AnimationSnapshot {
  activeClipIds: string[];
  springValues: Record<string, number>;
}

export interface ParticleSnapshot {
  emitterId: string;
  isEmitting: boolean;
  activeCount: number;
}

export interface UISnapshot {
  focusedInputId: string | null;
  cursorIndex: number;
  scrollOffsets: Record<string, number>;
}

export interface RuntimeStateSnapshot {
  timestamp: string;
  animation: AnimationSnapshot;
  particles: ParticleSnapshot[];
  ui: UISnapshot;
  custom: Record<string, any>;
}

/**
 * Capture current runtime state from various subsystems.
 */
export class StateSnapshotCapture {
  /**
   * Create a snapshot of the current runtime state.
   * Subsystem references are passed in to avoid coupling.
   */
  capture(options: {
    animationEngine?: { getActiveIds: () => string[] };
    particleSystems?: Array<{
      id: string;
      isEmitting: () => boolean;
      getActiveCount: () => number;
    }>;
    keyboardSystem?: { focusedInputId: string | null; cursorIndex: number };
    scrollOffsets?: Record<string, number>;
    custom?: Record<string, any>;
  }): RuntimeStateSnapshot {
    const { animationEngine, particleSystems, keyboardSystem, scrollOffsets, custom } = options;

    return {
      timestamp: new Date().toISOString(),
      animation: {
        activeClipIds: animationEngine?.getActiveIds() || [],
        springValues: {},
      },
      particles: (particleSystems || []).map((ps) => ({
        emitterId: ps.id,
        isEmitting: ps.isEmitting(),
        activeCount: ps.getActiveCount(),
      })),
      ui: {
        focusedInputId: keyboardSystem?.focusedInputId || null,
        cursorIndex: keyboardSystem?.cursorIndex || 0,
        scrollOffsets: scrollOffsets || {},
      },
      custom: custom || {},
    };
  }
}
