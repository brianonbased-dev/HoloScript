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
