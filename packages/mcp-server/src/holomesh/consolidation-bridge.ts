/**
 * HoloMesh Consolidation Bridge — Wire ConsolidationEngine into live HoloMesh.
 *
 * Provides explicit trigger paths from HoloMesh knowledge/session reports
 * into the pure ConsolidationEngine ( Framework ).
 *
 * Triggers:
 *   - timer      : periodic sleep cycle (daemon)
 *   - entropy    : auto-fire when hot-buffer entropy or cross-entry conflict detected
 *   - manual     : HTTP route or admin action
 *
 * Outputs:
 *   - reviewed quarantine set (safe Dreaming pattern)
 *   - run logs with rollback / discard behavior
 *   - cold-store snapshots per cycle
 */

import {
  ConsolidationEngine,
  validateMemoryReceipt,
  type ColdStoreEntry,
  type QuarantinedMemoryEntry,
  type ConsolidationResult,
} from '@holoscript/framework';
import type { KnowledgeDomain, MemoryReceipt, MemorySourceHash } from '@holoscript/framework';
import { KNOWLEDGE_DOMAINS } from '@holoscript/framework';
import type { MeshKnowledgeEntry } from './types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { HOLOMESH_DATA_DIR, atomicWriteJSON, readJSON } from './state';

// ── Persistence ──

const BRIDGE_DATA_DIR = path.join(HOLOMESH_DATA_DIR, 'consolidation');
const LOG_PATH = path.join(BRIDGE_DATA_DIR, 'run-logs.json');
const SNAPSHOT_PATH = path.join(BRIDGE_DATA_DIR, 'cold-store-snapshot.json');

function ensureDir(): void {
  if (!fs.existsSync(BRIDGE_DATA_DIR)) {
    fs.mkdirSync(BRIDGE_DATA_DIR, { recursive: true });
  }
}

// ── Run Log Types ──

export type ConsolidationTrigger = 'timer' | 'entropy' | 'manual' | 'conflict';

export interface ConsolidationRunLog {
  id: string;
  startedAt: number;
  finishedAt: number;
  trigger: ConsolidationTrigger;
  results: ConsolidationResult[];
  promotedEntryIds: string[];
  quarantinedEntryIds: string[];
  rejectedEntryIds: string[];
  rolledBack: boolean;
  rollbackAt?: number;
  reason?: string;
}

export interface RollbackOptions {
  /** Max cycles to roll back (default 1) */
  depth?: number;
  /** Only rollback entries from a specific domain */
  domain?: KnowledgeDomain;
}

export interface ReviewSet {
  quarantined: QuarantinedMemoryEntry[];
  rejected: QuarantinedMemoryEntry[];
  stats: {
    quarantinedCount: number;
    rejectedCount: number;
    oldestQuarantineAgeMs: number;
  };
}

// ── Helpers ──

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function buildMemoryReceipt(entry: MeshKnowledgeEntry, sourcePeerDid: string): MemoryReceipt {
  const now = Date.now();
  const rawSourceIds = [entry.id];
  if (entry.authorId) {
    rawSourceIds.push(`author:${entry.authorId}`);
  }
  const sourceHashes: MemorySourceHash[] = [
    {
      sourceId: entry.id,
      hash: entry.provenanceHash || hashContent(entry.content),
      algorithm: 'sha256',
    },
  ];
  if (entry.authorId) {
    sourceHashes.push({
      sourceId: `author:${entry.authorId}`,
      hash: hashContent(entry.authorId + entry.content),
      algorithm: 'custom',
    });
  }
  return {
    id: `receipt_${entry.id}_${now}`,
    rawSourceIds,
    sourceHashes,
    extractorVersion: 'holomesh-consolidation-bridge@1.0.0',
    modelIdentity: {
      agentId: sourcePeerDid,
      agentName: 'holomesh-bridge',
    },
    toolIdentity: {
      toolName: 'knowledge-ingestion',
      toolVersion: '1.0.0',
      runtime: 'mcp-server',
    },
    timestamp: now,
    corroborators: [sourcePeerDid],
    confidence: entry.confidence ?? 0.9,
    metadata: {
      workspaceId: entry.workspaceId,
      domain: entry.domain,
      tags: entry.tags,
      price: entry.price,
    },
  };
}

function buildSessionReportReceipt(
  content: string,
  sessionId: string,
  agentId: string,
  taskId?: string,
  commitHash?: string
): MemoryReceipt {
  const now = Date.now();
  return {
    id: `receipt_session_${sessionId}_${now}`,
    rawSourceIds: [sessionId, taskId].filter((s): s is string => Boolean(s)),
    sourceHashes: [
      {
        sourceId: sessionId,
        hash: hashContent(content),
        algorithm: 'sha256',
      },
    ],
    extractorVersion: 'holomesh-session-bridge@1.0.0',
    modelIdentity: {
      agentId,
      agentName: 'holomesh-bridge',
    },
    toolIdentity: {
      toolName: 'session-report-ingestion',
      toolVersion: '1.0.0',
      runtime: 'mcp-server',
    },
    timestamp: now,
    corroborators: [agentId],
    confidence: 0.85,
    sessionId,
    taskId,
    commitHash,
    metadata: {
      source: 'session-report',
    },
  };
}

