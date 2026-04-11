/** @text_to_universe Trait — Describe a movie and live in it. @trait text_to_universe */

export interface TextToUniverseConfig {
  llmProvider: string;
  autoSpawning: boolean;
  maxEntityCount: number;
  narrativeConsistency: string;
}

export interface TextToUniverseState {
  isGenerating: boolean;
  activeNarrativeArc: string;
  spawnedNodes: string[];
}

import type { TraitHandler, _HSPlusNode, _TraitContext, _TraitEvent } from './types';

export function createTextToUniverseHandler(): TraitHandler<TextToUniverseConfig> {
  return {
    name: 'text_to_universe',
    defaultConfig: { llmProvider: 'claude-3-opus', autoSpawning: true, maxEntityCount: 1000, narrativeConsistency: 'high' },
    onAttach(n: unknown, _c: TextToUniverseConfig, ctx: unknown) {
      (n as any).__ttuState = { isGenerating: false, activeNarrativeArc: '', spawnedNodes: [] };
      (ctx as any).emit?.('ttu:ready');
    },
    onDetach(n: unknown, _c: TextToUniverseConfig, _ctx: unknown) {
      delete (n as any).__ttuState;
    },
    onUpdate() {},
    onEvent(n: unknown, _c: TextToUniverseConfig, ctx: unknown, e: unknown) {
      const s = (n as any).__ttuState as TextToUniverseState;
      if (!s) return;
      if ((e as any).type === 'ttu:describe') {
         s.isGenerating = true;
         const prompt = (e as any).payload?.description as string;
         s.activeNarrativeArc = prompt.substring(0, 50) + '...';
         (ctx as any).emit?.('ttu:generating', { prompt });
         
         // Mock LLM to spatial tree generator
         setTimeout(() => {
           s.isGenerating = false;
           // Imagine injecting a dozen trees, vehicles, and a cinematic camera based on the prompt
           const mockGeneratedNodes = ['node_skybox_01', 'node_terrain_02', 'node_actor_jedi'];
           s.spawnedNodes.push(...mockGeneratedNodes);
           (ctx as any).emit?.('ttu:manifested', { newEntitiesCount: mockGeneratedNodes.length, prompt });
         }, 3000);
      }
    }
  };
}
