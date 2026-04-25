import { describe, it, expect } from 'vitest';
import { readJson } from '../../errors/safeJsonParse';
import {
  buildGistPublicationManifest,
  computeProvenanceSemiringDigestV0,
  provenanceDocumentIdForRoom,
  serializeGistPublicationManifest,
  computeXrMetricsCommitmentHash,
  resolveXrMetricsConflict,
  xrMetricsMapKey,
  extractXrMetricsForBinding,
  type Film3dXrMetricsForBinding,
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

  it('embeds optional film3d_attestation (WebXR / Film3D policy binding)', () => {
    const m = buildGistPublicationManifest({
      room: 'r-film',
      loroDocVersion: { v: 1 },
      film3dAttestation: {
        scheme: 'webxr-session-v0',
        session_id: 'sess_abc',
        captured_at_iso: '2026-04-20T12:00:00.000Z',
        device_summary: { display: 'quest3' },
      },
    });
    expect(m.film3d_attestation?.scheme).toBe('webxr-session-v0');
    expect(m.film3d_attestation?.session_id).toBe('sess_abc');
    expect(m.film3d_attestation?.device_summary?.display).toBe('quest3');
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

  // =========================================================================
  // XR→CRDT BINDING TESTS: sidecar → bound state before manifest signing
  // =========================================================================

  it('extracts Film3D XR metrics for binding', () => {
    const metrics = extractXrMetricsForBinding({
      depthHash: 'sha256_deadbeef',
      gazeSignature: 'ed25519_sig_abc123',
      frameCount: 150,
      sensorId: 'webglrenderer-session-1',
      timestamp: new Date('2026-04-16T14:30:00Z'),
    });

    expect(metrics.depthHash).toBe('sha256_deadbeef');
    expect(metrics.gazeSignature).toBe('ed25519_sig_abc123');
    expect(metrics.frameCount).toBe(150);
    expect(metrics.sensorId).toBe('webglrenderer-session-1');
    expect(metrics.timestamp).toBe('2026-04-16T14:30:00.000Z');
  });

  it('computes xr_metrics commitment hash (excludes timestamp/mergeNote)', () => {
    const metrics1: Film3dXrMetricsForBinding = {
      depthHash: 'abc123',
      gazeSignature: 'sig_xyz',
      frameCount: 75,
      sensorId: 'sensor-1',
      timestamp: '2026-04-16T10:00:00Z',
    };

    const metrics2: Film3dXrMetricsForBinding = {
      ...metrics1,
      timestamp: '2026-04-16T11:00:00Z', // Different timestamp
      mergeNote: 'manual resolution', // Different note
    };

    // Same commitment hash despite timestamp/note differences (evidence is what matters)
    const hash1 = computeXrMetricsCommitmentHash(metrics1);
    const hash2 = computeXrMetricsCommitmentHash(metrics2);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  it('resolves xr_metrics conflict via max frameCount', () => {
    const local: Film3dXrMetricsForBinding = {
      depthHash: 'depth_a',
      gazeSignature: 'gaze_a',
      frameCount: 200, // Higher frame count = more evidence
      sensorId: 'sensor-left',
      timestamp: '2026-04-16T10:00:00Z',
    };

    const remote: Film3dXrMetricsForBinding = {
      depthHash: 'depth_b',
      gazeSignature: 'gaze_b',
      frameCount: 150, // Lower
      sensorId: 'sensor-right',
      timestamp: '2026-04-16T10:00:00Z',
    };

    const resolved = resolveXrMetricsConflict(local, remote);
    expect(resolved.depthHash).toBe('depth_a'); // Kept from local (higher frameCount)
    expect(resolved.frameCount).toBe(200);
    expect(resolved.mergeNote).toContain('max frameCount: 200');
  });

  it('resolves xr_metrics conflict via max timestamp when frameCount ties', () => {
    const ts1 = '2026-04-16T10:00:00Z';
    const ts2 = '2026-04-16T11:30:00Z';

    const local: Film3dXrMetricsForBinding = {
      depthHash: 'depth_x',
      gazeSignature: 'gaze_x',
      frameCount: 100, // Same
      sensorId: 'sensor-a',
      timestamp: ts1, // Earlier
    };

    const remote: Film3dXrMetricsForBinding = {
      depthHash: 'depth_y',
      gazeSignature: 'gaze_y',
      frameCount: 100, // Same
      sensorId: 'sensor-b',
      timestamp: ts2, // Later
    };

    const resolved = resolveXrMetricsConflict(local, remote);
    expect(resolved.depthHash).toBe('depth_y'); // Kept from remote (more recent)
    expect(resolved.timestamp).toBe(ts2);
    expect(resolved.mergeNote).toContain('max timestamp');
    expect(resolved.mergeNote).toContain('frameCount tied at 100');
  });

  it('formats xr_metrics map key as ${manifestId}:xr:film3d', () => {
    const key = xrMetricsMapKey('manifest-uuid-12345');
    expect(key).toBe('manifest-uuid-12345:xr:film3d');
  });

  it('round-trips xr_metrics through manifest with commitment hash stable', () => {
    const metrics = extractXrMetricsForBinding({
      depthHash: 'deadbeef_depth',
      gazeSignature: 'abcdef_gaze',
      frameCount: 120,
      sensorId: 'device-001',
    });

    const commitment1 = computeXrMetricsCommitmentHash(metrics);

    // Build manifest with these metrics
    const manifest = buildGistPublicationManifest({
      room: 'test-xr-binding',
      loroDocVersion: { Frontiers: 'abc' },
      xrMetrics: metrics as Record<string, unknown>,
    });

    expect(manifest.xr_metrics).toEqual(metrics);

    // Simulate retrieval + re-binding (commitment hash should be stable)
    const retrieved = manifest.xr_metrics as Film3dXrMetricsForBinding;
    const commitment2 = computeXrMetricsCommitmentHash(retrieved);
    expect(commitment1).toBe(commitment2);

    // Provenance semiring includes the metrics
    expect(manifest.provenance_semiring_digest?.digest_hex).toHaveLength(64);

    // Serialize and deserialize
    const serialized = serializeGistPublicationManifest(manifest);
    const parsed = readJson(serialized);
    const commitment3 = computeXrMetricsCommitmentHash(parsed.xr_metrics);
    expect(commitment1).toBe(commitment3);
  });

  it('detects metrics tampering via commitment hash mismatch', () => {
    const original = extractXrMetricsForBinding({
      depthHash: 'original_depth',
      gazeSignature: 'original_gaze',
      frameCount: 100,
      sensorId: 'sensor-clean',
    });

    const originalCommitment = computeXrMetricsCommitmentHash(original);

    // Tamper: change frameCount
    const tampered: Film3dXrMetricsForBinding = {
      ...original,
      frameCount: 999, // Attacker boost
    };

    const tamperedCommitment = computeXrMetricsCommitmentHash(tampered);
    expect(originalCommitment).not.toBe(tamperedCommitment);
  });
});

