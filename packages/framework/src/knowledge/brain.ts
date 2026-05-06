/**
 * Knowledge Brain — Domain-specific consolidation, excitability, half-lives.
 *
 * Absorbed from mcp-server/src/holomesh/types.ts (V9/V11 neuroscience model).
 * The knowledge store uses these for search ranking, decay, and consolidation.
 */

// ── Domains ──

export const KNOWLEDGE_DOMAINS = [
  'security',
  'rendering',
  'agents',
  'compilation',
  'general',
] as const;

export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];
export type MemoryRetentionState = 'candidate' | 'retained' | 'quarantined' | 'rejected';
export type MemoryHashAlgorithm = 'sha256' | 'git-blob' | 'cid' | 'custom';

// ── Consolidation Config ──

export interface DomainConsolidationConfig {
  hotBufferTTL: number;
  sleepFrequencyMs: number;
  maxEntries: number;
  competitionMetric: 'citation_count' | 'query_frequency' | 'peer_corroboration';
  downscaleFactor: number;
  minCorroborations: number;
}

export const DOMAIN_CONSOLIDATION: Record<KnowledgeDomain, DomainConsolidationConfig> = {
  security: {
    hotBufferTTL: 1 * 60 * 60 * 1000,
    sleepFrequencyMs: 6 * 60 * 60 * 1000,
    maxEntries: 50,
    competitionMetric: 'peer_corroboration',
    downscaleFactor: 0.85,
    minCorroborations: 2,
  },
  rendering: {
    hotBufferTTL: 24 * 60 * 60 * 1000,
    sleepFrequencyMs: 24 * 60 * 60 * 1000,
    maxEntries: 200,
    competitionMetric: 'query_frequency',
    downscaleFactor: 0.95,
    minCorroborations: 1,
  },
  agents: {
    hotBufferTTL: 12 * 60 * 60 * 1000,
    sleepFrequencyMs: 12 * 60 * 60 * 1000,
    maxEntries: 150,
    competitionMetric: 'query_frequency',
    downscaleFactor: 0.9,
    minCorroborations: 1,
  },
  compilation: {
    hotBufferTTL: 12 * 60 * 60 * 1000,
    sleepFrequencyMs: 12 * 60 * 60 * 1000,
    maxEntries: 100,
    competitionMetric: 'citation_count',
    downscaleFactor: 0.9,
    minCorroborations: 1,
  },
  general: {
    hotBufferTTL: 6 * 60 * 60 * 1000,
    sleepFrequencyMs: 12 * 60 * 60 * 1000,
    maxEntries: 300,
    competitionMetric: 'query_frequency',
    downscaleFactor: 0.92,
    minCorroborations: 1,
  },
};

// ── Half-Lives ──

export const DOMAIN_HALF_LIVES: Record<KnowledgeDomain, number> = {
  security: 2 * 24 * 60 * 60 * 1000, // 2 days
  rendering: 14 * 24 * 60 * 60 * 1000, // 14 days
  agents: 7 * 24 * 60 * 60 * 1000, // 7 days
  compilation: 21 * 24 * 60 * 60 * 1000, // 21 days
  general: 7 * 24 * 60 * 60 * 1000, // 7 days
};

// ── Hot Buffer ──

export interface HotBufferEntry {
  id: string;
  domain: KnowledgeDomain;
  content: string;
  type: string;
  authorDid: string;
  tags: string[];
  ingestedAt: number;
  corroborations: string[];
  sourcePeerDid: string;
  retentionState: MemoryRetentionState;
  memoryReceipt?: MemoryReceipt;
}

export interface MemorySourceHash {
  sourceId: string;
  hash: string;
  algorithm: MemoryHashAlgorithm;
  path?: string;
  uri?: string;
}

export interface MemoryModelIdentity {
  provider?: string;
  model?: string;
  agentId?: string;
  agentName?: string;
  surface?: string;
}

export interface MemoryToolIdentity {
  toolName: string;
  toolVersion?: string;
  runtime?: string;
}

/**
 * Provenance lineage required before a candidate memory can be retained.
 *
 * Dreaming-like automation needs source hashes, extractor versions, and
 * corroboration thresholds before promotion. Every entry that survives
 * consolidation and reaches cold store MUST carry a receipt.
 */
export interface MemoryReceipt {
  id: string;
  rawSourceIds: string[];
  sourceHashes: MemorySourceHash[];
  extractorVersion: string;
  modelIdentity: MemoryModelIdentity;
  toolIdentity: MemoryToolIdentity;
  timestamp: number;
  corroborators: string[];
  confidence: number;
  sessionId?: string;
  taskId?: string;
  commitHash?: string;
  metadata?: Record<string, unknown>;
}

// ── Excitability ──

export interface ExcitabilityMetadata {
  queryCount: number;
  citationCount: number;
  corroborationCount: number;
  excitability: number;
  lastRetrievedAt: number;
  lastReconsolidatedAt: number;
  consolidationSurvivals: number;
}

/** Compute excitability score from metadata. */
export function computeExcitability(meta: Omit<ExcitabilityMetadata, 'excitability'>): number {
  return (
    2 * meta.queryCount +
    3 * meta.citationCount +
    1.5 * meta.corroborationCount +
    0.5 * meta.consolidationSurvivals
  );
}

/** Apply domain half-life decay to a score. */
export function applyHalfLifeDecay(score: number, ageMs: number, domain: KnowledgeDomain): number {
  const halfLife = DOMAIN_HALF_LIVES[domain] || DOMAIN_HALF_LIVES.general;
  return score * Math.pow(0.5, ageMs / halfLife);
}

// ── Consolidation Result ──

export interface ConsolidationResult {
  domain: KnowledgeDomain;
  promoted: number;
  merged: number;
  evicted: number;
  dropped: number;
  quarantined: number;
  rejected: number;
  downscaleFactor: number;
  consolidatedAt: number;
}

// ── Reconsolidation ──

export interface ReconsolidationEvent {
  entryId: string;
  domain: KnowledgeDomain;
  retrievedAt: number;
  excitabilityDelta: number;
  windowOpen: boolean;
  windowClosesAt: number;
}

/** Default reconsolidation window duration (5 minutes). */
export const RECONSOLIDATION_WINDOW_MS = 5 * 60 * 1000;

/** Create a reconsolidation event when an entry is retrieved. */
export function triggerReconsolidation(
  entryId: string,
  domain: KnowledgeDomain,
  excitabilityDelta: number
): ReconsolidationEvent {
  const now = Date.now();
  return {
    entryId,
    domain,
    retrievedAt: now,
    excitabilityDelta,
    windowOpen: true,
    windowClosesAt: now + RECONSOLIDATION_WINDOW_MS,
  };
}

/** Fast deterministic string hash (cyrb53 variant) for sourceHash computation. */
export function hashString(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}
