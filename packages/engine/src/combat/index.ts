export {
  CombatManager,
  type HitBox,
  type HurtBox,
  type ComboStep,
  type ComboChain,
  type Cooldown,
  type CombatTarget,
} from './CombatManager';

export {
  ComboTracker,
  type ComboStep as TrackerComboStep,
  type ComboDefinition,
  type ComboState,
} from './ComboTracker';

export {
  DamageSystem,
  type DamageType,
  type DamageInstance,
  type Resistances,
  type DotEffect,
  type DamageConfig,
} from './DamageSystem';

export {
  HitboxSystem,
  type Hitbox,
  type Hurtbox,
  type HitEvent,
} from './HitboxSystem';

export {
  ProjectileSystem,
  type ProjectileConfig,
  type Projectile,
  type ImpactCallback,
} from './ProjectileSystem';

export {
  StatusEffectSystem,
  type EffectType,
  type StackBehavior,
  type StatModifier,
  type StatusEffect,
} from './StatusEffects';

