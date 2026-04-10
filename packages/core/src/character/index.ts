/**
 * Character subsystem barrel export.
 */

export { CharacterController } from './CharacterController';
export type { Vector3, CharacterControllerOptions } from './CharacterController';

export { CharacterStats } from './CharacterStats';
export type { StatBlock, Modifier, CharacterStatsOptions } from './CharacterStats';

export { MovementSystem } from './MovementSystem';
export type { MovementMode, MovementInput, MovementConfig, MovementState } from './MovementSystem';

export { AnimationStateMachine } from './AnimationStateMachine';
export type {
  AnimationState,
  AnimationTransition,
  AnimationStateConfig,
} from './AnimationStateMachine';

export { CharacterInventory } from './CharacterInventory';
export type { EquipSlot, StatBonuses, InventoryItem, InventoryConfig } from './CharacterInventory';
