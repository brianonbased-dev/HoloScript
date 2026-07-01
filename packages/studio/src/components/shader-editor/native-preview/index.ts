/**
 * Shader preview - browser-first shader preview surface.
 *
 * The public component name remains NativeShaderPreview for compatibility, but
 * the active renderer runs in the browser through Three/WebGL with a deterministic
 * SVG frame fallback for non-WebGL environments and tests.
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
  ShaderPreviewBackend,
} from './useShaderPreview';
