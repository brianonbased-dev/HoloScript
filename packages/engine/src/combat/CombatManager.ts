import type { Vector3 } from '@holoscript/core';
/**
 * CombatManager.ts
 *
 * Combat orchestration: hitbox/hurtbox, combo system,
 * cooldowns, targeting, and combat state.
 *
 * @module combat
 */

// =============================================================================
// TYPES
// =============================================================================

export interface HitBox {
  id: string;
  ownerId: string;
  position: [number, number, number];
  size: Vector3;
  active: boolean;
  damage: number;
  damageType: string;
  knockback: number;
}

export interface HurtBox {
  id: string;
  ownerId: string;
  position: [number, number, number];
  size: Vector3;
  active: boolean;
}

export interface ComboStep {
  name: string;
  input: string;
  damage: number;
  window: number; // seconds to input next step
  hitboxId?: string;
}

export interface ComboChain {
  id: string;
  steps: ComboStep[];
  currentStep: number;
  timer: number;
  completed: boolean;
}

export interface Cooldown {
  abilityId: string;
  duration: number;
  remaining: number;
}

export interface CombatTarget {
  entityId: string;
  position: [number, number, number];
  priority: number;
  distance: number;
}

// =============================================================================
// COMBAT MANAGER
// =============================================================================

export class CombatManager {
  private hitboxes: Map<string, HitBox> = new Map();
  private hurtboxes: Map<string, HurtBox> = new Map();
  private combos: Map<string, ComboChain> = new Map();
  private cooldowns: Map<string, Cooldown> = new Map();
  private hitLog: Array<{ hitboxId: string; hurtboxId: string; time: number }> = [];

  // ---------------------------------------------------------------------------
  // Hitbox / Hurtbox
  // ---------------------------------------------------------------------------

  addHitBox(hitbox: HitBox): void {
    this.hitboxes.set(hitbox.id, hitbox);
  }
  addHurtBox(hurtbox: HurtBox): void {
    this.hurtboxes.set(hurtbox.id, hurtbox);
  }
  removeHitBox(id: string): void {
    this.hitboxes.delete(id);
  }
  removeHurtBox(id: string): void {
    this.hurtboxes.delete(id);
  }

  setHitBoxActive(id: string, active: boolean): void {
    const hb = this.hitboxes.get(id);
    if (hb) hb.active = active;
  }

  private toArr3(v: Vector3 | [number, number, number] | { x: number; y: number; z: number }): [number, number, number] {
    if (Array.isArray(v)) return [v[0], v[1], v[2]];
    const o = v as { x: number; y: number; z: number };
    return [o.x, o.y, o.z];
  }

  checkCollisions(): Array<{ hitbox: HitBox; hurtbox: HurtBox }> {
    const hits: Array<{ hitbox: HitBox; hurtbox: HurtBox }> = [];

    for (const hb of this.hitboxes.values()) {
      if (!hb.active) continue;
      for (const hr of this.hurtboxes.values()) {
        if (!hr.active) continue;
        if (hb.ownerId === hr.ownerId) continue; // No self-hit

        if (this.aabbOverlap(hb.position as any, hb.size, hr.position as any, hr.size)) {
          hits.push({ hitbox: hb, hurtbox: hr });
          this.hitLog.push({ hitboxId: hb.id, hurtboxId: hr.id, time: Date.now() });
        }
      }
    }

    return hits;
  }

  private aabbOverlap(
    posA: Vector3,
    sizeA: Vector3,
    posB: Vector3,
    sizeB: Vector3
  ): boolean {
    const pa = this.toArr3(posA as unknown as [number, number, number] | { x: number; y: number; z: number });
    const sa = this.toArr3(sizeA as unknown as [number, number, number] | { x: number; y: number; z: number });
    const pb = this.toArr3(posB as unknown as [number, number, number] | { x: number; y: number; z: number });
    const sb = this.toArr3(sizeB as unknown as [number, number, number] | { x: number; y: number; z: number });
    return (
      Math.abs(pa[0] - pb[0]) < (sa[0] + sb[0]) / 2 &&
      Math.abs(pa[1] - pb[1]) < (sa[1] + sb[1]) / 2 &&
      Math.abs(pa[2] - pb[2]) < (sa[2] + sb[2]) / 2
    );
  }

  // ---------------------------------------------------------------------------
  // Combo System
  // ---------------------------------------------------------------------------

  registerCombo(id: string, steps: ComboStep[]): ComboChain {
    const chain: ComboChain = { id, steps, currentStep: 0, timer: 0, completed: false };
    this.combos.set(id, chain);
    return chain;
  }

  advanceCombo(comboId: string, input: string): { hit: boolean; completed: boolean; step: number } {
    const combo = this.combos.get(comboId);
    if (!combo || combo.completed) return { hit: false, completed: false, step: -1 };

    const step = combo.steps[combo.currentStep];
    if (step.input === input) {
      combo.currentStep++;
      combo.timer = 0;
      const completed = combo.currentStep >= combo.steps.length;
      if (completed) combo.completed = true;
      return { hit: true, completed, step: combo.currentStep - 1 };
    }

    // Wrong input — reset
    combo.currentStep = 0;
    combo.timer = 0;
    return { hit: false, completed: false, step: 0 };
  }

  updateCombos(dt: number): void {
    for (const combo of this.combos.values()) {
      if (combo.completed || combo.currentStep === 0) continue;
      combo.timer += dt;
      const window = combo.steps[combo.currentStep - 1]?.window ?? 1;
      if (combo.timer > window) {
        combo.currentStep = 0;
        combo.timer = 0;
      }
    }
  }

  resetCombo(comboId: string): void {
    const combo = this.combos.get(comboId);
    if (combo) {
      combo.currentStep = 0;
      combo.timer = 0;
      combo.completed = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Cooldowns
  // ---------------------------------------------------------------------------

  startCooldown(abilityId: string, duration: number): void {
    this.cooldowns.set(abilityId, { abilityId, duration, remaining: duration });
  }

  isOnCooldown(abilityId: string): boolean {
    const cd = this.cooldowns.get(abilityId);
    return cd ? cd.remaining > 0 : false;
  }

  getCooldownRemaining(abilityId: string): number {
    return this.cooldowns.get(abilityId)?.remaining ?? 0;
  }

  updateCooldowns(dt: number): void {
    for (const cd of this.cooldowns.values()) {
      cd.remaining = Math.max(0, cd.remaining - dt);
    }
  }

  // ---------------------------------------------------------------------------
  // Targeting
  // ---------------------------------------------------------------------------

  findTargets(
    position: [number, number, number] | { x: number; y: number; z: number },
    candidates: Array<{
      entityId: string;
      position: [number, number, number];
      priority?: number;
    }>,
    maxRange: number
  ): CombatTarget[] {
    const p = this.toArr3(position);
    return candidates
      .map((c) => {
        const dx = c.position[0] - p[0];
        const dy = c.position[1] - p[1];
        const dz = c.position[2] - p[2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        return { entityId: c.entityId, position: c.position, priority: c.priority ?? 0, distance };
      })
      .filter((t) => t.distance <= maxRange)
      .sort((a, b) => b.priority - a.priority || a.distance - b.distance);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getHitLog(): typeof this.hitLog {
    return [...this.hitLog];
  }
  getHitBoxCount(): number {
    return this.hitboxes.size;
  }
  getHurtBoxCount(): number {
    return this.hurtboxes.size;
  }
}
