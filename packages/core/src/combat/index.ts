export { CombatManager } from './CombatManager';
export type { HitBox, HurtBox, CollisionResult, HitLogEntry, ComboStep, ComboChain, ComboAdvanceResult, Vec3, TargetCandidate } from './CombatManager';

export { DamageSystem } from './DamageSystem';
export type { DamageConfig, DamageInstance, Resistances, DoTEffect, DoTTickResult } from './DamageSystem';

export { HitboxSystem } from './HitboxSystem';
export type { Hitbox, Hurtbox, HitEvent } from './HitboxSystem';

export { ProjectileSystem } from './ProjectileSystem';
export type { ProjectileConfig, Projectile, Target } from './ProjectileSystem';

export { StatusEffectSystem } from './StatusEffects';
export type { StatusEffect, StatModifier, TickResult } from './StatusEffects';

export { ComboTracker } from './ComboTracker';
export type { ComboDefinition, ComboStep as ComboTrackerStep } from './ComboTracker';
