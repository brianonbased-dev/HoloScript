/**
 * Resource Accounting Trait
 *
 * Produces provenance-anchored receipts for resource-bearing actions against
 * domain ledger adapters. The receipt shape is intentionally deterministic so
 * tier-3 oracle checks can compare closed and drifted cases byte-for-byte.
 *
 * Evidence tags: F.050, W.GOLD.013, W.GOLD.191, D.013, D.024, F.037, F.043.
 * Paper-track memos: a233685, f3e965e, ffbab5f.
 */

import type { HSPlusNode, TraitHandler } from './TraitTypes';
import { extractPayload } from './TraitTypes';

export type ResourceAccountingDomain = 'base_mainnet' | 'can_bus' | 'hl7_fhir' | 'edi_x12';
export type ResourceAccountingStatus = 'closed' | 'drift_detected';
export type ResourceAccountingQuantity = string | number | bigint;

export interface ResourceAccountingClaim {
  claimId: string;
  action: string;
  expectedQuantity: ResourceAccountingQuantity;
  unit?: string;
  ledgerId?: string;
  adapterId?: string;
  tolerance?: ResourceAccountingQuantity;
  observedAt?: string;
  auditPrompt?: string;
  metadata?: Record<string, unknown>;
}

export interface ResourceLedgerObservation {
  adapterId: string;
  domain: ResourceAccountingDomain;
  ledgerId: string;
  observedAt: string;
  quantity: string;
  unit: string;
  source: string;
  sourceHash: string;
  citation?: string;
  raw: unknown;
}

export interface ResourceAccountingAdapter {
  adapterId: string;
  domain: ResourceAccountingDomain;
  unit: string;
  source: string;
  read: (claim: ResourceAccountingClaim) => ResourceLedgerObservation;
}

export interface ResourceAccountingReceipt {
  receiptId: string;
  claimId: string;
  adapterId: string;
  domain: ResourceAccountingDomain;
  action: string;
  ledgerId: string;
  expectedQuantity: string;
  observedQuantity: string;
  delta: string;
  tolerance: string;
  unit: string;
  status: ResourceAccountingStatus;
  observedAt: string;
  createdAt: string;
  source: string;
  sourceHash: string;
  receiptHash: string;
  auditPrompt: string;
  citation?: string;
  metadata?: Record<string, unknown>;
  rawObservation: unknown;
}

export interface ResourceAccountingConfig {
  enabled: boolean;
  tolerance: ResourceAccountingQuantity;
  adapters?: ResourceAccountingAdapter[];
  emitAuditLog: boolean;
  auditPromptTemplate: string;
}

export interface ResourceAccountingState {
  adapters: Map<string, ResourceAccountingAdapter>;
  receipts: ResourceAccountingReceipt[];
  drifts: ResourceAccountingReceipt[];
}

export interface BaseMainnetLedger {
  wallet: string;
  fundedWei: ResourceAccountingQuantity;
  spentWei: ResourceAccountingQuantity;
  remainingWei?: ResourceAccountingQuantity;
  chainId?: number;
  blockRange?: { from: number; to: number };
  txHashes?: string[];
}

export interface CanBusLedger {
  vehicleId: string;
  startMicroWh: ResourceAccountingQuantity;
  consumedMicroWh: ResourceAccountingQuantity;
  reportedRemainingMicroWh?: ResourceAccountingQuantity;
  frameIds?: string[];
}

export interface Hl7FhirDoseLedger {
  patientId: string;
  medicationAdministration: {
    resourceType: 'MedicationAdministration';
    id: string;
    status?: string;
    dosage: {
      dose: {
        value: string | number;
        unit: 'ug' | 'mcg' | 'microgram' | 'mg' | 'g';
      };
    };
  };
}

export interface EdiX12Ledger {
  shipmentId: string;
  transactionSet: '856' | '810' | '940';
  shippedUnits: ResourceAccountingQuantity;
  orderedUnits?: ResourceAccountingQuantity;
  receivedUnits?: ResourceAccountingQuantity;
  tradingPartner?: string;
}

const DEFAULT_AUDIT_PROMPT_TEMPLATE =
  'Tier-3 resource audit: reconcile {claimId} against {domain}/{ledgerId}; status={status}; delta={delta} {unit}.';

const DEFAULT_CONFIG: ResourceAccountingConfig = {
  enabled: true,
  tolerance: '0',
  adapters: [],
  emitAuditLog: true,
  auditPromptTemplate: DEFAULT_AUDIT_PROMPT_TEMPLATE,
};

