/**
 * Tests for HoloShell physical actuation receipts.
 */

import { describe, expect, it } from 'vitest';
import {
  HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION,
  PHYSICAL_ACTUATION_WORKFLOW,
  validateActuationSimulationReceipt,
  validateSensorFreshnessReceipt,
  validateSafeStopReceipt,
  validatePhysicalRollbackLimitReceipt,
  validateHoloShellPhysicalActuationReceiptPack,
  cloneHoloShellPhysicalActuationReceiptPack,
  isSupportedPhysicalActuationAction,
  isSupportedPhysicalActuationStatus,
  isSupportedSafeStopStatus,
  isSupportedPhysicalRollbackClass,
  type ActuationSimulationReceipt,
  type SensorFreshnessReceipt,
  type SafeStopReceipt,
  type PhysicalRollbackLimitReceipt,
  type HoloShellPhysicalActuationReceiptPack,
} from '../holoshell-physical-actuation-receipts';

const validSimulation: ActuationSimulationReceipt = {
  id: 'sim-001',
  schemaVersion: HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION,
  workflow: PHYSICAL_ACTUATION_WORKFLOW,
  action: 'trigger_haptic',
  actorId: 'quest-3-redacted',
  simulatedAt: '2026-05-19T19:00:00Z',
  status: 'passed',
  deterministicPreview: true,
  expectedDeltaHash: 'sha256-expected-delta',
  safeRangeNames: ['haptic-intensity', 'duration-ms'],
  humanVisibleSummary: 'Quest controller haptic pulse preview stayed within safe bounds.',
  hash: 'sha256-sim',
  hashAlgorithm: 'sha256',
};

const validFreshness: SensorFreshnessReceipt = {
  id: 'fresh-001',
  schemaVersion: HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION,
  workflow: PHYSICAL_ACTUATION_WORKFLOW,
  actorId: 'quest-3-redacted',
  checkedAt: '2026-05-19T19:00:01Z',
  sensorFresh: true,
  approvalFresh: true,
  adapterHealthy: true,
  maxSensorAgeMs: 1000,
  observedSensorAgeMs: 42,
  approvalAgeMs: 100,
  ownerLaneFresh: true,
  hash: 'sha256-fresh',
  hashAlgorithm: 'sha256',
};

const validSafeStop: SafeStopReceipt = {
  id: 'stop-001',
  schemaVersion: HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION,
  workflow: PHYSICAL_ACTUATION_WORKFLOW,
  actorId: 'quest-3-redacted',
  status: 'armed',
  armedAt: '2026-05-19T19:00:02Z',
  stopAvailable: true,
  ownerHandoffRequired: true,
  stopInstruction: 'Press the visible stop lever or revoke the native device approval.',
  hash: 'sha256-stop',
  hashAlgorithm: 'sha256',
};

const validRollback: PhysicalRollbackLimitReceipt = {
  id: 'rollback-001',
  schemaVersion: HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION,
  workflow: PHYSICAL_ACTUATION_WORKFLOW,
  actorId: 'quest-3-redacted',
  rollbackClass: 'physical_limited',
  softwareReplayAvailable: true,
  physicalUndoGuaranteed: false,
  rollbackNote: 'Receipt and software state replay are deterministic; the physical pulse cannot be un-felt.',
  hash: 'sha256-rollback',
  hashAlgorithm: 'sha256',
};

const validPack: HoloShellPhysicalActuationReceiptPack = {
  id: 'physical-pack-001',
  schemaVersion: HOLOSHELL_PHYSICAL_ACTUATION_RECEIPT_VERSION,
  workflow: PHYSICAL_ACTUATION_WORKFLOW,
  status: 'ready',
  actorId: 'quest-3-redacted',
  action: 'trigger_haptic',
  simulation: validSimulation,
  freshness: validFreshness,
  safeStop: validSafeStop,
  rollbackLimit: validRollback,
  taskFiled: false,
  humanVisibleSummary: 'The room can now show a simulated, fresh, stoppable haptic action.',
  hash: 'sha256-pack',
  hashAlgorithm: 'sha256',
};

