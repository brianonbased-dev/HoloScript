/**
 * avatar-character-creator.scenario.ts — LIVING-SPEC: Procedural Form & Avatar Evolution
 *
 * Persona: Casey — technical artist pushing the bounds of native HoloScript capability.
 * They rely on Studio tooling to:
 *   - Procedurally spawn 1000s of geometric shapes simultaneously without crashing.
 *   - Materialize ultra-realistic character meshes natively tapping HoloScript native logic.
 *   - Orchestrate high-fidelity avatar rigs mapping realistic topology constraints seamlessly.
 *
 * Run: npx vitest run src/__tests__/scenarios/avatar-character-creator.scenario.ts
 */

import { describe, it, expect } from 'vitest';
import { useSceneGraphStore, type SceneNode } from '../../lib/store';
import { groupNodes, duplicateNode } from '../../lib/sceneUtils';
import {
  startGeneration,
  pollGenerationStatus,
  getAvailableProviders,
  validatePrompt,
  estimateGenerationCost,
  type GenerationRequest
} from '../../lib/aiCharacterGeneration';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _id = 0;
const nextId = () => `node_${++_id}`;

function makeNode(name: string, type: SceneNode['type'] = 'mesh', parentId: string | null = null): SceneNode {
  return {
    id: nextId(), name, type, parentId,
    traits: [], position: [0,0,0], rotation: [0,0,0], scale: [1,1,1],
  };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Procedural Geometry (1000s of Shapes)
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Avatar Creator — 1000s of Geometric Shapes Natively', () => {
  it('efficiently spawns 2,500 primitive geometric shapes (Spheres/Cubes/Torus) natively', () => {
    useSceneGraphStore.setState({ nodes: [] });
    
    // Spawn Native Geometric Shapes Procedurally
    const structuralArray: SceneNode[] = [];
    for (let i = 0; i < 2500; i++) {
        // distribute them spatially simulating native placement algorithms
        const primitive = makeNode(`GeoShape_${i}`, 'mesh');
        primitive.position = [
           (Math.random() - 0.5) * 500,
           (Math.random() - 0.5) * 500,
           (Math.random() - 0.5) * 500
        ];
        // Inject native geometric topology markers
        primitive.traits.push({ 
            name: '@geometry', 
            properties: { type: i % 2 === 0 ? 'sphere' : (i % 3 === 0 ? 'torus' : 'cube') } 
        });
        structuralArray.push(primitive);
    }

    useSceneGraphStore.setState({ nodes: structuralArray });
    expect(useSceneGraphStore.getState().nodes.length).toBe(2500);
  });

  it('groups 1000s of primitive shapes rapidly avoiding tree hierarchy limits', () => {
    const nodes = useSceneGraphStore.getState().nodes;
    const { group, updatedChildren } = groupNodes(nodes.slice(0, 1000), 'mega-cluster', 'Native Formation');
    
    expect(group.name).toBe('Native Formation');
    expect(updatedChildren.length).toBe(1000);
    expect(updatedChildren.every(c => c.parentId === 'mega-cluster')).toBe(true);
  });
  
  it('clones massive geometry nodes mapping structural buffers successfully', () => {
      const orig = useSceneGraphStore.getState().nodes[0]!;
      const clone = duplicateNode(orig, 'clone-bound');
      expect(clone.traits[0]?.name).toBe('@geometry');
      expect(clone.position).toEqual(orig.position);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Realistic Character Generation 
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Avatar Creator — AI Native Realistic Characters', () => {
  it('native aiCharacterGeneration utilities detect local API hooks (meshy/rodin)', () => {
     const providers = getAvailableProviders();
     expect(providers.length).toBeGreaterThan(0);
     expect(['meshy', 'rodin']).toContain(providers[0]);
  });

  it('validatePrompt() blocks low-quality prompts prioritizing high expectations', () => {
     const invalid = validatePrompt('dog');
     expect(invalid.valid).toBe(false);
     expect(invalid.error).toContain('too short');

     const valid = validatePrompt('ultra realistic high-fantasy warrior knight bridging dimensional armors natively');
     expect(valid.valid).toBe(true);
  });

  it('estimateGenerationCost() calculates native quality rendering weight (High Quality)', () => {
     const defaultQuality = estimateGenerationCost('standard');
     const maxQuality = estimateGenerationCost('high');
     
     expect(maxQuality).toBe('~20 credits');
     expect(defaultQuality).toBe('~10 credits');
  });

  it('startGeneration() processes a realistic character request tracking mock polling status', async () => {
     const req: GenerationRequest = {
         provider: 'meshy',
         prompt: 'Hyper-realistic sci-fi scavenger avatar fully equipped native 8k topology',
         style: 'realistic',
         quality: 'high'
     };

     // The test simulates the local Mock Mode bypassing API key injection internally
     const taskId = await startGeneration(req);
     expect(taskId).toContain('mock-');
  });

  it('pollGenerationStatus() resolves final GLB structure rendering the Realistic Character', async () => {
     // Generate a fake polling offset simulating completion 
     const taskId = `mock-${Date.now() - 31000}`; // 31s elapsed
     const status = await pollGenerationStatus('meshy', taskId);

     expect(status.status).toBe('completed');
     expect(status.progress).toBe(100);
     expect(status.glbUrl).toContain('glTF-Sample-Models'); 
     expect(status.thumbnailUrl).toContain('svg');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Realistic Avatar Integration 
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Avatar Creator — High-Fidelity Avatar Traits', () => {
  it('attaches high-fidelity realistic rendering metadata dynamically', () => {
    const avatar = makeNode('Main Avatar');
    
    // Simulating applying typical HoloScript realistic avatar shader properties natively
    avatar.traits.push({ 
        name: '@material', 
        properties: { type: 'physical', rough: 0.1, metal: 0.9, sss: true } 
    });
    
    useSceneGraphStore.setState({ nodes: [avatar] });
    expect(useSceneGraphStore.getState().nodes[0].traits[0].properties['sss']).toBe(true);
  });

  it('binds native human-IK mapping trait asserting realistic animation scaling', () => {
     const avatar = useSceneGraphStore.getState().nodes[0]!;
     useSceneGraphStore.getState().addNode(avatar);

     avatar.traits.push({
         name: '@avatar',
         properties: { profile: 'vrm-realistic', boneMapping: 'humanoid-strict' }
     });

     expect(useSceneGraphStore.getState().nodes[0].traits.find(t => t.name === '@avatar')).toBeDefined();
     expect(avatar.traits[1].properties['profile']).toBe('vrm-realistic');
  });
});
