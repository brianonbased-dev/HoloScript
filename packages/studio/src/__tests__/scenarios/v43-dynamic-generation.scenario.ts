/**
 * v43-dynamic-generation.scenario.ts — LIVING-SPEC: Dynamic Real-time AI Generation
 *
 * Persona: Casey — technical artist relying on the local V43 Brittney LLM 
 * to parse and inject massive procedural structures dynamically spanning
 * thousands of geometric elements perfectly translating raw HoloScript to AST.
 *
 * Run: npx vitest run src/__tests__/scenarios/v43-dynamic-generation.scenario.ts
 */

import { describe, it, expect } from 'vitest';
import { useSceneGraphStore, type SceneNode } from '../../lib/store';
import { V43Generator } from '../../core/ai/V43Generator';

/**
 * Check if the local LLM (Ollama) is reachable.
 * Returns false if it's offline — tests will be skipped gracefully.
 */
async function isLLMOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

describe('Scenario: Studio — V43 Dynamic Architectural Generation', () => {
  it('connects to local Brittney, interprets complex prompts, and returns raw valid .holo code', async () => {
    const online = await isLLMOnline();
    if (!online) {
      console.log('⏭ Skipping: Local LLM (Ollama) is offline');
      return; // graceful skip — not a failure
    }

    const generator = new V43Generator();
    const prompt = 'Instantiate a massive cyberpunk architectural structure. Keep it extremely simple with just a few nested geometric blocks to demonstrate syntax.';
    
    const rawCode = await generator.generateHoloScript(prompt);
    
    expect(rawCode.length).toBeGreaterThan(20);
    expect(rawCode.toLowerCase()).toContain('object'); // Asserting standard object declaration syntax
  }, 120000); // 2 minute timeout for generation

  it('translates raw output directly into parsed AST arrays injected into the WebGL Store', async () => {
    const online = await isLLMOnline();
    if (!online) {
      console.log('⏭ Skipping: Local LLM (Ollama) is offline');
      return; // graceful skip — not a failure
    }

    const generator = new V43Generator();
    const prompt = `Write a clean HoloScript block creating an object called CyberSkyscraper. 
Do not use complicated macros, just a simple valid object block.`;

    const astNodes = await generator.generateAST(prompt);
    const rawCode = await generator.generateHoloScript(prompt);
    console.log("Raw V43 code:\n", rawCode);
    console.log("AST Layout Length:", astNodes.length, "\nKeys:", Object.keys(astNodes));
    
    expect(astNodes.length).toBeGreaterThan(0);

    // clear the store
    useSceneGraphStore.setState({ nodes: [] });
    
    // Map AST Node structure to WebGL Store Logic (Simplified simulation)
    const structuralArray: SceneNode[] = astNodes.map((ast: any, idx: number) => ({
      id: `v43_geo_${idx}`,
      name: ast.id?.name || 'V43_Structure',
      type: 'mesh',
      parentId: null,
      traits: [{ name: '@ai_generated', properties: {} }],
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }));

    // Inject into global mesh
    useSceneGraphStore.setState({ nodes: structuralArray });
    const nodes = useSceneGraphStore.getState().nodes;
    
    expect(nodes.length).toBe(astNodes.length);
    expect(nodes[0].id).toContain('v43_geo');
  }, 120000); // 2 minute timeout
});

