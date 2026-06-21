import { readFileSync } from 'node:fs';
import { readJson } from '../../errors/safeJsonParse';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertHoloMapManifestContract } from '../simulationContractBinding';
import {
  anchorReconstructionManifest,
  computeReconstructionManifestDigest,
  mergeAnchoredProvenance,
  type HoloMapAnchorRequest,
} from '../holoMapAnchoredManifest';
import type { ReconstructionManifest } from '../HoloMapRuntime';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readAnchoredFixture(): ReconstructionManifest {
  return readJson(
    readFileSync(join(__dirname, '../__fixtures__/ANCHORED_MANIFEST_EXAMPLE.json'), 'utf8')
  ) as ReconstructionManifest;
}

describe('Anchored manifest (OA3)', () => {
  it('example JSON satisfies contract', () => {
    const raw = readFileSync(
      join(__dirname, '../__fixtures__/ANCHORED_MANIFEST_EXAMPLE.json'),
      'utf8'
    );
    const m = readJson(raw) as ReconstructionManifest;
    expect(() => assertHoloMapManifestContract(m)).not.toThrow();
    expect(m.provenance.opentimestampsProof).toContain('.ots');
    expect(m.provenance.baseCalldataTx).toContain('tx/');
  });

  it('mergeAnchoredProvenance fills URLs', () => {
    const base = readAnchoredFixture();
    const cleared = {
      ...base,
      provenance: { capturedAtIso: base.provenance.capturedAtIso },
    };
    const merged = mergeAnchoredProvenance(cleared, {
      anchorHash: '0xabc',
      opentimestampsProof: 'https://ots.example.com/x.ots',
      baseCalldataTx: 'https://basescan.org/tx/0xdead',
    });
    expect(merged.provenance.anchorHash).toBe('0xabc');
    expect(merged.provenance.opentimestampsProof).toContain('ots.example.com');
    assertHoloMapManifestContract(merged);
  });

  it('computes a stable digest with anchor URLs stripped', async () => {
    const base = readAnchoredFixture();
    const digest = await computeReconstructionManifestDigest(base);
    const mutatedAnchors = {
      ...base,
      provenance: {
        anchorHash: '0xchanged',
        opentimestampsProof: 'https://ots.example.com/changed.ots',
        baseCalldataTx: 'https://basescan.org/tx/0xchanged',
        capturedAtIso: base.provenance.capturedAtIso,
      },
    };

    await expect(computeReconstructionManifestDigest(mutatedAnchors)).resolves.toBe(digest);
    expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('anchors through a provider with canonical manifest evidence', async () => {
    const base = readAnchoredFixture();
    const cleared = {
      ...base,
      provenance: { capturedAtIso: base.provenance.capturedAtIso },
    };
    let request: HoloMapAnchorRequest | undefined;

    const anchored = await anchorReconstructionManifest(cleared, {
      anchorManifest(anchorRequest) {
        request = anchorRequest;
        return {
          anchorHash: anchorRequest.manifestDigest,
          opentimestampsProof: `https://ots.example.com/${anchorRequest.replayHash}.ots`,
          baseCalldataTx: `https://basescan.org/tx/0x${anchorRequest.replayFingerprint}`,
        };
      },
    });

    expect(request?.manifestDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(request?.manifest.provenance.anchorHash).toBeUndefined();
    expect(anchored.provenance.anchorHash).toBe(request?.manifestDigest);
    expect(anchored.provenance.opentimestampsProof).toContain('.ots');
    expect(anchored.provenance.baseCalldataTx).toContain('basescan.org/tx/');
    assertHoloMapManifestContract(anchored);
  });

  it('falls back to self-attested provenance without provider anchors', async () => {
    const base = readAnchoredFixture();
    const cleared = {
      ...base,
      provenance: { capturedAtIso: base.provenance.capturedAtIso },
    };

    const anchored = await anchorReconstructionManifest(cleared, {
      anchorManifest: () => undefined,
    });

    expect(anchored.provenance.anchorHash).toBe(`self-attested:${base.replayHash}`);
    expect(anchored.provenance.opentimestampsProof).toBeUndefined();
    expect(anchored.provenance.baseCalldataTx).toBeUndefined();
  });
});
