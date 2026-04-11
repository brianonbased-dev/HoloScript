/**
 * HoloScript → Three.js Scene Builder
 *
 * Converts a parsed HoloComposition AST into a live Three.js scene.
 * Supports hot-reload (incremental updates without full scene rebuild).
 */

export interface SceneNode {
  id: string;
  type: 'orb' | 'template' | 'environment';
  name: string;
  properties: Record<string, unknown>;
  traits: string[];
}

export interface SceneOrb {
  id: string;
  name: string;
  color: string;
  scale: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number];
  opacity: number;
  castShadow: boolean;
}

/** Parse a color string to { r, g, b } 0-1 range */
function _parseColor(color: unknown): { r: number; g: number; b: number } {
  if (typeof color !== 'string') return { r: 1, g: 1, b: 1 };

  const named: Record<string, [number, number, number]> = {
    red: [1, 0, 0],
    blue: [0, 0, 1],
    green: [0, 0.5, 0],
    white: [1, 1, 1],
    black: [0, 0, 0],
    yellow: [1, 1, 0],
    orange: [1, 0.65, 0],
    purple: [0.5, 0, 0.5],
    cyan: [0, 1, 1],
    magenta: [1, 0, 1],
    gold: [1, 0.84, 0],
    gray: [0.5, 0.5, 0.5],
    brown: [0.55, 0.27, 0.07],
  };

  if (named[color]) {
    const [r, g, b] = named[color];
    return { r, g, b };
  }

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    const n = parseInt(hex.padEnd(6, '0').slice(0, 6), 16);
    return {
      r: ((n >> 16) & 255) / 255,
      g: ((n >> 8) & 255) / 255,
      b: (n & 255) / 255,
    };
  }

  return { r: 1, g: 1, b: 1 };
}

function coerceVec3(val: unknown, def: [number, number, number]): [number, number, number] {
  if (typeof val === 'number') return [val, val, val];
  if (Array.isArray(val) && val.length >= 3) return [+val[0], +val[1], +val[2]];
  return def;
}

/** Convert a parsed SceneNode into a renderable SceneOrb descriptor */
export function nodeToOrb(node: SceneNode): SceneOrb {
  const p = node.properties;
  return {
    id: node.id,
    name: node.name,
    color: typeof p.color === 'string' ? p.color : '#ffffff',
    scale: coerceVec3(p.scale, [1, 1, 1]),
    position: coerceVec3(p.position, [0, 0, 0]),
    rotation: coerceVec3(p.rotation, [0, 0, 0]),
    opacity: typeof p.opacity === 'number' ? p.opacity : 1,
    castShadow: p.castShadow !== false,
  };
}

/** Diff two SceneOrb arrays and return changed IDs */
export function diffOrbs(
  prev: SceneOrb[],
  next: SceneOrb[]
): { added: SceneOrb[]; removed: string[]; changed: SceneOrb[] } {
  const prevMap = new Map(prev.map((o) => [o.id, o]));
  const nextMap = new Map(next.map((o) => [o.id, o]));

  const added: SceneOrb[] = [];
  const changed: SceneOrb[] = [];
  const removed: string[] = [];

  for (const [id, orb] of nextMap) {
    if (!prevMap.has(id)) {
      added.push(orb);
    } else {
      const old = prevMap.get(id)!;
      if (JSON.stringify(old) !== JSON.stringify(orb)) {
        changed.push(orb);
      }
    }
  }

  for (const id of prevMap.keys()) {
    if (!nextMap.has(id)) removed.push(id);
  }

  return { added, removed, changed };
}

/**
 * ThreeJsSceneAdapter
 *
 * Manages a Three.js scene given SceneOrb descriptors.
 * Uses a dummy interface so tests don't need Three.js installed.
 */
export interface ThreeScene {
  addBox(orb: SceneOrb): void;
  updateBox(orb: SceneOrb): void;
  removeBox(id: string): void;
  render(): void;
}

export class SceneManager {
  private scene: ThreeScene;
  private currentOrbs: Map<string, SceneOrb> = new Map();

  constructor(scene: ThreeScene) {
    this.scene = scene;
  }

  /** Hot-reload: only update changed objects */
  applyUpdate(nextOrbs: SceneOrb[]): void {
    const prev = Array.from(this.currentOrbs.values());
    const { added, removed, changed } = diffOrbs(prev, nextOrbs);

    for (const orb of added) {
      this.scene.addBox(orb);
      this.currentOrbs.set(orb.id, orb);
    }
    for (const id of removed) {
      this.scene.removeBox(id);
      this.currentOrbs.delete(id);
    }
    for (const orb of changed) {
      this.scene.updateBox(orb);
      this.currentOrbs.set(orb.id, orb);
    }

    this.scene.render();
  }

  get orbCount(): number {
    return this.currentOrbs.size;
  }
}
