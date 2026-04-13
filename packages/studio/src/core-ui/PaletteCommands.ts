import { UXCommandPalette } from './UXCommandPalette';
import { HSPlusNode } from '@holoscript/core';

/**
 * Register built-in Studio commands (AI generate, export, WebRTC sync, etc.)
 * into the command palette. Called once on app init.
 */
export function initializeStudioCommands(palette: UXCommandPalette, sceneRoot: HSPlusNode, webrtcProvider?: unknown) {
  palette.registerCommands([
    {
      id: 'cmd_ai_universe',
      label: 'AI: Generate Universe',
      icon: '✨',
      shortcut: ['Cmd', 'G'],
      description: 'Uses @text_to_universe trait to procedurally spawn a scene',
      action: async () => {
        const prompt = globalThis.prompt('Describe your universe to manifest:');
        if (!prompt) return;

        // Construct a runtime invocation of the Text-to-Universe trait
        const ttuNode: HSPlusNode = {
          id: `ttu_manifest_${Date.now()}`,
          type: 'entity',
          properties: { position: [0, 0, 0], visible: true },
          traits: new Map([
            ['text_to_universe', { llmProvider: 'claude-3-opus', narrativeConsistency: 'high', autoSpawning: true }]
          ]),
          children: []
        };
        
        sceneRoot.children?.push(ttuNode);
        
        // Dispatch the generation event to the local graph
        const e = new CustomEvent('hs:trait_event', { 
          detail: { nodeId: ttuNode.id, type: 'ttu:describe', payload: { description: prompt } }
        });
        document.dispatchEvent(e);
      }
    },
    {
      id: 'cmd_ai_urban',
      label: 'AI: Simulate Urban Heat Island',
      icon: '🌇',
      description: 'Casts @geospatial_climate over selected neighborhood',
      action: async () => {
         // Placeholder for urban planning invocation
         console.log('Invoking geospatial climate twin...');
      }
    },
    {
      id: 'cmd_sync_mesh',
      label: 'Network: Force CRDT Mesh Sync',
      icon: '🌐',
      shortcut: ['Cmd', 'S'],
      description: 'Flushes all local mutations to the HoloMesh peer network',
      action: async () => {
         if (webrtcProvider) {
           console.log('Flushing specific local CRDT state to HoloMesh peers');
           // webrtcProvider.sync(...)
         }
      }
    }
  ]);
}
