/**
 * Loro v1.x subscribe batch helpers — `LoroEvent.target` is a {@link ContainerID}, not a live map handle.
 * Trait inspection for spatial graphs must use {@link LoroEvent.diff} plus {@link LoroDoc.getMap}.
 */

import type { ContainerID, LoroDoc, LoroEvent, LoroEventBatch, MapDiff } from 'loro-crdt';

/** Trait names stored under `name` on trait map nodes (economic / marketplace graph). */
export const ECONOMIC_TRAIT_NAMES = ['marketplace_listing', 'agent_owned_entity'] as const;
export type EconomicTraitName = (typeof ECONOMIC_TRAIT_NAMES)[number];

export function isEconomicTraitName(value: unknown): value is EconomicTraitName {
  return value === 'marketplace_listing' || value === 'agent_owned_entity';
}

function readTraitNameFromMapEvent(doc: LoroDoc, target: ContainerID, diff: MapDiff): unknown {
  if (!Object.prototype.hasOwnProperty.call(diff.updated, 'name')) {
    return undefined;
  }
  const fromDiff = diff.updated['name'];
  if (typeof fromDiff === 'string') {
    return fromDiff;
  }
  const map = doc.getMap(target);
  return map.get('name');
}

/**
 * True when this event describes a map mutation that includes the `name` field
 * and the resolved trait id is an economic primitive trait.
 */
export function loroEventTouchesEconomicTrait(doc: LoroDoc, ev: LoroEvent): boolean {
  if (ev.diff.type !== 'map') {
    return false;
  }
  const nameVal = readTraitNameFromMapEvent(doc, ev.target, ev.diff);
  return isEconomicTraitName(nameVal);
}

export function loroBatchTouchesEconomicTrait(doc: LoroDoc, batch: LoroEventBatch): boolean {
  return batch.events.some((ev) => loroEventTouchesEconomicTrait(doc, ev));
}
