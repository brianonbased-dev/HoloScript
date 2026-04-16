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

export interface SwarmTopologyNode {
  id: string;
  label?: string;
  status?: string;
  role?: string;
}

export interface SwarmTopologyPayload {
  roomId?: string;
  updatedAt?: string;
  nodes: SwarmTopologyNode[];
}

export interface LiveSwarmNodeViewerOptions {
  streamUrl?: string;
  eventSourceFactory?: (url: string) => EventSource;
}

const MAX_TEMPLATE_SHORTCUTS = 5;

const DEFAULT_SWARM_TOPOLOGY_STREAM_URL = '/api/holomesh/swarm/topology/stream';

let liveSwarmEventSource: EventSource | null = null;

function ensureLiveSwarmViewerContainer(): HTMLElement {
  const existing = document.getElementById('studio-live-swarm-viewer');
  if (existing) return existing;

  const container = document.createElement('section');
  container.id = 'studio-live-swarm-viewer';
  container.setAttribute('aria-label', 'Live Swarm Node Viewer');
  Object.assign(container.style, {
    position: 'absolute',
    right: '16px',
    top: '16px',
    width: '320px',
    maxHeight: '320px',
    overflow: 'auto',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(10, 10, 14, 0.88)',
    color: '#fff',
    zIndex: '9998',
    padding: '12px',
    fontFamily: 'Inter, sans-serif',
    backdropFilter: 'blur(10px)',
  });
  container.innerHTML = '<strong>Live Swarm Node Viewer</strong><div style="opacity:0.7;margin-top:8px;">Connecting...</div>';
  document.body.appendChild(container);
  return container;
}

function renderLiveSwarmTopology(payload: SwarmTopologyPayload): void {
  const container = ensureLiveSwarmViewerContainer();
  const rows = payload.nodes
    .map((node) => {
      const status = node.status ?? 'unknown';
      const role = node.role ? ` · ${node.role}` : '';
      const label = node.label ?? node.id;
      return `<li style="margin:6px 0; list-style:none;"><span style="font-weight:600;">${label}</span><span style="opacity:0.65;"> · ${status}${role}</span></li>`;
    })
    .join('');

  const updated = payload.updatedAt ?? new Date().toISOString();
  const room = payload.roomId ? `<div style="opacity:0.65; margin-top:4px;">Room: ${payload.roomId}</div>` : '';

  container.innerHTML = [
    '<strong>Live Swarm Node Viewer</strong>',
    room,
    `<div style="opacity:0.65; margin-top:4px;">Updated: ${updated}</div>`,
    `<ul style="padding:0; margin:8px 0 0 0;">${rows || '<li style="list-style:none;opacity:0.7;">No nodes</li>'}</ul>`,
  ].join('');
}

export function createLiveSwarmNodeViewerCommand(
  options: LiveSwarmNodeViewerOptions = {}
): CommandOption {
  return {
    id: 'cmd_live_swarm_node_viewer',
    label: 'HoloMesh: Live Swarm Node Viewer',
    icon: '🕸️',
    shortcut: ['Cmd', 'Shift', 'L'],
    description: 'Open an SSE stream and visualize live SwarmTopology nodes.',
    action: async () => {
      ensureLiveSwarmViewerContainer();

      if (liveSwarmEventSource) {
        liveSwarmEventSource.close();
        liveSwarmEventSource = null;
      }

      const url = options.streamUrl ?? DEFAULT_SWARM_TOPOLOGY_STREAM_URL;
      const factory = options.eventSourceFactory ?? ((u: string) => new EventSource(u));
      const source = factory(url);
      liveSwarmEventSource = source;

      source.onmessage = (event: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(event.data) as SwarmTopologyPayload;
          const payload: SwarmTopologyPayload = {
            roomId: parsed.roomId,
            updatedAt: parsed.updatedAt,
            nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
          };
          renderLiveSwarmTopology(payload);
          const topologyEvent = new CustomEvent('hs:swarm_topology', { detail: payload });
          document.dispatchEvent(topologyEvent);
        } catch {
          // Ignore malformed stream chunks; next SSE event may recover.
        }
      };

      source.onerror = () => {
        const container = ensureLiveSwarmViewerContainer();
        container.innerHTML =
          '<strong>Live Swarm Node Viewer</strong><div style="opacity:0.7;margin-top:8px;">Stream disconnected. Retry via Cmd+Shift+L.</div>';
      };
    },
  };
}

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
  const liveSwarmNodeViewerCommand = createLiveSwarmNodeViewerCommand();

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
    liveSwarmNodeViewerCommand,
    ...templateCommands,
  ]);
}
