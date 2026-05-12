import { describe, expect, it, vi } from 'vitest';
import {
  createBaseMainnetAccountingAdapter,
  createCanBusAccountingAdapter,
  createEdiX12AccountingAdapter,
  createHl7FhirAccountingAdapter,
  resourceAccountingHandler,
  runResourceAccountingAudit,
  type ResourceAccountingAdapter,
  type ResourceAccountingClaim,
} from '../ResourceAccountingTrait';

const cases: Array<{
  name: string;
  adapter: ResourceAccountingAdapter;
  expectedQuantity: string;
  driftQuantity: string;
  expectedDriftDelta: string;
  unit: string;
}> = [
  {
    name: 'Base mainnet',
    adapter: createBaseMainnetAccountingAdapter({
      wallet: '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3',
      fundedWei: '61978092810119',
      spentWei: '41659953892419',
      remainingWei: '20318138917700',
      blockRange: { from: 44845906, to: 45881370 },
      txHashes: ['0x9bf57e89', '0x4e167b71'],
    }),
    expectedQuantity: '20318138917700',
    driftQuantity: '20318138917701',
    expectedDriftDelta: '-1',
    unit: 'wei',
  },
  {
    name: 'CAN bus',
    adapter: createCanBusAccountingAdapter({
      vehicleId: 'forklift-7',
      startMicroWh: '420000000',
      consumedMicroWh: '125000000',
      reportedRemainingMicroWh: '295000000',
      frameIds: ['0x18fef100', '0x18fef101'],
    }),
    expectedQuantity: '295000000',
    driftQuantity: '294999000',
    expectedDriftDelta: '1000',
    unit: 'micro_wh',
  },
  {
    name: 'HL7 FHIR',
    adapter: createHl7FhirAccountingAdapter({
      patientId: 'patient-42',
      medicationAdministration: {
        resourceType: 'MedicationAdministration',
        id: 'medadmin-2500mcg',
        status: 'completed',
        dosage: {
          dose: { value: '2.5', unit: 'mg' },
        },
      },
    }),
    expectedQuantity: '2500',
    driftQuantity: '2501',
    expectedDriftDelta: '-1',
    unit: 'microgram',
  },
  {
    name: 'EDI-X12',
    adapter: createEdiX12AccountingAdapter({
      transactionSet: '856',
      shipmentId: 'asn-9001',
      orderedUnits: '144',
      shippedUnits: '144',
      receivedUnits: '144',
      tradingPartner: 'partner-17',
    }),
    expectedQuantity: '144',
    driftQuantity: '143',
    expectedDriftDelta: '1',
    unit: 'unit',
  },
];

function claimFor(
  testCase: (typeof cases)[number],
  expectedQuantity: string
): ResourceAccountingClaim {
  return {
    claimId: `${testCase.name.toLowerCase().replace(/\s+/g, '-')}-claim`,
    action: 'resource.account',
    expectedQuantity,
    unit: testCase.unit,
    metadata: { fixture: testCase.name },
  };
}

describe('ResourceAccountingTrait adapters', () => {
  for (const testCase of cases) {
    it(`${testCase.name} closes the true-case byte-exactly`, () => {
      const receipt = runResourceAccountingAudit(
        testCase.adapter,
        claimFor(testCase, testCase.expectedQuantity)
      );
      const replayedReceipt = runResourceAccountingAudit(
        testCase.adapter,
        claimFor(testCase, testCase.expectedQuantity)
      );

      expect(receipt.status).toBe('closed');
      expect(receipt.expectedQuantity).toBe(testCase.expectedQuantity);
      expect(receipt.observedQuantity).toBe(testCase.expectedQuantity);
      expect(receipt.delta).toBe('0');
      expect(receipt.unit).toBe(testCase.unit);
      expect(receipt.receiptId).toBe(`ra_${receipt.receiptHash}`);
      expect(receipt.receiptHash).toBe(replayedReceipt.receiptHash);
      expect(receipt.sourceHash).toMatch(/^[a-z0-9]+$/);
      expect(receipt.auditPrompt).toContain('Tier-3 resource audit');
    });

    it(`${testCase.name} detects the false-case drift`, () => {
      const receipt = runResourceAccountingAudit(
        testCase.adapter,
        claimFor(testCase, testCase.driftQuantity)
      );

      expect(receipt.status).toBe('drift_detected');
      expect(receipt.delta).toBe(testCase.expectedDriftDelta);
      expect(receipt.receiptHash).toMatch(/^[a-z0-9]+$/);
    });
  }
});

describe('resourceAccountingHandler', () => {
  it('emits a receipt and drift event through the trait runtime surface', () => {
    const node = { id: 'node-1' };
    const emit = vi.fn();
    const adapter = cases[0].adapter;
    const config = {
      ...resourceAccountingHandler.defaultConfig!,
      adapters: [adapter],
    };

    resourceAccountingHandler.onAttach!(node as never, config, { emit } as never);
    resourceAccountingHandler.onEvent!(node as never, config, { emit } as never, {
      type: 'resource_accounting:record',
      payload: {
        ...claimFor(cases[0], cases[0].driftQuantity),
        adapterId: adapter.adapterId,
      },
    } as never);

    expect(emit).toHaveBeenCalledWith(
      'resource_accounting_drift_detected',
      expect.objectContaining({
        receipt: expect.objectContaining({ status: 'drift_detected' }),
      })
    );
    expect(emit).toHaveBeenCalledWith(
      'audit_log',
      expect.objectContaining({
        action: 'resource_accounting.audit',
        result: 'error',
      })
    );
  });
});
