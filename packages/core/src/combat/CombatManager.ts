/**
 * CombatManager — hitbox/hurtbox AABB collision, combo chains,
 * cooldowns, targeting.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface HitBox {
  id: string;
  ownerId: string;
  position: Vec3;
  size: Vec3;
  active: boolean;
  damage: number;
  damageType: string;
  knockback: number;
}

export interface HurtBox {
  id: string;
  ownerId: string;
  position: Vec3;
  size: Vec3;
  active: boolean;
}

export interface CollisionResult {
  hitbox: HitBox;
  hurtbox: HurtBox;
}

export interface HitLogEntry {
  hitboxId: string;
  hurtboxId: string;
  timestamp: number;
}

export interface ComboStep {
  name: string;
  input: string;
  damage: number;
  window: number;
}

export interface ComboChain {
  id: string;
  steps: ComboStep[];
  currentStep: number;
  completed: boolean;
  lastAdvanceTime: number;
}

export interface ComboAdvanceResult {
  hit: boolean;
  step: number;
  completed: boolean;
}

export interface TargetCandidate {
  entityId: string;
  position: Vec3;
  priority?: number;
}

function aabbOverlap(aPos: Vec3, aSize: Vec3, bPos: Vec3, bSize: Vec3): boolean {
  const aMinX = aPos.x - aSize.x / 2;
  const aMaxX = aPos.x + aSize.x / 2;
  const aMinY = aPos.y - aSize.y / 2;
  const aMaxY = aPos.y + aSize.y / 2;
  const aMinZ = aPos.z - aSize.z / 2;
  const aMaxZ = aPos.z + aSize.z / 2;

  const bMinX = bPos.x - bSize.x / 2;
  const bMaxX = bPos.x + bSize.x / 2;
  const bMinY = bPos.y - bSize.y / 2;
  const bMaxY = bPos.y + bSize.y / 2;
  const bMinZ = bPos.z - bSize.z / 2;
  const bMaxZ = bPos.z + bSize.z / 2;

  return (
    aMinX < bMaxX &&
    aMaxX > bMinX &&
    aMinY < bMaxY &&
    aMaxY > bMinY &&
    aMinZ < bMaxZ &&
    aMaxZ > bMinZ
  );
}

function dist(a: Vec3, b: Vec3): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

export class CombatManager {
  private hitboxes: Map<string, HitBox> = new Map();
  private hurtboxes: Map<string, HurtBox> = new Map();
  private hitLog: HitLogEntry[] = [];
  private combos: Map<string, ComboChain> = new Map();
  private cooldowns: Map<string, number> = new Map();

  // --- Hitbox/Hurtbox CRUD ---
  addHitBox(hb: HitBox): void {
    this.hitboxes.set(hb.id, { ...hb });
  }

  addHurtBox(hr: HurtBox): void {
    this.hurtboxes.set(hr.id, { ...hr });
  }

  removeHitBox(id: string): void {
    this.hitboxes.delete(id);
  }

  removeHurtBox(id: string): void {
    this.hurtboxes.delete(id);
  }

  getHitBoxCount(): number {
    return this.hitboxes.size;
  }

  getHurtBoxCount(): number {
    return this.hurtboxes.size;
  }

  setHitBoxActive(id: string, active: boolean): void {
    const hb = this.hitboxes.get(id);
    if (hb) hb.active = active;
  }

  // --- Collision Detection ---
  checkCollisions(): CollisionResult[] {
    const results: CollisionResult[] = [];
    for (const hb of this.hitboxes.values()) {
      if (!hb.active) continue;
      for (const hr of this.hurtboxes.values()) {
        if (!hr.active) continue;
        if (hb.ownerId === hr.ownerId) continue;
        if (aabbOverlap(hb.position, hb.size, hr.position, hr.size)) {
          results.push({ hitbox: hb, hurtbox: hr });
          this.hitLog.push({
            hitboxId: hb.id,
            hurtboxId: hr.id,
            timestamp: Date.now(),
          });
        }
      }
    }
    return results;
  }

  getHitLog(): HitLogEntry[] {
    return [...this.hitLog];
  }

  // --- Combo System ---
  registerCombo(id: string, steps: ComboStep[]): ComboChain {
    const chain: ComboChain = {
      id,
      steps: [...steps],
      currentStep: 0,
      completed: false,
      lastAdvanceTime: 0,
    };
    this.combos.set(id, chain);
    return chain;
  }

  advanceCombo(id: string, input: string): ComboAdvanceResult {
    const chain = this.combos.get(id);
    if (!chain || chain.completed) return { hit: false, step: -1, completed: false };

    const step = chain.steps[chain.currentStep];
    if (step.input === input) {
      const stepIdx = chain.currentStep;
      chain.currentStep++;
      chain.lastAdvanceTime = 0;
      if (chain.currentStep >= chain.steps.length) {
        chain.completed = true;
        return { hit: true, step: stepIdx, completed: true };
      }
      return { hit: true, step: stepIdx, completed: false };
    }

    // Wrong input — reset
    chain.currentStep = 0;
    chain.lastAdvanceTime = 0;
    chain.completed = false;
    return { hit: false, step: -1, completed: false };
  }

  resetCombo(id: string): void {
    const chain = this.combos.get(id);
    if (chain) {
      chain.currentStep = 0;
      chain.completed = false;
      chain.lastAdvanceTime = 0;
    }
  }

  updateCombos(dt: number): void {
    for (const chain of this.combos.values()) {
      if (chain.completed || chain.currentStep === 0) continue;
      chain.lastAdvanceTime += dt;
      const currentStepDef = chain.steps[chain.currentStep];
      if (currentStepDef && chain.lastAdvanceTime > currentStepDef.window) {
        chain.currentStep = 0;
        chain.completed = false;
        chain.lastAdvanceTime = 0;
      }
    }
  }

  // --- Cooldowns ---
  startCooldown(ability: string, duration: number): void {
    this.cooldowns.set(ability, duration);
  }

  isOnCooldown(ability: string): boolean {
    const rem = this.cooldowns.get(ability);
    return rem !== undefined && rem > 0;
  }

  getCooldownRemaining(ability: string): number {
    return this.cooldowns.get(ability) ?? 0;
  }

  updateCooldowns(dt: number): void {
    for (const [ability, remaining] of this.cooldowns.entries()) {
      const next = remaining - dt;
      if (next <= 0) {
        this.cooldowns.delete(ability);
      } else {
        this.cooldowns.set(ability, next);
      }
    }
  }

  // --- Targeting ---
  findTargets(origin: Vec3, candidates: TargetCandidate[], maxRange: number): TargetCandidate[] {
    return candidates
      .filter((c) => dist(origin, c.position) <= maxRange)
      .sort((a, b) => {
        const pa = a.priority ?? 0;
        const pb = b.priority ?? 0;
        if (pb !== pa) return pb - pa; // higher priority first
        return dist(origin, a.position) - dist(origin, b.position); // closer first
      });
  }
}
