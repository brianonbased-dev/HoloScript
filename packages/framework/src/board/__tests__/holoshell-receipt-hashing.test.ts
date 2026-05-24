import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHoloShellBuildCustodyReceipt,
  validateHoloShellBuildCustodyReceipt,
} from '../holoshell-build-custody-receipt';
import {
  createHoloShellWorldBuildReadyToken,
  validateHoloShellWorldBuildReadyToken,
  type WorldBuildGateResult,
} from '../holoshell-world-build-ready-token';

const HASH_RE = /^sha256:[a-f0-9]{64}$/;
const fixedNow = '2026-05-24T11:30:00.000Z';

function freezeGeneratedIds(): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(fixedNow));
  vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function makePassingGates(): WorldBuildGateResult[] {
  return [
    'local-source',
    'hardware-reality',
    'build-custody',
    'visual-witness',
    'codebase-graph-trust',
    'task-dirty-tree',
    'replay',
    'rollback',
  ].map((gateId) => ({
    gateId: gateId as WorldBuildGateResult['gateId'],
    status: 'pass' as const,
    receiptId: `${gateId}-receipt`,
    authorityProof: `sha256:${gateId}`,
    checkedAt: fixedNow,
  }));
}

describe('HoloShell receipt hashing', () => {
  it('builds WorldBuildReadyToken hashes from canonical payloads', () => {
    freezeGeneratedIds();

    const input = {
      gates: makePassingGates(),
      authorityMarkers: {
        localSourceBundleHash: 'sha256:local-source-bundle',
        hardwareAuditId: 'audit-codex-001',
        visualWitnessTunnelId: 'tunnel-quest-001',
        graphAuthoritySource: 'local' as const,
      },
      notes: ['all gates passed'],
      createdBy: 'codex-hardware',
    };

    const first = createHoloShellWorldBuildReadyToken(input);
    const second = createHoloShellWorldBuildReadyToken(input);

    expect(first.hash).toMatch(HASH_RE);
    expect(first.hash).not.toBe('placeholder-until-signed');
    expect(first.hash).toBe(second.hash);
    expect(validateHoloShellWorldBuildReadyToken(first)).toEqual([]);
  });

  it('changes WorldBuildReadyToken hashes when payload authority changes', () => {
    freezeGeneratedIds();

    const baseInput = {
      gates: makePassingGates(),
      authorityMarkers: {
        localSourceBundleHash: 'sha256:local-source-bundle',
        graphAuthoritySource: 'local' as const,
      },
      createdBy: 'codex-hardware',
    };

    const first = createHoloShellWorldBuildReadyToken(baseInput);
    const changed = createHoloShellWorldBuildReadyToken({
      ...baseInput,
      authorityMarkers: {
        localSourceBundleHash: 'sha256:different-local-source-bundle',
        graphAuthoritySource: 'local' as const,
      },
    });

    expect(changed.hash).toMatch(HASH_RE);
    expect(changed.hash).not.toBe(first.hash);
  });

  it('builds custody receipt hashes from canonical payloads', () => {
    freezeGeneratedIds();

    const input = {
      builtBy: 'codex-hardware',
      sourceRef: 'commit:abc1234',
      mcpHealthSnapshot: {
        mcpVersion: '6.1.0',
        healthy: true,
        graphAuthoritative: true,
        features: ['tools/list', 'sourceFiles'],
      },
      hardwareContext: {
        os: 'windows',
        cpu: 'local-cpu',
        gpus: ['gpu-a'],
        wasmSimd: true,
      },
      receiptsIncluded: ['local-source-receipt'],
      notes: ['native custody'],
      createdBy: 'codex-hardware',
    };

    const first = createHoloShellBuildCustodyReceipt(input);
    const second = createHoloShellBuildCustodyReceipt(input);

    expect(first.hash).toMatch(HASH_RE);
    expect(first.hash).not.toBe('placeholder-until-signed');
    expect(first.hash).toBe(second.hash);
    expect(validateHoloShellBuildCustodyReceipt(first)).toEqual([]);
  });

  it('changes custody receipt hashes when source custody changes', () => {
    freezeGeneratedIds();

    const first = createHoloShellBuildCustodyReceipt({
      builtBy: 'codex-hardware',
      sourceRef: 'commit:abc1234',
      createdBy: 'codex-hardware',
    });
    const changed = createHoloShellBuildCustodyReceipt({
      builtBy: 'codex-hardware',
      sourceRef: 'commit:def5678',
      createdBy: 'codex-hardware',
    });

    expect(changed.hash).toMatch(HASH_RE);
    expect(changed.hash).not.toBe(first.hash);
  });

  it('rejects legacy placeholder hashes in receipt validators', () => {
    freezeGeneratedIds();

    const worldToken = {
      ...createHoloShellWorldBuildReadyToken({
        gates: makePassingGates(),
        authorityMarkers: {
          localSourceBundleHash: 'sha256:local-source-bundle',
          graphAuthoritySource: 'local',
        },
        createdBy: 'codex-hardware',
      }),
      hash: 'placeholder-until-signed',
    };
    const custodyReceipt = {
      ...createHoloShellBuildCustodyReceipt({
        builtBy: 'codex-hardware',
        sourceRef: 'commit:abc1234',
        createdBy: 'codex-hardware',
      }),
      hash: 'placeholder-until-signed',
    };

    expect(validateHoloShellWorldBuildReadyToken(worldToken)).toContain(
      'HoloShellWorldBuildReadyToken.hash must be a computed sha256 receipt hash.'
    );
    expect(validateHoloShellBuildCustodyReceipt(custodyReceipt)).toContain(
      'HoloShellBuildCustodyReceipt.hash must be a computed sha256 receipt hash.'
    );
  });
});
