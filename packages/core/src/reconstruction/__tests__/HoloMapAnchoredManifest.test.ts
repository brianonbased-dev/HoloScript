import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { assertHoloMapManifestContract } from '../simulationContractBinding';
import { mergeAnchoredProvenance } from '../holoMapAnchoredManifest';
import type { ReconstructionManifest } from '../HoloMapRuntime';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Anchored manifest (OA3)', () => {
  it('example JSON satisfies contract', () => {
    const raw = readFileSync(join(__dirname, '../__fixtures__/ANCHORED_MANIFEST_EXAMPLE.json'), 'utf8');
    const m = JSON.parse(raw) as ReconstructionManifest;
    expect(() => assertHoloMapManifestContract(m)).not.toThrow();
    expect(m.provenance.opentimestampsProof).toContain('.ots');
    expect(m.provenance.baseCalldataTx).toContain('tx/');
  });

  it('mergeAnchoredProvenance fills URLs', () => {
    const base: ReconstructionManifest = JSON.parse(
      readFileSync(join(__dirname, '../__fixtures__/ANCHORED_MANIFEST_EXAMPLE.json'), 'utf8'),
    ) as ReconstructionManifest;
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
});
