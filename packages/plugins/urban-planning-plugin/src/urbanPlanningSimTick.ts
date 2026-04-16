import type { TraitEvent } from './traits/types';

/** Event type consumed by {@link createZoningHandler} `onEvent`. */
export const URBAN_PLANNING_ECONOMY_SIM_TICK = 'urban_planning:economy_sim_tick' as const;

/**
 * Canonical trait event for one zoning simulation step (parcel workload).
 * Prefer this shape when calling `VRTraitRegistry.handleEventForAllTraits` directly.
 */
export function urbanPlanningEconomySimTickTraitEvent(parcels: number): TraitEvent {
  const n = Math.max(0, Math.floor(parcels));
  return { type: URBAN_PLANNING_ECONOMY_SIM_TICK, payload: { parcels: n } };
}
