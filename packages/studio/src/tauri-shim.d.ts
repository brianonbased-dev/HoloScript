// Ambient declaration for `@tauri-apps/api/core` — used by the Tauri
// desktop adapter (lib/tauri-bridge.ts, components/shader-editor/.../
// useShaderPreview.ts). The studio package doesn't depend on
// `@tauri-apps/api` at the workspace level because the Tauri integration
// is optional (web-only deploys don't ship the runtime). The dynamic
// `import('@tauri-apps/api/core')` is wrapped in try/catch so unavailable
// platforms degrade gracefully — TS just needs to know the shape.
declare module '@tauri-apps/api/core' {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}
