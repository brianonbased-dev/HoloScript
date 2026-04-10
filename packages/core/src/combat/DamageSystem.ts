/**
 * DamageSystem — damage calculation, resistances, crits, DoT,
 * armor penetration, global multiplier, damage log.
 */

export interface DamageConfig {
  critChance: number;
  critMultiplier: number;
  armorPenetration: number;
  globalMultiplier: number;
}

export interface DamageInstance {
  source: string;
  target: string;
  baseDamage: number;
  finalDamage: number;
  damageType: string;
  isCritical: boolean;
  timestamp: number;
}

export interface Resistances {
  [key: string]: number;
}

export interface DoTEffect {
  source: string;
  target: string;
  name: string;
  damagePerTick: number;
  tickInterval: number;
  duration: number;
  stacks: number;
  elapsed: number;
  lastTick: number;
}

export interface DoTTickResult {
  source: string;
  target: string;
  name: string;
  baseDamage: number;
  finalDamage: number;
  timestamp: number;
}

type DamageCallback = (instance: DamageInstance) => void;

const DEFAULT_CONFIG: DamageConfig = {
  critChance: 0,
  critMultiplier: 2,
  armorPenetration: 0,
  globalMultiplier: 1,
};

export class DamageSystem {
  private config: DamageConfig = { ...DEFAULT_CONFIG };
  private resistances: Map<string, Resistances> = new Map();
  private log: DamageInstance[] = [];
  private callbacks: DamageCallback[] = [];
  private dots: DoTEffect[] = [];

  setConfig(partial: Partial<DamageConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  getConfig(): DamageConfig {
    return { ...this.config };
  }

  setResistances(entityId: string, res: Resistances): void {
    this.resistances.set(entityId, { ...res });
  }

  getResistances(entityId: string): Resistances {
    return this.resistances.get(entityId) ?? { physical: 0, fire: 0, ice: 0, true: 0 };
  }

  calculateDamage(
    source: string,
    target: string,
    baseDamage: number,
    damageType: string,
    forceCrit = false,
  ): DamageInstance {
    let damage = baseDamage;

    // Critical hit
    const isCritical =
      forceCrit || (this.config.critChance > 0 && Math.random() < this.config.critChance);
    if (isCritical) {
      damage *= this.config.critMultiplier;
    }

    // Resistance (true damage bypasses)
    if (damageType !== 'true') {
      const res = this.resistances.get(target);
      if (res && res[damageType] !== undefined) {
        const effectiveRes = res[damageType] * (1 - this.config.armorPenetration);
        damage *= 1 - effectiveRes;
      }
    }

    // Global multiplier
    damage *= this.config.globalMultiplier;

    const instance: DamageInstance = {
      source,
      target,
      baseDamage,
      finalDamage: Math.round(damage * 100) / 100, // avoid floating point noise
      damageType,
      isCritical,
      timestamp: Date.now(),
    };

    this.log.push(instance);
    for (const cb of this.callbacks) cb(instance);
    return instance;
  }

  onDamage(cb: DamageCallback): void {
    this.callbacks.push(cb);
  }

  getDamageLog(): DamageInstance[] {
    return [...this.log];
  }

  getTotalDamageDealt(source: string): number {
    return this.log
      .filter((d) => d.source === source)
      .reduce((sum, d) => sum + d.finalDamage, 0);
  }

  clearLog(): void {
    this.log = [];
  }

  // --- Damage Over Time ---
  applyDoT(
    source: string,
    target: string,
    name: string,
    damagePerTick: number,
    tickInterval: number,
    duration: number,
    stacks = 1,
  ): DoTEffect {
    const dot: DoTEffect = {
      source,
      target,
      name,
      damagePerTick,
      tickInterval,
      duration,
      stacks,
      elapsed: 0,
      lastTick: 0,
    };
    this.dots.push(dot);
    return dot;
  }

  getActiveDoTs(target?: string): DoTEffect[] {
    if (target !== undefined) {
      return this.dots.filter((d) => d.target === target);
    }
    return [...this.dots];
  }

  updateDoTs(dt: number): DoTTickResult[] {
    const results: DoTTickResult[] = [];
    const alive: DoTEffect[] = [];

    for (const dot of this.dots) {
      dot.elapsed += dt;

      // Tick as many times as needed
      while (dot.lastTick + dot.tickInterval <= dot.elapsed && dot.lastTick + dot.tickInterval <= dot.duration) {
        dot.lastTick += dot.tickInterval;
        const tickDamage = dot.damagePerTick * dot.stacks;
        results.push({
          source: dot.source,
          target: dot.target,
          name: dot.name,
          baseDamage: tickDamage,
          finalDamage: tickDamage * this.config.globalMultiplier,
          timestamp: Date.now(),
        });
      }

      if (dot.elapsed < dot.duration) {
        alive.push(dot);
      }
    }

    this.dots = alive;
    return results;
  }
}
