/**
 * HoloShell Build Custody Receipt
 *
 * Reusable HoloScript substrate contract for native build custody (the
 * "who built what, from which local source, under what hardware/MCP
 * conditions, with what authority" proof).
 *
 * This is the native replacement for hololand_overlay "MCP custody split"
 * logic. HoloLand world-build cockpits and the HoloShellWorldBuildReadyToken
 * should prefer this receipt over product-specific overlay semantics.
 *
 * Directly addresses the HoloScript upstream gap from the
 * 2026-05-20 world-build-cockpit-v2 research:
 * "Add native MCP custody snapshot/split receipts to HoloScript MCP/HoloMesh
 * so HoloLand does not need hololand_overlay compatibility mode."
 *
 * task_1779310657520_3ey4 (derived/continued from WorldBuildReadyToken work)
 */

import type {
  ArtifactHashAlgorithm,
  ArtifactProvenanceLink,
  ArtifactVerificationCommand,
} from './board-types';

// ── Version ────────────────────────────────────────────────────────────────

export const HOLOSHELL_BUILD_CUSTODY_RECEIPT_VERSION = 'holoshell.build-custody.v1';

// ── Custody Sources ────────────────────────────────────────────────────────

export const CUSTODY_SOURCES = [
  'local_holoscript_cli',
  'mcp_server',
  'hololand_overlay',   // legacy / product compatibility only
  'manual',
  'ci',
] as const;
export type CustodySource = (typeof CUSTODY_SOURCES)[number];

// ── Build Custody Record ───────────────────────────────────────────────────

export interface BuildCustodyRecord {
  custodyId: string;
  source: CustodySource;
  /** True when this is a true native HoloScript receipt (not hololand_overlay). */
  isNative: boolean;
  builtBy: string;                    // agent / surface / seat
  builtAt: string;
  sourceRef: string;                  // commit, bundle hash, or workspace id
  mcpHealthSnapshot?: {
    mcpVersion: string;
    healthy: boolean;
    graphAuthoritative: boolean;      // critical: stale hosted vs fresh local
    features: string[];
  };
  hardwareContext?: {
    os: string;
    cpu: string;
    gpus: string[];
    wasmSimd: boolean;
  };
  receiptsIncluded: string[];         // IDs of other receipts that fed this custody
  notes?: string[];
}

// ── The Receipt ────────────────────────────────────────────────────────────

export interface HoloShellBuildCustodyReceipt {
  schemaVersion: typeof HOLOSHELL_BUILD_CUSTODY_RECEIPT_VERSION;
  id: string;
  status: 'authoritative' | 'overlay' | 'warn' | 'blocked';
  custody: BuildCustodyRecord;
  /** Explicit callout when this is still the legacy overlay. */
  overlayWarning?: string;
  hash: string;
  hashAlgorithm: ArtifactHashAlgorithm;
  verificationCommands?: ArtifactVerificationCommand[];
  provenance?: ArtifactProvenanceLink;
  createdAt: string;
  createdBy: string;
}

// ── Validator ──────────────────────────────────────────────────────────────

export function validateHoloShellBuildCustodyReceipt(
  receipt: HoloShellBuildCustodyReceipt
): string[] {
  const errors: string[] = [];

  if (receipt.schemaVersion !== HOLOSHELL_BUILD_CUSTODY_RECEIPT_VERSION) {
    errors.push(
      `HoloShellBuildCustodyReceipt.schemaVersion must be "${HOLOSHELL_BUILD_CUSTODY_RECEIPT_VERSION}".`
    );
  }
  if (!receipt.id) {
    errors.push('HoloShellBuildCustodyReceipt.id is required.');
  }
  if (!['authoritative', 'overlay', 'warn', 'blocked'].includes(receipt.status)) {
    errors.push('Invalid status for HoloShellBuildCustodyReceipt.');
  }

  const c = receipt.custody;
  if (!c) {
    errors.push('HoloShellBuildCustodyReceipt.custody is required.');
  } else {
    if (!c.custodyId) errors.push('custody.custodyId is required.');
    if (!CUSTODY_SOURCES.includes(c.source)) {
      errors.push(`Unknown custody.source: ${c.source}`);
    }
    if (typeof c.isNative !== 'boolean') {
      errors.push('custody.isNative (boolean) is required.');
    }
    if (!c.builtBy) errors.push('custody.builtBy is required.');
    if (!c.builtAt) errors.push('custody.builtAt is required.');
    if (!c.sourceRef) errors.push('custody.sourceRef is required.');
    if (c.source === 'hololand_overlay' && receipt.status !== 'overlay') {
      errors.push('When source is hololand_overlay, status should be "overlay".');
    }
  }

  if (receipt.status === 'authoritative' && !receipt.custody.isNative) {
    errors.push('Status authoritative requires custody.isNative === true.');
  }

  if (!receipt.hash) errors.push('HoloShellBuildCustodyReceipt.hash is required.');
  if (!receipt.createdAt) errors.push('createdAt is required.');
  if (!receipt.createdBy) errors.push('createdBy is required.');

  return errors;
}

