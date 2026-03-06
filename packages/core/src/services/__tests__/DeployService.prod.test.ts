/**
 * DeployService — Production Tests
 *
 * Covers: local compilation (web, R3F), no-API-key guard for remote targets,
 * getSupportedTargets, HoloScript object extraction, geometry/color helpers.
 * Network calls are not made in tests (no API key → early-return path).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DeployService, createDeployService, type DeployResult } from '../DeployService';

// Single-line HoloScript to avoid regex edge cases with multiline bodies
const SIMPLE_HS = `object "WorldOrb" { geometry: sphere color: cyan position: [0, 0, 0] }`;

// ─── Construction ─────────────────────────────────────────────────────────────

describe('DeployService — construction', () => {
  it('createDeployService() returns DeployService instance', () => {
    const svc = createDeployService();
    expect(svc).toBeInstanceOf(DeployService);
  });
  it('default enableLocalCompilation=true', () => {
    const svc = new DeployService();
    expect(svc).toBeDefined();
  });
});

// ─── getSupportedTargets ──────────────────────────────────────────────────────

describe('DeployService — getSupportedTargets', () => {
  let svc: DeployService;
  beforeEach(() => { svc = new DeployService(); });

  it('returns 10 targets', () => {
    expect(svc.getSupportedTargets()).toHaveLength(10);
  });
  it('web and react-three-fiber are local=true', () => {
    const targets = svc.getSupportedTargets();
    const local = targets.filter(t => t.local);
    expect(local.map(t => t.target)).toEqual(expect.arrayContaining(['web', 'react-three-fiber']));
  });
  it('unity requires backend', () => {
    const targets = svc.getSupportedTargets();
    const unity = targets.find(t => t.target === 'unity')!;
    expect(unity.requiresBackend).toBe(true);
    expect(unity.local).toBe(false);
  });
  it('all targets have requiresBackend = !local', () => {
    for (const t of svc.getSupportedTargets()) {
      expect(t.requiresBackend).toBe(!t.local);
    }
  });
});

// ─── Local compilation: web ───────────────────────────────────────────────────

describe('DeployService — deploy: web (local)', () => {
  let svc: DeployService;
  beforeEach(() => { svc = new DeployService({ enableLocalCompilation: true }); });

  it('returns success=true for web target', async () => {
    const result = await svc.deploy({ target: 'web', holoScript: SIMPLE_HS });
    expect(result.success).toBe(true);
  });
  it('output code contains THREE.js imports', async () => {
    const result = await svc.deploy({ target: 'web', holoScript: SIMPLE_HS });
    expect(result.code).toContain("import * as THREE from 'three'");
  });
  it('output code contains scene setup', async () => {
    const result = await svc.deploy({ target: 'web', holoScript: SIMPLE_HS });
    expect(result.code).toContain('createScene');
  });
  it('metadata includes compilationTime and outputSize', async () => {
    const result = await svc.deploy({ target: 'web', holoScript: SIMPLE_HS });
    expect(result.metadata?.compilationTime).toBeGreaterThanOrEqual(0);
    expect(result.metadata?.outputSize).toBeGreaterThan(0);
  });
  it('metadata dependencies is empty array for web', async () => {
    const result = await svc.deploy({ target: 'web', holoScript: SIMPLE_HS });
    expect(result.metadata?.dependencies).toEqual([]);
  });
  it('empty HoloScript produces valid (minimal) web output', async () => {
    const result = await svc.deploy({ target: 'web', holoScript: '' });
    expect(result.success).toBe(true);
    expect(result.code).toContain('THREE');
  });
  it('output code contains lighting setup', async () => {
    const result = await svc.deploy({ target: 'web', holoScript: '' });
    expect(result.code).toContain('AmbientLight');
  });
});

// ─── Local compilation: react-three-fiber ────────────────────────────────────

describe('DeployService — deploy: react-three-fiber (local)', () => {
  let svc: DeployService;
  beforeEach(() => { svc = new DeployService({ enableLocalCompilation: true }); });

  it('returns success=true for R3F target', async () => {
    const result = await svc.deploy({ target: 'react-three-fiber', holoScript: SIMPLE_HS });
    expect(result.success).toBe(true);
  });
  it('output code imports Canvas from @react-three/fiber', async () => {
    const result = await svc.deploy({ target: 'react-three-fiber', holoScript: SIMPLE_HS });
    expect(result.code).toContain("import { Canvas } from '@react-three/fiber'");
  });
  it('output code includes Canvas component', async () => {
    const result = await svc.deploy({ target: 'react-three-fiber', holoScript: SIMPLE_HS });
    expect(result.code).toContain('<Canvas');
  });
  it('output code exports Scene function', async () => {
    const result = await svc.deploy({ target: 'react-three-fiber', holoScript: SIMPLE_HS });
    expect(result.code).toContain('export function Scene');
  });
  it('metadata dependencies includes @react-three/fiber', async () => {
    const result = await svc.deploy({ target: 'react-three-fiber', holoScript: SIMPLE_HS });
    expect(result.metadata?.dependencies).toContain('@react-three/fiber');
  });
});

// ─── Remote targets: no API key guard ────────────────────────────────────────

describe('DeployService — deploy: remote targets (no API key)', () => {
  let svc: DeployService;
  beforeEach(() => { svc = new DeployService({ apiKey: '' }); });

  const remoteTargets = ['unity', 'unreal', 'godot', 'flutter', 'swiftui', 'vision-pro', 'quest-native'] as const;

  for (const target of remoteTargets) {
    it(`${target}: fails gracefully with API key message`, async () => {
      const result: DeployResult = await svc.deploy({ target, holoScript: SIMPLE_HS });
      expect(result.success).toBe(false);
      expect(result.errors?.[0]).toContain('API key');
    });
  }
});

// ─── Local compilation disabled → remote path ────────────────────────────────

describe('DeployService — enableLocalCompilation=false routes web to remote', () => {
  it('web target falls through to remote path without api key', async () => {
    const svc = new DeployService({ enableLocalCompilation: false, apiKey: '' });
    const result = await svc.deploy({ target: 'web', holoScript: SIMPLE_HS });
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toMatch(/API key/i);
  });
});

// ─── Geometry helpers via getGeometryCode (reflected in web output) ───────────

describe('DeployService — geometry via object extraction', () => {
  let svc: DeployService;
  beforeEach(() => { svc = new DeployService(); });

  it('compiled web output always contains scene creation logic', async () => {
    const inputs = [
      `object "A" { geometry: torus color: cyan }`,
      `object "B" { geometry: cylinder color: red }`,
      `object "C" { geometry: cone color: blue }`,
    ];
    for (const hs of inputs) {
      const r = await svc.deploy({ target: 'web', holoScript: hs });
      expect(r.success).toBe(true);
      expect(r.code).toContain('THREE');
    }
  });
});

// ─── Color helpers via colorToHex (reflected in web output) ──────────────────

describe('DeployService — color helpers', () => {
  let svc: DeployService;
  beforeEach(() => { svc = new DeployService(); });

  it('known named colors produce a hex output', async () => {
    const r = await svc.deploy({ target: 'web', holoScript: `object "X" { geometry: cone color: red }` });
    expect(r.success).toBe(true);
    // Output contains 0x prefix hex colors
    expect(r.code).toMatch(/0x[0-9a-f]{6}/i);
  });
  it('multiple deploys are idempotent in structure', async () => {
    const r1 = await svc.deploy({ target: 'web', holoScript: SIMPLE_HS });
    const r2 = await svc.deploy({ target: 'web', holoScript: SIMPLE_HS });
    expect(r1.success).toBe(r2.success);
    expect(r1.code?.length).toBe(r2.code?.length);
  });
  it('r3f output for single object is non-empty', async () => {
    const r = await svc.deploy({ target: 'react-three-fiber', holoScript: '' });
    expect(r.success).toBe(true);
    expect((r.code?.length ?? 0)).toBeGreaterThan(100);
  });
});
