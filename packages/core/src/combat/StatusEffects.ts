/**
 * StatusEffectSystem — buffs/debuffs with stacking behaviors,
 * immunity, tick damage, stat modifiers, cleanse.
 */

export interface StatModifier {
  stat: string;
  flat: number;
  percent: number;
}

export interface StatusEffect {
  id: string;
  name: string;
  type: 'buff' | 'debuff';
  duration: number;
  maxStacks: number;
  stackBehavior: 'stack' | 'refresh' | 'replace' | 'ignore';
  modifiers: StatModifier[];
  tickInterval: number;
  tickDamage: number;
  stacks: number;
  elapsed: number;
  lastTick: number;
}

export interface TickResult {
  entityId: string;
  effectName: string;
  damage: number;
  timestamp: number;
}

type EffectInput = Omit<StatusEffect, 'id' | 'elapsed' | 'lastTick' | 'stacks'> & {
  stacks?: number;
};

let nextEffectId = 0;

export class StatusEffectSystem {
  private effects: Map<string, StatusEffect[]> = new Map(); // entityId -> effects
  private immunities: Map<string, Set<string>> = new Map(); // entityId -> immune effect names
  private tickResults: TickResult[] = [];

  apply(entityId: string, input: EffectInput): StatusEffect | null {
    // Check immunity
    const immunes = this.immunities.get(entityId);
    if (immunes && immunes.has(input.name)) {
      return null;
    }

    let effects = this.effects.get(entityId);
    if (!effects) {
      effects = [];
      this.effects.set(entityId, effects);
    }

    const existing = effects.find((e) => e.name === input.name);

    if (existing) {
      switch (input.stackBehavior) {
        case 'stack':
          if (existing.stacks < existing.maxStacks) {
            existing.stacks++;
          }
          return existing;
        case 'refresh':
          existing.elapsed = 0;
          return existing;
        case 'replace': {
          const idx = effects.indexOf(existing);
          const newEffect: StatusEffect = {
            ...input,
            id: `effect_${nextEffectId++}`,
            stacks: input.stacks ?? 1,
            elapsed: 0,
            lastTick: 0,
          };
          effects[idx] = newEffect;
          return newEffect;
        }
        case 'ignore':
          return existing;
        default:
          return existing;
      }
    }

    const effect: StatusEffect = {
      ...input,
      id: `effect_${nextEffectId++}`,
      stacks: input.stacks ?? 1,
      elapsed: 0,
      lastTick: 0,
    };
    effects.push(effect);
    return effect;
  }

  remove(entityId: string, name: string): boolean {
    const effects = this.effects.get(entityId);
    if (!effects) return false;
    const idx = effects.findIndex((e) => e.name === name);
    if (idx === -1) return false;
    effects.splice(idx, 1);
    return true;
  }

  hasEffect(entityId: string, name: string): boolean {
    const effects = this.effects.get(entityId);
    if (!effects) return false;
    return effects.some((e) => e.name === name);
  }

  getEffects(entityId: string): StatusEffect[] {
    return this.effects.get(entityId) ?? [];
  }

  getEffectCount(entityId: string): number {
    return (this.effects.get(entityId) ?? []).length;
  }

  // --- Immunity ---
  addImmunity(entityId: string, effectName: string): void {
    let set = this.immunities.get(entityId);
    if (!set) {
      set = new Set();
      this.immunities.set(entityId, set);
    }
    set.add(effectName);
  }

  removeImmunity(entityId: string, effectName: string): void {
    const set = this.immunities.get(entityId);
    if (set) set.delete(effectName);
  }

  // --- Ticking & Duration ---
  update(dt: number): void {
    this.tickResults = [];

    for (const [entityId, effects] of this.effects.entries()) {
      const alive: StatusEffect[] = [];

      for (const eff of effects) {
        eff.elapsed += dt;

        // Tick damage
        if (eff.tickInterval > 0 && eff.tickDamage > 0) {
          while (eff.lastTick + eff.tickInterval <= eff.elapsed) {
            eff.lastTick += eff.tickInterval;
            this.tickResults.push({
              entityId,
              effectName: eff.name,
              damage: eff.tickDamage * eff.stacks,
              timestamp: Date.now(),
            });
          }
        }

        // Duration check (0 = infinite)
        if (eff.duration > 0 && eff.elapsed >= eff.duration) {
          continue; // expired, don't keep
        }
        alive.push(eff);
      }

      this.effects.set(entityId, alive);
    }
  }

  getTickResults(): TickResult[] {
    return [...this.tickResults];
  }

  // --- Stat Modifiers ---
  getStatModifiers(entityId: string, stat: string): { flat: number; percent: number } {
    const effects = this.effects.get(entityId) ?? [];
    let flat = 0;
    let percent = 1.0;

    for (const eff of effects) {
      for (const mod of eff.modifiers) {
        if (mod.stat === stat) {
          flat += mod.flat * eff.stacks;
          percent *= mod.percent;
        }
      }
    }

    return { flat, percent };
  }

  applyStatModifiers(entityId: string, stat: string, baseValue: number): number {
    const { flat, percent } = this.getStatModifiers(entityId, stat);
    return (baseValue + flat) * percent;
  }

  // --- Cleanse ---
  cleanse(entityId: string): number {
    const effects = this.effects.get(entityId);
    if (!effects) return 0;
    const before = effects.length;
    const remaining = effects.filter((e) => e.type !== 'debuff');
    this.effects.set(entityId, remaining);
    return before - remaining.length;
  }

  removeAllOfType(entityId: string, type: 'buff' | 'debuff'): number {
    const effects = this.effects.get(entityId);
    if (!effects) return 0;
    const before = effects.length;
    const remaining = effects.filter((e) => e.type !== type);
    this.effects.set(entityId, remaining);
    return before - remaining.length;
  }
}
