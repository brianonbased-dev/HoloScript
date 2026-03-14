/**
 * @holoscript/studio — Public API
 *
 * Top-level exports for external consumers of the HoloScript Studio platform.
 * Provides access to the compiler bridge, WebXR viewer, benchmarking,
 * platform detection, and Tauri desktop integration.
 *
 * Usage:
 *   import { CompilerBridge, WebXRViewer, runBenchmark } from '@holoscript/studio';
 *
 * For embeddable components only (no platform APIs):
 *   import { SceneViewer, StudioWidget } from '@holoscript/studio/embed';
 */

// ═══════════════════════════════════════════════════════════════════
// Compiler Bridge — WASM/TS compiler with Worker-based architecture
// ═══════════════════════════════════════════════════════════════════

export { CompilerBridge, getCompilerBridge, resetCompilerBridge } from './lib/wasm-compiler-bridge';

export type {
  CompilerBridgeStatus,
  CompileTarget,
  PlatformTarget,
  CompileResult,
  ValidationResult,
  Diagnostic,
  Severity,
  TraitDef,
  TraitFull,
  Position,
  Span,
} from './lib/wasm-compiler-bridge';

// ═══════════════════════════════════════════════════════════════════
// WebXR Viewer — Embeddable 3D viewer with VR/AR session support
// ═══════════════════════════════════════════════════════════════════

export { WebXRViewer } from './embed/WebXRViewer';
export type { WebXRViewerProps, XRSessionMode } from './embed/WebXRViewer';

// ═══════════════════════════════════════════════════════════════════
// Performance Benchmarking — WASM vs TS comparison harness
// ═══════════════════════════════════════════════════════════════════

export { runBenchmark, quickBenchmark } from './lib/benchmark-harness';

export type {
  BenchmarkResult,
  BenchmarkComparison,
  BenchmarkTimings,
  BenchmarkOptions,
} from './lib/benchmark-harness';

// ═══════════════════════════════════════════════════════════════════
// Platform Detection — Runtime capability detection
// ═══════════════════════════════════════════════════════════════════

export { detectPlatform, checkBudget, PLATFORM_BUDGETS } from './lib/platform-detect';

export type { PlatformCapabilities, PerformanceBudget } from './lib/platform-detect';

// ═══════════════════════════════════════════════════════════════════
// Tauri Desktop Bridge — Native feature gates and file operations
// ═══════════════════════════════════════════════════════════════════

export {
  isTauri,
  detectTauriFeatures,
  resolveWasmUrl,
  enhancePlatformWithTauri,
  initBridgeForPlatform,
  saveProjectNative,
  loadProjectNative,
  listProjectsNative,
} from './lib/tauri-bridge';

export type { TauriFeatureGates, TauriGpuInfo, TauriProjectMeta } from './lib/tauri-bridge';

// ═══════════════════════════════════════════════════════════════════
// React Hooks — For use within React component trees
// ═══════════════════════════════════════════════════════════════════

export { useCompilerBridge } from './hooks/useCompilerBridge';
export type { UseCompilerBridgeReturn } from './hooks/useCompilerBridge';

export { useScenePipeline } from './hooks/useScenePipeline';

// ═══════════════════════════════════════════════════════════════════
// Studio Components — UI building blocks for HoloScript Studio
// ═══════════════════════════════════════════════════════════════════

// AI & Confidence
export { CalibrationUncertaintyIndicator } from './components/ai/CalibrationUncertaintyIndicator';
export { ConfidenceAwareXRUI } from './components/xr/ConfidenceAwareXRUI';

// Scene Preview & Diff
export { DragonPreview } from './components/preview/DragonPreview';
export { HoloDiffPanel } from './components/diff/HoloDiffPanel';

// Editors & Inspectors
export { SliderMaterialInspector } from './components/inspector/SliderMaterialInspector';
export { AssetImportDropZone } from './components/import/AssetImportDropZone';
export { CinematicCameraPanel } from './components/camera/CinematicCameraPanel';

// Dashboards & Visualizers
export { TraitSupportMatrixDashboard } from './components/registry/TraitSupportMatrixDashboard';
export { SyntheticDataDashboard } from './components/synthetic/SyntheticDataDashboard';
export { CompilationPipelineVisualizer } from './components/pipeline/CompilationPipelineVisualizer';
export { StudioOperationsHub } from './components/operations/StudioOperationsHub';

// Layouts
export { ResponsiveStudioLayout } from './components/layouts/ResponsiveStudioLayout';

// ═══════════════════════════════════════════════════════════════════
// Studio Bridge — Visual-to-AST synchronization
// ═══════════════════════════════════════════════════════════════════

export { default as StudioBridge } from './lib/StudioBridge';
export type { ASTMutation, MutationResult, ASTChangeEvent, StudioBridgeOptions } from './lib/StudioBridge';
