import type { TraitRegistrarTarget } from '@holoscript/core/runtime';
import { registerThreatIntelligencePlugin } from './index';

/** Canonical auto-register entry point consumed by ManifestAutoLoader. */
export function registerTraitHandlers(registrar: TraitRegistrarTarget): void {
  registerThreatIntelligencePlugin(registrar);
}
