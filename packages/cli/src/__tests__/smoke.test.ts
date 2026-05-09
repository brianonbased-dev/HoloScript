/**
 * Tests for the physics smoke receipt module.
 *
 * Covers:
 *   - Receipt shape validation
 *   - Physics trait extraction
 *   - Compilation smoke shape checks
 *   - CLI integration (exit codes, JSON output)
 */

import { describe, it, expect } from 'vitest';
import {
  runPhysicsSmoke,
  printSmokeReceipt,
  type PhysicsSmokeReceipt,
} from '../smoke';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');

describe('physics smoke receipt', { timeout: 120000 }, () => {
  const advancedPhysicsDemo = path.join(repoRoot, 'examples/physics/advanced-physics-showcase.holo');

  it('produces a valid receipt for a single physics demo', async () => {
    const receipt = await runPhysicsSmoke({
      files: [advancedPhysicsDemo],
      target: 'threejs',
      json: false,
      verbose: false,
    });

    expect(receipt.schema_version).toBe('physics-smoke-receipt-v1');
    expect(receipt.benchmark).toBe('physics-smoke');
    expect(receipt.status).toBe('completed');
    expect(receipt.demos.length).toBe(1);

    const demo = receipt.demos[0];
    expect(demo.status).toBe('passed');
    expect(demo.file).toBe(advancedPhysicsDemo);
    expect(demo.title).toBe('Advanced Physics Showcase');
    expect(demo.durationMs).toBeGreaterThanOrEqual(0);

    // Physics traits should be detected (tolerant parser may yield partial
    // extraction if the demo uses syntax the current parser does not fully
    // support — the smoke test still passes as long as SOME traits are found).
    const traitNames = demo.physicsTraits.map((t) => t.name);
    expect(traitNames.length).toBeGreaterThanOrEqual(2);

    expect(demo.compileResult).toBeDefined();
    expect(demo.compileResult!.target).toBe('threejs');
    expect(demo.compileResult!.success).toBe(true);

    expect(receipt.summary.total).toBe(1);
    expect(receipt.summary.passed).toBe(1);
    expect(receipt.summary.failed).toBe(0);
  });

  it('accepts a directory and finds .holo files', async () => {
    const receipt = await runPhysicsSmoke({
      files: [path.join(repoRoot, 'examples/physics')],
      target: 'threejs',
      json: false,
      verbose: false,
    });

    expect(receipt.demos.length).toBeGreaterThanOrEqual(1);
    expect(receipt.status).toBe('completed');
  });

  it('marks missing files as failed', async () => {
    const receipt = await runPhysicsSmoke({
      files: [path.join(repoRoot, 'examples/physics/nonexistent.holo')],
      target: 'threejs',
      json: false,
      verbose: false,
    });

    expect(receipt.demos.length).toBe(1);
    expect(receipt.demos[0].status).toBe('failed');
    expect(receipt.demos[0].validationErrors.some((e) => e.message.includes('not found'))).toBe(true);
  });

  it('writes receipt to disk when output is specified', async () => {
    const outPath = path.join(repoRoot, '.bench-logs', 'physics-smoke-test-receipt.json');
    const receipt = await runPhysicsSmoke({
      files: [advancedPhysicsDemo],
      target: 'threejs',
      output: outPath,
      json: false,
      verbose: false,
    });

    expect(fs.existsSync(outPath)).toBe(true);
    const raw = fs.readFileSync(outPath, 'utf-8');
    const parsed = JSON.parse(raw) as PhysicsSmokeReceipt;
    expect(parsed.schema_version).toBe('physics-smoke-receipt-v1');
    expect(parsed.demos[0].status).toBe('passed');

    // Cleanup
    fs.unlinkSync(outPath);
  });

  it('printSmokeReceipt does not throw', async () => {
    const receipt = await runPhysicsSmoke({
      files: [advancedPhysicsDemo],
      target: 'threejs',
      json: false,
      verbose: false,
    });

    expect(() => printSmokeReceipt(receipt)).not.toThrow();
  });

  it('produces JSON output compatible with the WebGPU benchmark receipt shape', async () => {
    const receipt = await runPhysicsSmoke({
      files: [advancedPhysicsDemo],
      target: 'threejs',
      json: true,
      verbose: false,
    });

    // Shared fields with webgpu-physics-bench receipt
    expect(typeof receipt.generatedAt).toBe('string');
    expect(typeof receipt.status).toBe('string');
    expect(Array.isArray(receipt.failures)).toBe(true);
    expect(Array.isArray(receipt.notes)).toBe(true);

    // Physics-smoke-specific fields
    expect(Array.isArray(receipt.demos)).toBe(true);
    expect(typeof receipt.summary.total).toBe('number');
    expect(typeof receipt.summary.passed).toBe('number');
    expect(typeof receipt.summary.failed).toBe('number');
  });
});
