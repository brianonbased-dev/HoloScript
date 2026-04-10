/**
 * Tests for PersonaLoader Service
 *
 * Covers:
 * - Storage directory creation
 * - Save/load persona round-trip
 * - Load missing persona returns null
 * - List personas
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersonaLoader } from './PersonaLoader';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('PersonaLoader', () => {
  let loader: PersonaLoader;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `persona-test-${Date.now()}`);
    loader = new PersonaLoader(tempDir);
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {}
  });

  describe('ensureStorage', () => {
    it('creates storage directory', async () => {
      await loader.ensureStorage();
      const stat = await fs.stat(tempDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it('is idempotent', async () => {
      await loader.ensureStorage();
      await loader.ensureStorage(); // Should not throw
    });
  });

  describe('savePersona / loadPersona', () => {
    it('round-trips a persona', async () => {
      const state = { personality: 'brave', memory: ['fought dragon'], confidence: 0.8 };
      await loader.savePersona('npc-hero', state as any);
      const loaded = await loader.loadPersona('npc-hero');
      expect(loaded).toEqual(state);
    });

    it('returns null for nonexistent persona', async () => {
      const result = await loader.loadPersona('nonexistent-npc');
      expect(result).toBeNull();
    });
  });

  describe('listPersonas', () => {
    it('lists saved personas', async () => {
      await loader.savePersona('alice', { x: 1 } as any);
      await loader.savePersona('bob', { x: 2 } as any);
      const list = await loader.listPersonas();
      expect(list).toContain('alice');
      expect(list).toContain('bob');
    });

    it('returns empty for no personas', async () => {
      const list = await loader.listPersonas();
      expect(list).toEqual([]);
    });
  });
});