describe('HoloShell physical actuation receipts', () => {
  it('accepts a valid simulation receipt', () => {
    expect(validateActuationSimulationReceipt(validSimulation)).toEqual([]);
  });

  it('rejects a passed simulation without deterministic preview', () => {
    const errors = validateActuationSimulationReceipt({
      ...validSimulation,
      deterministicPreview: false,
    });
    expect(errors).toContain(
      'ActuationSimulationReceipt.deterministicPreview must be true when status=passed.'
    );
  });

  it('requires failed simulations to carry a reason', () => {
    const errors = validateActuationSimulationReceipt({
      ...validSimulation,
      status: 'failed',
      deterministicPreview: false,
    });
    expect(errors).toContain('ActuationSimulationReceipt.failureReason is required unless status=passed.');
  });

  it('accepts a valid freshness receipt', () => {
    expect(validateSensorFreshnessReceipt(validFreshness)).toEqual([]);
  });

  it('rejects stale sensors claiming freshness', () => {
    const errors = validateSensorFreshnessReceipt({
      ...validFreshness,
      maxSensorAgeMs: 100,
      observedSensorAgeMs: 101,
    });
    expect(errors).toContain(
      'SensorFreshnessReceipt.sensorFresh cannot be true when observedSensorAgeMs exceeds maxSensorAgeMs.'
    );
  });

  it('requires stale reasons when freshness gates are not satisfied', () => {
    const errors = validateSensorFreshnessReceipt({
      ...validFreshness,
      approvalFresh: false,
    });
    expect(errors).toContain(
      'SensorFreshnessReceipt.staleReason is required when freshness is not fully satisfied.'
    );
  });

  it('accepts a valid safe stop receipt', () => {
    expect(validateSafeStopReceipt(validSafeStop)).toEqual([]);
  });

  it('rejects armed stops that are unavailable', () => {
    const errors = validateSafeStopReceipt({
      ...validSafeStop,
      stopAvailable: false,
    });
    expect(errors).toContain('SafeStopReceipt.stopAvailable must be true when status is armed or triggered.');
  });

  it('accepts a valid rollback limit receipt', () => {
    expect(validatePhysicalRollbackLimitReceipt(validRollback)).toEqual([]);
  });

  it('never allows physicalUndoGuaranteed=true', () => {
    const errors = validatePhysicalRollbackLimitReceipt({
      ...validRollback,
      physicalUndoGuaranteed: true as false,
    });
    expect(errors).toContain('PhysicalRollbackLimitReceipt.physicalUndoGuaranteed must be false.');
  });

  it('requires irreversible warnings for irreversible_blocked rollback', () => {
    const errors = validatePhysicalRollbackLimitReceipt({
      ...validRollback,
      rollbackClass: 'irreversible_blocked',
    });
    expect(errors).toContain(
      'PhysicalRollbackLimitReceipt.irreversibleEffectWarning is required for irreversible_blocked.'
    );
  });

  it('accepts a valid ready pack', () => {
    expect(validateHoloShellPhysicalActuationReceiptPack(validPack)).toEqual([]);
  });

  it('rejects ready packs without satisfied freshness', () => {
    const errors = validateHoloShellPhysicalActuationReceiptPack({
      ...validPack,
      freshness: {
        ...validFreshness,
        approvalFresh: false,
        staleReason: 'approval expired',
      },
    });
    expect(errors).toContain(
      'HoloShellPhysicalActuationReceiptPack.ready states require satisfied freshness.'
    );
  });

  it('requires a device action for executed packs', () => {
    const errors = validateHoloShellPhysicalActuationReceiptPack({
      ...validPack,
      status: 'executed',
    });
    expect(errors).toContain(
      'HoloShellPhysicalActuationReceiptPack.deviceAction is required when status=executed.'
    );
  });

  it('requires blocked status for irreversible_blocked rollback', () => {
    const errors = validateHoloShellPhysicalActuationReceiptPack({
      ...validPack,
      rollbackLimit: {
        ...validRollback,
        rollbackClass: 'irreversible_blocked',
        irreversibleEffectWarning: 'This action could move a real object into an unsafe state.',
      },
    });
    expect(errors).toContain(
      'HoloShellPhysicalActuationReceiptPack.irreversible_blocked rollback requires blocked status.'
    );
  });

  it('clones packs without sharing nested receipt objects', () => {
    const clone = cloneHoloShellPhysicalActuationReceiptPack(validPack);
    expect(clone).toEqual(validPack);
    expect(clone).not.toBe(validPack);
    expect(clone.simulation).not.toBe(validPack.simulation);
    expect(clone.simulation.safeRangeNames).not.toBe(validPack.simulation.safeRangeNames);
    expect(clone.freshness).not.toBe(validPack.freshness);
    expect(clone.safeStop).not.toBe(validPack.safeStop);
    expect(clone.rollbackLimit).not.toBe(validPack.rollbackLimit);
  });

  it('exposes support guards for registry routing', () => {
    expect(isSupportedPhysicalActuationAction('trigger_haptic')).toBe(true);
    expect(isSupportedPhysicalActuationStatus('ready')).toBe(true);
    expect(isSupportedSafeStopStatus('armed')).toBe(true);
    expect(isSupportedPhysicalRollbackClass('physical_limited')).toBe(true);
    expect(isSupportedPhysicalActuationAction('launch_missile')).toBe(false);
  });
});
