/**
 * StatusEffects.ts
 *
 * Buff/debuff system: stacking, duration, ticking effects,
 * stat modifiers, immunity, and cleansing.
 *
 * @module combat
 */

// =============================================================================
// TYPES
// =============================================================================

export type EffectType = 'buff' | 'debuff';
export type StackBehavior = 'stack' | 'refresh' | 'replace' | 'ignore';

export interface StatModifier {
  stat: string;
  flat: number; // Added to base value
  percent: number; // Multiplied (1.0 = no change, 1.5 = +50%)
}

export interface StatusEffect {
  id: string;
  name: string;
  type: EffectType;
  duration: number; // seconds, 0 = infinite
  elapsed: number;
  stacks: number;
  maxStacks: number;
  stackBehavior: StackBehavior;
  modifiers: StatModifier[];
  tickInterval: number; // 0 = no tick
  lastTick: number;
  tickDamage: number;
  onApply?: string; // event name
  onRemove?: string;
  onTick?: string;
}

// =============================================================================
// STATUS EFFECT SYSTEM
// =============================================================================

let _effectId = 0;

export class StatusEffectSystem {
  private effects: Map<string, Map<string, StatusEffect>> = new Map(); // entityId → effectName → effect
  private immunities: Map<string, Set<string>> = new Map(); // entityId → immune effect names
  private tickResults: Array<{ entityId: string; effectName: string; damage: number }> = [];

  // ---------------------------------------------------------------------------
  // Application
  // ---------------------------------------------------------------------------

  apply(
    entityId: string,
    effectDef: Omit<StatusEffect, 'id' | 'elapsed' | 'lastTick' | 'stacks'> & { stacks?: number }
  ): StatusEffect | null {
    // Check immunity
    const immune = this.immunities.get(entityId);
    if (immune?.has(effectDef.name)) return null;

    let entityEffects = this.effects.get(entityId);
    if (!entityEffects) {
      entityEffects = new Map();
      this.effects.set(entityId, entityEffects);
    }

    const existing = entityEffects.get(effectDef.name);

    if (existing) {
      switch (effectDef.stackBehavior) {
        case 'stack':
          existing.stacks = Math.min(existing.stacks + (effectDef.stacks ?? 1), existing.maxStacks);
          return existing;
        case 'refresh':
          existing.elapsed = 0;
          return existing;
        case 'replace':
          // Fall through to create new
          break;
        case 'ignore':
          return existing;
      }
    }

    const effect: StatusEffect = {
      ...effectDef,
      id: `effect_${_effectId++}`,
      elapsed: 0,
      lastTick: 0,
      stacks: effectDef.stacks ?? 1,
    };

    entityEffects.set(effect.name, effect);
    return effect;
  }

  // ---------------------------------------------------------------------------
  // Removal
  // ---------------------------------------------------------------------------

  remove(entityId: string, effectName: string): boolean {
    const entityEffects = this.effects.get(entityId);
    return entityEffects ? entityEffects.delete(effectName) : false;
  }

  removeAllOfType(entityId: string, type: EffectType): number {
    const entityEffects = this.effects.get(entityId);
    if (!entityEffects) return 0;
    let count = 0;
    for (const [name, effect] of entityEffects) {
      if (effect.type === type) {
        entityEffects.delete(name);
        count++;
      }
    }
    return count;
  }

  cleanse(entityId: string, count = Infinity): number {
    return this.removeAllOfType(entityId, 'debuff');
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    this.tickResults = [];
    const toRemove: Array<{ entityId: string; name: string }> = [];

    for (const [entityId, entityEffects] of this.effects) {
      for (const [name, effect] of entityEffects) {
        effect.elapsed += dt;

        // Tick
        if (effect.tickInterval > 0 && effect.tickDamage > 0) {
          while (effect.elapsed - effect.lastTick >= effect.tickInterval) {
            effect.lastTick += effect.tickInterval;
            this.tickResults.push({
              entityId,
              effectName: name,
              damage: effect.tickDamage * effect.stacks,
            });
          }
        }

        // Expiry
        if (effect.duration > 0 && effect.elapsed >= effect.duration) {
          toRemove.push({ entityId, name });
        }
      }
    }

    for (const { entityId, name } of toRemove) {
      this.remove(entityId, name);
    }
  }

  getTickResults(): typeof this.tickResults {
    return [...this.tickResults];
  }

  // ---------------------------------------------------------------------------
  // Immunity
  // ---------------------------------------------------------------------------

  addImmunity(entityId: string, effectName: string): void {
    let set = this.immunities.get(entityId);
    if (!set) {
      set = new Set();
      this.immunities.set(entityId, set);
    }
    set.add(effectName);
  }

  removeImmunity(entityId: string, effectName: string): void {
    this.immunities.get(entityId)?.delete(effectName);
  }

  // ---------------------------------------------------------------------------
  // Stat Queries
  // ---------------------------------------------------------------------------

  getStatModifiers(entityId: string, stat: string): { flat: number; percent: number } {
    let flat = 0,
      percent = 1.0;
    const entityEffects = this.effects.get(entityId);
    if (entityEffects) {
      for (const effect of entityEffects.values()) {
        for (const mod of effect.modifiers) {
          if (mod.stat === stat) {
            flat += mod.flat * effect.stacks;
            percent *= Math.pow(mod.percent, effect.stacks);
          }
        }
      }
    }
    return { flat, percent };
  }

  applyStatModifiers(entityId: string, stat: string, baseValue: number): number {
    const { flat, percent } = this.getStatModifiers(entityId, stat);
    return (baseValue + flat) * percent;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getEffects(entityId: string): StatusEffect[] {
    const entityEffects = this.effects.get(entityId);
    return entityEffects ? [...entityEffects.values()] : [];
  }

  hasEffect(entityId: string, effectName: string): boolean {
    return this.effects.get(entityId)?.has(effectName) ?? false;
  }

  getEffectCount(entityId: string): number {
    return this.effects.get(entityId)?.size ?? 0;
  }
}

