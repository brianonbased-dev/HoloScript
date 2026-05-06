/**
 * GemResonance Trait
 *
 * Harmonic spatial audio between nearby enchanted crystal gems.
 */

import type { TraitHandler, TraitEvent } from './TraitTypes';
import type { HSPlusNode, Vector3 } from '../types/HoloScriptPlus';

export type GemResonanceBlendMode = 'harmonic' | 'additive' | 'beating';
export type GemResonanceOutput = 'spatial_audio' | 'event';
export type GemFrequencyMap = Record<string, number>;

export interface GemResonanceConfig {
  max_distance: number;
  base_frequencies: 'auto' | GemFrequencyMap;
  blend_mode: GemResonanceBlendMode;
  output: GemResonanceOutput;
  volume: number;
  probe_interval_ms: number;
  chord_limit: number;
  element?: string;
}

export interface GemResonanceNeighbor {
  id?: string;
  nodeId?: string;
  name?: string;
  element?: string;
  frequency?: number;
  distance?: number;
  position?: Vector3;
  traits?: string[] | Record<string, unknown>;
  config?: Record<string, unknown>;
}

interface GemResonanceState {
  element: string;
  baseFrequency: number;
  held: boolean;
  probeElapsedMs: number;
  activeChord: number[];
  activeNeighborIds: string[];
}

export const GEM_RESONANCE_ELEMENT_FREQUENCIES: GemFrequencyMap = {
  fire: 440,
  water: 528,
  earth: 396,
  air: 741,
  shadow: 174,
  ice: 417,
  lightning: 963,
  storm: 963,
  light: 852,
  all: 432,
  none: 432,
};

