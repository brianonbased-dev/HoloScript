/**
 * Shared base infrastructure for fleet-adversarial attacker loops.
 *
 * Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md
 * Pattern established by sibling attackers (sybil-cross-vouch.mjs +
 * slow-poisoner.mjs); this file is the consolidated base for new
 * attacker classes (whitewasher / reputation-squatter / cross-brain-hijack).
 *
 * Exports:
 *   - AUDIT_PREFIX_LOCAL: audit/-prefix invariant for the W.090 + foreign-
 *     route-write gate
 *   - DEFAULT_API_BASE: production HoloMesh API base
 *   - buildCaelRecord(): canonical 7-layer CAEL record builder
 *   - AuditEmitter: writes to local JSONL + best-effort POST to live CAEL
 *     endpoint (HS bf5eec591) when apiBase + apiKey set; marshals operation
 *     to string + lifts metadata to typed slots per server contract
 *   - liveAllowedFromArgs(): the dry-run + tripwire gate (matches sibling
 *     attackers' --no-dry-run + --i-acknowledge-blockers... pattern)
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import process from 'node:process';

export const AUDIT_PREFIX_LOCAL = 'audit/';
export const DEFAULT_API_BASE = process.env.HOLOMESH_API_BASE || 'https://mcp.holoscript.net/api/holomesh';

/**
 * Build a 7-layer CAEL record matching task _d2jx GET endpoint contract.
 * Operation is kept as a rich object (kind/route/target_handle/policy/payload)
 * for forensic JSONL value; AuditEmitter flattens to string at the POST
 * boundary per server's typeof-string check.
 */
export function buildCaelRecord({ agentHandle, operation, prevHash, vvFingerprint }) {
  const tickIso = new Date().toISOString();
  const opSerialized = JSON.stringify(operation);
  const layerHashes = [];
  let acc = prevHash || '';
  const slices = [
    agentHandle,
    operation.kind || '',
    opSerialized,
    operation.route || '',
    operation.target_handle || '',
    operation.policy || 'attacker-loop',
    tickIso,
  ];
  for (const slice of slices) {
    acc = createHash('sha256').update(`${acc}:${slice}`).digest('hex');
    layerHashes.push(acc);
  }
  let fnv = 0x811c9dc5 >>> 0;
  for (const ch of opSerialized) {
    fnv ^= ch.charCodeAt(0);
    fnv = Math.imul(fnv, 0x01000193) >>> 0;
  }
  return {
    tick_iso: tickIso,
    layer_hashes: layerHashes,
    operation: { kind: operation.kind, route: operation.route, target_handle: operation.target_handle },
    prev_hash: prevHash || null,
    fnv1a_chain: fnv.toString(16),
    version_vector_fingerprint: vvFingerprint || null,
    agent_handle: agentHandle,
  };
}

/**
 * AuditEmitter: writes CAEL records to local JSONL (audit/-prefix), and
 * in live mode also POSTs to /api/holomesh/agent/<handle>/audit (HS
 * bf5eec591). Marshals operation to string at the POST boundary +
 * lifts metadata to server's typed slots.
 *
 * Constructor args: { auditDir, runId, attackClass, apiBase, apiKey }
 *   - attackClass: tagged on every flatRecord for oracle dispatch
 */
export class AuditEmitter {
  constructor({ auditDir, runId, attackClass, apiBase = null, apiKey = null }) {
    if (!attackClass) throw new Error('AuditEmitter requires attackClass');
    this.auditDir = auditDir;
    this.runId = runId;
    this.attackClass = attackClass;
    this.logPath = join(auditDir, AUDIT_PREFIX_LOCAL, `${attackClass}-${runId}.jsonl`);
    this.records = [];
    this.foreignRouteWrites = 0;
    this.prevHash = null;
    this.apiBase = apiBase;
    this.apiKey = apiKey;
    this.liveModeFailures = 0;
  }

  async init() {
    const dir = dirname(this.logPath);
    if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  }

  async emit({ agentHandle, operation, vvFingerprint }) {
    const record = buildCaelRecord({ agentHandle, operation, prevHash: this.prevHash, vvFingerprint });
    this.records.push(record);
    this.prevHash = record.layer_hashes[record.layer_hashes.length - 1];
    await appendFile(this.logPath, `${JSON.stringify(record)}\n`, 'utf8');

    if (this.apiBase && this.apiKey) {
      try {
        const url = `${this.apiBase}/api/holomesh/agent/${encodeURIComponent(agentHandle)}/audit`;
        const op = record.operation;
        const flatRecord = {
          ...record,
          operation: typeof op === 'string' ? op : `${op.route || 'audit/'}${op.kind || 'unknown'}`,
          attack_class: this.attackClass,
          ...(typeof op === 'object' && op !== null ? {
            target_handle: op.target_handle,
            defense_state: op.defense_state,
            trial: op.trial,
          } : {}),
        };
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': this.apiKey },
          body: JSON.stringify({ record: flatRecord }),
        });
        if (!response.ok) this.liveModeFailures += 1;
      } catch {
        this.liveModeFailures += 1;
      }
    }
    return this.prevHash;
  }

  recordForeignWrite() {
    // Sentinel — should never be called. Runner gate-clear enforces foreignRouteWrites === 0.
    this.foreignRouteWrites += 1;
  }
}

/**
 * Decode the dry-run + tripwire gate. Live attacks require BOTH:
 *   --no-dry-run (i.e., dry_run === false)
 *   --i-acknowledge-blockers-d2jx-8bav-open (acknowledge_blockers === true)
 * Note: blockers _d2jx + _8bav are now CLOSED (HS bf5eec591 + 01add19d7),
 * so the tripwire flag name is historical; future refactor can rename.
 */
export function liveAllowedFromArgs({ dry_run, acknowledge_blockers }) {
  if (dry_run) return false;
  if (!acknowledge_blockers) {
    throw new Error(
      `live-mode refused: pass --i-acknowledge-blockers-d2jx-8bav-open if you accept the trial may run with reduced fidelity. `
      + `Recommended: keep dry_run=true unless explicitly running a production trial.`
    );
  }
  return true;
}
