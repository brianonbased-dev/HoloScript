/**
 * EmotionSystem.ts
 *
 * Emotion states: mood tracking, decay over time,
 * relationship modifiers, and emotion-triggered events.
 *
 * @module dialogue
 */

// =============================================================================
// TYPES
// =============================================================================

export type EmotionType = string;

export interface EmotionState {
  type: EmotionType;
  intensity: number;
  decayRate: number;
}

export interface Relationship {
  entityA: string;
  entityB: string;
  affinity: number;
}

export type EmotionTrigger = (entityId: string, emotion: EmotionType, intensity: number) => void;

// =============================================================================
// EMOTION SYSTEM
// =============================================================================

export class EmotionSystem {
  private emotions: Map<string, Map<string, EmotionState>> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private triggers: EmotionTrigger[] = [];

  // ---------------------------------------------------------------------------
  // Emotion Management
  // ---------------------------------------------------------------------------

  setEmotion(entityId: string, type: EmotionType, intensity: number, decayRate = 0.1): void {
    if (!this.emotions.has(entityId)) this.emotions.set(entityId, new Map());
    const emotions = this.emotions.get(entityId)!;
    const clamped = Math.max(0, Math.min(1, intensity));
    emotions.set(type, { type, intensity: clamped, decayRate });

    for (const trigger of this.triggers) trigger(entityId, type, clamped);
  }

  getEmotion(entityId: string, type: EmotionType): number {
    return this.emotions.get(entityId)?.get(type)?.intensity ?? 0;
  }

  getDominantEmotion(entityId: string): EmotionType | null {
    const emotions = this.emotions.get(entityId);
    if (!emotions || emotions.size === 0) return null;
    let best: EmotionType | null = null;
    let bestIntensity = 0;
    for (const [type, state] of emotions) {
      if (state.intensity > bestIntensity) {
        bestIntensity = state.intensity;
        best = type;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Decay
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    for (const emotions of this.emotions.values()) {
      for (const [type, state] of emotions) {
        state.intensity = Math.max(0, state.intensity - state.decayRate * dt);
        if (state.intensity <= 0) emotions.delete(type);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Relationships
  // ---------------------------------------------------------------------------

  setRelationship(entityA: string, entityB: string, affinity: number): void {
    const key = `${entityA}:${entityB}`;
    this.relationships.set(key, {
      entityA,
      entityB,
      affinity: Math.max(-1, Math.min(1, affinity)),
    });
  }

  getRelationship(entityA: string, entityB: string): number {
    return this.relationships.get(`${entityA}:${entityB}`)?.affinity ?? 0;
  }

  modifyRelationship(entityA: string, entityB: string, delta: number): void {
    const current = this.getRelationship(entityA, entityB);
    this.setRelationship(entityA, entityB, current + delta);
  }

  // ---------------------------------------------------------------------------
  // Triggers
  // ---------------------------------------------------------------------------

  onEmotionChange(trigger: EmotionTrigger): void {
    this.triggers.push(trigger);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEntityEmotions(entityId: string): string[] {
    const emotions = this.emotions.get(entityId);
    if (!emotions) return [];
    return [...emotions.keys()];
  }
}
