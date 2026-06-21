import {
  DEFAULT_DAMPENING,
  chroma,
  hue,
  lightness,
  nearestNeutral,
  perceptualDistance,
  perceptualLerp,
  type PerceptualDistanceOptions,
  type SRGB,
} from '../color';

export type PerceptualColorPassSource = 'palette' | 'gradient' | 'color_map';

export interface PerceptualGradientStop {
  t: number;
  color: string;
}

export interface PerceptualColorPassOptions {
  steps?: number;
  dampening?: number;
  arcSteps?: number;
  targetDeltaE?: number;
  neutralAxis?: boolean;
}

export interface PerceptualPaletteResult {
  colors: string[];
  pairwiseDeltaE: number[];
  minDeltaE: number;
  maxDeltaE: number;
  meanDeltaE: number;
  nearestNeutral?: string[];
}

export interface PerceptualGradientResult {
  stops: PerceptualGradientStop[];
  colors: string[];
  deltaE: number[];
  minDeltaE: number;
  maxDeltaE: number;
  meanDeltaE: number;
}

export interface PerceptualColorMapResult extends PerceptualGradientResult {
  name: string;
}

export interface PerceptualColorPassInput {
  palette?: readonly string[];
  gradient?: readonly (string | PerceptualGradientStop)[];
  colorMap?: string | readonly (string | PerceptualGradientStop)[];
  steps?: number;
  dampening?: number;
  arcSteps?: number;
  targetDeltaE?: number;
  neutralAxis?: boolean;
  scientific?: boolean;
}

export interface PerceptualColorPassResult {
  algorithm: 'perceptual_lerp_delta_e2000';
  source: PerceptualColorPassSource;
  scientific: boolean;
  targetDeltaE: number;
  dampening: number;
  palette?: PerceptualPaletteResult;
  gradient?: PerceptualGradientResult;
  colorMap?: PerceptualColorMapResult;
  warnings: string[];
}

export const SCIENTIFIC_COLOR_MAPS: Record<string, readonly string[]> = {
  viridis: ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'],
  plasma: ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'],
  magma: ['#000004', '#3b0f70', '#8c2981', '#de4968', '#fcfdbf'],
  inferno: ['#000004', '#420a68', '#932667', '#dd513a', '#fcffa4'],
  cividis: ['#00204c', '#31456b', '#666970', '#a69c75', '#ffe945'],
  turbo: ['#30123b', '#466be3', '#1bcfd4', '#a4fc3c', '#faba39', '#7a0403'],
  thermal: ['#102040', '#1f77b4', '#31a354', '#ffbf00', '#d62728'],
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function normalizeHexColor(color: string): string {
  const trimmed = color.trim();
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(trimmed);
  if (!match) {
    throw new Error(`Unsupported color format: ${color}`);
  }
  const hex = match[1];
  if (hex.length === 3) {
    return `#${hex
      .split('')
      .map((c) => c + c)
      .join('')}`.toUpperCase();
  }
  return `#${hex}`.toUpperCase();
}

export function hexToSrgb(color: string): SRGB {
  const hex = normalizeHexColor(color).slice(1);
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

export function srgbToHex(rgb: SRGB): string {
  const [r, g, b] = rgb.map((c) => clampByte(clamp01(c) * 255));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizedStops(
  stops: readonly (string | PerceptualGradientStop)[],
  warnings: string[]
): PerceptualGradientStop[] {
  if (stops.length === 0) {
    warnings.push('No colors supplied; using viridis fallback.');
    return normalizedStops(SCIENTIFIC_COLOR_MAPS.viridis, warnings);
  }

  const rawStops = stops.map((stop, index) => {
    if (typeof stop === 'string') {
      return {
        t: stops.length === 1 ? 0 : index / (stops.length - 1),
        color: stop,
      };
    }
    return stop;
  });

  const normalized: PerceptualGradientStop[] = [];
  for (const stop of rawStops) {
    try {
      normalized.push({
        t: clamp01(finiteNumber(stop.t, 0)),
        color: normalizeHexColor(stop.color),
      });
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : 'Invalid color stop skipped.');
    }
  }

  if (normalized.length === 0) {
    warnings.push('All supplied colors were invalid; using viridis fallback.');
    return normalizedStops(SCIENTIFIC_COLOR_MAPS.viridis, warnings);
  }
  if (normalized.length === 1) {
    normalized.push({ t: 1, color: normalized[0].color });
  }
  normalized.sort((a, b) => a.t - b.t);
  normalized[0] = { ...normalized[0], t: 0 };
  normalized[normalized.length - 1] = { ...normalized[normalized.length - 1], t: 1 };
  return normalized;
}

function findSegment(
  stops: readonly PerceptualGradientStop[],
  t: number
): [PerceptualGradientStop, PerceptualGradientStop] {
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].t && t <= stops[i + 1].t) {
      return [stops[i], stops[i + 1]];
    }
  }
  return [stops[stops.length - 2], stops[stops.length - 1]];
}

function deltas(colors: readonly string[], options: PerceptualDistanceOptions): number[] {
  const values: number[] = [];
  for (let i = 1; i < colors.length; i++) {
    values.push(perceptualDistance(hexToSrgb(colors[i - 1]), hexToSrgb(colors[i]), options));
  }
  return values;
}

function stats(values: readonly number[]): {
  minDeltaE: number;
  maxDeltaE: number;
  meanDeltaE: number;
} {
  if (values.length === 0) return { minDeltaE: 0, maxDeltaE: 0, meanDeltaE: 0 };
  const minDeltaE = Math.min(...values);
  const maxDeltaE = Math.max(...values);
  const meanDeltaE = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { minDeltaE, maxDeltaE, meanDeltaE };
}

