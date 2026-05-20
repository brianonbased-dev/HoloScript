/**
 * HoloShell World Build Ready Token
 *
 * Reusable HoloScript substrate contract and validator for the conjunction of
 * all gates required before a non-developer (or agent) is authorized to build
 * and publish a HoloLand world.
 *
 * Gates include (but are not limited to):
 * - Local source / codebase bundle validation (fresh local truth, not stale hosted graph)
 * - Hardware reality audit (Codex / local GPUs, WASM, WebGPU policy)
 * - Build custody (who built, from what source, with what custody receipts)
 * - Visual / target-device witness (HoloTunnel wireless proof or explicit blocker)
 * - Codebase graph trust with authority markers (local absorb / sourceFiles preferred)
 * - Task / dirty-tree / replay / rollback summary
 *
 * The token proves that the conjunction of these (or documented blockers) authorizes
 * "ready to build a HoloLand world" and can be consumed by HoloLand world-build
 * cockpits, holoshell pipelines, and HoloMesh task flows.
 *
 * Directly addresses the substrate gap surfaced in holoshell-human-os-frontier
 * 2026-05-20 world-build-cockpit-v2 research and the stale graph / Windows absorb
 * authority problems.
 *
 * task_1779310669220_bz8n
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── Version ────────────────────────────────────────────────────────────────

export const HOLOSHELL_WORLD_BUILD_READY_TOKEN_VERSION = 'holoshell.world-build-ready.v1';

// ── Gate Definitions ───────────────────────────────────────────────────────

export const WORLD_BUILD_GATE_IDS = [
  'local-source',
  'hardware-reality',
  'build-custody',
  'visual-witness',
  'codebase-graph-trust',
  'task-dirty-tree',
  'replay',
  'rollback',
] as const;

export type WorldBuildGateId = (typeof WORLD_BUILD_GATE_IDS)[number];

// ── Individual Gate Result ─────────────────────────────────────────────────

export interface WorldBuildGateResult {
  gateId: WorldBuildGateId;
  /** The receipt ID that satisfied (or attempted to satisfy) this gate. */
  receiptId?: string;
  status: 'pass' | 'warn' | 'blocked' | 'skipped';
  /** Human or machine readable reason when not pass. */
  reason?: string;
  /** Authority proof (e.g. local source hash, tunnel ID, hardware audit ID). */
  authorityProof?: string;
  /** Explicit blocker when the gate cannot be satisfied. */
  blocker?: string;
  checkedAt: string;
}

// ── The Conjunction Token ──────────────────────────────────────────────────

export interface HoloShellWorldBuildReadyToken {
  schemaVersion: typeof HOLOSHELL_WORLD_BUILD_READY_TOKEN_VERSION;
  id: string;
  status: 'ready' | 'warn' | 'blocked';
  /** The set of gates that were evaluated. */
  gates: WorldBuildGateResult[];
  /** Which gates are considered mandatory for a "ready" token. */
  requiredGates: WorldBuildGateId[];
  /** Overall authority markers for the entire token (local source bundle hash, etc.). */
  authorityMarkers: {
    localSourceBundleHash?: string;
    hardwareAuditId?: string;
    visualWitnessTunnelId?: string;
    graphAuthoritySource: 'local' | 'hosted-stale' | 'mixed';
  };
  /** Free-form notes or warnings that do not block but are visible. */
  notes?: string[];
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  verificationCommands?: ArtifactVerificationCommand[];
  provenance?: ArtifactProvenanceLink;
  createdAt: string;
  createdBy: string;
}

// ── Validator ──────────────────────────────────────────────────────────────

