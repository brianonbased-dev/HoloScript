/**
 * DiagnosticProvider v4.2 Production Tests
 *
 * Tests for expanded diagnostic rules: HS004 (domain block required properties),
 * HS005 (material texture hints), and known simulation directives.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticProvider } from '../DiagnosticProvider';
import type { DiagnosticContext } from '../DiagnosticProvider';

function makeCtx(nodes: any[], knownTraits: string[] = []): DiagnosticContext {
  return { nodes, knownTraits: new Set(knownTraits) };
}

describe('DiagnosticProvider v4.2 — Simulation Rules', () => {
  let provider: DiagnosticProvider;
  beforeEach(() => { provider = new DiagnosticProvider(); });

  // ── HS004: Domain block required properties ─────────────────────────────

  describe('HS004: required properties', () => {
    it('warns when material block is missing baseColor', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'material',
        name: 'Steel',
        properties: { roughness: 0.5 },
        loc: { start: { line: 10, column: 0 }, end: { line: 15, column: 1 } },
      }]);
      const diags = provider.diagnose(ctx);
      expect(diags.some(d => d.code === 'HS004' && d.message.includes('baseColor'))).toBe(true);
    });

    it('no warning when material has baseColor', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'material',
        name: 'Steel',
        properties: { baseColor: '#ff0000', roughness: 0.5 },
      }]);
      const diags = provider.diagnose(ctx);
      expect(diags.some(d => d.code === 'HS004')).toBe(false);
    });

    it('warns when rigidbody is missing mass', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'rigidbody',
        name: 'body',
        properties: { use_gravity: true },
        loc: { start: { line: 5, column: 4 }, end: { line: 8, column: 1 } },
      }]);
      const diags = provider.diagnose(ctx);
      expect(diags.some(d => d.code === 'HS004' && d.message.includes('mass'))).toBe(true);
    });

    it('warns when audio_source is missing clip', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'audio_source',
        name: 'bgm',
        properties: { volume: 0.8 },
      }]);
      const diags = provider.diagnose(ctx);
      expect(diags.some(d => d.code === 'HS004' && d.message.includes('clip'))).toBe(true);
    });

    it('warns when navmesh is missing agent_radius and agent_height', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'navmesh',
        name: 'nav',
        properties: {},
      }]);
      const diags = provider.diagnose(ctx);
      const hs004 = diags.filter(d => d.code === 'HS004');
      expect(hs004.length).toBe(2);
      expect(hs004.some(d => d.message.includes('agent_radius'))).toBe(true);
      expect(hs004.some(d => d.message.includes('agent_height'))).toBe(true);
    });

    it('no warning for unknown block type', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'custom_thing',
        properties: {},
      }]);
      const diags = provider.diagnose(ctx);
      expect(diags.some(d => d.code === 'HS004')).toBe(false);
    });

    it('no HS004 for non-domain nodes', () => {
      const ctx = makeCtx([{
        type: 'mesh',
        keyword: 'material',
        properties: {},
      }]);
      expect(provider.diagnose(ctx).some(d => d.code === 'HS004')).toBe(false);
    });
  });

  // ── HS005: Material texture hint ────────────────────────────────────────

  describe('HS005: material texture hint', () => {
    it('hints when material has roughness but no texture maps', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'pbr_material',
        name: 'Floor',
        properties: { baseColor: '#ccc', roughness: 0.8 },
      }]);
      const diags = provider.diagnose(ctx);
      expect(diags.some(d => d.code === 'HS005')).toBe(true);
    });

    it('no hint when material has a texture map', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'pbr_material',
        name: 'Floor',
        properties: { baseColor: '#ccc', roughness: 0.8, albedo_map: 'floor.png' },
      }]);
      const diags = provider.diagnose(ctx);
      expect(diags.some(d => d.code === 'HS005')).toBe(false);
    });

    it('no hint when material has no roughness', () => {
      const ctx = makeCtx([{
        type: 'DomainBlock',
        keyword: 'material',
        name: 'Flat',
        properties: { baseColor: '#fff' },
      }]);
      expect(provider.diagnose(ctx).some(d => d.code === 'HS005')).toBe(false);
    });
  });

  // ── Simulation directives recognized ───────────────────────────────────

  describe('simulation directives not flagged', () => {
    const simDirectives = [
      'physics', 'collidable', 'networked', 'pbr', 'spatial', 'hrtf',
      'looping', 'dynamic', 'lod', 'obstacle_avoidance', 'safety_rated', 'telemetry',
    ];

    for (const dir of simDirectives) {
      it(`@${dir} is recognized as known directive`, () => {
        const ctx = makeCtx([{
          type: 'mesh',
          directives: [{ name: dir }],
        }]);
        const diags = provider.diagnose(ctx);
        expect(diags.some(d => d.code === 'HS001'), `@${dir} flagged as unknown`).toBe(false);
      });
    }
  });

  // ── Rule count ──────────────────────────────────────────────────────────

  it('has at least 5 built-in rules', () => {
    expect(provider.ruleCount).toBeGreaterThanOrEqual(5);
  });
});