export function cloneHoloShellBuildCustodyReceipt(
  receipt: HoloShellBuildCustodyReceipt
): HoloShellBuildCustodyReceipt {
  return {
    ...receipt,
    custody: {
      ...receipt.custody,
      mcpHealthSnapshot: receipt.custody.mcpHealthSnapshot
        ? { ...receipt.custody.mcpHealthSnapshot, features: [...receipt.custody.mcpHealthSnapshot.features] }
        : undefined,
      hardwareContext: receipt.custody.hardwareContext
        ? { ...receipt.custody.hardwareContext, gpus: [...receipt.custody.hardwareContext.gpus] }
        : undefined,
      receiptsIncluded: [...receipt.custody.receiptsIncluded],
      ...(receipt.custody.notes ? { notes: [...receipt.custody.notes] } : {}),
    },
    ...(receipt.verificationCommands ? { verificationCommands: receipt.verificationCommands.map(c => ({ ...c })) } : {}),
    ...(receipt.provenance ? { provenance: { ...receipt.provenance } } : {}),
    ...(receipt.overlayWarning ? { overlayWarning: receipt.overlayWarning } : {}),
  };
}

// ── Convenience creator ────────────────────────────────────────────────────

export interface BuildCustodyInput {
  builtBy: string;
  sourceRef: string;
  source?: CustodySource;
  isNative?: boolean;
  mcpHealthSnapshot?: BuildCustodyRecord['mcpHealthSnapshot'];
  hardwareContext?: BuildCustodyRecord['hardwareContext'];
  receiptsIncluded?: string[];
  notes?: string[];
  createdBy: string;
}

export function createHoloShellBuildCustodyReceipt(
  input: BuildCustodyInput
): HoloShellBuildCustodyReceipt {
  const source = input.source ?? (input.isNative === false ? 'hololand_overlay' : 'local_holoscript_cli');
  const isNative = input.isNative ?? (source !== 'hololand_overlay');

  const status: HoloShellBuildCustodyReceipt['status'] =
    source === 'hololand_overlay' ? 'overlay' :
    isNative ? 'authoritative' : 'warn';

  const record: BuildCustodyRecord = {
    custodyId: `build-custody-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    source,
    isNative,
    builtBy: input.builtBy,
    builtAt: new Date().toISOString(),
    sourceRef: input.sourceRef,
    mcpHealthSnapshot: input.mcpHealthSnapshot,
    hardwareContext: input.hardwareContext,
    receiptsIncluded: input.receiptsIncluded ?? [],
    notes: input.notes,
  };

  const receipt: HoloShellBuildCustodyReceipt = {
    schemaVersion: HOLOSHELL_BUILD_CUSTODY_RECEIPT_VERSION,
    id: record.custodyId,
    status,
    custody: record,
    ...(source === 'hololand_overlay' ? {
      overlayWarning: 'Legacy hololand_overlay custody. Prefer native HoloScript custody for WorldBuildReadyToken and cockpit gates.'
    } : {}),
    hash: 'placeholder-until-signed',
    hashAlgorithm: 'sha256',
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
  };

  return receipt;
}