export const resourceAccountingHandler: TraitHandler<ResourceAccountingConfig> = {
  name: 'resource_accounting',

  defaultConfig: DEFAULT_CONFIG,

  onAttach(node, config, context) {
    const state: ResourceAccountingState = {
      adapters: new Map((config.adapters ?? []).map((adapter) => [adapter.adapterId, adapter])),
      receipts: [],
      drifts: [],
    };

    resourceAccountingNode(node).__resourceAccountingState = state;

    context.emit('resource_accounting_ready', {
      node,
      adapterIds: [...state.adapters.keys()],
    });
  },

  onDetach(node) {
    delete resourceAccountingNode(node).__resourceAccountingState;
  },

  onEvent(node, config, context, event) {
    const state = resourceAccountingNode(node).__resourceAccountingState;
    if (!state || !config.enabled) return;

    const payload = extractPayload(event);

    if (event.type === 'resource_accounting:register_adapter') {
      const adapter = payload.adapter as ResourceAccountingAdapter | undefined;
      if (!adapter?.adapterId) {
        context.emit('resource_accounting_error', {
          node,
          error: 'ADAPTER_REQUIRED',
        });
        return;
      }
      state.adapters.set(adapter.adapterId, adapter);
      context.emit('resource_accounting_adapter_registered', {
        node,
        adapterId: adapter.adapterId,
        domain: adapter.domain,
      });
      return;
    }

    if (
      event.type === 'resource_accounting:record' ||
      event.type === 'resource_accounting:audit' ||
      event.type === 'resource_accounting_record'
    ) {
      const claim = payload as ResourceAccountingClaim;
      const adapter =
        (payload.adapter as ResourceAccountingAdapter | undefined) ??
        state.adapters.get(String(payload.adapterId ?? ''));

      if (!adapter) {
        context.emit('resource_accounting_error', {
          node,
          error: 'ADAPTER_NOT_FOUND',
          adapterId: payload.adapterId,
        });
        return;
      }

      const receipt = runResourceAccountingAudit(adapter, claim, {
        tolerance: claim.tolerance ?? config.tolerance,
        auditPromptTemplate: config.auditPromptTemplate,
      });
      state.receipts.push(receipt);

      context.emit('resource_accounting_receipt', {
        node,
        receipt,
      });

      if (receipt.status === 'drift_detected') {
        state.drifts.push(receipt);
        context.emit('resource_accounting_drift_detected', {
          node,
          receipt,
        });
      }

      if (config.emitAuditLog) {
        context.emit('audit_log', {
          action: 'resource_accounting.audit',
          result: receipt.status === 'closed' ? 'success' : 'error',
          severity: receipt.status === 'closed' ? 'info' : 'warning',
          details: {
            claimId: receipt.claimId,
            adapterId: receipt.adapterId,
            ledgerId: receipt.ledgerId,
            status: receipt.status,
            delta: receipt.delta,
            receiptHash: receipt.receiptHash,
          },
        });
      }
      return;
    }

    if (event.type === 'resource_accounting:query') {
      context.emit('resource_accounting_query_result', {
        node,
        receipts: [...state.receipts],
        drifts: [...state.drifts],
      });
    }
  },
};

export function runResourceAccountingAudit(
  adapter: ResourceAccountingAdapter,
  claim: ResourceAccountingClaim,
  options: {
    tolerance?: ResourceAccountingQuantity;
    auditPromptTemplate?: string;
  } = {}
): ResourceAccountingReceipt {
  if (!claim.claimId) {
    throw new Error('Resource accounting claim requires claimId');
  }
  if (!claim.action) {
    throw new Error('Resource accounting claim requires action');
  }

  const observation = adapter.read(claim);
  const expectedQuantity = toBigIntQuantity(claim.expectedQuantity);
  const observedQuantity = toBigIntQuantity(observation.quantity);
  const tolerance = toBigIntQuantity(options.tolerance ?? claim.tolerance ?? '0');
  const delta = observedQuantity - expectedQuantity;
  const status = absBigInt(delta) <= tolerance ? 'closed' : 'drift_detected';
  const baseReceipt = {
    claimId: claim.claimId,
    adapterId: observation.adapterId,
    domain: observation.domain,
    action: claim.action,
    ledgerId: observation.ledgerId,
    expectedQuantity: expectedQuantity.toString(),
    observedQuantity: observedQuantity.toString(),
    delta: delta.toString(),
    tolerance: tolerance.toString(),
    unit: observation.unit,
    status,
    observedAt: claim.observedAt ?? observation.observedAt,
    createdAt: observation.observedAt,
    source: observation.source,
    sourceHash: observation.sourceHash,
    citation: observation.citation,
    metadata: claim.metadata,
    rawObservation: observation.raw,
  } satisfies Omit<ResourceAccountingReceipt, 'receiptId' | 'receiptHash' | 'auditPrompt'>;

  const receiptHash = stableResourceAccountingReceiptHash(baseReceipt);
  return {
    ...baseReceipt,
    receiptId: `ra_${receiptHash}`,
    receiptHash,
    auditPrompt:
      claim.auditPrompt ??
      renderAuditPrompt(options.auditPromptTemplate ?? DEFAULT_AUDIT_PROMPT_TEMPLATE, {
        ...baseReceipt,
        receiptId: `ra_${receiptHash}`,
        receiptHash,
      }),
  };
}

