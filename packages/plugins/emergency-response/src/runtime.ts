import type { TraitRegistrarTarget } from '@holoscript/core/runtime';
import { registerEmergencyResponsePlugin } from './index';

/** Canonical auto-register entry point consumed by ManifestAutoLoader. */
export function registerTraitHandlers(registrar: TraitRegistrarTarget): void {
  registerEmergencyResponsePlugin(registrar);
}
