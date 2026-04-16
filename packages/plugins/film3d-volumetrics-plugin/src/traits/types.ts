import type { LoroDoc } from 'loro-crdt';

export interface HSPlusNode { id?: string; properties?: Record<string, unknown>; [key: string]: unknown; }
export interface TraitContext {
  emit?: (event: string, payload?: unknown) => void;
  /** Injected by HoloLand / spatial host so volumetric payloads sync on the shared Loro + WebRTC doc. */
  spatialSync?: { doc: LoroDoc };
  [key: string]: unknown;
}
export interface TraitEvent { type: string; payload?: Record<string, unknown>; [key: string]: unknown; }
export interface TraitHandler<T = unknown> { name: string; defaultConfig: T; onAttach(n: HSPlusNode, c: T, ctx: TraitContext): void; onDetach(n: HSPlusNode, c: T, ctx: TraitContext): void; onUpdate(n: HSPlusNode, c: T, ctx: TraitContext, d: number): void; onEvent(n: HSPlusNode, c: T, ctx: TraitContext, e: TraitEvent): void; }
