/**
 * Shared types for Emergency Response plugin traits.
 *
 * These mirror the core TraitHandler interface so the plugin
 * remains decoupled from @holoscript/core internals. The plugin
 * is data + handlers — no core modifications.
 */

// =============================================================================
// TRAIT SYSTEM TYPES (plugin-local mirror)
// =============================================================================

export interface HSPlusNode {
  id?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TraitContext {
  emit?: (event: string, payload?: unknown) => void;
  getState?: () => Record<string, unknown>;
  setState?: (updates: Record<string, unknown>) => void;
  [key: string]: unknown;
}

export interface TraitEvent {
  type: string;
  source?: string;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface TraitHandler<TConfig = unknown> {
  name: string;
  defaultConfig: TConfig;
  onAttach(node: HSPlusNode, config: TConfig, ctx: TraitContext): void;
  onDetach(node: HSPlusNode, config: TConfig, ctx: TraitContext): void;
  onUpdate(node: HSPlusNode, config: TConfig, ctx: TraitContext, delta: number): void;
  onEvent(node: HSPlusNode, config: TConfig, ctx: TraitContext, event: TraitEvent): void;
}

// =============================================================================
// COMMON EMERGENCY RESPONSE TYPES
// =============================================================================

export interface GeoCoordinate {
  lat: number;
  lng: number;
  alt?: number;
}

export type UnitType = 'fire' | 'ems' | 'police' | 'hazmat' | 'search_rescue';

export type IncidentSeverity = 'minor' | 'moderate' | 'major' | 'catastrophic';