export function createBaseMainnetAccountingAdapter(
  ledger: BaseMainnetLedger
): ResourceAccountingAdapter {
  const chainId = ledger.chainId ?? 8453;
  const adapterId = `base-mainnet:${chainId}:${ledger.wallet.toLowerCase()}`;

  return {
    adapterId,
    domain: 'base_mainnet',
    unit: 'wei',
    source: 'base-mainnet-rpc',
    read: () => {
      const fundedWei = toBigIntQuantity(ledger.fundedWei);
      const spentWei = toBigIntQuantity(ledger.spentWei);
      const observedWei = fundedWei - spentWei;
      const raw = {
        ...ledger,
        fundedWei: fundedWei.toString(),
        spentWei: spentWei.toString(),
        computedRemainingWei: observedWei.toString(),
        remainingWei:
          ledger.remainingWei === undefined
            ? undefined
            : toBigIntQuantity(ledger.remainingWei).toString(),
      };

      return {
        adapterId,
        domain: 'base_mainnet',
        ledgerId: `base:${chainId}:${ledger.wallet.toLowerCase()}`,
        observedAt: blockRangeTimestamp(ledger.blockRange),
        quantity: observedWei.toString(),
        unit: 'wei',
        source: 'base-mainnet-rpc',
        sourceHash: stableResourceAccountingReceiptHash(raw),
        citation: ledger.txHashes?.join(','),
        raw,
      };
    },
  };
}

export function createCanBusAccountingAdapter(ledger: CanBusLedger): ResourceAccountingAdapter {
  return {
    adapterId: `can-bus:${ledger.vehicleId}`,
    domain: 'can_bus',
    unit: 'micro_wh',
    source: 'can-bus-frame-log',
    read: () => {
      const startMicroWh = toBigIntQuantity(ledger.startMicroWh);
      const consumedMicroWh = toBigIntQuantity(ledger.consumedMicroWh);
      const observedMicroWh = startMicroWh - consumedMicroWh;
      const raw = {
        ...ledger,
        startMicroWh: startMicroWh.toString(),
        consumedMicroWh: consumedMicroWh.toString(),
        computedRemainingMicroWh: observedMicroWh.toString(),
        reportedRemainingMicroWh:
          ledger.reportedRemainingMicroWh === undefined
            ? undefined
            : toBigIntQuantity(ledger.reportedRemainingMicroWh).toString(),
      };

      return {
        adapterId: `can-bus:${ledger.vehicleId}`,
        domain: 'can_bus',
        ledgerId: `can:${ledger.vehicleId}`,
        observedAt: 'can-frame-log',
        quantity: observedMicroWh.toString(),
        unit: 'micro_wh',
        source: 'can-bus-frame-log',
        sourceHash: stableResourceAccountingReceiptHash(raw),
        citation: ledger.frameIds?.join(','),
        raw,
      };
    },
  };
}

export function createHl7FhirAccountingAdapter(
  ledger: Hl7FhirDoseLedger
): ResourceAccountingAdapter {
  return {
    adapterId: `hl7-fhir:${ledger.medicationAdministration.id}`,
    domain: 'hl7_fhir',
    unit: 'microgram',
    source: 'hl7-fhir-medication-administration',
    read: () => {
      const dose = ledger.medicationAdministration.dosage.dose;
      const observedMicrograms = convertDoseToMicrograms(dose.value, dose.unit);
      const raw = {
        ...ledger,
        canonicalDoseMicrograms: observedMicrograms.toString(),
      };

      return {
        adapterId: `hl7-fhir:${ledger.medicationAdministration.id}`,
        domain: 'hl7_fhir',
        ledgerId: `fhir:MedicationAdministration/${ledger.medicationAdministration.id}`,
        observedAt: ledger.medicationAdministration.id,
        quantity: observedMicrograms.toString(),
        unit: 'microgram',
        source: 'hl7-fhir-medication-administration',
        sourceHash: stableResourceAccountingReceiptHash(raw),
        citation: `Patient/${ledger.patientId}`,
        raw,
      };
    },
  };
}

