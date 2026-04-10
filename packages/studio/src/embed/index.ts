/**
 * @holoscript/studio — Embeddable components
 *
 * These components are self-contained and work anywhere React 18 + R3F 8
 * + @holoscript/core are available. No Zustand stores, no Next.js routing,
 * no Tailwind CSS required.
 *
 * Usage:
 *   import { SceneViewer, StudioWidget, generateMockScene } from '@holoscript/studio/embed';
 */

// Embeddable 3D viewer — takes HoloScript code, renders the scene
export { SceneViewer } from './SceneViewer';
export type { SceneViewerProps } from './SceneViewer';

// Full studio widget — prompt bar + 3D viewer + mock AI
export { StudioWidget } from './StudioWidget';
export type { StudioWidgetProps } from './StudioWidget';

// Mock generator — keyword-based scene generation, zero LLM
export { generateMockScene, refineMockScene } from '../lib/mock-generator';
