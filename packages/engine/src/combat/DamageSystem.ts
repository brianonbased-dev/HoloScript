/**
 * DamageSystem.ts
 *
 * Damage calculation: damage types, resistances, critical hits,
 * damage-over-time, armor penetration, and damage events.
 *
 * @module combat
 */

// =============================================================================
// TYPES
// =============================================================================

export type DamageType =
  | 'physical'
  | 'fire'
  | 'ice'
  | 'lightning'
  | 'poison'
  | 'holy'
  | 'dark'
  | 'true';

export interface DamageInstance {
  id: string;
  sourceId: string;
  targetId: string;
  baseDamage: number;
  type: DamageType;
  isCritical: boolean;
  finalDamage: number;
  timestamp: number;
}

export interface Resistances {
  physical: number;
  fire: number;
  ice: number;
  lightning: number;
  poison: number;
  holy: number;
  dark: number;
}

export interface DotEffect {
  id: string;
  sourceId: string;
  targetId: string;
  type: DamageType;
  damagePerTick: number;
  tickInterval: number; // seconds
  duration: number; // seconds
  elapsed: number;
  lastTick: number;
  stacks: number;
}

export interface DamageConfig {
  critChance: number; // 0-1
  critMultiplier: number;
  armorPenetration: number; // 0-1, % of resistance ignored
  globalMultiplier: number;
}

// =============================================================================
// DAMAGE SYSTEM
// =============================================================================

let _dmgId = 0;
let _dotId = 0;

export class DamageSystem {
  private config: DamageConfig = {
    critChance: 0.1,
    critMultiplier: 2.0,
    armorPenetration: 0,
    globalMultiplier: 1.0,
  };
  private damageLog: DamageInstance[] = [];
  private dots: Map<string, DotEffect> = new Map();
  private resistances: Map<string, Resistances> = new Map();
  private callbacks: Array<(dmg: DamageInstance) => void> = [];

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setConfig(config: Partial<DamageConfig>): void {
    Object.assign(this.config, config);
  }
  getConfig(): DamageConfig {
    return { ...this.config };
  }

  setResistances(entityId: string, res: Partial<Resistances>): void {
    const base: Resistances = {
      physical: 0,
      fire: 0,
      ice: 0,
      lightning: 0,
      poison: 0,
      holy: 0,
      dark: 0,
    };
    this.resistances.set(entityId, { ...base, ...res });
  }

  getResistances(entityId: string): Resistances {
    return (
      this.resistances.get(entityId) ?? {
        physical: 0,
        fire: 0,
        ice: 0,
        lightning: 0,
        poison: 0,
        holy: 0,
        dark: 0,
      }
    );
  }

  // ---------------------------------------------------------------------------
  // Damage Calculation
  // ---------------------------------------------------------------------------

  calculateDamage(
    sourceId: string,
    targetId: string,
    baseDamage: number,
    type: DamageType,
    forceCrit = false
  ): DamageInstance {
    const isCrit = forceCrit || Math.random() < this.config.critChance;
    let damage = baseDamage;

    // Critical hit
    if (isCrit) damage *= this.config.critMultiplier;

    // Resistance (true damage ignores resistance)
    if (type !== 'true') {
      const res = this.getResistances(targetId);
      const resValue = res[type as keyof Resistances] ?? 0;
      const effectiveRes = resValue * (1 - this.config.armorPenetration);
      damage *= Math.max(0, 1 - effectiveRes);
    }

    // Global multiplier
    damage *= this.config.globalMultiplier;
    damage = Math.max(0, Math.round(damage * 100) / 100);

    const instance: DamageInstance = {
      id: `dmg_${_dmgId++}`,
      sourceId,
      targetId,
      baseDamage,
      type,
      isCritical: isCrit,
      finalDamage: damage,
      timestamp: Date.now(),
    };

    this.damageLog.push(instance);
    this.callbacks.forEach((cb) => cb(instance));
    return instance;
  }

  // ---------------------------------------------------------------------------
  // Damage Over Time
  // ---------------------------------------------------------------------------

  applyDoT(
    sourceId: string,
    targetId: string,
    type: DamageType,
    damagePerTick: number,
    tickInterval: number,
    duration: number,
    stacks = 1
  ): DotEffect {
    const dot: DotEffect = {
      id: `dot_${_dotId++}`,
      sourceId,
      targetId,
      type,
      damagePerTick,
      tickInterval,
      duration,
      elapsed: 0,
      lastTick: 0,
      stacks,
    };
    this.dots.set(dot.id, dot);
    return dot;
  }

  updateDoTs(dt: number): DamageInstance[] {
    const ticked: DamageInstance[] = [];
    const expired: string[] = [];

    for (const dot of this.dots.values()) {
      dot.elapsed += dt;

      while (dot.elapsed - dot.lastTick >= dot.tickInterval && dot.lastTick < dot.duration) {
        dot.lastTick += dot.tickInterval;
        const dmg = this.calculateDamage(
          dot.sourceId,
          dot.targetId,
          dot.damagePerTick * dot.stacks,
          dot.type
        );
        ticked.push(dmg);
      }

      if (dot.elapsed >= dot.duration) expired.push(dot.id);
    }

    for (const id of expired) this.dots.delete(id);
    return ticked;
  }

  getActiveDoTs(targetId?: string): DotEffect[] {
    const all = [...this.dots.values()];
    return targetId ? all.filter((d) => d.targetId === targetId) : all;
  }

  // ---------------------------------------------------------------------------
  // Events & Queries
  // ---------------------------------------------------------------------------

  onDamage(callback: (dmg: DamageInstance) => void): void {
    this.callbacks.push(callback);
  }

  getDamageLog(limit = 100): DamageInstance[] {
    return this.damageLog.slice(-limit);
  }

  getTotalDamageDealt(sourceId: string): number {
    return this.damageLog
      .filter((d) => d.sourceId === sourceId)
      .reduce((sum, d) => sum + d.finalDamage, 0);
  }

  clearLog(): void {
    this.damageLog = [];
  }
}

