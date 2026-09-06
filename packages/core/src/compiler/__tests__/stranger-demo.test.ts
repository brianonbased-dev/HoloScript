/**
 * Stranger-demo gate: the public quickstart .holo must lower through the
 * real parser into two real backends, with trait and color evidence in the
 * emitted artifacts. This is not a synthetic AST snapshot. If a backend
 * starts dumping a template that forgot CyanOrb, @grabbable, or the cyan
 * material, this test fails.
 *
 * Targets: WebGPU (browser preview) and URDF (physical/robot export).
 *
 * Run: pnpm stranger-demo
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebGPUCompiler } from '../WebGPUCompiler';
import { URDFCompiler } from '../URDFCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..', '..', '..');
const SOURCE = join(repoRoot, 'examples', 'quickstart', '1-floating-cyan-orb.holo');
const TOKEN = 'stranger-demo-token';

describe('stranger demo: public orb → WebGPU + URDF', () => {
  const source = readFileSync(SOURCE, 'utf8');
  const parsed = new HoloCompositionParser().parse(source);

  it('parses the public quickstart file', () => {
    expect(parsed.success).toBe(true);
    expect(parsed.ast?.name).toBe('Floating Cyan Orb');
    const names = (parsed.ast?.objects ?? []).map((obj) => obj.name);
    expect(names).toEqual(expect.arrayContaining(['CyanOrb', 'Ground']));
  });

  it('WebGPU emit contains the orb, traits, and authored cyan', () => {
    expect(parsed.ast).toBeTruthy();
    const out = new WebGPUCompiler().compile(parsed.ast!, TOKEN);
    expect(out).toContain('navigator.gpu.requestAdapter()');
    expect(out).toContain('CyanOrb');
    expect(out).toContain('generateSphereVertices');
    expect(out).toContain('traits: ["grabbable","glowing"]');
    expect(out).toContain('traits: ["collidable"]');
    // #00ffff → parseColor → 0,1,1  (not the 0.8,0.8,0.8 default)
    expect(out).toMatch(/CyanOrbMat = createBuffer\(device, new Float32Array\(\[0,1,1,1\.0,/);
  });

  it('URDF emit contains the orb link, ground collision, and cyan material', () => {
    expect(parsed.ast).toBeTruthy();
    const out = new URDFCompiler({
      robotName: parsed.ast?.name || 'HoloScriptRobot',
      includeVisual: true,
      includeCollision: true,
      includeInertial: true,
      includeHoloExtensions: true,
    }).compile(parsed.ast!, TOKEN);
    expect(out).toContain('<?xml');
    expect(out).toContain('<robot');
    expect(out).toContain('cyanorb');
    expect(out).toContain('<link name="ground">');
    expect(out).toContain('Floating Cyan Orb');
    // Ground is @collidable → collision geometry must be present
    expect(out).toMatch(/<link name="ground">[\s\S]*<collision>/);
    // material.baseColor #00ffff must survive as a URDF color, not the gray default
    expect(out).toMatch(/0(?:\.0+)? 1(?:\.0+)? 1(?:\.0+)?/);
  });
});
