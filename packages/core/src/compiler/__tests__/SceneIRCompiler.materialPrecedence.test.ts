/**
 * What the author wrote about an object's look reaches the web 3D viewers.
 *
 * The quickstart programs (examples/quickstart/*.holo) rendered with no color and
 * with roughness forced to 0.5: inline `baseColor`/`metallic` were passed through
 * under names three.js does not read, and the trait look (@collidable, @grabbable,
 * @clickable ...) was spread after the authored values, so it won. A named preset's
 * color also beat an explicit `color`. These tests compile the real quickstart file
 * through the real parser, so a regression shows up as the scene a newcomer sees.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SceneIRCompiler } from '../SceneIRCompiler';
import { parseHolo } from '../../parser/HoloCompositionParser';
import type { R3FNode } from '../SceneIRCompiler';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// packages/core/src/compiler/__tests__ → repo root (5 levels up)
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

function compile(source: string): R3FNode {
  const parsed = parseHolo(source);
  expect(parsed.errors ?? []).toEqual([]);
  return new SceneIRCompiler().compileComposition(parsed.ast!);
}

function find(node: R3FNode, id: string): R3FNode {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.id === id) return n;
    stack.push(...(n.children ?? []));
  }
  throw new Error(`no node "${id}"`);
}

const mat = (node: R3FNode) => node.props.materialProps as Record<string, unknown>;

describe('SceneIRCompiler material precedence', () => {
  describe('examples/quickstart/2-red-cube-teal-button.holo', () => {
    const scene = compile(
      readFileSync(join(repoRoot, 'examples', 'quickstart', '2-red-cube-teal-button.holo'), 'utf8')
    );

    it('inline glTF names become the three.js names the renderer reads', () => {
      expect(mat(find(scene, 'Ground'))).toMatchObject({ color: '#2d3436', metalness: 0.05 });
      expect(mat(find(scene, 'RedCube'))).toMatchObject({ color: '#ff6b6b', metalness: 0.15 });
      expect(mat(find(scene, 'TealButton'))).toMatchObject({
        color: '#4ecdc4',
        metalness: 0.3,
        emissive: '#2a9d8f',
        emissiveIntensity: 0.3,
      });
      for (const id of ['Ground', 'RedCube', 'TealButton']) {
        expect(mat(find(scene, id))).not.toHaveProperty('baseColor');
        expect(mat(find(scene, id))).not.toHaveProperty('metallic');
      }
    });

    it('authored roughness survives the trait look (@collidable, @grabbable, @clickable)', () => {
      expect(mat(find(scene, 'Ground')).roughness).toBe(0.85);
      expect(mat(find(scene, 'RedCube')).roughness).toBe(0.45);
      expect(mat(find(scene, 'TealButton')).roughness).toBe(0.3);
    });
  });

  it('top-level roughness/metallic/color beat the trait look', () => {
    const scene = compile(`composition "S" {
  object "Rock" {
    @collidable
    @grabbable
    geometry: "sphere"
    color: "#8a8378"
    roughness: 0.75
    metallic: 0.0
  }
}`);
    const rock = find(scene, 'Rock');
    expect(rock.props.color).toBe('#8a8378');
    expect(mat(rock).roughness).toBe(0.75);
    expect(mat(rock).metalness).toBe(0);
    expect(mat(rock).color === undefined || mat(rock).color === '#8a8378').toBe(true);
  });

  it('control: a trait still sets the look where the author wrote nothing', () => {
    const scene = compile(`composition "S" {
  object "Plain" {
    @grabbable
    geometry: "cube"
  }
}`);
    const m = mat(find(scene, 'Plain'));
    expect(m.roughness).toBeTypeOf('number');
    expect(m.emissive).toBeDefined();
  });

  it('an explicit color beats the color a named preset brings in', () => {
    const scene = compile(`composition "S" {
  object "Boulder" {
    geometry: "sphere"
    material: "stone"
    color: "#8a8378"
  }
}`);
    const boulder = find(scene, 'Boulder');
    expect(boulder.props.color).toBe('#8a8378');
    expect(mat(boulder).color).toBeUndefined();
    expect(mat(boulder).roughness).toBe(0.85);
  });

  it('a preset color stays when the author wrote no color', () => {
    const scene = compile(`composition "S" {
  object "Boulder" {
    geometry: "sphere"
    material: "stone"
  }
}`);
    expect(mat(find(scene, 'Boulder')).color).toBe('#808080');
  });

  it('a three.js name written directly wins over its glTF alias', () => {
    const scene = compile(`composition "S" {
  object "Both" {
    geometry: "cube"
    material: { baseColor: "#111111", color: "#222222", metallic: 0.9, metalness: 0.1 }
  }
}`);
    expect(mat(find(scene, 'Both'))).toMatchObject({ color: '#222222', metalness: 0.1 });
  });
});
