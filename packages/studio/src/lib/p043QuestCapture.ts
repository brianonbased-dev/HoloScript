export const P043_QUEST_SKU_ID = 'quest3-adreno740';
export const P043_SAMPLE_SECONDS = 60;
export const P043_WARMUP_SECONDS = 5;
export const P043_REQUIRED_RUNS = 3;
export const P043_FRAME_BUDGET_MS = 1000 / 90;

export type P043QuestSceneId = 'indoor-500k' | 'outdoor-1m' | 'dense-2m';

export interface P043QuestScene {
  id: P043QuestSceneId;
  label: string;
  gaussianCount: number;
  fixture: string;
}

export interface P043QuestCell {
  id: string;
  skuId: typeof P043_QUEST_SKU_ID;
  sceneId: P043QuestSceneId;
  sceneFixture: string;
  gaussianCount: number;
  views: number;
  artifactPath: string;
}

export interface P043Metric {
  samples: number[];
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export type JsonRecord = Record<string, unknown>;

export const P043_QUEST_SCENES: readonly P043QuestScene[] = Object.freeze([
  {
    id: 'indoor-500k',
    label: 'Indoor room scan',
    gaussianCount: 500000,
    fixture: 'benchmarks/p043-multiview/scenes/indoor-500k.splat',
  },
  {
    id: 'outdoor-1m',
    label: 'Outdoor plaza scan',
    gaussianCount: 1000000,
    fixture: 'benchmarks/p043-multiview/scenes/outdoor-1m.splat',
  },
  {
    id: 'dense-2m',
    label: 'Dense foliage / high-overdraw scan',
    gaussianCount: 2000000,
    fixture: 'benchmarks/p043-multiview/scenes/dense-2m.splat',
  },
]);

export const P043_QUEST_VIEW_COUNTS = Object.freeze([2, 3, 4]);

export function artifactPathForP043QuestCell(cell: Pick<P043QuestCell, 'sceneId' | 'views'>): string {
  return `.bench-logs/p043-sku-matrix/${P043_QUEST_SKU_ID}/${cell.sceneId}/n${cell.views}.json`;
}

export function buildP043QuestCells(): P043QuestCell[] {
  const cells: P043QuestCell[] = [];
  for (const scene of P043_QUEST_SCENES) {
    for (const views of P043_QUEST_VIEW_COUNTS) {
      const cell = {
        id: `${P043_QUEST_SKU_ID}__${scene.id}__n${views}`,
        skuId: P043_QUEST_SKU_ID,
        sceneId: scene.id,
        sceneFixture: scene.fixture,
        gaussianCount: scene.gaussianCount,
        views,
        artifactPath: `.bench-logs/p043-sku-matrix/${P043_QUEST_SKU_ID}/${scene.id}/n${views}.json`,
      } satisfies P043QuestCell;
      cells.push(cell);
    }
  }
  return cells;
}

export function parseP043QuestCellId(cellId: string): P043QuestCell | null {
  const match = /^quest3-adreno740__(indoor-500k|outdoor-1m|dense-2m)__n(2|3|4)$/.exec(cellId);
  if (!match) return null;
  const sceneId = match[1] as P043QuestSceneId;
  const views = Number(match[2]);
  const scene = P043_QUEST_SCENES.find((candidate) => candidate.id === sceneId);
  if (!scene) return null;
  return {
    id: cellId,
    skuId: P043_QUEST_SKU_ID,
    sceneId,
    sceneFixture: scene.fixture,
    gaussianCount: scene.gaussianCount,
    views,
    artifactPath: artifactPathForP043QuestCell({ sceneId, views }),
  };
}

export function metric(samples: readonly number[]): P043Metric {
  const rounded = samples.map((value) => Number(value.toFixed(4)));
  const sorted = [...rounded].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  return {
    samples: rounded,
    avg: Number(avg.toFixed(4)),
    p50: Number(percentile(sorted, 50).toFixed(4)),
    p95: Number(percentile(sorted, 95).toFixed(4)),
    p99: Number(percentile(sorted, 99).toFixed(4)),
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

export function normalizeQuestAdapterInfo(adapterInfo: unknown): JsonRecord {
  const base =
    adapterInfo !== null && typeof adapterInfo === 'object' && !Array.isArray(adapterInfo)
      ? { ...(adapterInfo as JsonRecord) }
      : {};

  return {
    vendor: typeof base.vendor === 'string' && base.vendor ? base.vendor : 'Qualcomm',
    device: typeof base.device === 'string' && base.device ? base.device : 'Adreno 740',
    architecture:
      typeof base.architecture === 'string' && base.architecture ? base.architecture : 'Adreno',
    description:
      typeof base.description === 'string' && base.description
        ? base.description
        : 'Meta Quest 3 Snapdragon XR2 Gen 2 Adreno 740',
    source:
      typeof base.source === 'string' && base.source
        ? base.source
        : 'Quest Browser WebGPU adapter info with Quest metadata fallback',
    rawAdapterInfo: base,
  };
}

export interface BuildP043QuestArtifactInput {
  cell: P043QuestCell;
  runSamples: number[][];
  checksum: number;
  adapterInfo: unknown;
  browserVersion: string;
  osVersion: string;
  browserShell: string;
  batteryState: string;
  thermalState: string;
  sampleSeconds?: number;
  warmupSeconds?: number;
  requiredRuns?: number;
  runId?: string;
  url?: string;
  notes?: string[];
  failures?: JsonRecord[];
}

export function buildP043QuestArtifact(input: BuildP043QuestArtifactInput): JsonRecord {
  const sampleSeconds = input.sampleSeconds ?? P043_SAMPLE_SECONDS;
  const warmupSeconds = input.warmupSeconds ?? P043_WARMUP_SECONDS;
  const requiredRuns = input.requiredRuns ?? P043_REQUIRED_RUNS;
  const frameSamples = input.runSamples.flat();
  const frameMetric = metric(frameSamples);

  return {
    schema_version: 'p043-shared-sort-capture-v1',
    benchmark: 'p043-cross-vendor-shared-sort',
    status: 'completed',
    captureMode: 'quest-browser-webgpu',
    runner: 'packages/studio/src/app/p043-quest-capture/page.tsx',
    generatedAt: new Date().toISOString(),
    cellId: input.cell.id,
    skuId: input.cell.skuId,
    sceneId: input.cell.sceneId,
    sceneFixture: input.cell.sceneFixture,
    fixtureMode: 'deterministic-synthetic-quest-browser',
    requestedGaussianCount: input.cell.gaussianCount,
    gaussianCount: input.cell.gaussianCount,
    views: input.cell.views,
    sampleSeconds,
    warmupSeconds,
    requiredRuns,
    adapterInfo: normalizeQuestAdapterInfo(input.adapterInfo),
    browserVersion: input.browserVersion,
    osVersion: input.osVersion,
    browserShell: input.browserShell,
    batteryState: input.batteryState,
    thermalState: input.thermalState,
    runId: input.runId ?? null,
    sourceUrl: input.url ?? null,
    frameTimeMs: frameMetric,
    perUserFrameTimeMs: {
      p95: Number((frameMetric.p95 / Math.max(1, input.cell.views)).toFixed(4)),
    },
    sharedSortMs: frameMetric,
    visibilityMaskMs: frameMetric,
    droppedFrameCount: frameSamples.filter((value) => value > P043_FRAME_BUDGET_MS).length,
    runs: input.runSamples.map((samples, index) => ({
      run: index + 1,
      sampleCount: samples.length,
      frameBudgetMs: P043_FRAME_BUDGET_MS,
      frameTimeMs: metric(samples),
    })),
    checksum: input.checksum >>> 0,
    notes: [
      'Quest Browser WebGPU runner executes splat-shared-sort.wgsl directly in the headset session.',
      'sharedSortMs and visibilityMaskMs both report the fused preprocess dispatch because the WGSL computes distance keys and bitmasks in one pass.',
      ...(input.notes ?? []),
    ],
    failures: input.failures ?? [],
  };
}

export interface P043QuestArtifactValidation {
  ok: boolean;
  cell: P043QuestCell | null;
  errors: string[];
}

export function validateP043QuestArtifact(artifact: unknown): P043QuestArtifactValidation {
  const errors: string[] = [];
  const obj = asRecord(artifact);
  const cellId = typeof obj.cellId === 'string' ? obj.cellId : '';
  const cell = parseP043QuestCellId(cellId);
  if (!cell) errors.push('cellId must be a Quest 3 P043 matrix cell');
  if (obj.skuId !== P043_QUEST_SKU_ID) errors.push(`skuId must be ${P043_QUEST_SKU_ID}`);
  if (obj.status !== 'completed') errors.push('status must be completed');

  const captureMode = String(obj.captureMode ?? '');
  if (!captureMode) errors.push('captureMode is required');
  if (captureMode.toLowerCase().includes('smoke')) {
    errors.push('captureMode must not be smoke');
  }

  if (Number(obj.requiredRuns) !== P043_REQUIRED_RUNS) {
    errors.push(`requiredRuns must be ${P043_REQUIRED_RUNS}`);
  }
  if (!Array.isArray(obj.runs) || obj.runs.length < P043_REQUIRED_RUNS) {
    errors.push(`runs must contain at least ${P043_REQUIRED_RUNS} entries`);
  }
  if (!Array.isArray(getPath(obj, 'frameTimeMs.samples')) || getPath(obj, 'frameTimeMs.samples.length') === 0) {
    errors.push('frameTimeMs.samples must be a non-empty array');
  }

  for (const path of [
    'frameTimeMs.p50',
    'frameTimeMs.p95',
    'frameTimeMs.p99',
    'perUserFrameTimeMs.p95',
    'sharedSortMs.p95',
    'visibilityMaskMs.p95',
    'droppedFrameCount',
    'thermalState',
    'batteryState',
    'browserVersion',
    'osVersion',
  ]) {
    if (getPath(obj, path) === undefined) errors.push(`${path} is required`);
  }

  const adapterText = adapterIdentityText(obj.adapterInfo);
  if (!adapterText.includes('adreno')) errors.push('adapterInfo must include adreno');
  if (!adapterText.includes('qualcomm')) errors.push('adapterInfo must include qualcomm');

  return { ok: errors.length === 0, cell, errors };
}

function asRecord(input: unknown): JsonRecord {
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as JsonRecord)
    : {};
}

function getPath(obj: unknown, dottedPath: string): unknown {
  let current: unknown = obj;
  for (const part of dottedPath.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
    current = (current as JsonRecord)[part];
  }
  return current;
}

function adapterIdentityText(adapterInfo: unknown): string {
  if (adapterInfo == null) return '';
  if (typeof adapterInfo === 'string') return adapterInfo.toLowerCase();
  try {
    return JSON.stringify(adapterInfo).toLowerCase();
  } catch {
    return String(adapterInfo).toLowerCase();
  }
}
