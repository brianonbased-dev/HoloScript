export { createTastingProfileHandler, type TastingProfileConfig, type TastingNote } from './traits/TastingProfileTrait';
export { createPairingEngineHandler, type PairingEngineConfig, type PairingRule } from './traits/PairingEngineTrait';
export { createInventoryAgingHandler, type InventoryAgingConfig, type AgingItem } from './traits/InventoryAgingTrait';
export * from './traits/types';

import { createTastingProfileHandler } from './traits/TastingProfileTrait';
import { createPairingEngineHandler } from './traits/PairingEngineTrait';
import { createInventoryAgingHandler } from './traits/InventoryAgingTrait';

export const pluginMeta = { name: '@holoscript/plugin-wine-food-beverage', version: '1.0.0', traits: ['tasting_profile', 'pairing_engine', 'inventory_aging'] };
export const traitHandlers = [createTastingProfileHandler(), createPairingEngineHandler(), createInventoryAgingHandler()];
