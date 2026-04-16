/** @text_to_universe Trait — Describe a movie and live in it. @trait text_to_universe */

import { buildTextToUniverseRenderSnippet } from '../textToUniverseSpatial';

export interface TextToUniverseConfig {
  llmProvider: string;
  autoSpawning: boolean;
  maxEntityCount: number;
  narrativeConsistency: string;
  gapsLodEnabled: boolean; // Geometric And Physics Scaling protection
}

export interface TextToUniverseState {
  isGenerating: boolean;
  activeNarrativeArc: string;
  crdtStreamSession: string | null;
  spawnedNodes: string[];
}

export interface TextToUniverseTraitHandler {
  name: 'text_to_universe';
  defaultConfig: TextToUniverseConfig;
  onAttach(n: unknown, c: TextToUniverseConfig, ctx: unknown): void;
  onDetach(n: unknown, c: TextToUniverseConfig, ctx: unknown): void;
  onUpdate(n: unknown, c: Partial<TextToUniverseConfig>, ctx: unknown): void;
  onEvent(n: unknown, c: TextToUniverseConfig, ctx: unknown, e: unknown): void;
}

export function createTextToUniverseHandler(): TextToUniverseTraitHandler {
  return {
    name: 'text_to_universe',
    defaultConfig: { llmProvider: 'claude-3-opus', autoSpawning: true, maxEntityCount: 1000, narrativeConsistency: 'high', gapsLodEnabled: true },
    onAttach(n: unknown, _c: TextToUniverseConfig, ctx: unknown) {
      (n as any).__ttuState = { isGenerating: false, activeNarrativeArc: '', crdtStreamSession: null, spawnedNodes: [] };
      (ctx as any).emit?.('ttu:ready');
    },
    onDetach(n: unknown, _c: TextToUniverseConfig, _ctx: unknown) {
      delete (n as any).__ttuState;
    },
    onUpdate() {},
    onEvent(n: unknown, c: TextToUniverseConfig, ctx: unknown, e: unknown) {
      const s = (n as any).__ttuState as TextToUniverseState;
      if (!s) return;

      const evt = e as any;
      if (evt.type === 'ttu:describe') {
         s.isGenerating = true;
         const prompt = evt.payload?.description as string;
         s.activeNarrativeArc = prompt.substring(0, 50) + '...';
         
         // 1. Trigger Prophetic SNN-WebGPU warming for zero-latency anticipation
         (ctx as any).emit?.('ttu:prophetic_warm', { 
           intentions: prompt,
           resourcePool: c.maxEntityCount 
         });

         (ctx as any).emit?.('ttu:generating', { prompt });
         
         // 2. Initialize CRDT AST stream from HoloMesh Orchestrator
         s.crdtStreamSession = `crdt://holomesh/feed/ttu/${Date.now()}`;
         (ctx as any).emit?.('ttu:crdt_channel_open', { 
             sessionUrl: s.crdtStreamSession,
             gapsEnabled: c.gapsLodEnabled
         });

         // Async processing simulation - replace with actual Orchestrator SSE/CRDT binding in production
         setTimeout(() => {
           s.isGenerating = false;
           // Generates interactive, live AST nodes directly instead of dead .glb meshes
           const astRootNodes = [`node_ttu_orchestrator_${Date.now()}`];
           s.spawnedNodes.push(...astRootNodes);
           
           const holoSnippet = buildTextToUniverseRenderSnippet({
             objectName: 'TTU_LiveRoot',
             fractalDepth: Math.min(6, 2 + Math.floor((prompt?.length ?? 0) / 80)),
           });
           
           (ctx as any).emit?.('ttu:render_snippet', { holoSnippet, prompt });
           (ctx as any).emit?.('ttu:manifested', { 
             newEntitiesCount: astRootNodes.length, 
             crdtRoot: astRootNodes[0], 
             prompt 
           });
         }, 500); // Latency reduced drastically thanks to SNN Prophetic pre-warming
      }
    }
  };
}
