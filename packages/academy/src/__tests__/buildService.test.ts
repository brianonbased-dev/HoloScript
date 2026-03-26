/**
 * BuildService Tests — Build pipeline and scene graph parser
 */

import { describe, it, expect } from 'vitest';
import {
  build,
  parseSceneGraph,
  getAllTargets,
  getTargetMeta,
  type BuildTarget,
} from '../lib/buildService';

// ─── parseSceneGraph ──────────────────────────────────────────────────────────

describe('parseSceneGraph', () => {
  it('extracts scene title', () => {
    const result = parseSceneGraph('scene "My World" {}');
    expect(result.metadata.title).toBe('My World');
  });

  it('extracts world title', () => {
    const result = parseSceneGraph('world "Galaxy" {}');
    expect(result.metadata.title).toBe('Galaxy');
  });

  it('extracts objects with traits', () => {
    const code = 'object Player { @mesh { geometry: "sphere" } @material { color: "red" } }';
    const result = parseSceneGraph(code);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].name).toBe('Player');
    expect(result.objects[0].traits).toHaveLength(2);
    expect(result.objects[0].traits[0].name).toBe('mesh');
    expect(result.objects[0].traits[0].props.geometry).toBe('sphere');
    expect(result.objects[0].traits[1].name).toBe('material');
    expect(result.objects[0].traits[1].props.color).toBe('red');
  });

  it('extracts numeric properties', () => {
    const code = 'object Light { @light { intensity: 2.5 } }';
    const result = parseSceneGraph(code);
    expect(result.objects[0].traits[0].props.intensity).toBe(2.5);
  });

  it('handles multiple objects', () => {
    const code = `
      object A { @mesh { geometry: "box" } }
      object B { @mesh { geometry: "sphere" } }
    `;
    const result = parseSceneGraph(code);
    expect(result.objects).toHaveLength(2);
    expect(result.objects[0].name).toBe('A');
    expect(result.objects[1].name).toBe('B');
  });

  it('returns empty for empty code', () => {
    const result = parseSceneGraph('');
    expect(result.objects).toHaveLength(0);
    expect(result.metadata.title).toBeUndefined();
  });
});

// ─── build() ──────────────────────────────────────────────────────────────────

describe('build()', () => {
  const testCode = `
    scene "TestScene" {}
    object Cube {
      @mesh { geometry: "box" }
      @material { color: "#6366f1" }
    }
    object Ball {
      @mesh { geometry: "sphere" }
      @material { color: "#34d399" }
    }
  `;

  it('builds to web target', () => {
    const result = build(testCode, { target: 'web' });
    expect(result.success).toBe(true);
    expect(result.target).toBe('web');
    expect(result.output).toContain('<!DOCTYPE html>');
    expect(result.output).toContain('three');
    expect(result.output).toContain('Cube');
    expect(result.output).toContain('Ball');
    expect(result.size).toBeGreaterThan(500);
    expect(result.buildTime).toBeGreaterThanOrEqual(0);
    expect(result.filename).toContain('.html');
  });

  it('builds to embed target', () => {
    const result = build(testCode, { target: 'embed' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('<iframe');
    expect(result.output).toContain('holoscript');
  });

  it('builds to pwa target', () => {
    const result = build(testCode, { target: 'pwa' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('manifest');
    expect(result.output).toContain('<!DOCTYPE html>');
  });

  it('builds to urdf target', () => {
    const result = build(testCode, { target: 'urdf' });
    expect(result.success).toBe(true);
    expect(result.output).toContain('<robot');
    expect(result.output).toContain('Cube');
    expect(result.output).toContain('<joint');
    expect(result.filename).toContain('.urdf');
  });

  it('builds to gltf target', () => {
    const result = build(testCode, { target: 'gltf' });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.asset.version).toBe('2.0');
    expect(parsed.asset.generator).toBe('HoloScript Studio');
    expect(parsed.nodes).toHaveLength(2);
  });

  it('builds to json target', () => {
    const result = build(testCode, { target: 'json', title: 'TestScene' });
    expect(result.success).toBe(true);
    const parsed = JSON.parse(result.output);
    expect(parsed.title).toBe('TestScene');
    expect(parsed.objects).toHaveLength(2);
  });

  it('warns when no objects in non-json build', () => {
    const result = build('scene "Empty" {}', { target: 'web' });
    expect(result.success).toBe(true);
    expect(result.warnings).toContain('No objects found in scene — output may be empty');
  });

  it('returns error on unknown target', () => {
    const result = build(testCode, { target: 'unknown' as BuildTarget });
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─── Metadata ─────────────────────────────────────────────────────────────────

describe('Target metadata', () => {
  it('getAllTargets returns 6 targets', () => {
    const targets = getAllTargets();
    expect(targets).toHaveLength(6);
    expect(targets.map((t) => t.id)).toEqual(['web', 'embed', 'pwa', 'urdf', 'gltf', 'json']);
  });

  it('getTargetMeta returns correct info', () => {
    const meta = getTargetMeta('web');
    expect(meta.ext).toBe('html');
    expect(meta.mime).toBe('text/html');
    expect(meta.label).toContain('Web');
  });

  it('urdf target has correct extension', () => {
    const meta = getTargetMeta('urdf');
    expect(meta.ext).toBe('urdf');
    expect(meta.mime).toBe('application/xml');
  });
});
