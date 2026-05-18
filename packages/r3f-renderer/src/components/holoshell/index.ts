/**
 * HoloShell — Natural Phenomena Scene Renderer
 *
 * The "OS for everyone" surface of Hololand.
 * Every interface element is a living natural phenomenon.
 * No buttons, no menus, no learned behaviors — only touchable nature.
 *
 * Scenes (6 total):
 *   UnderwaterScene (default) — bubbles, sand, water, kelp glow, rock door
 *   WarmLibraryScene — fire, bookshelves, dust motes
 *   ZenGardenScene — raked sand, drifting leaves, morning light
 *   MountainLakeScene — mirror water, peaks, mist
 *   NightCampfireScene — fire, embers, stars
 *   ZenGardenCloseScene — intimate sand + single leaf
 *
 * Phenomena (reusable building blocks):
 *   BubbleField, WaterSurface, SandCanvas, FireSource, LeafField,
 *   GlowField, SceneDoor (the single navigation primitive)
 *
 * Usage:
 *   import { HoloShellRouter, useHoloShell } from '@hololand/renderer/holoshell';
 *
 *   <HoloShellRouter initialScene="UnderwaterScene" />
 *
 * @module holoshell
 * @see docs/specs/HOLOSHELL_HARDWARE_NATIVE_SURFACE.md
 */

// =============================================================================
// ROOT SURFACES
// =============================================================================

export { HoloShellRouter } from './HoloShellRouter';
export type { HoloShellRouterProps } from './HoloShellRouter';

export { HoloShellScene } from './HoloShellScene';
export type { HoloShellSceneProps } from './types';

export {
  HoloShellProvider,
  useHoloShell,
  useSceneNavigation,
} from './useHoloShell';

// =============================================================================
// SCENES (direct import for advanced usage / testing)
// =============================================================================

export { default as UnderwaterScene } from './scenes/UnderwaterScene';
export { default as WarmLibraryScene } from './scenes/WarmLibraryScene';
export { default as ZenGardenScene } from './scenes/ZenGardenScene';
export { default as MountainLakeScene } from './scenes/MountainLakeScene';
export { default as NightCampfireScene } from './scenes/NightCampfireScene';
export { default as ZenGardenCloseScene } from './scenes/ZenGardenCloseScene';

// =============================================================================
// PHENOMENA (composable natural objects)
// =============================================================================

export { BubbleField } from './phenomena/BubbleField';
export type { BubbleFieldProps } from './types';

export { WaterSurface } from './phenomena/WaterSurface';
export type { WaterSurfaceProps } from './types';

export { SandCanvas } from './phenomena/SandCanvas';
export type { SandCanvasProps } from './types';

export { FireSource } from './phenomena/FireSource';
export type { FireSourceProps } from './types';

export { LeafField } from './phenomena/LeafField';
export type { LeafFieldProps } from './types';

export { GlowField } from './phenomena/GlowField';
export type { GlowFieldProps } from './types';

export { SceneDoor } from './phenomena/SceneDoor';
export type { SceneDoorProps } from './types';

// =============================================================================
// TYPES & UTILITIES
// =============================================================================

export type {
  SceneId,
  HoloShellContextType,
  PhenomenaBaseProps,
  SceneComponentProps,
} from './types';

export {
  seededRandom,
  lerp,
  hexToRgb,
} from './types';

// =============================================================================
// DEFAULT EXPORT — most common entry point
// =============================================================================

export { HoloShellRouter as default } from './HoloShellRouter';
