import { describe, it, expect } from 'vitest';
import {
  buildGistPublicationManifest,
  computeProvenanceSemiringDigestV0,
  provenanceDocumentIdForRoom,
  serializeGistPublicationManifest,
} from '../GistPublicationManifest';

describe('GistPublicationManifest', () => {
  it('names provenance document from room', () => {
    expect(provenanceDocumentIdForRoom('film3d-room-7')).toBe('provenance_receipt_film3d-room-7');
  });

  it('builds manifest with Loro version and optional x402', () => {
    const m = buildGistPublicationManifest({
      room: 'r1',
      loroDocVersion: { Frontiers: 'abc' },
      x402Receipt: { payment_id: 'x402_1', network: 'base' },
      title: 'Test export',
    });
    expect(m.holoscript_publication_manifest_version).toBe('0.1.0');
    expect(m.provenance_receipt.document_id).toBe('provenance_receipt_r1');
    expect(m.provenance_receipt.loro_doc_version).toEqual({ Frontiers: 'abc' });
    expect(m.x402_receipt?.payment_id).toBe('x402_1');
    expect(m.x402_receipt?.network).toBe('base');
    expect(m.provenance_semiring_digest?.scheme).toBe('sha256_canonical_v0');
    expect(m.provenance_semiring_digest?.digest_hex).toHaveLength(64);
  });

  it('omits x402 when absent', () => {
    const m = buildGistPublicationManifest({
      room: 'r2',
      loroDocVersion: {},
    });
    expect(m.x402_receipt).toBeUndefined();
  });

  it('embeds optional xr_metrics (Film3D / WebXR physical origination)', () => {
    const m = buildGistPublicationManifest({
      room: 'room-alpha-9',
      loroDocVersion: { Frontiers: 'x' },
      xrMetrics: {
        hitTestCount: 12,
        occlusionProofAcquired: true,
        depthSensingActive: true,
      },
    });
    expect(m.xr_metrics?.hitTestCount).toBe(12);
    expect(m.xr_metrics?.occlusionProofAcquired).toBe(true);
    const standalone = computeProvenanceSemiringDigestV0({
      room: 'room-alpha-9',
      loroDocVersion: { Frontiers: 'x' },
      xrMetrics: m.xr_metrics,
    });
    expect(m.provenance_semiring_digest?.digest_hex).toBe(standalone.digest_hex);
  });

  it('omits semiring digest when includeSemiringDigest is false', () => {
    const m = buildGistPublicationManifest({
      room: 'z',
      loroDocVersion: {},
      includeSemiringDigest: false,
    });
    expect(m.provenance_semiring_digest).toBeUndefined();
  });

  it('serializes to pretty JSON', () => {
    const s = serializeGistPublicationManifest(
      buildGistPublicationManifest({ room: 'x', loroDocVersion: { k: 1 } })
    );
    expect(s).toContain('"room": "x"');
    expect(s.endsWith('\n')).toBe(true);
  });
});
