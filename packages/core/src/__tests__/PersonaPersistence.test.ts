import { describe, it, expect, vi, afterEach } from 'vitest';
import { PersonaLoader } from '../services/PersonaLoader';
import { NeuralState } from '../traits/NeuralForgeTrait';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Persona Persistence', () => {
  const TEST_DIR = './test_personas';
  const loader = new PersonaLoader(TEST_DIR);

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch (e) {}
  });

  it('should save and load a persona', async () => {
    const npcId = 'npc_test_save';
    const state: NeuralState = {
      shards: [
        {
          id: 's1',
          sourceId: npcId,
          timestamp: 12345,
          type: 'memory',
          data: { foo: 'bar' },
          weight: 1.0,
        },
      ],
      weights: { openness: 0.8 },
      experienceLog: ['log1'],
      lastSynthesis: 99999,
    };

    await loader.savePersona(npcId, state);

    const loaded = await loader.loadPersona(npcId);
    expect(loaded).toEqual(state);
  });

  it('should list saved personas', async () => {
    await loader.savePersona('p1', {} as any);
    await loader.savePersona('p2', {} as any);

    const list = await loader.listPersonas();
    expect(list).toContain('p1');
    expect(list).toContain('p2');
  });
});

