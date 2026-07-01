import { describe, expect, it } from 'vitest';
import {
  HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION,
  buildHfCompatibleArtifactPublisherDryRun,
  validateHfArtifactPublisherReceipt,
  type HfArtifactPublisherInput,
} from '../hf-compatible-artifact-publisher';

const FIXTURE_BUNDLE: HfArtifactPublisherInput = {
  artifactId: 'lotus-agent-bundle',
  title: 'Lotus Agent Bundle',
  summary: 'Semantic scene, twin, agent, target manifest, dataset, and validation receipt.',
  license: 'apache-2.0',
  tags: ['holoscript', 'semantic-scene', 'agent', 'x402', 'cael'],
  artifacts: [
    {
      kind: 'semantic-scene',
      path: 'artifacts/lotus.scene.holo',
      mediaType: 'text/holoscript+holo',
      sha256: 'sha256:scene',
    },
    {
      kind: 'digital-twin',
      path: 'artifacts/lotus.twin.holo',
      mediaType: 'text/holoscript+holo',
      sha256: 'sha256:twin',
    },
    {
      kind: 'agent',
      path: 'artifacts/lotus-agent.hsplus',
      mediaType: 'text/holoscript+hsplus',
      sha256: 'sha256:agent',
    },
    {
      kind: 'target-manifest',
      path: 'manifests/webxr.target.json',
      mediaType: 'application/json',
      sha256: 'sha256:target',
    },
    {
      kind: 'example-dataset',
      path: 'datasets/lotus-examples.jsonl',
      mediaType: 'application/jsonl',
      sha256: 'sha256:dataset',
    },
    {
      kind: 'validation-receipt',
      path: 'receipts/validation-receipt.json',
      mediaType: 'application/json',
      sha256: 'sha256:receipt',
    },
  ],
  provenance: {
    caelTraceHash: 'cael:trace-hash',
    holomeshSignature: 'holomesh:sig',
    x402ReceiptHash: 'x402:receipt-hash',
    sourceCommit: '83ecdea90d2d0189aa48ff65524ea41f30f0deff',
  },
  spacesDemo: {
    sdk: 'static',
    appFile: 'spaces/README.md',
  },
  holohub: {
    collection: 'starter-agents',
    curationTags: ['holohub', 'native-first'],
  },
};

describe('HF-compatible HoloScript artifact publisher (CG-026)', () => {
  it('builds a no-token dry-run receipt with HF cards and Spaces manifest', () => {
    const receipt = buildHfCompatibleArtifactPublisherDryRun(FIXTURE_BUNDLE);

    expect(receipt.schemaVersion).toBe(HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION);
    expect(receipt.type).toBe('HFCompatibleHoloScriptArtifactPublisherDryRunReceipt');
    expect(receipt.noTokenDryRun).toBe(true);
    expect(receipt.secretsIncluded).toBe(false);
    expect(receipt.layout.root).toBe('hf-compatible/lotus-agent-bundle');
    expect(receipt.layout.files).toContain('model-card.md');
    expect(receipt.layout.files).toContain('dataset-card.md');
    expect(receipt.layout.files).toContain('spaces/README.md');
    expect(receipt.spacesDemo.readmeBlock).toContain('Lotus Agent Bundle');
  });

  it('records model-card, dataset-card, CAEL, HoloMesh, and x402 fields by schema', () => {
    const receipt = buildHfCompatibleArtifactPublisherDryRun(FIXTURE_BUNDLE);

    expect(Object.keys(receipt.cards.modelCard).sort()).toEqual(
      ['artifacts', 'license', 'summary', 'tags', 'title'].sort()
    );
    expect(receipt.cards.datasetCard.artifacts).toEqual([
      {
        kind: 'example-dataset',
        path: 'datasets/lotus-examples.jsonl',
        sha256: 'sha256:dataset',
      },
    ]);
    expect(receipt.provenance.caelTraceHash).toBe('cael:trace-hash');
    expect(receipt.provenance.holomeshSignature).toBe('holomesh:sig');
    expect(receipt.provenance.x402ReceiptHash).toBe('x402:receipt-hash');
    expect(receipt.provenance.redacted).toBe(true);
  });

  it('classifies the fixture as publishable to both HF-compatible layout and HoloHub', () => {
    const receipt = buildHfCompatibleArtifactPublisherDryRun(FIXTURE_BUNDLE);

    expect(receipt.publishability.classification).toBe('both');
    expect(receipt.publishability.reasons).toContain('license declared');
    expect(receipt.publishability.reasons).toContain('HoloHub curation metadata declared');
  });

  it('keeps HoloHub-only bundles out of the HF-compatible class', () => {
    const receipt = buildHfCompatibleArtifactPublisherDryRun({
      ...FIXTURE_BUNDLE,
      artifacts: FIXTURE_BUNDLE.artifacts.map((artifact) =>
        artifact.kind === 'agent' ? { ...artifact, holohubOnly: true } : artifact
      ),
    });

    expect(receipt.publishability.classification).toBe('holohub-only');
    expect(receipt.publishability.reasons).toContain(
      'one or more artifacts require HoloHub runtime custody'
    );
  });

  it('validates a well-formed receipt as valid', () => {
    const receipt = buildHfCompatibleArtifactPublisherDryRun(FIXTURE_BUNDLE);
    expect(validateHfArtifactPublisherReceipt(receipt)).toEqual({ valid: true, errors: [] });
  });

  it('rejects missing cards and provenance hashes', () => {
    const result = validateHfArtifactPublisherReceipt({
      schemaVersion: HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION,
      type: 'HFCompatibleHoloScriptArtifactPublisherDryRunReceipt',
      noTokenDryRun: true,
      secretsIncluded: false,
      layout: { root: 'hf-compatible/x', files: [] },
      spacesDemo: { sdk: 'static', appFile: 'spaces/README.md', readmeBlock: 'demo' },
      provenance: { caelTraceHash: '', redacted: true },
      holohub: { collection: 'x', curationTags: [], marketplaceCompatible: false },
      publishability: { classification: 'both', reasons: [] },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cards must be an object');
    expect(result.errors).toContain('provenance.holomeshSignature is required');
    expect(result.errors).toContain('provenance.x402ReceiptHash is required');
  });

  it('rejects token-shaped fields in dry-run receipts', () => {
    const receipt = buildHfCompatibleArtifactPublisherDryRun(FIXTURE_BUNDLE);
    const result = validateHfArtifactPublisherReceipt({
      ...receipt,
      hfToken: 'hf_redacted',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'receipt must not contain token, secret, apiKey, or credential fields'
    );
  });
});