const RESONANCE_REQUIREMENTS = ['crystal_gem', 'enchantable'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function normalizeElement(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim().toLowerCase();
}

function isTraitDirective(
  value: unknown,
  traitName: string
): value is { type: 'trait'; name: string; config?: Record<string, unknown> } {
  return isRecord(value) && value.type === 'trait' && value.name === traitName;
}

function readTraitConfig(node: HSPlusNode, traitName: string): Record<string, unknown> | undefined {
  const fromTraits = node.traits?.get(traitName);
  if (isRecord(fromTraits)) return fromTraits;

  const directives = node.directives ?? [];
  const directive = directives.find((d) => isTraitDirective(d, traitName));
  return isRecord(directive?.config) ? directive.config : undefined;
}

function hasTrait(node: HSPlusNode, traitName: string): boolean {
  if (node.traits?.has(traitName)) return true;
  return (node.directives ?? []).some((d) => isTraitDirective(d, traitName));
}

function isQualifiedGem(node: HSPlusNode): boolean {
  return RESONANCE_REQUIREMENTS.every((traitName) => hasTrait(node, traitName));
}

function getNodeId(node: HSPlusNode): string {
  return String(node.id ?? node.name ?? node.type ?? 'gem');
}

function resolveFrequencyMap(config: GemResonanceConfig): GemFrequencyMap {
  return isRecord(config.base_frequencies)
    ? { ...GEM_RESONANCE_ELEMENT_FREQUENCIES, ...(config.base_frequencies as GemFrequencyMap) }
    : GEM_RESONANCE_ELEMENT_FREQUENCIES;
}

function resolveElement(node: HSPlusNode, config: GemResonanceConfig): string {
  return (
    normalizeElement(config.element) ??
    normalizeElement(readTraitConfig(node, 'enchantable')?.element) ??
    normalizeElement(node.stateBlock?.element) ??
    normalizeElement(node.properties?.element) ??
    normalizeElement(node.properties?.state) ??
    'none'
  );
}

function resolveBaseFrequency(element: string, config: GemResonanceConfig): number {
  const frequencies = resolveFrequencyMap(config);
  return asFiniteNumber(frequencies[element]) ?? frequencies.none ?? 432;
}

function neighborId(neighbor: GemResonanceNeighbor): string {
  return String(neighbor.nodeId ?? neighbor.id ?? neighbor.name ?? neighbor.element ?? 'nearby_gem');
}

function neighborElement(neighbor: GemResonanceNeighbor): string {
  const configElement = isRecord(neighbor.config) ? normalizeElement(neighbor.config.element) : null;
  return normalizeElement(neighbor.element) ?? configElement ?? 'none';
}

function neighborHasTrait(neighbor: GemResonanceNeighbor, traitName: string): boolean {
  if (Array.isArray(neighbor.traits)) return neighbor.traits.includes(traitName);
  if (isRecord(neighbor.traits)) return Boolean(neighbor.traits[traitName]);
  return true;
}

function isNeighborCandidate(neighbor: GemResonanceNeighbor, maxDistance: number): boolean {
  if (!neighborHasTrait(neighbor, 'crystal_gem') || !neighborHasTrait(neighbor, 'enchantable')) {
    return false;
  }
  return typeof neighbor.distance !== 'number' || neighbor.distance <= maxDistance;
}

function resolveNeighborFrequency(
  neighbor: GemResonanceNeighbor,
  config: GemResonanceConfig
): number {
  return asFiniteNumber(neighbor.frequency) ?? resolveBaseFrequency(neighborElement(neighbor), config);
}

function rounded(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function beatFrequencies(frequencies: number[]): number[] {
  const beats: number[] = [];
  for (let i = 0; i < frequencies.length; i += 1) {
    for (let j = i + 1; j < frequencies.length; j += 1) {
      const beat = rounded(Math.abs(frequencies[j] - frequencies[i]));
      if (beat > 0) beats.push(beat);
    }
  }
  return beats;
}

function buildChord(
  state: GemResonanceState,
  config: GemResonanceConfig,
  neighbors: GemResonanceNeighbor[]
): {
  elements: string[];
  frequencies: number[];
  neighborIds: string[];
  beatFrequencies: number[];
  resonanceId: string;
} {
  const sortedNeighbors = neighbors
    .filter((neighbor) => isNeighborCandidate(neighbor, config.max_distance))
    .sort((a, b) => {
      const ad = typeof a.distance === 'number' ? a.distance : Number.POSITIVE_INFINITY;
      const bd = typeof b.distance === 'number' ? b.distance : Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return neighborId(a).localeCompare(neighborId(b));
    })
    .slice(0, Math.max(0, config.chord_limit - 1));

  const elements = [state.element, ...sortedNeighbors.map(neighborElement)];
  const frequencies = [
    state.baseFrequency,
    ...sortedNeighbors.map((neighbor) => resolveNeighborFrequency(neighbor, config)),
  ].map(rounded);
  const neighborIds = sortedNeighbors.map(neighborId);
  const resonanceId = `${elements.slice().sort().join('_')}_${config.blend_mode}`;

  return {
    elements,
    frequencies,
    neighborIds,
    beatFrequencies: beatFrequencies(frequencies),
    resonanceId,
  };
}

function getNeighbors(event: TraitEvent): GemResonanceNeighbor[] {
  const payload = isRecord(event.payload) ? event.payload : event;
  const neighbors = payload.neighbors;
  return Array.isArray(neighbors) ? (neighbors as GemResonanceNeighbor[]) : [];
}

export const gemResonanceHandler: TraitHandler<GemResonanceConfig> = {
  name: 'gem_resonance',

  defaultConfig: {
    max_distance: 0.5,
    base_frequencies: 'auto',
    blend_mode: 'harmonic',
    output: 'spatial_audio',
    volume: 0.45,
    probe_interval_ms: 100,
    chord_limit: 4,
  },

  onAttach(node, config, context) {
    const element = resolveElement(node, config);
    const state: GemResonanceState = {
      element,
      baseFrequency: resolveBaseFrequency(element, config),
      held: Boolean(node.stateBlock?.held ?? node.properties?.held ?? false),
      probeElapsedMs: 0,
      activeChord: [],
      activeNeighborIds: [],
    };
    node.__gemResonanceState = state;

    context.emit?.('gem_resonance_register', {
      node,
      nodeId: getNodeId(node),
      element: state.element,
      baseFrequency: state.baseFrequency,
      maxDistance: config.max_distance,
      blendMode: config.blend_mode,
      output: config.output,
      qualified: isQualifiedGem(node),
      requires: [...RESONANCE_REQUIREMENTS],
    });
  },

  onDetach(node, _config, context) {
    const state = node.__gemResonanceState as GemResonanceState | undefined;
    if (state?.activeChord.length) {
      context.emit?.('gem_resonance_stop', { node, nodeId: getNodeId(node) });
    }
    context.emit?.('gem_resonance_unregister', { node, nodeId: getNodeId(node) });
    delete node.__gemResonanceState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__gemResonanceState as GemResonanceState | undefined;
    if (!state || !isQualifiedGem(node)) return;

    state.probeElapsedMs += Math.max(0, delta) * 1000;
    if (state.probeElapsedMs < config.probe_interval_ms) return;
    state.probeElapsedMs = 0;

    context.emit?.('gem_resonance_probe', {
      node,
      nodeId: getNodeId(node),
      maxDistance: config.max_distance,
      element: state.element,
      baseFrequency: state.baseFrequency,
      held: state.held,
      requires: [...RESONANCE_REQUIREMENTS],
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__gemResonanceState as GemResonanceState | undefined;
    if (!state) return;

    if (event.type === 'grab_start') {
      state.held = true;
      return;
    }

    if (event.type === 'grab_end') {
      state.held = false;
      state.activeChord = [];
      state.activeNeighborIds = [];
      context.emit?.('gem_resonance_stop', { node, nodeId: getNodeId(node) });
      return;
    }

    if (event.type !== 'gem_resonance_neighbors' && event.type !== 'nearby_gems_update') {
      return;
    }

    if (!isQualifiedGem(node)) return;

    const chord = buildChord(state, config, getNeighbors(event));
    if (chord.frequencies.length < 2) {
      if (state.activeChord.length) {
        context.emit?.('gem_resonance_stop', { node, nodeId: getNodeId(node) });
      }
      state.activeChord = [];
      state.activeNeighborIds = [];
      return;
    }

    state.activeChord = chord.frequencies;
    state.activeNeighborIds = chord.neighborIds;

    const payload = {
      node,
      nodeId: getNodeId(node),
      resonanceId: chord.resonanceId,
      elements: chord.elements,
      frequencies: chord.frequencies,
      beatFrequencies: chord.beatFrequencies,
      neighborIds: chord.neighborIds,
      blendMode: config.blend_mode,
      volume: config.volume,
      maxDistance: config.max_distance,
      spatial: config.output === 'spatial_audio',
    };

    context.emit?.('gem_resonance_audio', payload);
    if (config.output === 'spatial_audio') {
      context.emit?.('spatial_audio', {
        ...payload,
        source: 'gem_resonance',
      });
    }
  },
};

export default gemResonanceHandler;
