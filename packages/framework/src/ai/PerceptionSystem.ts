/**
 * PerceptionSystem.ts
 *
 * AI perception: sight/hearing/smell sense cones, stimulus memory,
 * priority scoring, and detection events.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export type SenseType = 'sight' | 'hearing' | 'smell';

export interface Stimulus {
  id: string;
  type: SenseType;
  sourceId: string;
  position: [number, number, number] | [number, number, number];
  intensity: number; // 0-1
  timestamp: number;
  data?: unknown;
}

export interface SenseConfig {
  type: SenseType;
  range: number;
  fov: number; // Degrees (360 = omnidirectional)
  sensitivity: number; // Multiplier on intensity
}

export interface PerceivedStimulus extends Stimulus {
  awareness: number; // 0-1 (increases with exposure)
  lastSeen: number;
}

// =============================================================================
// PERCEPTION SYSTEM
// =============================================================================

export class PerceptionSystem {
  // Per-entity: senses config, memory of perceived stimuli
  private entities: Map<
    string,
    {
      senses: SenseConfig[];
      facing: [number, number, number];
      position: [number, number, number];
      memory: Map<string, PerceivedStimulus>;
      memoryDuration: number;
    }
  > = new Map();

  // Active stimuli in the world
  private stimuli: Map<string, Stimulus> = new Map();

  // ---------------------------------------------------------------------------
  // Entity Registration
  // ---------------------------------------------------------------------------

  private toVec3(v: [number, number, number] | [number, number, number]): [number, number, number] {
    if (Array.isArray(v)) return [v[0], v[1], v[2]];
    return v;
  }

  registerEntity(id: string, senses: SenseConfig[], memoryDuration = 10): void {
    this.entities.set(id, {
      senses,
      facing: [0, 0, 1],
      position: [0, 0, 0],
      memory: new Map(),
      memoryDuration,
    });
  }

  setEntityTransform(
    entityId: string,
    position: [number, number, number],
    facing: [number, number, number]
  ): void {
    const e = this.entities.get(entityId);
    if (e) {
      e.position = this.toVec3(position);
      e.facing = this.toVec3(facing);
    }
  }

  // ---------------------------------------------------------------------------
  // Stimuli
  // ---------------------------------------------------------------------------

  addStimulus(stimulus: Stimulus): void {
    this.stimuli.set(stimulus.id, {
      ...stimulus,
      position: this.toVec3(stimulus.position),
    });
  }
  removeStimulus(id: string): void {
    this.stimuli.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Perception Update
  // ---------------------------------------------------------------------------

  update(time: number): void {
    for (const [entityId, entity] of this.entities) {
      // Expire old memories
      for (const [stimId, mem] of entity.memory) {
        if (time - mem.lastSeen > entity.memoryDuration) {
          entity.memory.delete(stimId);
        }
      }

      // Check each stimulus against senses
      for (const stim of this.stimuli.values()) {
        if (stim.sourceId === entityId) continue; // Can't sense yourself

        for (const sense of entity.senses) {
          if (sense.type !== stim.type) continue;

          const stimPos = this.toVec3(stim.position);
          const dx = stimPos[0] - entity.position[0];
          const dy = stimPos[1] - entity.position[1];
          const dz = stimPos[2] - entity.position[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          // Range check
          if (dist > sense.range) continue;

          // FOV check (only for directional senses)
          if (sense.fov < 360 && dist > 0) {
            const fLen =
              Math.sqrt(entity.facing[0] ** 2 + entity.facing[1] ** 2 + entity.facing[2] ** 2) || 1;
            const dot =
              (dx * entity.facing[0] + dy * entity.facing[1] + dz * entity.facing[2]) / (dist * fLen);
            const halfFovRad = (sense.fov / 2) * (Math.PI / 180);
            if (dot < Math.cos(halfFovRad)) continue;
          }

          // Perceived!
          const distFactor = 1 - dist / sense.range;
          const effectiveIntensity = stim.intensity * distFactor * sense.sensitivity;

          const existing = entity.memory.get(stim.id);
          if (existing) {
            existing.awareness = Math.min(1, existing.awareness + effectiveIntensity * 0.1);
            existing.lastSeen = time;
            existing.position = { ...stim.position };
          } else {
            entity.memory.set(stim.id, {
              ...stim,
              awareness: Math.min(1, effectiveIntensity),
              lastSeen: time,
            });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getPerceivedStimuli(entityId: string): PerceivedStimulus[] {
    const e = this.entities.get(entityId);
    return e ? [...e.memory.values()] : [];
  }

  getHighestPriority(entityId: string): PerceivedStimulus | null {
    const perceived = this.getPerceivedStimuli(entityId);
    if (perceived.length === 0) return null;
    return perceived.reduce((best, s) =>
      s.awareness * s.intensity > best.awareness * best.intensity ? s : best
    );
  }

  isAwareOf(entityId: string, stimulusId: string): boolean {
    return this.entities.get(entityId)?.memory.has(stimulusId) ?? false;
  }

  getStimulusCount(): number {
    return this.stimuli.size;
  }
}
