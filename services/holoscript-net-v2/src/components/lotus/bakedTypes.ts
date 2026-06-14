/**
 * Baked lotus scene types — the runtime contract for the JSON produced by
 * scripts/bake-lotus-scenes.ts. The viewer (LotusWorld) imports ONLY these +
 * three/R3F/drei; it never touches @holoscript/core at runtime (the Railway
 * runtime bundle must not depend on core — see the baker's header). The flower
 * is still genuinely HoloScript-compiled; this is just the serialized handoff.
 */

export interface BakedGeometry {
  positions: number[];
  normals: number[];
  uv: number[];
  indices: number[];
}

export interface BakedPrimitive {
  hsType: string;
  name?: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  color?: string;
  roughness?: number;
  metalness?: number;
  reflective?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  width?: number;
  height?: number;
  radius?: number;
  radiusTop?: number;
  radiusBottom?: number;
  notchAngle?: number;
}

export interface BakedPetalPlacement {
  azimuth: number;
  tilt: number;
  radius: number;
  lift: number;
  ring: number;
}

export interface BakedLotusInstance {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  growthCap: number;
  placements: BakedPetalPlacement[];
  scene: {
    stemHeight?: number;
    scaffold?: {
      receptacle?: { radius: number; squashY: number; lift: number };
      calyx?: { radius: number; height: number; drop: number };
    };
    colors?: { water: string; leaf: string; leafDark: string };
    center?: {
      seedPod: string;
      seedPodRim: string;
      stamen: string;
      stamenTip: string;
      stamenCount: number;
      carpelRings?: number[];
    };
  };
}

export interface BakedAnimatedChannel {
  prop: string;
  target: string;
  edge0: number;
  edge1: number;
  from: number;
  to: number;
}

export interface BakedAnimatedGroup {
  position?: [number, number, number];
  rotation?: [number, number, number];
  channels: BakedAnimatedChannel[];
  children: BakedPrimitive[];
}

export interface BakedTimelineKey {
  t: number;
  target: string;
  value: number;
}

export type BloomState = 'full' | 'blooming' | 'budding' | 'sealed' | 'wilted';

export interface BakedPaperPetal {
  index: number;
  ring: number;
  ringIndex: number;
  angle: number;
  radius: number;
  height: number;
  color: string;
  label: string;
  title: string;
  bloomAuthored: BloomState;
  bloomHealth: BloomState | null;
  health: number | null;
  retired: boolean;
  failing: number | null;
  rowId: string | null;
}

export interface BakedScene {
  kind: 'pond' | 'paper-flower' | 'symbolic';
  name: string;
  source: string;
  generatedAt: string;
  petalGeometry?: BakedGeometry;
  lotuses?: BakedLotusInstance[];
  scaffold?: BakedPrimitive[];
  animatedGroups?: BakedAnimatedGroup[];
  timeline?: BakedTimelineKey[];
  camera?: { position: [number, number, number]; target: [number, number, number] };
  paperPetals?: BakedPaperPetal[];
  center?: Record<string, unknown>;
  colors?: Record<string, string>;
  aggregate?: number;
  aggregateBloom?: BloomState;
  nodes?: BakedPrimitive[];
}

/** The three switchable scenes. `pond` is the default. */
export const LOTUS_SCENES: { id: string; label: string; file: string; blurb: string }[] = [
  { id: 'pond', label: 'Pond', file: '/scenes/lotus-pond.baked.json', blurb: 'Full botanical pond — flower, stem, water, pads, leaves' },
  { id: 'seedable', label: 'Paper flower', file: '/scenes/garden.seedable.baked.json', blurb: '42-petal Fibonacci genesis sculpture, petals bound to live paper health' },
  { id: 'refreshed', label: 'Baseline', file: '/scenes/garden.refreshed.baked.json', blurb: 'Bloom-readability baseline — root, stalk, center, petals' },
];

/** Bloom → openness factor (0 sealed/wilted bud … 1 full open). */
export function bloomOpenness(b: BloomState | null): number {
  switch (b) {
    case 'full':
      return 1;
    case 'blooming':
      return 0.78;
    case 'budding':
      return 0.5;
    case 'wilted':
      return 0.22;
    case 'sealed':
    default:
      return 0.12;
  }
}

/** Bloom → a tint multiplier + droop signal for honest visual wilt. */
export function bloomTint(b: BloomState | null): { dim: number; brown: boolean } {
  if (b === 'wilted') return { dim: 0.45, brown: true };
  if (b === 'sealed') return { dim: 0.6, brown: false };
  if (b === 'budding') return { dim: 0.8, brown: false };
  return { dim: 1, brown: false };
}
