import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NPCPlayerMemory } from './player-memory.js';
import { generateDialogue } from './generate-dialogue.js';

describe('NPCPlayerMemory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'hololand-npc-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('remembers a fact and recalls it', () => {
    const mem = new NPCPlayerMemory('guard-01', tmpDir);
    mem.remember('player-42', 'My favorite color is blue');
    const facts = mem.recall('player-42');
    expect(facts).toContain('My favorite color is blue');
  });

  it('survives a full NPC reload (fresh process / new handle)', () => {
    const npcId = 'merchant-01';
    const playerId = 'player-99';

    // First session: player tells the NPC a fact
    const mem1 = new NPCPlayerMemory(npcId, tmpDir);
    mem1.remember(playerId, 'I am searching for the lost amulet');

    // Simulate reload: brand new memory handle, same NPC + player
    const mem2 = new NPCPlayerMemory(npcId, tmpDir);
    const facts = mem2.recall(playerId);
    expect(facts).toContain('I am searching for the lost amulet');
  });

  it('generates dialogue that references a persisted fact after reload', () => {
    const npcId = 'wizard-01';
    const playerId = 'player-77';

    // Session 1: fact is shared
    const mem1 = new NPCPlayerMemory(npcId, tmpDir);
    mem1.remember(playerId, 'My sister lives in the east tower');

    // Session 2: fresh handle, generate dialogue on a related prompt
    const mem2 = new NPCPlayerMemory(npcId, tmpDir);
    const response = generateDialogue({
      npcId,
      playerId,
      prompt: 'Tell me about your journey',
      memory: mem2,
    });

    // The response must reference the persisted fact
    expect(response).toContain('My sister lives in the east tower');
  });

  it('fails if memory is lost on reload', () => {
    const npcId = 'thief-01';
    const playerId = 'player-88';

    // Only one session: no explicit save, but remember auto-saves
    const mem = new NPCPlayerMemory(npcId, tmpDir);
    mem.remember(playerId, 'The password is swordfish');

    // Reload
    const reloaded = new NPCPlayerMemory(npcId, tmpDir);
    const facts = reloaded.recall(playerId);

    // This assertion guards the core invariant: memory must NOT be empty after reload
    expect(facts.length).toBeGreaterThan(0);
    expect(facts).toContain('The password is swordfish');
  });

  it('accumulates multiple facts for the same player', () => {
    const mem = new NPCPlayerMemory('bard-01', tmpDir);
    mem.remember('player-01', 'I play the lute');
    mem.remember('player-01', 'I dislike crowds');

    const facts = mem.recall('player-01');
    expect(facts).toHaveLength(2);
    expect(facts).toContain('I play the lute');
    expect(facts).toContain('I dislike crowds');
  });

  it('isolates facts per player', () => {
    const mem = new NPCPlayerMemory('blacksmith-01', tmpDir);
    mem.remember('alice', 'I need a new sword');
    mem.remember('bob', 'I need a shield');

    expect(mem.recall('alice')).toEqual(['I need a new sword']);
    expect(mem.recall('bob')).toEqual(['I need a shield']);
  });
});
