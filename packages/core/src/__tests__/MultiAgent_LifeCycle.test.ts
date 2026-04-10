import { describe, it, expect, vi, afterEach } from 'vitest';
import { neuralForgeHandler } from '../traits/NeuralForgeTrait';
import { PersonaLoader } from '../services/PersonaLoader';
import * as fs from 'fs/promises';

describe('Multi-Agent Life Cycle', () => {
  const TEST_DIR = './lifecycle_test';
  const loader = new PersonaLoader(TEST_DIR);

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {}
  });

  it('should evolve, persist, and reincarnate', async () => {
    // 1. Spawn "Adam"
    const adamNode = { id: 'adam', properties: {} };
    const context = { emit: vi.fn() } as any;
    const config = { ...neuralForgeHandler.defaultConfig, synthesis_threshold: 1 };

    neuralForgeHandler.onAttach!(adamNode as any, config, context);

    // 2. Adam Learns (Trigger Auto-Synthesis)
    neuralForgeHandler.onEvent!(adamNode as any, config, context, {
      type: 'npc_ai_response',
      text: 'I think therefore I am',
    });

    // Verify Adam has evolved
    const state = (adamNode as any).__neuralState;
    expect(state.shards.length).toBe(1);
    const originalWeights = { ...state.weights };

    // 3. Adam Persists
    await loader.savePersona('adam', state);

    // 4. Adam Despawns
    neuralForgeHandler.onDetach!(adamNode as any, config, context);
    delete (adamNode as any).__neuralState;

    // 5. "Adam Reborn" (New Node, Same Soul)
    const rebornNode = { id: 'adam', properties: {} };

    // Hydrate from disk
    const savedSoul = await loader.loadPersona('adam');
    expect(savedSoul).not.toBeNull();

    // Manual hydration simulation (Trait would usually handle this via config, but we mock strictly)
    (rebornNode as any).__neuralState = savedSoul;

    // Verify Reincarnation Memory
    expect((rebornNode as any).__neuralState.shards.length).toBe(1);
    expect((rebornNode as any).__neuralState.weights).toEqual(originalWeights);
  });
});

