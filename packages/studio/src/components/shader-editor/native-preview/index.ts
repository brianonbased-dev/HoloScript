/**
 * Native Shader Preview — wgpu render-to-texture pipeline for Tauri 2.0.
 *
 * Provides GPU-accelerated shader preview without WebGL dependency.
 * Renders WGSL shaders to offscreen texture via wgpu, delivers frames
 * as base64 PNG data URIs through Tauri IPC.
 *
 * @module shader-editor/native-preview
 */

export { NativeShaderPreview } from './NativeShaderPreview';
export { useShaderPreview } from './useShaderPreview';
export type {
  FrameResult,
  PipelineTimings,
  BenchmarkResult,
  ShaderPreviewState,
  ShaderPreviewActions,
} from './useShaderPreview';
