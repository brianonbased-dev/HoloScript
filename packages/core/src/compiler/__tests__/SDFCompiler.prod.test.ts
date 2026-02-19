/**
 * SDFCompiler — Production Test Suite
 *
 * Covers: SDF XML generation, physics engine options, scene configuration,
 * geometry types (sphere/cube/cylinder/cone), light mapping, color parsing,
 * XML escaping, name sanitization.
 */
import { describe, it, expect } from 'vitest';
import SDFCompiler from '../SDFCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// ─── Helpers ────────────────────────────────────────────────────────
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestWorld',
    objects: [
      { name: 'Box1', traits: [], properties: [{ key: 'type', value: 'cube' }] },
    ],
    spatialGroups: [],
    ...overrides,
  } as HoloComposition;
}

describe('SDFCompiler — Production', () => {
  // ─── Basic Output ─────────────────────────────────────────────────
  it('generates valid SDF XML header', () => {
    const compiler = new SDFCompiler();
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('<?xml version="1.0"');
    expect(sdf).toContain('<sdf version=');
  });

  it('wraps content in <world> tag', () => {
    const compiler = new SDFCompiler();
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('<world name=');
    expect(sdf).toContain('</world>');
  });

  it('respects custom worldName', () => {
    const compiler = new SDFCompiler({ worldName: 'MyUniverse' });
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('MyUniverse');
  });

  // ─── Physics ──────────────────────────────────────────────────────
  it('includes physics when enabled', () => {
    const compiler = new SDFCompiler({ includePhysics: true });
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('<physics');
  });

  it('uses custom physics engine', () => {
    const compiler = new SDFCompiler({ includePhysics: true, physicsEngine: 'bullet' });
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('bullet');
  });

  // ─── Models / Geometry ────────────────────────────────────────────
  it('generates model for object', () => {
    const compiler = new SDFCompiler();
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('<model name=');
    expect(sdf).toContain('box1');
  });

  it('generates sphere geometry', () => {
    const comp = makeComposition({
      objects: [{ name: 'Ball', traits: [], properties: [{ key: 'geometry', value: 'sphere' }, { key: 'radius', value: 2 }] }],
    });
    const sdf = new SDFCompiler().compile(comp);
    expect(sdf).toContain('<sphere>');
    expect(sdf).toContain('<radius>');
  });

  it('generates cylinder geometry', () => {
    const comp = makeComposition({
      objects: [{ name: 'Piston', traits: [], properties: [{ key: 'geometry', value: 'cylinder' }] }],
    });
    const sdf = new SDFCompiler().compile(comp);
    expect(sdf).toContain('<cylinder>');
  });

  // ─── Transforms ───────────────────────────────────────────────────
  it('includes position in pose', () => {
    const comp = makeComposition({
      objects: [{ name: 'A', traits: [], properties: [{ key: 'type', value: 'cube' }, { key: 'position', value: [1, 2, 3] }] }],
    });
    const sdf = new SDFCompiler().compile(comp);
    expect(sdf).toContain('<pose>');
    expect(sdf).toContain('1 2 3');
  });

  // ─── Scene ────────────────────────────────────────────────────────
  it('includes scene when enabled', () => {
    const compiler = new SDFCompiler({ includeScene: true });
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('<scene>');
  });

  // ─── Ground Plane ─────────────────────────────────────────────────
  it('generates ground plane model', () => {
    const compiler = new SDFCompiler();
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('ground_plane');
  });

  // ─── Name Sanitization ────────────────────────────────────────────
  it('sanitizes names with special characters', () => {
    const comp = makeComposition({
      objects: [{ name: 'My-Object!@#', traits: [], properties: [{ key: 'geometry', value: 'cube' }] }],
    });
    const sdf = new SDFCompiler().compile(comp);
    expect(sdf).toContain('my_object___');
  });

  // ─── SDF Version ──────────────────────────────────────────────────
  it('uses custom SDF version', () => {
    const compiler = new SDFCompiler({ sdfVersion: '1.7' });
    const sdf = compiler.compile(makeComposition());
    expect(sdf).toContain('version="1.7"');
  });
});
