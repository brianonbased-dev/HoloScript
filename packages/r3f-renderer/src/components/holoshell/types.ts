/**
 * HoloShell Types
 *
 * Shared TypeScript definitions for the HoloShell natural phenomena renderer.
 * Zero learned UI behaviors — every interaction is grounded in physical phenomena.
 *
 * @module holoshell/types
 */

import type { Vector3, Euler } from 'three';

// =============================================================================
// SCENE IDENTIFIERS
// =============================================================================

/** All available HoloShell natural phenomena scenes (from .holo templates) */
export type SceneId =
  | 'UnderwaterScene'
  | 'WarmLibraryScene'
  | 'ZenGardenScene'
  | 'MountainLakeScene'
  | 'NightCampfireScene'
  | 'ZenGardenCloseScene';

// =============================================================================
// PHENOMENA PROP INTERFACES
// =============================================================================

/** Common props for all phenomena components */
export interface PhenomenaBaseProps {
  /** 3D position */
  position?: [number, number, number];
  /** 3D rotation in degrees [x, y, z] */
  rotation?: [number, number, number];
  /** Scale factor */
  scale?: number | [number, number, number];
}

/** BubbleField — rising iridescent spheres, touch to pop */
export interface BubbleFieldProps extends PhenomenaBaseProps {
  /** Number of bubbles (default 20) */
  count?: number;
  /** Base rise speed (units/sec, default 0.25) */
  floatSpeed?: number;
  /** Callback when a bubble is popped (for haptics/audio) */
  onPop?: (id: number) => void;
  /** Whether bubbles respawn after popping */
  respawn?: boolean;
}

/** WaterSurface — shimmering animated plane with light rays */
export interface WaterSurfaceProps extends PhenomenaBaseProps {
  /** Base water color (hex) */
  color?: string;
  /** Enable volumetric light rays */
  lightRays?: boolean;
  /** Number of light ray columns */
  rayCount?: number;
  /** Light ray opacity */
  rayOpacity?: number;
  /** Enable animated caustics */
  caustics?: boolean;
}

/** SandCanvas — sand plane with ripple/rake patterns, pointer traces */
export interface SandCanvasProps extends PhenomenaBaseProps {
  /** Sand base color (hex) */
  sandColor?: string;
  /** Underwater variant (darker, wet sheen) */
  isUnderwater?: boolean;
  /** Pre-baked rake/ripple pattern type */
  rakePattern?: 'none' | 'ripple' | 'zen-raked' | 'tide';
  /** Callback for sand interaction (pointer drag traces) */
  onInteract?: (uv: [number, number]) => void;
}

/** FireSource — particle fire with glow and embers */
export interface FireSourceProps extends PhenomenaBaseProps {
  /** Fire intensity 0-1 */
  intensity?: number;
  /** Color temperature shift (warm -> hot) */
  colorTemp?: number;
  /** Enable floating embers */
  embers?: boolean;
  /** React to pointer proximity */
  onProximity?: (distance: number) => void;
}

/** LeafField — falling/drifting leaves */
export interface LeafFieldProps extends PhenomenaBaseProps {
  /** Number of leaves */
  count?: number;
  /** Fall/drift speed */
  driftSpeed?: number;
  /** Leaf color theme */
  color?: string;
  /** Enable gentle wind sway */
  wind?: boolean;
  /** Callback on leaf touch */
  onTouch?: (id: number) => void;
}

/** GlowField — ambient floating light particles (e.g. kelp bioluminescence) */
export interface GlowFieldProps extends PhenomenaBaseProps {
  /** Particle color (hex) */
  color?: string;
  /** Pulse rate (Hz) */
  pulseRate?: number;
  /** Base intensity */
  intensity?: number;
  /** Number of particles */
  count?: number;
}

/** SceneDoor — wooden/natural door in surface, opens to trigger navigation */
export interface SceneDoorProps extends PhenomenaBaseProps {
  /** Visual style of the surrounding surface */
  materialType?: 'underwater_rock' | 'wood_cliff' | 'stone_arch' | 'bookshelf' | 'campfire_ring' | 'zen_rock';
  /** Target scene to navigate to on open */
  destinationScene: SceneId;
  /** Called when door open animation completes */
  onNavigate?: (sceneId: SceneId) => void;
  /** Optional label for a11y */
  ariaLabel?: string;
}

// =============================================================================
// HOOK / CONTEXT TYPES
// =============================================================================

/** Value provided by useHoloShell hook */
export interface HoloShellContextType {
  /** Currently visible scene */
  currentScene: SceneId;
  /** Navigate to a different scene (triggers 1.8s crossfade) */
  navigate: (sceneId: SceneId) => void;
  /** True during scene transition */
  isTransitioning: boolean;
  /** Previous scene (for transition effects) */
  previousScene: SceneId | null;
  /** Manually trigger a phenomena response (for external systems) */
  triggerPhenomena: (phenomena: string, data?: unknown) => void;
}

/** Props for the root HoloShellScene renderer */
export interface HoloShellSceneProps {
  /** Which scene template to render */
  sceneId: SceneId;
  /** Optional className for the wrapper canvas container */
  className?: string;
  /** Camera initial position override [x, y, z] */
  cameraPosition?: [number, number, number];
  /** FOV override (default 75) */
  fov?: number;
  /** Called after scene fully mounted */
  onSceneLoaded?: (sceneId: SceneId) => void;
  /** Called when user interacts with any phenomena */
  onPhenomenaInteraction?: (type: string, detail?: unknown) => void;
}

/** Internal scene component contract (all scene files export a default React.FC) */
export interface SceneComponentProps {
  onNavigateRequest?: (sceneId: SceneId) => void;
  onInteraction?: (type: string, detail?: unknown) => void;
}

// =============================================================================
// UTILITIES
// =============================================================================

/** Seeded random for deterministic bubble/particle layouts */
export function seededRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Lerp helper */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Hex to three color tuple (simple) */
export function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}
