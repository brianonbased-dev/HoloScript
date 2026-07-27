import { readFileSync } from 'node:fs';
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

  it('owns the resilient stdio lease lifecycle under transport authority', () => {
    const manifest = buildHoloAbsorbManifest();
    const transport = manifest.capabilities.find(
      (capability) => capability.id === 'transport-authority'
    );

    expect(transport?.evidencePaths).toEqual(
      expect.arrayContaining([
        'scripts/holoscript-mcp-stdio.mjs',
        'scripts/lib/mcp-process-lifecycle.mjs',
        'scripts/__tests__/mcp-process-lifecycle.test.mjs',
        'packages/absorb-service/scripts/bench-holoabsorb-transport.mjs',
      ])
    );
  });

  it('freezes external literal-pixel confirmation without claiming results', () => {
    const manifest = buildHoloAbsorbManifest();
    const paper = manifest.papers.find((entry) => entry.id === 'paper-5-graphrag');
    const protocol = JSON.parse(
      readFileSync(
        new URL('../../benchmarks/paper-5-visual-agent-study-v4.json', import.meta.url),
        'utf8'
      )
    );

    expect(
      manifest.capabilities
        .find((capability) => capability.id === 'evidence')
        ?.evidencePaths
    ).toContain('packages/absorb-service/benchmarks/paper-5-visual-agent-study-v4.json');
    expect(paper?.claimBoundary).toContain('four-arm factorial confirmation');
    expect(paper?.benchmarkCommands).toContain(
      'node packages/absorb-service/scripts/bench-holoabsorb-hybrid.mjs --visual-focus-only --repo=packages/absorb-service --max-files=2000'
    );
    expect(paper?.claimBoundary).toContain('wrong-resolved arms');
    expect(protocol.design.arms).toHaveLength(4);
    expect(protocol.design.visualProjection.requireActualImageContentPart).toBe(true);
    expect(protocol.dataset.minimumExternalCodebases).toBeGreaterThanOrEqual(3);
    expect(protocol.dataset.minimumQueries).toBeGreaterThanOrEqual(90);
    expect(protocol.claimBoundary.publicationReady).toBe(false);
    expect(protocol.claimBoundary.literalPixelVisionMeasured).toBe(false);
    const evidence = manifest.capabilities.find((capability) => capability.id === 'evidence');
    expect(evidence?.evidencePaths).toEqual(
      expect.arrayContaining([
        'packages/absorb-service/scripts/audit-paper-5-visual-v4.mjs',
        'packages/absorb-service/scripts/prepare-paper-5-visual-v4.mjs',
        'packages/absorb-service/scripts/lib/paper-5-visual-v4.mjs',
      ])
    );
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
