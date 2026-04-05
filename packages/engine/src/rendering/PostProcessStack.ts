/**
 * PostProcessStack.ts
 *
 * Ordered post-processing effect chain: add/remove effects,
 * enable/disable, priority ordering, and blend weights.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PostProcessEffect {
  id: string;
  name: string;
  priority: number; // Lower = processed first
  enabled: boolean;
  weight: number; // 0-1 blend
  params: Map<string, number>;
  process: (input: Float32Array, width: number, height: number) => Float32Array;
}

// =============================================================================
// POST PROCESS STACK
// =============================================================================

let _effectId = 0;

export class PostProcessStack {
  private effects: Map<string, PostProcessEffect> = new Map();
  private sortedCache: PostProcessEffect[] = [];
  private dirty = true;
  private enabled = true;

  // ---------------------------------------------------------------------------
  // Effect Management
  // ---------------------------------------------------------------------------

  addEffect(
    name: string,
    priority: number,
    process: PostProcessEffect['process'],
    params?: Record<string, number>
  ): PostProcessEffect {
    const id = `ppfx_${_effectId++}`;
    const effect: PostProcessEffect = {
      id,
      name,
      priority,
      enabled: true,
      weight: 1,
      params: new Map(Object.entries(params ?? {})),
      process,
    };
    this.effects.set(id, effect);
    this.dirty = true;
    return effect;
  }

  removeEffect(id: string): boolean {
    this.dirty = true;
    return this.effects.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Enable / Disable
  // ---------------------------------------------------------------------------

  setEnabled(id: string, enabled: boolean): void {
    const effect = this.effects.get(id);
    if (effect) effect.enabled = enabled;
  }

  setGlobalEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
  isGlobalEnabled(): boolean {
    return this.enabled;
  }

  setWeight(id: string, weight: number): void {
    const effect = this.effects.get(id);
    if (effect) effect.weight = Math.max(0, Math.min(1, weight));
  }

  // ---------------------------------------------------------------------------
  // Processing
  // ---------------------------------------------------------------------------

  process(input: Float32Array, width: number, height: number): Float32Array {
    if (!this.enabled) return input;

    const sorted = this.getSorted();
    let buffer = input;

    for (const effect of sorted) {
      if (!effect.enabled || effect.weight <= 0) continue;

      const processed = effect.process(buffer, width, height);
      if (effect.weight >= 1) {
        buffer = processed;
      } else {
        // Blend
        const blended = new Float32Array(buffer.length);
        for (let i = 0; i < buffer.length; i++) {
          blended[i] = buffer[i] * (1 - effect.weight) + processed[i] * effect.weight;
        }
        buffer = blended;
      }
    }

    return buffer;
  }

  // ---------------------------------------------------------------------------
  // Ordering
  // ---------------------------------------------------------------------------

  private getSorted(): PostProcessEffect[] {
    if (this.dirty) {
      this.sortedCache = [...this.effects.values()].sort((a, b) => a.priority - b.priority);
      this.dirty = false;
    }
    return this.sortedCache;
  }

  reorder(id: string, newPriority: number): void {
    const effect = this.effects.get(id);
    if (effect) {
      effect.priority = newPriority;
      this.dirty = true;
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEffect(id: string): PostProcessEffect | undefined {
    return this.effects.get(id);
  }
  getEffectCount(): number {
    return this.effects.size;
  }
  getActiveCount(): number {
    return [...this.effects.values()].filter((e) => e.enabled).length;
  }
  getEffectNames(): string[] {
    return this.getSorted().map((e) => e.name);
  }

  setParam(id: string, param: string, value: number): void {
    this.effects.get(id)?.params.set(param, value);
  }

  getParam(id: string, param: string): number | undefined {
    return this.effects.get(id)?.params.get(param);
  }
}
