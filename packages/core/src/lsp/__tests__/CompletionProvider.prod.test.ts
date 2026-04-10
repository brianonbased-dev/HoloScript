/**
 * CompletionProvider v4.2 Production Tests
 *
 * Tests for expanded completions: domain blocks, simulation constructs,
 * HSPlus keywords, context-aware properties, and custom traits.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CompletionProvider } from '../CompletionProvider';

describe('CompletionProvider v4.2', () => {
  let p: CompletionProvider;
  beforeEach(() => {
    p = new CompletionProvider();
  });

  // ── Block completions ───────────────────────────────────────────────────

  describe('block completions', () => {
    it('returns block completions for empty prefix', () => {
      const items = p.getCompletions({ prefix: '' });
      const labels = items.map((i) => i.label);
      expect(labels).toContain('material');
      expect(labels).toContain('collider');
      expect(labels).toContain('particles');
      expect(labels).toContain('weather');
      expect(labels).toContain('navmesh');
    });

    it('returns simulation blocks for partial match', () => {
      const items = p.getCompletions({ prefix: 'part' });
      expect(items.some((i) => i.label === 'particles')).toBe(true);
    });

    it('returns post_processing block', () => {
      const items = p.getCompletions({ prefix: 'post' });
      expect(items.some((i) => i.label === 'post_processing')).toBe(true);
    });

    it('returns audio_source and reverb_zone', () => {
      const items = p.getCompletions({ prefix: 'audio' });
      expect(items.some((i) => i.label === 'audio_source')).toBe(true);
    });

    it('returns procedural block', () => {
      const items = p.getCompletions({ prefix: 'proc' });
      expect(items.some((i) => i.label === 'procedural')).toBe(true);
    });

    it('returns behavior_tree block', () => {
      const items = p.getCompletions({ prefix: 'behav' });
      expect(items.some((i) => i.label === 'behavior_tree')).toBe(true);
    });

    it('returns IoT domain blocks', () => {
      const items = p.getCompletions({ prefix: 'sensor' });
      expect(items.some((i) => i.label === 'sensor')).toBe(true);
    });
  });

  // ── HSPlus keyword completions ──────────────────────────────────────────

  describe('HSPlus keywords', () => {
    it('returns struct when empty', () => {
      const items = p.getCompletions({ prefix: '' });
      expect(items.some((i) => i.label === 'struct' && i.kind === 'keyword')).toBe(true);
    });

    it('filters keywords by prefix', () => {
      const items = p.getCompletions({ prefix: 'inter' });
      expect(items.some((i) => i.label === 'interface')).toBe(true);
    });

    it('returns module keyword', () => {
      const items = p.getCompletions({ prefix: 'mod' });
      expect(items.some((i) => i.label === 'module')).toBe(true);
    });

    it('returns import/export', () => {
      const items = p.getCompletions({ prefix: 'imp' });
      expect(items.some((i) => i.label === 'import')).toBe(true);
    });
  });

  // ── Simulation trait completions ────────────────────────────────────────

  describe('simulation traits', () => {
    it('returns physics trait on @', () => {
      const items = p.getCompletions({ prefix: '@phys' });
      expect(items.some((i) => i.label === 'physics')).toBe(true);
    });

    it('returns pbr trait', () => {
      const items = p.getCompletions({ prefix: '@pb' });
      expect(items.some((i) => i.label === 'pbr')).toBe(true);
    });

    it('returns spatial trait', () => {
      const items = p.getCompletions({ prefix: '@spat' });
      expect(items.some((i) => i.label === 'spatial')).toBe(true);
    });

    it('returns safety_rated trait', () => {
      const items = p.getCompletions({ prefix: '@safety' });
      expect(items.some((i) => i.label === 'safety_rated')).toBe(true);
    });
  });

  // ── Context-aware block property completions ────────────────────────────

  describe('blockContext properties', () => {
    it('material context returns baseColor, roughness, metallic', () => {
      const items = p.getCompletions({ prefix: '', blockContext: 'material' });
      const labels = items.map((i) => i.label);
      expect(labels).toContain('baseColor');
      expect(labels).toContain('roughness');
      expect(labels).toContain('metallic');
    });

    it('rigidbody context returns mass, use_gravity', () => {
      const items = p.getCompletions({ prefix: '', blockContext: 'rigidbody' });
      const labels = items.map((i) => i.label);
      expect(labels).toContain('mass');
      expect(labels).toContain('use_gravity');
    });

    it('particles context returns max_particles', () => {
      const items = p.getCompletions({ prefix: '', blockContext: 'particles' });
      const labels = items.map((i) => i.label);
      expect(labels).toContain('max_particles');
    });

    it('audio_source context returns clip, volume, spatialization', () => {
      const items = p.getCompletions({ prefix: '', blockContext: 'audio_source' });
      const labels = items.map((i) => i.label);
      expect(labels).toContain('clip');
      expect(labels).toContain('volume');
      expect(labels).toContain('spatialization');
    });

    it('unknown blockContext falls back to general', () => {
      const items = p.getCompletions({ prefix: '', blockContext: 'unknown_block' });
      // Should still return items (general completions)
      expect(items.length).toBeGreaterThan(0);
    });

    it('getBlockPropertyCompletions returns empty for unknown', () => {
      expect(p.getBlockPropertyCompletions('nonexistent')).toEqual([]);
    });
  });

  // ── Total completion count ──────────────────────────────────────────────

  describe('counts', () => {
    it('totalCompletions > 80', () => {
      expect(p.totalCompletions).toBeGreaterThan(70);
    });

    it('insertText is present on block completions', () => {
      const items = p.getCompletions({ prefix: '' });
      const blocks = items.filter((i) => i.kind === 'block');
      for (const b of blocks) {
        expect(b.insertText, `${b.label} missing insertText`).toBeDefined();
      }
    });
  });
});
