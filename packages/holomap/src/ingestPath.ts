/**
 * Scene ingest path for dual-path benchmarks (Marble compatibility vs HoloMap native).
 * Operators use plain-language labels; this module maps env / argv / profiles.
 */

export type IngestPath = 'marble' | 'holomap' | 'both';

export interface ReconstructionProfileMeta {
  id: string;
  plainName: string;
  ingestPath: IngestPath;
  description: string;
}

export type HoloMapVertical = 'base' | 'indoor' | 'outdoor' | 'object';

export interface HoloMapVerticalProfile {
  id: string;
  vertical: HoloMapVertical;
  modelId: string;
  plainName: string;
  intendedTraits: string[];
  description: string;
}

export const RECONSTRUCTION_PROFILES: Record<string, ReconstructionProfileMeta> = {
  'compatibility-marble': {
    id: 'compatibility-marble',
    plainName: 'Compatibility scene (Marble)',
    ingestPath: 'marble',
    description: 'Default for paper deadlines; legacy manifest semantics.',
  },
  'native-holomap-v1': {
    id: 'native-holomap-v1',
    plainName: 'Native scene (HoloMap)',
    ingestPath: 'holomap',
    description: 'WebGPU reconstruction path with SimulationContract binding on manifest.',
  },
  'compare-both': {
    id: 'compare-both',
    plainName: 'Compare compatibility and native',
    ingestPath: 'both',
    description: 'Runs both probes and emits a comparison table.',
  },
};

export const HOLOMAP_VERTICAL_PROFILES: Record<HoloMapVertical, HoloMapVerticalProfile> = {
  base: {
    id: 'native-holomap-v1',
    vertical: 'base',
    modelId: 'holomap/base-v1',
    plainName: 'HoloMap Base',
    intendedTraits: ['reconstruction_source', 'drift_corrected'],
    description: 'General-purpose reconstruction baseline with balanced quality/perf.',
  },
  indoor: {
    id: 'native-holomap-indoor-v1',
    vertical: 'indoor',
    modelId: 'holomap/indoor-v1',
    plainName: 'HoloMap Indoor',
    intendedTraits: ['reconstruction_source', 'slam_heavy', 'low_light'],
    description: 'Indoor SLAM-heavy scenes with stronger loop-closure priors.',
  },
  outdoor: {
    id: 'native-holomap-outdoor-v1',
    vertical: 'outdoor',
    modelId: 'holomap/outdoor-v1',
    plainName: 'HoloMap Outdoor',
    intendedTraits: ['reconstruction_source', 'geospatial', 'scale_ambiguous'],
    description: 'Outdoor/urban scenes with stronger global scale stabilization.',
  },
  object: {
    id: 'native-holomap-object-v1',
    vertical: 'object',
    modelId: 'holomap/object-v1',
    plainName: 'HoloMap Object',
    intendedTraits: ['reconstruction_source', 'close_range_scan', 'turntable_capture'],
    description: 'Close-range object scans with fine local geometry priors.',
  },
};

function normalizeIngestPath(raw: string): IngestPath {
  const s = raw.trim().toLowerCase();
  if (s === 'marble' || s === 'holomap' || s === 'both') {
    return s;
  }
  throw new Error(
    `Invalid ingest path "${raw}". Use marble | holomap | both (or set HOLOSCRIPT_RECONSTRUCTION_PROFILE).`,
  );
}

/** Resolve argv like `--ingest-path=marble` (Vitest forwards args after `--`). */
export function parseIngestPathArgv(argv: string[]): string | undefined {
  for (const a of argv) {
    if (a.startsWith('--ingest-path=')) {
      return a.slice('--ingest-path='.length);
    }
  }
  return undefined;
}

export function parseVerticalArgv(argv: string[]): string | undefined {
  for (const a of argv) {
    if (a.startsWith('--holomap-vertical=')) {
      return a.slice('--holomap-vertical='.length);
    }
  }
  return undefined;
}

function normalizeVertical(raw: string): HoloMapVertical {
  const s = raw.trim().toLowerCase();
  if (s === 'base' || s === 'indoor' || s === 'outdoor' || s === 'object') {
    return s;
  }
  throw new Error(
    `Invalid HoloMap vertical "${raw}". Use base | indoor | outdoor | object.`,
  );
}

/**
 * Canonical resolution order: argv flag → HOLOSCRIPT_INGEST_PATH → INGEST_PATH →
 * HOLOSCRIPT_RECONSTRUCTION_PROFILE → default `marble`.
 */
export function resolveIngestPath(proc: {
  argv: string[];
  env: NodeJS.ProcessEnv;
}): IngestPath {
  const fromArgv = parseIngestPathArgv(proc.argv);
  if (fromArgv) {
    return normalizeIngestPath(fromArgv);
  }

  const envDirect = proc.env.HOLOSCRIPT_INGEST_PATH ?? proc.env.INGEST_PATH;
  if (envDirect) {
    return normalizeIngestPath(envDirect);
  }

  const profileId = proc.env.HOLOSCRIPT_RECONSTRUCTION_PROFILE?.trim();
  if (profileId) {
    const meta = RECONSTRUCTION_PROFILES[profileId];
    if (!meta) {
      throw new Error(
        `Unknown HOLOSCRIPT_RECONSTRUCTION_PROFILE "${profileId}". ` +
          `Known: ${Object.keys(RECONSTRUCTION_PROFILES).join(', ')}`,
      );
    }
    return meta.ingestPath;
  }

  return 'marble';
}

export function getIngestPathLabel(path: IngestPath): string {
  switch (path) {
    case 'marble':
      return 'Compatibility scene (Marble)';
    case 'holomap':
      return 'Native scene (HoloMap)';
    case 'both':
      return 'Compare both';
    default:
      return path;
  }
}

export function resolveHoloMapVertical(proc: {
  argv: string[];
  env: NodeJS.ProcessEnv;
}): HoloMapVertical {
  const fromArgv = parseVerticalArgv(proc.argv);
  if (fromArgv) {
    return normalizeVertical(fromArgv);
  }

  const fromEnv = proc.env.HOLOSCRIPT_HOLOMAP_VERTICAL ?? proc.env.HOLOMAP_VERTICAL;
  if (fromEnv) {
    return normalizeVertical(fromEnv);
  }

  return 'base';
}

export function selectHoloMapVerticalFromTraits(traits: string[]): HoloMapVertical {
  const normalized = new Set(traits.map((t) => t.trim().toLowerCase()));

  if (
    normalized.has('close_range_scan') ||
    normalized.has('turntable_capture') ||
    normalized.has('object_scan')
  ) {
    return 'object';
  }

  if (
    normalized.has('geospatial') ||
    normalized.has('outdoor') ||
    normalized.has('scale_ambiguous')
  ) {
    return 'outdoor';
  }

  if (
    normalized.has('slam_heavy') ||
    normalized.has('indoor') ||
    normalized.has('low_light')
  ) {
    return 'indoor';
  }

  return 'base';
}

export function getHoloMapVerticalProfile(vertical: HoloMapVertical): HoloMapVerticalProfile {
  return HOLOMAP_VERTICAL_PROFILES[vertical];
}
