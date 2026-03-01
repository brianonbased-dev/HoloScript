/**
 * @holoscript/preview-component
 *
 * Standalone React component for embedding interactive HoloScript 3D scene previews.
 * Designed for GitHub PRs, documentation sites, playgrounds, and any React application.
 *
 * @example
 * ```tsx
 * import { HoloScriptPreview } from '@holoscript/preview-component';
 * import * as THREE from 'three';
 * import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
 *
 * <HoloScriptPreview
 *   code={`
 *     orb hero {
 *       geometry: "sphere"
 *       color: "cyan"
 *       position: [0, 1, 0]
 *       animate: "float"
 *     }
 *   `}
 *   threeModule={THREE}
 *   orbitControls={OrbitControls}
 *   width={800}
 *   height={600}
 * />
 * ```
 *
 * @packageDocumentation
 */

// Main component
export { HoloScriptPreview } from './components/HoloScriptPreview';
export type { HoloScriptPreviewProps } from './components/HoloScriptPreview';

// Sub-components (for advanced composition)
export { PreviewToolbar } from './components/PreviewToolbar';
export type { PreviewToolbarProps } from './components/PreviewToolbar';
export { CodePanel } from './components/CodePanel';
export type { CodePanelProps } from './components/CodePanel';
export { StatsOverlay } from './components/StatsOverlay';
export type { StatsOverlayProps } from './components/StatsOverlay';

// Engine (for headless / custom usage)
export { parseHoloScript } from './engine/parser';
export { PreviewRenderer } from './engine/renderer';
export { resolveColor, SKYBOX_GRADIENTS } from './engine/colors';
export type {
  ParsedObject,
  ParsedEnvironment,
  ParseResult,
  AnimatedEntry,
  SceneState,
  RendererConfig,
} from './engine/types';
