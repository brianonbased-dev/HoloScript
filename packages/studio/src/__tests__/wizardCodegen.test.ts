/**
 * wizardCodegen.test.ts
 *
 * Unit tests for buildSceneCode in QuickStartWizard.tsx
 * This function is the core code-generation logic — pure, no React needed.
 */

import { describe, it, expect } from 'vitest';
import { buildSceneCode } from '@/components/wizard/QuickStartWizard';

// ── Output format ─────────────────────────────────────────────────────────────

describe('buildSceneCode — output format', () => {
  it('returns a non-empty string', () => {
    const code = buildSceneCode('medieval', ['entrance', 'boss'], ['merchant']);
    expect(typeof code).toBe('string');
    expect(code.trim().length).toBeGreaterThan(0);
  });

  it('starts with world declaration', () => {
    const code = buildSceneCode('medieval', [], []);
    expect(code.trim()).toMatch(/^world\s+"/);
  });

  it('closes with a closing brace', () => {
    const code = buildSceneCode('scifi', [], []);
    expect(code.trim()).toMatch(/\}$/);
  });

  it('includes @setting trait with the chosen setting', () => {
    const code = buildSceneCode('modern', [], []);
    expect(code).toContain('@setting("modern")');
  });

  it('includes @lighting trait', () => {
    const code = buildSceneCode('nature', [], []);
    expect(code).toContain('@lighting("ambient")');
  });

  it('includes @skybox with setting id', () => {
    const code = buildSceneCode('scifi', [], []);
    expect(code).toContain('@skybox("scifi")');
  });
});

// ── World name ────────────────────────────────────────────────────────────────

describe('buildSceneCode — world name', () => {
  it('uses "Medieval Fantasy World" for medieval setting', () => {
    const code = buildSceneCode('medieval', [], []);
    expect(code).toContain('Medieval Fantasy World');
  });

  it('uses "Sci-Fi Space World" for scifi setting', () => {
    const code = buildSceneCode('scifi', [], []);
    expect(code).toContain('Sci-Fi Space World');
  });

  it('uses "Modern City World" for modern setting', () => {
    const code = buildSceneCode('modern', [], []);
    expect(code).toContain('Modern City World');
  });

  it('uses "Nature / Wilderness World" for nature setting', () => {
    const code = buildSceneCode('nature', [], []);
    expect(code).toContain('Nature / Wilderness World');
  });
});

// ── Rooms ─────────────────────────────────────────────────────────────────────

describe('buildSceneCode — rooms', () => {
  it('includes object blocks for each selected room', () => {
    const code = buildSceneCode('medieval', ['entrance', 'boss'], []);
    expect(code).toContain('object "Entrance Hall"');
    expect(code).toContain('object "Boss Fight Arena"');
  });

  it('includes @room trait on room objects', () => {
    const code = buildSceneCode('medieval', ['entrance'], []);
    expect(code).toContain('@room');
  });

  it('includes @position trait on room objects', () => {
    const code = buildSceneCode('medieval', ['entrance'], []);
    expect(code).toContain('@position(');
  });

  it('only includes rooms for the selected setting', () => {
    // 'hangar' is a scifi room, not medieval
    const code = buildSceneCode('medieval', ['hangar'], []);
    expect(code).not.toContain('Docking Hangar');
  });

  it('handles empty rooms array', () => {
    const code = buildSceneCode('scifi', [], []);
    expect(code).not.toContain('object "');
  });

  it('includes all selected rooms for scifi', () => {
    const code = buildSceneCode('scifi', ['hangar', 'bridge', 'lab'], []);
    expect(code).toContain('Docking Hangar');
    expect(code).toContain('Command Bridge');
    expect(code).toContain('Research Lab');
  });

  it('includes all selected rooms for modern', () => {
    const code = buildSceneCode('modern', ['lobby', 'cafe', 'gym'], []);
    expect(code).toContain('Lobby');
    expect(code).toContain('Rooftop Café');
    expect(code).toContain('Gym');
  });

  it('includes all selected rooms for nature', () => {
    const code = buildSceneCode('nature', ['glade', 'waterfall'], []);
    expect(code).toContain('Forest Clearing');
    expect(code).toContain('Waterfall');
  });
});

// ── NPCs ──────────────────────────────────────────────────────────────────────

describe('buildSceneCode — NPCs', () => {
  it('includes npc blocks for each selected NPC', () => {
    const code = buildSceneCode('medieval', [], ['merchant', 'enemy']);
    expect(code).toContain('npc "Merchant"');
    expect(code).toContain('npc "Enemy"');
  });

  it('includes @role trait on npc blocks', () => {
    const code = buildSceneCode('scifi', [], ['merchant']);
    expect(code).toContain('@role("Friendly")');
  });

  it('marks enemy as Hostile', () => {
    const code = buildSceneCode('scifi', [], ['enemy']);
    expect(code).toContain('@role("Hostile")');
  });

  it('marks guard as Neutral', () => {
    const code = buildSceneCode('modern', [], ['guard']);
    expect(code).toContain('@role("Neutral")');
  });

  it('includes @position on npc blocks', () => {
    const code = buildSceneCode('nature', [], ['companion']);
    expect(code).toContain('@position(');
  });

  it('handles empty NPC selection', () => {
    const code = buildSceneCode('medieval', ['entrance'], []);
    expect(code).not.toContain('npc "');
  });

  it('includes boss NPC when selected', () => {
    const code = buildSceneCode('scifi', [], ['boss']);
    expect(code).toContain('npc "Boss"');
    expect(code).toContain('@role("Hostile")');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('buildSceneCode — edge cases', () => {
  it('handles all rooms and NPCs simultaneously', () => {
    const allRooms = ['entrance', 'treasure', 'boss', 'puzzle', 'trap', 'secret'];
    const allNpcs = ['merchant', 'guard', 'enemy', 'companion', 'questgiver', 'boss'];
    const code = buildSceneCode('medieval', allRooms, allNpcs);
    expect(code.length).toBeGreaterThan(500);
    expect(code).toContain('@room');
    expect(code).toContain('npc "Merchant"');
  });

  it('produces valid output for all 4 settings with no rooms or npcs', () => {
    for (const setting of ['medieval', 'scifi', 'modern', 'nature']) {
      const code = buildSceneCode(setting, [], []);
      expect(code.trim()).toMatch(/^world\s+"/);
      expect(code.trim()).toMatch(/\}$/);
    }
  });
});
