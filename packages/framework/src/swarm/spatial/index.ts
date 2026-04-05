/**
 * Spatial Swarm Behaviors - Index
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

// Vector utilities
export { Vector3 } from './Vector3';

// Boid-based flocking
export { FlockingBehavior, type IBoid, type IFlockingConfig } from './FlockingBehavior';

// Geometric formations
export {
  FormationController,
  type FormationType,
  type IFormationSlot,
  type IFormationConfig,
} from './FormationController';

// Territory control
export {
  ZoneClaiming,
  type ZoneState,
  type IZone,
  type IZoneClaim,
  type IZoneEvent,
  type IZoneClaimingConfig,
} from './ZoneClaiming';
