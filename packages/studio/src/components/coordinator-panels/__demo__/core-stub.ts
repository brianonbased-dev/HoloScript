// Minimal stub for @holoscript/core in the demo. The panels and the
// TraitContextFactory/TraitRuntimeIntegration only need:
//   - VRTraitRegistry (constructed but never used by the demo's panels)
//   - HSPlusNode, VRTraitName, TraitContext, TraitEvent (type-only)
//
// Replacing the full @holoscript/core barrel sidesteps a chain of
// type-vs-value re-export issues across spatial/composition/etc that
// vite enforces strictly. The demo doesn't exercise any of those code
// paths.
export class VRTraitRegistry {
  attachTrait(_node: unknown, _name: unknown, _config: unknown, _ctx: unknown): void {}
  detachTrait(_node: unknown, _name: unknown, _ctx: unknown): void {}
  updateAllTraits(_node: unknown, _ctx: unknown, _delta: unknown): void {}
  handleEventForAllTraits(_node: unknown, _ctx: unknown, _event: unknown): void {}
}
export type HSPlusNode = { id?: string; traits?: Map<string, unknown>; [k: string]: unknown };
export type VRTraitName = string;
export interface TraitContext {
  emit?: (event: string, payload?: unknown) => void;
  vr?: { headset?: { position?: unknown; rotation?: unknown } };
  [k: string]: unknown;
}
export type TraitEvent = { type: string; [k: string]: unknown };
export type VRContext = unknown;
export type PhysicsContext = unknown;
export type AudioContext = unknown;
export type HapticsContext = unknown;
export type AccessibilityContext = unknown;
export type RaycastHit = unknown;
export type VRHand = unknown;
export type Vector3 = [number, number, number];
