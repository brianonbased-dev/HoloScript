/**
 * Public API composition for `@holoscript/core`.
 * Split across barrels so the root `index.ts` does not pull the entire graph through one file.
 */

export * from '../legacy-exports';

export * from './hsplus-public-types';

export * from './constants';
export * from './runtime-env';

export * from './exports-core';
export * from './exports-semantics-diff-wasm';
export * from './exports-visual-through-v43';
export * from './exports-graphql-safety';

// Platform / XR (split so culture + agent exports stay in original order)
export * from '../platforms/conditional-modality';
export * from './culture-agents';
export * from '../platforms/cross-reality';

export * from './marketplace';
export * from './material-io-pipeline';
export * from './trait-stdlib-interop';
export * from './compiler-plugins-crypto';
export * from './registry-deploy-events';

// HoloMap - WebGPU reconstruction runtime (Sprint 1 scaffold)
export * from '../reconstruction';

// Spatial MCP - 3D context payload (research/2026-05-07_spatial-mcp-spec.md)
export * from '../spatial';

// Agent extensions (ISwarmConfig, ISwarmResult, IAgentExtension, etc.)
export * from '../extensions';

// Worker layer exports
export * from '../HoloScriptCodeParser';
export * from '../worker/CompilerWorkerProxy';
export * from '../worker/LSPWorkerProtocol';

// Compiler module resolver (engine HotReloadBridge relies on invalidate()).
export { ModuleResolver } from '../compiler/ModuleResolver';
export type { CachedModule, ModuleHeader, ResolvedImport } from '../compiler/ModuleResolver';
export type { ResolvedImport as ModuleImport } from '../compiler/ModuleResolver';
export type ModuleExport = string;

// Theming (consumed by @holoscript/engine RuntimeBridge)
export * from '../theming/ThemeEngine';
export * from '../theming/StyleResolver';

// Shared trait types (TraitInstanceDelegate consumed by engine traits).
// Keep this explicit so legacy VR exports remain authoritative for overlapping names.
export { extractPayload } from '../traits/TraitTypes';
export type {
  TraitHandler,
  HostExecOptions,
  HostExecResult,
  HostNetworkRequestOptions,
  HostNetworkResponse,
  HostFileSystemCapabilities,
  HostProcessCapabilities,
  HostNetworkCapabilities,
  HostMediaFrame,
  HostMediaCapabilities,
  HostDepthMap,
  HostDepthInferenceCapabilities,
  HostGpuComputeResult,
  HostGpuComputeCapabilities,
  HostCapabilities,
  TraitContext,
  AccessibilityContext,
  VRContext,
  PhysicsContext,
  AudioContext,
  HapticsContext,
  RaycastHit,
  TraitEvent,
  TraitEventPayload,
  TraitInstanceDelegate,
} from '../traits/TraitTypes';

// Trust primitives (ADR-2026-05-14)
export * from '../trust';