export function createEdiX12AccountingAdapter(ledger: EdiX12Ledger): ResourceAccountingAdapter {
  return {
    adapterId: `edi-x12:${ledger.transactionSet}:${ledger.shipmentId}`,
    domain: 'edi_x12',
    unit: 'unit',
    source: 'edi-x12-transaction-set',
    read: () => {
      const shippedUnits = toBigIntQuantity(ledger.shippedUnits);
      const raw = {
        ...ledger,
        shippedUnits: shippedUnits.toString(),
        orderedUnits:
          ledger.orderedUnits === undefined
            ? undefined
            : toBigIntQuantity(ledger.orderedUnits).toString(),
        receivedUnits:
          ledger.receivedUnits === undefined
            ? undefined
            : toBigIntQuantity(ledger.receivedUnits).toString(),
      };

      return {
        adapterId: `edi-x12:${ledger.transactionSet}:${ledger.shipmentId}`,
        domain: 'edi_x12',
        ledgerId: `edi-x12:${ledger.transactionSet}:${ledger.shipmentId}`,
        observedAt: ledger.shipmentId,
        quantity: shippedUnits.toString(),
        unit: 'unit',
        source: 'edi-x12-transaction-set',
        sourceHash: stableResourceAccountingReceiptHash(raw),
        citation: ledger.tradingPartner,
        raw,
      };
    },
  };
}

export function stableResourceAccountingReceiptHash(input: unknown): string {
  const canonical = canonicalize(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function resourceAccountingNode(
  node: HSPlusNode
): HSPlusNode & { __resourceAccountingState?: ResourceAccountingState } {
  return node as HSPlusNode & { __resourceAccountingState?: ResourceAccountingState };
}

function renderAuditPrompt(
  template: string,
  receipt: Omit<ResourceAccountingReceipt, 'auditPrompt'>
): string {
  return replaceToken(
    replaceToken(
      replaceToken(
        replaceToken(
          replaceToken(replaceToken(template, '{claimId}', receipt.claimId), '{domain}', receipt.domain),
          '{ledgerId}',
          receipt.ledgerId
        ),
        '{status}',
        receipt.status
      ),
      '{delta}',
      receipt.delta
    ),
    '{unit}',
    receipt.unit
  );
}

function replaceToken(input: string, token: string, value: string): string {
  return input.split(token).join(value);
}

function convertDoseToMicrograms(
  value: string | number,
  unit: Hl7FhirDoseLedger['medicationAdministration']['dosage']['dose']['unit']
): bigint {
  const multiplierByUnit: Record<typeof unit, bigint> = {
    ug: 1n,
    mcg: 1n,
    microgram: 1n,
    mg: 1_000n,
    g: 1_000_000n,
  };
  return decimalToIntegerUnits(value, multiplierByUnit[unit]);
}

function toBigIntQuantity(value: ResourceAccountingQuantity): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      throw new Error(`Resource quantity must be an integer base unit: ${value}`);
    }
    return BigInt(value);
  }
  const trimmed = value.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    throw new Error(`Resource quantity must be an integer base unit: ${value}`);
  }
  return BigInt(trimmed);
}

function decimalToIntegerUnits(value: string | number, multiplier: bigint): bigint {
  const raw = String(value).trim();
  const match = raw.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new Error(`Dose quantity must be decimal numeric: ${value}`);
  }

  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2]) * multiplier;
  const fraction = match[3] ?? '';
  if (!fraction) return sign * whole;

  const scale = 10n ** BigInt(fraction.length);
  const fractionalUnits = BigInt(fraction) * multiplier;
  if (fractionalUnits % scale !== 0n) {
    throw new Error(`Dose quantity cannot be represented as an integer canonical unit: ${value}`);
  }
  return sign * (whole + fractionalUnits / scale);
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function blockRangeTimestamp(blockRange: BaseMainnetLedger['blockRange']): string {
  if (!blockRange) return 'base-mainnet-ledger';
  return `base-blocks:${blockRange.from}-${blockRange.to}`;
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '"__undefined__"';
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot canonicalize non-finite number: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
      .join(',')}}`;
  }
  return JSON.stringify(String(value));
}

export default resourceAccountingHandler;
