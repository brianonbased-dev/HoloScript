import { describe, expect, it } from 'vitest';
import {
  HOLOABSORB_MANIFEST_SCHEMA,
  HOLOABSORB_PRODUCT_NAME,
  auditHoloAbsorbManifest,
  buildHoloAbsorbManifest,
} from './index';

describe('HoloAbsorb product manifest', () => {
  it('declares the official umbrella while preserving compatibility boundaries', () => {
    const manifest = buildHoloAbsorbManifest();

    expect(manifest.schemaVersion).toBe(HOLOABSORB_MANIFEST_SCHEMA);
    expect(manifest.productName).toBe(HOLOABSORB_PRODUCT_NAME);
    expect(manifest.canonicalPackage).toBe('@holoscript/absorb-service');
    expect(manifest.serviceSlug).toBe('absorb-service');
    expect(manifest.consumerSpine).toBe('@holoscript/absorb-service/gev');
    expect(manifest.renameRequired).toBe(false);
  });

  it('folds every declared lane into exactly one canonical capability owner', () => {
    const manifest = buildHoloAbsorbManifest();
    const ids = manifest.capabilities.map((capability) => capability.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'ingest',
        'holograph',
        'holoembed',
        'graphrag',
        'synthesis',
        'spatial-output',
        'transport-authority',
        'self-improvement',
        'service-host',
        'evidence',
      ])
    );
  });

  it('distinguishes deliberate aliases from duplicate implementations', () => {
    const manifest = buildHoloAbsorbManifest();
    const queryAlias = manifest.aliases.find((entry) => entry.alias === 'absorb_query');
    const structuralAlias = manifest.aliases.find((entry) => entry.alias === 'structural');

    expect(queryAlias).toMatchObject({
      canonical: 'holo_semantic_search',
      disposition: 'compatibility-alias',
    });
    expect(structuralAlias).toMatchObject({
      canonical: 'holoembed',
      disposition: 'legacy-alias',
    });
  });

  it('self-audits with no duplicate owners or missing evidence declarations', () => {
    const audit = auditHoloAbsorbManifest();

    expect(audit.status).toBe('pass');
    expect(audit.errors).toEqual([]);
    expect(audit.checks.every((check) => check.status === 'pass')).toBe(true);
  });

  it('reports missing observed surfaces instead of claiming completeness', () => {
    const audit = auditHoloAbsorbManifest({
      observedToolNames: ['holo_absorb_repo'],
      observedPaths: ['packages/absorb-service/src/engine/index.ts'],
    });

    expect(audit.status).toBe('fail');
    expect(audit.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Missing observed HoloAbsorb tools'),
        expect.stringContaining('Missing observed HoloAbsorb paths'),
      ])
    );
  });
});