function resolveDomain(entry: MeshKnowledgeEntry): KnowledgeDomain {
  const raw = (entry.domain || 'general').toLowerCase();
  if (KNOWLEDGE_DOMAINS.includes(raw as KnowledgeDomain)) return raw as KnowledgeDomain;
  // Map common aliases
  if (raw.includes('security')) return 'security';
  if (raw.includes('render')) return 'rendering';
  if (raw.includes('agent')) return 'agents';
  if (raw.includes('compil')) return 'compilation';
  return 'general';
}

// ── Entropy Detection ──

interface EntropySnapshot {
  timestamp: number;
  hotBufferSizes: Record<string, number>;
  coldStoreSizes: Record<string, number>;
}

function computeEntropyDelta(prev: EntropySnapshot, curr: EntropySnapshot): number {
  let delta = 0;
  for (const domain of KNOWLEDGE_DOMAINS) {
    const hotDelta = Math.abs(
      (curr.hotBufferSizes[domain] || 0) - (prev.hotBufferSizes[domain] || 0)
    );
    const coldDelta = Math.abs(
      (curr.coldStoreSizes[domain] || 0) - (prev.coldStoreSizes[domain] || 0)
    );
    delta += hotDelta * 2 + coldDelta;
  }
  return delta;
}

// ── Bridge ──

