import { describe, it, expect } from 'vitest';
import { parseHolo } from './HoloCompositionParser';
import { SemanticSceneGraph } from '../compiler/SemanticSceneGraph';
import type { HoloComposition, HoloNPC } from './HoloCompositionTypes';

/**
 * First-class AGENT anchoring in the .holo IR (#6): NPCs gain an optional spatial
 * position and a typed AgentBrainAttachment, and the SemanticSceneGraph emits
 * agent-perspective edges (hs:locatedAt / hs:brain / hs:hasAgency /
 * hs:canInteractWith) — so a compiler/analyzer can reason about AI agency and
 * location WITHOUT running the trait runtime.
 */
describe('.holo IR — agent anchoring', () => {
  function npcOf(source: string): HoloNPC {
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    const npc = result.ast?.npcs?.[0];
    expect(npc).toBeDefined();
    return npc as HoloNPC;
  }

  it('coerces position [x,y,z] into the canonical {x,y,z}', () => {
    const npc = npcOf(`
      composition "World" {
        npc "Guard" {
          position: [1, 2, 3]
        }
      }
    `);
    expect(npc.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('parses brain_ref shorthand into a typed AgentBrainAttachment', () => {
    const npc = npcOf(`
      composition "World" {
        npc "Merchant" {
          brain_ref: "merchant_brain"
        }
      }
    `);
    expect(npc.brain?.type).toBe('AgentBrainAttachment');
    expect(npc.brain?.brainRef).toBe('merchant_brain');
    expect(npc.brain?.brainType).toBe('llm');
  });

  it('parses a full brain block', () => {
    const npc = npcOf(`
      composition "World" {
        npc "Guard" {
          brain: { type: "llm", autonomy: "autonomous", ref: "b1", tools: ["greet", "sell"] }
        }
      }
    `);
    expect(npc.brain?.brainType).toBe('llm');
    expect(npc.brain?.autonomy).toBe('autonomous');
    expect(npc.brain?.brainRef).toBe('b1');
    expect(npc.brain?.toolPermissions).toEqual(['greet', 'sell']);
  });

  it('is backward-compatible — a plain NPC has no position/brain', () => {
    const npc = npcOf(`
      composition "World" {
        npc "Guard" {
          type: "warrior"
          model: "guard_model"
        }
      }
    `);
    expect(npc.npcType).toBe('warrior');
    expect(npc.position).toBeUndefined();
    expect(npc.brain).toBeUndefined();
  });

  it('SemanticSceneGraph emits hs:locatedAt + agency edges for a positioned, brained NPC', () => {
    const result = parseHolo(`
      composition "World" {
        npc "Guard" {
          position: [4, 0, 7]
          brain: { type: "llm", autonomy: "autonomous", tools: ["greet", "open_door"] }
        }
      }
    `);
    expect(result.success).toBe(true);
    const graph = SemanticSceneGraph.generateObject(
      result.ast as unknown as HoloComposition
    ) as Record<string, unknown>;
    const npcs = graph['hs:npcs'] as Array<Record<string, unknown>>;
    expect(npcs).toHaveLength(1);
    const node = npcs[0];

    expect(node['hs:locatedAt']).toMatchObject({
      '@type': 'hs:Position',
      'hs:x': 4,
      'hs:y': 0,
      'hs:z': 7,
    });
    expect(node['hs:hasAgency']).toBe(true);
    const brain = node['hs:brain'] as Record<string, unknown>;
    expect(brain['hs:brainType']).toBe('llm');
    expect(brain['hs:autonomy']).toBe('autonomous');
    expect(brain['hs:canInteractWith']).toEqual(['greet', 'open_door']);
  });

  it('agency marker is a real signal — a non-brain NPC has no hs:hasAgency', () => {
    const result = parseHolo(`
      composition "World" {
        npc "Rock" {
          type: "scenery"
        }
      }
    `);
    const graph = SemanticSceneGraph.generateObject(
      result.ast as unknown as HoloComposition
    ) as Record<string, unknown>;
    const node = (graph['hs:npcs'] as Array<Record<string, unknown>>)[0];
    expect(node['hs:hasAgency']).toBeUndefined();
    expect(node['hs:brain']).toBeUndefined();
  });
});