export function validateHoloShellWorldBuildReadyToken(
  token: HoloShellWorldBuildReadyToken
): string[] {
  const errors: string[] = [];

  if (token.schemaVersion !== HOLOSHELL_WORLD_BUILD_READY_TOKEN_VERSION) {
    errors.push(
      `HoloShellWorldBuildReadyToken.schemaVersion must be "${HOLOSHELL_WORLD_BUILD_READY_TOKEN_VERSION}".`
    );
  }
  if (!token.id) {
    errors.push('HoloShellWorldBuildReadyToken.id is required.');
  }
  if (!['ready', 'warn', 'blocked'].includes(token.status)) {
    errors.push(`HoloShellWorldBuildReadyToken.status must be ready|warn|blocked.`);
  }
  if (!Array.isArray(token.gates)) {
    errors.push('HoloShellWorldBuildReadyToken.gates must be an array.');
  } else {
    const seenGates = new Set<WorldBuildGateId>();
    for (const gate of token.gates) {
      if (!WORLD_BUILD_GATE_IDS.includes(gate.gateId as WorldBuildGateId)) {
        errors.push(`Unknown gateId in WorldBuildGateResult: ${gate.gateId}`);
      }
      if (seenGates.has(gate.gateId)) {
        errors.push(`Duplicate gateId in token: ${gate.gateId}`);
      }
      seenGates.add(gate.gateId);
      if (!['pass', 'warn', 'blocked', 'skipped'].includes(gate.status)) {
        errors.push(`Invalid status for gate ${gate.gateId}: ${gate.status}`);
      }
      if (gate.status === 'blocked' && !gate.blocker && !gate.reason) {
        errors.push(`Blocked gate ${gate.gateId} must have blocker or reason.`);
      }
      if (!gate.checkedAt) {
        errors.push(`WorldBuildGateResult.checkedAt is required for gate ${gate.gateId}.`);
      }
    }

    // Cross-field: if status === 'ready', every required gate must be 'pass'
    if (token.status === 'ready') {
      for (const required of token.requiredGates) {
        const g = token.gates.find((x) => x.gateId === required);
        if (!g || g.status !== 'pass') {
          errors.push(
            `Token marked ready but required gate "${required}" is not pass.`
          );
        }
      }
    }
  }

  if (!Array.isArray(token.requiredGates) || token.requiredGates.length === 0) {
    errors.push('HoloShellWorldBuildReadyToken.requiredGates must be a non-empty array.');
  }

  const auth = token.authorityMarkers;
  if (!auth) {
    errors.push('HoloShellWorldBuildReadyToken.authorityMarkers is required.');
  } else {
    if (!auth.graphAuthoritySource || !['local', 'hosted-stale', 'mixed'].includes(auth.graphAuthoritySource)) {
      errors.push('authorityMarkers.graphAuthoritySource must be local | hosted-stale | mixed.');
    }
    // Strong preference for local authority on source/graph
    if (auth.graphAuthoritySource === 'hosted-stale' && !auth.localSourceBundleHash) {
      errors.push(
        'When graphAuthoritySource is hosted-stale, a localSourceBundleHash authority proof is required.'
      );
    }
  }

  if (!token.hash) errors.push('HoloShellWorldBuildReadyToken.hash is required.');
  if (!token.hashAlgorithm) errors.push('HoloShellWorldBuildReadyToken.hashAlgorithm is required.');
  if (!token.createdAt) errors.push('HoloShellWorldBuildReadyToken.createdAt is required.');
  if (!token.createdBy) errors.push('HoloShellWorldBuildReadyToken.createdBy is required.');

  return errors;
}

export function cloneHoloShellWorldBuildReadyToken(
  token: HoloShellWorldBuildReadyToken
): HoloShellWorldBuildReadyToken {
  return {
    ...token,
    gates: token.gates.map((g) => ({ ...g })),
    requiredGates: [...token.requiredGates],
    authorityMarkers: { ...token.authorityMarkers },
    ...(token.notes ? { notes: [...token.notes] } : {}),
    ...(token.verificationCommands
      ? { verificationCommands: token.verificationCommands.map((c) => ({ ...c })) }
      : {}),
    ...(token.provenance ? { provenance: { ...token.provenance } } : {}),
  };
}

// ── Convenience constructor for the common "all gates evaluated" case ─────

export interface BuildWorldReadyTokenInput {
  gates: WorldBuildGateResult[];
  requiredGates?: WorldBuildGateId[];
  authorityMarkers: HoloShellWorldBuildReadyToken['authorityMarkers'];
  notes?: string[];
  createdBy: string;
}

export function createHoloShellWorldBuildReadyToken(
  input: BuildWorldReadyTokenInput
): HoloShellWorldBuildReadyToken {
  const requiredGates = input.requiredGates ?? [...WORLD_BUILD_GATE_IDS];

  const status = computeOverallStatus(input.gates, requiredGates);

  const token: HoloShellWorldBuildReadyToken = {
    schemaVersion: HOLOSHELL_WORLD_BUILD_READY_TOKEN_VERSION,
    id: `world-build-ready-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    status,
    gates: input.gates,
    requiredGates,
    authorityMarkers: input.authorityMarkers,
    notes: input.notes,
    hash: 'placeholder-until-signed',
    hashAlgorithm: 'sha256',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };

  return token;
}

function computeOverallStatus(
  gates: WorldBuildGateResult[],
  required: WorldBuildGateId[]
): 'ready' | 'warn' | 'blocked' {
  let hasBlock = false;
  let hasWarn = false;

  for (const g of gates) {
    if (g.status === 'blocked') hasBlock = true;
    if (g.status === 'warn') hasWarn = true;
  }

  if (hasBlock) return 'blocked';

  const missingRequired = required.filter((req) => {
    const g = gates.find((x) => x.gateId === req);
    return !g || (g.status !== 'pass' && g.status !== 'warn');
  });

  if (missingRequired.length > 0) return 'blocked';

  if (hasWarn) return 'warn';
  return 'ready';
}

