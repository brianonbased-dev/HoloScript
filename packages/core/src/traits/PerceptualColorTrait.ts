/**
 * @perceptual_color
 *
 * Runtime trait wrapper for the non-Riemannian color primitive. It emits a
 * compiler-ready payload so renderers and export targets can use the same
 * DeltaE2000/perceptual-lerp path as the compiler pass.
 */

import { DEFAULT_DAMPENING } from '../color';
import {
  analyzePerceptualColor,
  applyPerceptualColorPass,
  type PerceptualColorPassResult,
  type PerceptualGradientStop,
} from '../compiler/PerceptualColorPass';
import type { TraitContext, TraitEvent, TraitHandler, HSPlusNode, VRTraitName } from './TraitTypes';

export type PerceptualColorMode = 'auto' | 'palette' | 'gradient' | 'color_map';

export interface PerceptualColorConfig {
  mode: PerceptualColorMode;
  palette: string[];
  gradient: PerceptualGradientStop[];
  color_map: string;
  steps: number;
  dampening: number;
  target_delta_e: number;
  neutral_axis: boolean;
  scientific: boolean;
  emit_analysis: boolean;
}

export interface PerceptualColorState {
  revisions: number;
  lastApplied: PerceptualColorTraitOutput | null;
}

export interface PerceptualColorTraitOutput {
  mode: PerceptualColorMode;
  palette?: string[];
  gradient?: PerceptualGradientStop[];
  colorMap?: string;
  analysis?: ReturnType<typeof analyzePerceptualColor>[];
  compilerColorPass: PerceptualColorPassResult;
}

const DEFAULT_PALETTE = ['#1F77B4', '#FF7F0E', '#2CA02C', '#D62728'];

export const perceptualColorHandler: TraitHandler<PerceptualColorConfig> = {
  name: 'perceptual_color' as VRTraitName,

  defaultConfig: {
    mode: 'auto',
    palette: DEFAULT_PALETTE,
    gradient: [
      { t: 0, color: '#440154' },
      { t: 0.5, color: '#21918C' },
      { t: 1, color: '#FDE725' },
    ],
    color_map: 'viridis',
    steps: 7,
    dampening: DEFAULT_DAMPENING,
    target_delta_e: 8,
    neutral_axis: false,
    scientific: true,
    emit_analysis: true,
  },

  onAttach(node, config, context) {
    const state: PerceptualColorState = { revisions: 0, lastApplied: null };
    node.__perceptualColorState = state;
    applyPerceptualColor(node, config, state, context);
  },

  onDetach(node, _config, context) {
    const state = node.__perceptualColorState as PerceptualColorState | undefined;
    if (state?.lastApplied) {
      context.emit?.('perceptual_color_detach', {
        node,
        revisions: state.revisions,
      });
    }
    delete node.__perceptualColorState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Perceptual color is event-driven; recompute when palette inputs change.
  },

  onEvent(node, config, context, event) {
    const state = node.__perceptualColorState as PerceptualColorState | undefined;
    if (!state) return;

    if (event.type === 'perceptual_color_recompute' || event.type === 'perceptual_color_apply') {
      const overrides = eventToConfigOverrides(event);
      applyPerceptualColor(node, { ...config, ...overrides }, state, context);
    } else if (event.type === 'perceptual_color_query') {
      context.emit?.('perceptual_color_info', {
        queryId: event.queryId,
        node,
        revisions: state.revisions,
        lastApplied: state.lastApplied,
      });
    }
  },
};

function eventToConfigOverrides(event: TraitEvent): Partial<PerceptualColorConfig> {
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : (event as Record<string, unknown>);

  const overrides: Partial<PerceptualColorConfig> = {};
  if (isMode(payload.mode)) overrides.mode = payload.mode;
  const palette = stringArray(payload.palette);
  if (palette) overrides.palette = palette;
  const gradient = gradientArray(payload.gradient);
  if (gradient) overrides.gradient = gradient;
  if (typeof payload.color_map === 'string') overrides.color_map = payload.color_map;
  const steps = numberValue(payload.steps);
  if (steps !== undefined) overrides.steps = steps;
  const dampening = numberValue(payload.dampening);
  if (dampening !== undefined) overrides.dampening = dampening;
  const targetDeltaE = numberValue(payload.target_delta_e);
  if (targetDeltaE !== undefined) overrides.target_delta_e = targetDeltaE;
  if (typeof payload.neutral_axis === 'boolean') overrides.neutral_axis = payload.neutral_axis;
  if (typeof payload.scientific === 'boolean') overrides.scientific = payload.scientific;
  if (typeof payload.emit_analysis === 'boolean') overrides.emit_analysis = payload.emit_analysis;
  return overrides;
}

function isMode(value: unknown): value is PerceptualColorMode {
  return value === 'auto' || value === 'palette' || value === 'gradient' || value === 'color_map';
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? [...value]
    : undefined;
}

function gradientArray(value: unknown): PerceptualGradientStop[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const stops: PerceptualGradientStop[] = [];
  for (const entry of value) {
    if (
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Record<string, unknown>).t === 'number' &&
      typeof (entry as Record<string, unknown>).color === 'string'
    ) {
      const stop = entry as { t: number; color: string };
      stops.push({
        t: stop.t,
        color: stop.color,
      });
    }
  }
  return stops.length > 0 ? stops : undefined;
}

function applyPerceptualColor(
  node: HSPlusNode,
  config: PerceptualColorConfig,
  state: PerceptualColorState,
  context: TraitContext
): void {
  const compilerColorPass = applyPerceptualColorPass({
    palette: config.mode === 'palette' ? config.palette : undefined,
    gradient: config.mode === 'gradient' ? config.gradient : undefined,
    colorMap: config.mode === 'auto' || config.mode === 'color_map' ? config.color_map : undefined,
    steps: config.steps,
    dampening: config.dampening,
    targetDeltaE: config.target_delta_e,
    neutralAxis: config.neutral_axis,
    scientific: config.scientific,
  });

  const palette = compilerColorPass.palette?.colors;
  const gradient = compilerColorPass.gradient?.stops;
  const colorMap = compilerColorPass.colorMap?.name;
  const analysis =
    config.emit_analysis === true
      ? (palette ?? compilerColorPass.gradient?.colors ?? []).map(analyzePerceptualColor)
      : undefined;

  const output: PerceptualColorTraitOutput = {
    mode: config.mode,
    palette,
    gradient,
    colorMap,
    analysis,
    compilerColorPass,
  };

  state.revisions += 1;
  state.lastApplied = output;

  context.emit?.('perceptual_color_apply', {
    node,
    revision: state.revisions,
    ...output,
  });

  context.emit?.('on_perceptual_color_change', {
    node,
    revision: state.revisions,
    source: compilerColorPass.source,
    minDeltaE: compilerColorPass.gradient?.minDeltaE ?? compilerColorPass.palette?.minDeltaE ?? 0,
  });
}

export default perceptualColorHandler;
