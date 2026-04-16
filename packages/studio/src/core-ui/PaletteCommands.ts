import { UXCommandPalette } from './UXCommandPalette';
import { HSPlusNode } from '@holoscript/core';
import { SCENE_TEMPLATES, type SceneTemplate } from '../data/sceneTemplates';
import type { CommandOption } from './UXCommandPalette';

export interface AgentMarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  category: SceneTemplate['category'];
  tags: string[];
  shortcut: string[];
  code: string;
}

export interface AgentMarketplaceTypes {
  templates: AgentMarketplaceTemplate[];
}

const MAX_TEMPLATE_SHORTCUTS = 5;

function buildAgentMarketplaceTypes(
  templates: readonly SceneTemplate[] = SCENE_TEMPLATES
): AgentMarketplaceTypes {
  return {
    templates: templates.slice(0, MAX_TEMPLATE_SHORTCUTS).map((template, index) => ({
      id: template.id,
      name: template.name,
      description: template.desc,
      category: template.category,
      tags: template.tags,
      code: template.code,
      shortcut: ['Cmd', 'Shift', String(index + 1)],
    })),
  };
}

export function createAgentMarketplaceTemplateCommands(
  sceneRoot: HSPlusNode,
  templates: readonly SceneTemplate[] = SCENE_TEMPLATES
): CommandOption[] {
  const marketplaceTypes = buildAgentMarketplaceTypes(templates);

  return marketplaceTypes.templates.map((template) => ({
    id: `cmd_template_${template.id}`,
    label: `Template: ${template.name}`,
    icon: '🧩',
    shortcut: template.shortcut,
    description: `Insert ${template.category} template from Agent Marketplace`,
    action: async () => {
      const templateNode: HSPlusNode = {
        id: `template_${template.id}_${Date.now()}`,
        type: 'entity',
        properties: {
          templateId: template.id,
          templateCategory: template.category,
          label: template.name,
          createdBy: 'palette',
          visible: true,
          position: [0, 0, 0],
        },
        traits: new Map([
          [
            'template_reference',
            {
              templateId: template.id,
              tags: template.tags,
              source: 'agent-marketplace',
            },
          ],
        ]),
        children: [],
      };

      sceneRoot.children?.push(templateNode);

      const event = new CustomEvent('hs:template_apply', {
        detail: {
          templateId: template.id,
          templateName: template.name,
          templateCode: template.code,
          source: 'palette-shortcut',
        },
      });

      document.dispatchEvent(event);
    },
  }));
}

/**
 * Register built-in Studio commands (AI generate, export, WebRTC sync, etc.)
 * into the command palette. Called once on app init.
 */
export function initializeStudioCommands(palette: UXCommandPalette, sceneRoot: HSPlusNode, webrtcProvider?: unknown) {
  const templateCommands = createAgentMarketplaceTemplateCommands(sceneRoot);

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
    },
    ...templateCommands,
  ]);
}
