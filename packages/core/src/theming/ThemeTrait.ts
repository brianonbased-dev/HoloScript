/**
 * ThemeTrait.ts
 *
 * Declarative theme application for HoloScript+ nodes.
 */

import type { TraitHandler } from '../traits/TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { ThemeEngine } from './ThemeEngine';
import { StyleResolver } from './StyleResolver';

export interface ThemeTraitConfig {
  classes?: string[];
  states?: string[];
  inline?: Record<string, any>;
}

let sharedThemeEngine: ThemeEngine | null = null;
let sharedStyleResolver: StyleResolver | null = null;

export function setSharedThemeEngine(engine: ThemeEngine): void {
  sharedThemeEngine = engine;
}
export function setSharedStyleResolver(resolver: StyleResolver): void {
  sharedStyleResolver = resolver;
}

export const themeTraitHandler: TraitHandler<ThemeTraitConfig> = {
  name: 'theme',
  defaultConfig: {},

  onAttach(node: HSPlusNode, config: ThemeTraitConfig, _context: any) {
    if (!sharedStyleResolver) return;
    const style = sharedStyleResolver.resolve(
      node.type || 'entity',
      config.classes || [],
      config.states || [],
      config.inline || {}
    );
    if (node.properties) {
      (node.properties as any)._style = style;
    }
  },

  onUpdate(node: HSPlusNode, config: ThemeTraitConfig, _context: any, _delta: number) {
    // Re-resolve on state changes
    if (!sharedStyleResolver) return;
    const style = sharedStyleResolver.resolve(
      node.type || 'entity',
      config.classes || [],
      config.states || [],
      config.inline || {}
    );
    if (node.properties) {
      (node.properties as any)._style = style;
    }
  },
};