export function buildPerceptualGradient(
  stops: readonly (string | PerceptualGradientStop)[],
  options: PerceptualColorPassOptions = {}
): PerceptualGradientResult {
  const warnings: string[] = [];
  const normalized = normalizedStops(stops, warnings);
  const steps = Math.max(2, Math.floor(finiteNumber(options.steps, 7)));
  const colors: string[] = [];
  const sampledStops: PerceptualGradientStop[] = [];

  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const [a, b] = findSegment(normalized, t);
    const localT = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
    const color =
      t <= 0
        ? a.color
        : t >= 1
          ? b.color
          : srgbToHex(perceptualLerp(hexToSrgb(a.color), hexToSrgb(b.color), localT));
    colors.push(color);
    sampledStops.push({ t, color });
  }

  const distanceOptions = {
    dampening: options.dampening ?? DEFAULT_DAMPENING,
    steps: options.arcSteps ?? 24,
  };
  const deltaE = deltas(colors, distanceOptions);
  return {
    stops: sampledStops,
    colors,
    deltaE,
    ...stats(deltaE),
  };
}

export function buildPerceptualPalette(
  colors: readonly string[],
  options: PerceptualColorPassOptions = {}
): PerceptualPaletteResult {
  const warnings: string[] = [];
  const normalized = normalizedStops(colors, warnings).map((stop) => stop.color);
  const distanceOptions = {
    dampening: options.dampening ?? DEFAULT_DAMPENING,
    steps: options.arcSteps ?? 24,
  };
  const pairwiseDeltaE = deltas(normalized, distanceOptions);
  const neutral =
    options.neutralAxis === true
      ? normalized.map((color) => srgbToHex(nearestNeutral(hexToSrgb(color))))
      : undefined;
  return {
    colors: normalized,
    pairwiseDeltaE,
    ...stats(pairwiseDeltaE),
    nearestNeutral: neutral,
  };
}

function resolveColorMap(
  colorMap: PerceptualColorPassInput['colorMap'],
  warnings: string[]
): { name: string; stops: readonly (string | PerceptualGradientStop)[] } | undefined {
  if (typeof colorMap === 'string') {
    const key = colorMap.trim().toLowerCase();
    const stops = SCIENTIFIC_COLOR_MAPS[key];
    if (stops) return { name: key, stops };
    warnings.push(`Unknown color map "${colorMap}"; using viridis.`);
    return { name: 'viridis', stops: SCIENTIFIC_COLOR_MAPS.viridis };
  }
  if (Array.isArray(colorMap)) {
    return { name: 'custom', stops: colorMap };
  }
  return undefined;
}

function metricWarnings(
  result: PerceptualGradientResult | PerceptualPaletteResult,
  targetDeltaE: number
): string[] {
  if (targetDeltaE <= 0) return [];
  const minDeltaE = result.minDeltaE;
  if (minDeltaE === 0 || minDeltaE >= targetDeltaE) return [];
  return [
    `Minimum adjacent perceptual distance ${minDeltaE.toFixed(2)} is below target ${targetDeltaE}.`,
  ];
}

export function analyzePerceptualColor(color: string): {
  color: string;
  lightness: number;
  chroma: number;
  hue: number;
  nearestNeutral: string;
} {
  const normalized = normalizeHexColor(color);
  const rgb = hexToSrgb(normalized);
  return {
    color: normalized,
    lightness: lightness(rgb),
    chroma: chroma(rgb),
    hue: hue(rgb),
    nearestNeutral: srgbToHex(nearestNeutral(rgb)),
  };
}

export function applyPerceptualColorPass(
  input: PerceptualColorPassInput
): PerceptualColorPassResult {
  const warnings: string[] = [];
  const targetDeltaE = finiteNumber(input.targetDeltaE, 8);
  const options: PerceptualColorPassOptions = {
    steps: input.steps,
    dampening: input.dampening ?? DEFAULT_DAMPENING,
    arcSteps: input.arcSteps,
    targetDeltaE,
    neutralAxis: input.neutralAxis,
  };

  const resolvedMap = resolveColorMap(input.colorMap, warnings);
  if (resolvedMap) {
    const gradient = buildPerceptualGradient(resolvedMap.stops, options);
    const colorMap: PerceptualColorMapResult = { name: resolvedMap.name, ...gradient };
    warnings.push(...metricWarnings(gradient, targetDeltaE));
    return {
      algorithm: 'perceptual_lerp_delta_e2000',
      source: 'color_map',
      scientific: input.scientific ?? true,
      targetDeltaE,
      dampening: options.dampening ?? DEFAULT_DAMPENING,
      gradient,
      colorMap,
      warnings,
    };
  }

  if (input.gradient) {
    const gradient = buildPerceptualGradient(input.gradient, options);
    warnings.push(...metricWarnings(gradient, targetDeltaE));
    return {
      algorithm: 'perceptual_lerp_delta_e2000',
      source: 'gradient',
      scientific: input.scientific ?? false,
      targetDeltaE,
      dampening: options.dampening ?? DEFAULT_DAMPENING,
      gradient,
      warnings,
    };
  }

  const palette = buildPerceptualPalette(input.palette ?? SCIENTIFIC_COLOR_MAPS.viridis, options);
  const shouldSamplePalette = input.steps !== undefined && input.steps > palette.colors.length;
  const gradient = shouldSamplePalette
    ? buildPerceptualGradient(palette.colors, options)
    : undefined;
  warnings.push(...metricWarnings(gradient ?? palette, targetDeltaE));
  return {
    algorithm: 'perceptual_lerp_delta_e2000',
    source: 'palette',
    scientific: input.scientific ?? false,
    targetDeltaE,
    dampening: options.dampening ?? DEFAULT_DAMPENING,
    palette,
    gradient,
    warnings,
  };
}
