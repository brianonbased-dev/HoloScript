import { describe, expect, it } from 'vitest';
import {
  HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION,
  cloneHoloShellLegacyAppRealitySnapshot,
  isSupportedHoloShellLegacyLaneColor,
  isSupportedHoloShellLegacyProcessRole,
  validateHoloShellLegacyAppRealitySnapshot,
  type HoloShellLegacyAppRealitySnapshot,
} from '../holoshell-legacy-app-reality';

function fixture(): HoloShellLegacyAppRealitySnapshot {
  return {
    schemaVersion: HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION,
    generatedAt: '2026-05-16T03:00:00.000Z',
    platform: 'win32',
    sourceAnchors: {
      source: 'apps/holoshell/source/holoshell-home.hsplus',
      adapter: 'scripts/holoshell-legacy-app-reality.mjs',
      processHealth: '.tmp/holoshell/process-health.json',
      networkReality: '.tmp/holoshell/network-reality.json',
      legacyWindowInventory: '.tmp/holoshell/legacy-window-inventory.json',
    },
    summary: {
      processCount: 3,
      visibleWindowCount: 2,
      agentInstanceCount: 1,
      shellInstanceCount: 1,
      legacyAppCount: 1,
      browserCount: 1,
      networkConsumerCount: 1,
      heavyNetworkConsumerCount: 0,
      colorLaneCount: 2,
      processCountIsPeerCount: false,
      confidence: 'fixture',
    },
    lanes: [
      {
        laneId: 'codex',
        label: 'Codex',
        color: 'cyan',
        agentKind: 'codex',
        processCount: 1,
        visibleWindowCount: 1,
        networkConsumerCount: 0,
        primaryPid: 101,
        evidence: ['process_name'],
      },
      {
        laneId: 'browser',
        label: 'Browser',
        color: 'blue',
        agentKind: 'browser',
        processCount: 1,
        visibleWindowCount: 1,
        networkConsumerCount: 1,
        primaryPid: 202,
        evidence: ['network_connection_owner'],
      },
    ],
    processes: [
      {
        pid: 101,
        parentPid: null,
        processName: 'codex',
        role: 'ai_peer_surface',
        laneId: 'codex',
        laneColor: 'cyan',
        agentKind: 'codex',
        hasVisibleWindow: true,
        networkPosture: 'none',
        custodyStatus: 'observed',
        memoryBytes: 1000,
        cpuSeconds: 1,
        startedAt: '2026-05-16T02:00:00.000Z',
        evidence: ['process_table', 'visible_window'],
      },
      {
        pid: 202,
        processName: 'chrome',
        role: 'browser',
        laneId: 'browser',
        laneColor: 'blue',
        hasVisibleWindow: true,
        networkPosture: 'active',
        custodyStatus: 'owner_unknown',
        evidence: ['process_table', 'network_connection_owner'],
      },
      {
        pid: 303,
        processName: 'notepad',
        role: 'legacy_app',
        hasVisibleWindow: false,
        networkPosture: 'none',
        custodyStatus: 'safe_to_review',
        evidence: ['process_table'],
      },
    ],
    windows: [
      {
        id: 'window-codex',
        title: 'Codex',
        processId: 101,
        processName: 'codex',
        role: 'ai_peer_surface',
        laneId: 'codex',
        laneColor: 'cyan',
        visible: true,
        evidence: ['visible_window'],
      },
      {
        id: 'window-browser',
        title: 'Browser',
        processId: 202,
        processName: 'chrome',
        role: 'browser',
        laneId: 'browser',
        laneColor: 'blue',
        visible: true,
        evidence: ['visible_window'],
      },
    ],
    networkConsumers: [
      {
        pid: 202,
        processName: 'chrome',
        role: 'browser',
        laneId: 'browser',
        networkPosture: 'active',
        connectionCount: 3,
        evidence: ['network_connection_owner'],
      },
    ],
    redaction: {
      localOnly: true,
      commandLinesIncluded: false,
      commandLinesRedacted: true,
      rawWindowTitlesIncluded: true,
      remoteEndpointsIncluded: false,
      secretsRedacted: true,
    },
    receipt: {
      receiptType: 'legacy_app_reality_snapshot',
      actionTaken: 'self_test_snapshot',
      mutationPerformed: false,
      snapshotHash: 'fixture-hash',
      hashAlgorithm: 'sha256',
      emittedAt: '2026-05-16T03:00:00.000Z',
    },
  };
}

describe('HoloShell legacy app reality schema', () => {
  it('accepts a local-only process/window/network snapshot', () => {
    expect(validateHoloShellLegacyAppRealitySnapshot(fixture())).toEqual([]);
  });

  it('rejects peer-count conflation and unsupported colors', () => {
    const snapshot = fixture();
    snapshot.summary.processCountIsPeerCount = true as false;
    snapshot.processes[0].laneColor = 'purple' as never;

    expect(validateHoloShellLegacyAppRealitySnapshot(snapshot)).toEqual(
      expect.arrayContaining([
        'summary.processCountIsPeerCount must be false.',
        'processes[0].laneColor is unsupported: purple.',
      ])
    );
  });

  it('clones arrays without sharing mutable evidence', () => {
    const snapshot = fixture();
    const cloned = cloneHoloShellLegacyAppRealitySnapshot(snapshot);
    cloned.processes[0].evidence.push('mutated');

    expect(snapshot.processes[0].evidence).toEqual(['process_table', 'visible_window']);
    expect(cloned.processes[0].evidence).toContain('mutated');
  });

  it('exposes type guards for adapter lane mapping', () => {
    expect(isSupportedHoloShellLegacyProcessRole('browser')).toBe(true);
    expect(isSupportedHoloShellLegacyProcessRole('spreadsheet')).toBe(false);
    expect(isSupportedHoloShellLegacyLaneColor('cyan')).toBe(true);
    expect(isSupportedHoloShellLegacyLaneColor('purple')).toBe(false);
  });
});
