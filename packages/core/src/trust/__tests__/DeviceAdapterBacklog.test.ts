import { describe, expect, it } from 'vitest';
import {
  DEVICE_ADAPTER_CONTRACT_BACKLOG,
  getDeviceAdapterContractInstance,
  summarizeDeviceAdapterBacklog,
  validateDeviceAdapterContractInstance,
  type DeviceAdapterContractInstance,
} from '../DeviceAdapterBacklog';

function clone(instance: DeviceAdapterContractInstance): DeviceAdapterContractInstance {
  return structuredClone(instance);
}

describe('DeviceAdapterBacklog', () => {
  it('pins the device R&D adapter instances behind the digital-twin promotion gate', () => {
    expect(DEVICE_ADAPTER_CONTRACT_BACKLOG.map((instance) => instance.id)).toEqual([
      'matter-thread-home',
      'obd-ii-advisory',
      'sovereign-voice-puck',
      'tv-hololand-display-node',
      'health-wearables-bridge',
      'manufacturing-ros2-fill',
    ]);

    for (const instance of DEVICE_ADAPTER_CONTRACT_BACKLOG) {
      expect(instance.gate.digitalTwinPromotion).toBe('satisfied');
      expect(instance.gate.evidence).toContain(
        'docs/architecture/2026-05-14_trust-primitives-decision-record.md'
      );
      expect(validateDeviceAdapterContractInstance(instance).valid).toBe(true);
    }
  });

  it('summarizes priorities, blocked rows, and guarded mutation rows', () => {
    const summary = summarizeDeviceAdapterBacklog();

    expect(summary.total).toBe(6);
    expect(summary.byPriority).toEqual({ 1: 1, 2: 3, 3: 2 });
    expect(summary.blockedIds).toEqual(['health-wearables-bridge']);
    expect(summary.guardedMutationIds).toEqual([
      'matter-thread-home',
      'sovereign-voice-puck',
      'manufacturing-ros2-fill',
    ]);
  });

  it('finds a contract instance by id', () => {
    const instance = getDeviceAdapterContractInstance('obd-ii-advisory');

    expect(instance?.domain).toBe('vehicle');
    expect(instance?.trust.permissionEnvelope).toBe('read_only');
    expect(instance?.trust.outboundMutation).toBe('none');
  });

  it('rejects guarded outbound mutation paired with read_only permission', () => {
    const matter = clone(getDeviceAdapterContractInstance('matter-thread-home')!);
    matter.trust.permissionEnvelope = 'read_only';

    expect(validateDeviceAdapterContractInstance(matter).errors).toContain(
      'Guarded outbound mutation cannot use read_only permission'
    );
  });

  it('rejects break-glass mutation without break_glass permission', () => {
    const ros2 = clone(getDeviceAdapterContractInstance('manufacturing-ros2-fill')!);
    ros2.trust.permissionEnvelope = 'guarded_execute';

    expect(validateDeviceAdapterContractInstance(ros2).errors).toContain(
      'Break-glass outbound mutation must use break_glass permission'
    );
  });

  it('rejects health adapters without redacted sync support', () => {
    const health = clone(getDeviceAdapterContractInstance('health-wearables-bridge')!);
    health.trust.localPrivateDataRedaction = false;
    health.trust.allowedSyncStates = ['local_only'];

    expect(validateDeviceAdapterContractInstance(health).errors).toContain(
      'Health adapters require local-private redaction and redacted sync support'
    );
  });

  it('rejects rows that drop SimulationContract replay as Layer 3 oracle', () => {
    const tv = clone(getDeviceAdapterContractInstance('tv-hololand-display-node')!);
    tv.trust.layer3OracleRefKind = 'visual_witness' as never;

    expect(validateDeviceAdapterContractInstance(tv).errors).toContain(
      'Device adapters must name SimulationContract replay as Layer 3 oracle'
    );
  });
});
