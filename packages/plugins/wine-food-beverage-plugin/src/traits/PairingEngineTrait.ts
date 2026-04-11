/** @pairing_engine Trait — Food and beverage pairing suggestions. @trait pairing_engine */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface PairingRule { food: string; beverage: string; strength: 'perfect' | 'good' | 'acceptable' | 'clash'; reason: string; }
export interface PairingEngineConfig { rules: PairingRule[]; flavorProfiles: Record<string, string[]>; maxSuggestions: number; }

const defaultConfig: PairingEngineConfig = { rules: [], flavorProfiles: {}, maxSuggestions: 5 };

export function createPairingEngineHandler(): TraitHandler<PairingEngineConfig> {
  return { name: 'pairing_engine', defaultConfig,
    onAttach(n: HSPlusNode, c: PairingEngineConfig, ctx: TraitContext) { n.__pairingState = { rulesLoaded: c.rules.length }; ctx.emit?.('pairing:ready', { rules: c.rules.length }); },
    onDetach(n: HSPlusNode, _c: PairingEngineConfig, ctx: TraitContext) { delete n.__pairingState; ctx.emit?.('pairing:removed'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, c: PairingEngineConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'pairing:suggest') {
        const food = (e.payload?.food as string) ?? '';
        const matches = c.rules.filter(r => r.food.toLowerCase() === food.toLowerCase() && r.strength !== 'clash').sort((a, b) => { const order = { perfect: 0, good: 1, acceptable: 2, clash: 3 }; return order[a.strength] - order[b.strength]; }).slice(0, c.maxSuggestions);
        ctx.emit?.('pairing:suggestions', { food, pairings: matches.map(m => ({ beverage: m.beverage, strength: m.strength, reason: m.reason })) });
      }
    },
  };
}