export class HoloMeshConsolidationBridge {
  private engine: ConsolidationEngine;
  private runLogs: ConsolidationRunLog[] = [];
  private lastEntropySnapshot: EntropySnapshot | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.engine = new ConsolidationEngine();
    this.loadSnapshot();
    this.loadLogs();
  }

  private captureEntropySnapshot(): EntropySnapshot {
    return {
      timestamp: Date.now(),
      hotBufferSizes: Object.fromEntries(
        this.engine.getHotBufferStats().map((s) => [s.domain, s.count])
      ),
      coldStoreSizes: Object.fromEntries(
        this.engine.getColdStoreStats().map((s) => [s.domain, s.count])
      ),
    };
  }

  // ── Ingestion ──

  /**
   * Ingest a HoloMesh knowledge entry into the hot buffer.
   * Generates a MemoryReceipt from entry provenance fields.
   */
  ingestKnowledgeEntry(entry: MeshKnowledgeEntry, sourcePeerDid: string): string {
    const domain = resolveDomain(entry);
    const hasProvenance = Boolean(entry.provenanceHash && entry.provenanceHash.length >= 64);
    if (!hasProvenance) {
      // Ingest without receipt — will be quarantined on consolidation cycle
      const hot = this.engine.ingest(
        domain,
        {
          content: entry.content,
          type: entry.type || 'wisdom',
          authorDid: entry.authorId || sourcePeerDid,
          tags: entry.tags || [],
        },
        sourcePeerDid
      );
      return hot.id;
    }

    const receipt = buildMemoryReceipt(entry, sourcePeerDid);
    const receiptErrors = validateMemoryReceipt(receipt);
    if (receiptErrors.length > 0) {
      // Receipt invalid — still ingest but without receipt (will be quarantined on cycle)
      const hot = this.engine.ingest(
        domain,
        {
          content: entry.content,
          type: entry.type || 'wisdom',
          authorDid: entry.authorId || sourcePeerDid,
          tags: entry.tags || [],
        },
        sourcePeerDid
      );
      return hot.id;
    }

    const hot = this.engine.ingest(
      domain,
      {
        content: entry.content,
        type: entry.type || 'wisdom',
        authorDid: entry.authorId || sourcePeerDid,
        tags: entry.tags || [],
        memoryReceipt: receipt,
      },
      sourcePeerDid
    );
    return hot.id;
  }

  /**
   * Ingest a session report as a knowledge entry.
   */
  ingestSessionReport(
    content: string,
    sessionId: string,
    agentId: string,
    opts?: { taskId?: string; commitHash?: string; tags?: string[] }
  ): string {
    const receipt = buildSessionReportReceipt(
      content,
      sessionId,
      agentId,
      opts?.taskId,
      opts?.commitHash
    );
    const domain: KnowledgeDomain = 'agents';
    const hot = this.engine.ingest(
      domain,
      {
        content,
        type: 'session-report',
        authorDid: agentId,
        tags: opts?.tags || ['session-report'],
        memoryReceipt: receipt,
      },
      agentId
    );
    return hot.id;
  }

  /**
   * Corroborate an existing hot buffer entry.
   */
  corroborate(domain: KnowledgeDomain, entryId: string, peerDid: string): boolean {
    return this.engine.corroborate(domain, entryId, peerDid);
  }

  // ── Triggers ──

  /** Run a manual consolidation cycle across all overdue domains. */
  triggerManual(reason?: string): ConsolidationResult[] {
    return this.runCycle('manual', reason);
  }

  /** Timer tick — run if any domain is overdue. */
  triggerTimer(): ConsolidationResult[] {
    const needs = this.engine.needsConsolidation().filter((n) => n.overdue);
    if (needs.length === 0) return [];
    return this.runCycle('timer');
  }

  /**
   * Entropy trigger — auto-fire when hot-buffer churn or conflict exceeds threshold.
   * Returns empty if no threshold breach.
   */
  triggerEntropy(threshold: number = 10): ConsolidationResult[] {
    const current = this.captureEntropySnapshot();
    if (!this.lastEntropySnapshot) {
      this.lastEntropySnapshot = current;
      return [];
    }
    const delta = computeEntropyDelta(this.lastEntropySnapshot, current);
    this.lastEntropySnapshot = current;
    if (delta >= threshold) {
      return this.runCycle('entropy', `entropy-delta:${delta}`);
    }
    return [];
  }

  /**
   * Conflict trigger — fire when the ConsolidationEngine detects contradictions
   * or when an external caller observes cross-entry conflicts.
   */
  triggerConflict(conflictReason: string): ConsolidationResult[] {
    return this.runCycle('conflict', conflictReason);
  }

  // ── Core Cycle ──

  private runCycle(trigger: ConsolidationTrigger, reason?: string): ConsolidationResult[] {
    ensureDir();
    const startedAt = Date.now();

    // Snapshot cold-store IDs before cycle for rollback bookkeeping
    const preIds = this.snapshotColdStoreIds();

    // Run consolidation across all overdue domains (or all if forced)
    const force = trigger !== 'timer';
    const results = this.engine.sleepCycle(force);

    // Determine promoted / quarantined / rejected IDs by diffing cold store + quarantine
    const postIds = this.snapshotColdStoreIds();
    const promotedEntryIds = this.diffPromoted(preIds, postIds);
    const allQuarantine = KNOWLEDGE_DOMAINS.flatMap((d) => this.engine.getQuarantine(d));
    const quarantinedEntryIds = allQuarantine
      .filter((q) => q.state === 'quarantined')
      .map((q) => q.entry.id);
    const rejectedEntryIds = allQuarantine
      .filter((q) => q.state === 'rejected')
      .map((q) => q.entry.id);

    const log: ConsolidationRunLog = {
      id: `run_${startedAt}_${trigger}`,
      startedAt,
      finishedAt: Date.now(),
      trigger,
      results,
      promotedEntryIds,
      quarantinedEntryIds,
      rejectedEntryIds,
      rolledBack: false,
      reason,
    };

    this.runLogs.push(log);
    this.trimLogs();
    this.persistLogs();
    this.persistSnapshot();

    return results;
  }

  // ── Rollback / Discard ──

  /**
   * Roll back the last N consolidation cycles.
   * Removes promoted entries that survive the rollback window.
   * Returns count of entries discarded.
   */
  rollback(opts: RollbackOptions = {}): { discarded: number; domains: string[] } {
    const depth = opts.depth ?? 1;
    const targetLogs = this.runLogs.filter((l) => !l.rolledBack).slice(-depth);
    if (targetLogs.length === 0) return { discarded: 0, domains: [] };

    const affectedDomains = new Set<string>();
    let discarded = 0;

    for (const log of targetLogs) {
      for (const entryId of log.promotedEntryIds) {
        // Find which domain the entry lives in
        for (const domain of KNOWLEDGE_DOMAINS) {
          if (this.engine.getColdStoreEntry(domain, entryId)) {
            const removed = this.engine.discardEntry(domain, entryId);
            if (removed) {
              discarded++;
              affectedDomains.add(domain);
            }
            break;
          }
        }
      }
      log.rolledBack = true;
      log.rollbackAt = Date.now();
    }

    this.persistLogs();
    this.persistSnapshot();
    return { discarded, domains: [...affectedDomains] };
  }

  /** Discard a single cold-store entry by ID (admin override). */
  discard(domain: KnowledgeDomain, entryId: string): boolean {
    const removed = this.engine.discardEntry(domain, entryId);
    if (removed) this.persistSnapshot();
    return removed;
  }

  // ── Review Sets ──

  /** Get the full reviewable quarantine + rejected set (safe Dreaming pattern). */
  getReviewSet(): ReviewSet {
    const all = KNOWLEDGE_DOMAINS.flatMap((d) => this.engine.getQuarantine(d));
    const quarantined = all.filter((q) => q.state === 'quarantined');
    const rejected = all.filter((q) => q.state === 'rejected');
    const now = Date.now();
    const ages = quarantined.map((q) => now - q.quarantinedAt);
    return {
      quarantined,
      rejected,
      stats: {
        quarantinedCount: quarantined.length,
        rejectedCount: rejected.length,
        oldestQuarantineAgeMs: ages.length > 0 ? Math.max(...ages) : 0,
      },
    };
  }

  /** Reject a quarantined entry after review. */
  rejectQuarantined(domain: KnowledgeDomain, entryId: string, reason: string): boolean {
    const ok = this.engine.rejectQuarantinedMemory(domain, entryId, reason);
    if (ok) this.persistSnapshot();
    return ok;
  }

  // ── Logs ──

  getRunLogs(): ConsolidationRunLog[] {
    return [...this.runLogs];
  }

  getLatestLog(): ConsolidationRunLog | undefined {
    return this.runLogs[this.runLogs.length - 1];
  }

  // ── Stats ──

  getStats(): {
    hotBuffer: { domain: string; count: number }[];
    coldStore: { domain: string; count: number }[];
    logs: number;
    lastRun?: number;
  } {
    return {
      hotBuffer: this.engine.getHotBufferStats(),
      coldStore: this.engine.getColdStoreStats(),
      logs: this.runLogs.length,
      lastRun:
        this.runLogs.length > 0 ? this.runLogs[this.runLogs.length - 1].finishedAt : undefined,
    };
  }

  // ── Daemon Timer ──

  /** Start periodic timer trigger. Interval in ms (default 6h). */
  startTimer(intervalMs: number = 6 * 60 * 60 * 1000): void {
    this.stopTimer();
    this.timer = setInterval(() => this.triggerTimer(), intervalMs);
    this.timer.unref();
  }

  stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ── Persistence (private) ──

  private snapshotColdStoreIds(): Map<KnowledgeDomain, Set<string>> {
    const map = new Map<KnowledgeDomain, Set<string>>();
    for (const domain of KNOWLEDGE_DOMAINS) {
      const entries = this.engine.getColdStore(domain);
      map.set(domain, new Set(entries.map((e) => e.id)));
    }
    return map;
  }

  private diffPromoted(
    pre: Map<KnowledgeDomain, Set<string>>,
    post: Map<KnowledgeDomain, Set<string>>
  ): string[] {
    const promoted: string[] = [];
    for (const domain of KNOWLEDGE_DOMAINS) {
      const preSet = pre.get(domain) || new Set();
      const postSet = post.get(domain) || new Set();
      for (const id of postSet) {
        if (!preSet.has(id)) promoted.push(id);
      }
    }
    return promoted;
  }

  private trimLogs(max: number = 1000): void {
    if (this.runLogs.length > max) {
      this.runLogs = this.runLogs.slice(-max);
    }
  }

  private persistLogs(): void {
    try {
      atomicWriteJSON(LOG_PATH, this.runLogs);
    } catch {
      /* non-fatal */
    }
  }

  private loadLogs(): void {
    const data = readJSON(LOG_PATH);
    if (Array.isArray(data)) {
      this.runLogs = data;
    }
  }

  private persistSnapshot(): void {
    try {
      const snapshot: Record<string, ColdStoreEntry[]> = {};
      for (const domain of KNOWLEDGE_DOMAINS) {
        snapshot[domain] = this.engine.getColdStore(domain);
      }
      atomicWriteJSON(SNAPSHOT_PATH, snapshot);
    } catch {
      /* non-fatal */
    }
  }

  private loadSnapshot(): void {
    const data = readJSON(SNAPSHOT_PATH);
    if (!data || typeof data !== 'object') return;
    for (const domain of KNOWLEDGE_DOMAINS) {
      const entries = data[domain];
      if (Array.isArray(entries)) {
        this.engine.seedColdStore(domain, entries as ColdStoreEntry[]);
      }
    }
  }
}

// ── Singleton ──

let bridgeInstance: HoloMeshConsolidationBridge | null = null;

export function getConsolidationBridge(): HoloMeshConsolidationBridge {
  if (!bridgeInstance) {
    bridgeInstance = new HoloMeshConsolidationBridge();
  }
  return bridgeInstance;
}

export interface ResetConsolidationBridgeOptions {
  clearPersistence?: boolean;
}

export function resetConsolidationBridge(options: ResetConsolidationBridgeOptions = {}): void {
  bridgeInstance?.stopTimer();
  bridgeInstance = null;
  if (options.clearPersistence) {
    try {
      fs.rmSync(BRIDGE_DATA_DIR, { recursive: true, force: true });
    } catch {
      /* non-fatal */
    }
  }
}
