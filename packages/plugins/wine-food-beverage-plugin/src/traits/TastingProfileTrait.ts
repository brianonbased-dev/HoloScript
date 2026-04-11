/** @tasting_profile Trait — Sensory evaluation profile. @trait tasting_profile */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface TastingNote { attribute: string; intensity: number; description: string; }
export interface TastingProfileConfig { productName: string; category: 'wine' | 'beer' | 'spirits' | 'coffee' | 'tea' | 'food'; vintage?: number; region?: string; appearance: TastingNote[]; aroma: TastingNote[]; taste: TastingNote[]; finish: TastingNote[]; overallScore: number; }

const defaultConfig: TastingProfileConfig = { productName: '', category: 'wine', appearance: [], aroma: [], taste: [], finish: [], overallScore: 0 };

export function createTastingProfileHandler(): TraitHandler<TastingProfileConfig> {
  return { name: 'tasting_profile', defaultConfig,
    onAttach(n: HSPlusNode, c: TastingProfileConfig, ctx: TraitContext) { n.__tastingState = { totalNotes: c.appearance.length + c.aroma.length + c.taste.length + c.finish.length, avgIntensity: 0 }; ctx.emit?.('tasting:profiled', { product: c.productName, score: c.overallScore }); },
    onDetach(n: HSPlusNode, _c: TastingProfileConfig, ctx: TraitContext) { delete n.__tastingState; ctx.emit?.('tasting:removed'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, c: TastingProfileConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'tasting:compare') { ctx.emit?.('tasting:comparison', { product: c.productName, score: c.overallScore, category: c.category }); }
    },
  };
}
