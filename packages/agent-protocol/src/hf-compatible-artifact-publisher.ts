/**
 * HF-compatible HoloScript artifact publisher contract (CG-026).
 *
 * This is a bridge-not-replace publisher surface: it projects HoloScript
 * artifacts into a Hugging Face-compatible repository layout while preserving
 * HoloHub curation metadata, HoloMesh signatures, x402 receipt hashes, and
 * CAEL provenance. It performs no network I/O and consumes no HF token.
 */

export const HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION = 'holoscript.hf-artifact-publisher.v1' as const;

export type HfArtifactPublisherSchema = typeof HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION;

export type HoloScriptArtifactKind =
  | 'semantic-scene'
  | 'digital-twin'
  | 'agent'
  | 'target-manifest'
  | 'example-dataset'
  | 'validation-receipt';

export type HfHoloHubPublishClass = 'hf-publishable' | 'holohub-only' | 'both';

export interface HoloScriptArtifactDescriptor {
  kind: HoloScriptArtifactKind;
  path: string;
  mediaType: string;
  sha256: string;
  holohubOnly?: boolean;
}

export interface HoloScriptArtifactProvenance {
  caelTraceHash: string;
  holomeshSignature: string;
  x402ReceiptHash: string;
  sourceCommit: string;
}

export interface HfArtifactPublisherInput {
  artifactId: string;
  title: string;
  summary: string;
  license: string;
  tags: string[];
  artifacts: HoloScriptArtifactDescriptor[];
  provenance: HoloScriptArtifactProvenance;
  spacesDemo: {
    sdk: 'static' | 'gradio' | 'docker';
    appFile: string;
  };
  holohub: {
    collection: string;
    curationTags: string[];
  };
}

export interface HfCardMetadata {
  title: string;
  summary: string;
  license: string;
  tags: string[];
  artifacts: Array<{
    kind: HoloScriptArtifactKind;
    path: string;
    sha256: string;
  }>;
}

export interface HfSpacesDemoManifest {
  sdk: 'static' | 'gradio' | 'docker';
  appFile: string;
  readmeBlock: string;
}

export interface HoloHubPublisherMetadata {
  collection: string;
  curationTags: string[];
  marketplaceCompatible: boolean;
}

export interface HfArtifactPublisherReceipt {
  schemaVersion: HfArtifactPublisherSchema;
  type: 'HFCompatibleHoloScriptArtifactPublisherDryRunReceipt';
  createdAt: string;
  noTokenDryRun: true;
  secretsIncluded: false;
  layout: {
    root: string;
    files: string[];
  };
  cards: {
    modelCard: HfCardMetadata;
    datasetCard: HfCardMetadata;
  };
  spacesDemo: HfSpacesDemoManifest;
  provenance: HoloScriptArtifactProvenance & {
    redacted: true;
  };
  holohub: HoloHubPublisherMetadata;
  publishability: {
    classification: HfHoloHubPublishClass;
    reasons: string[];
  };
}

export interface HfArtifactPublisherValidation {
  valid: boolean;
  errors: string[];
}

export function buildHfCompatibleArtifactPublisherDryRun(
  input: HfArtifactPublisherInput
): HfArtifactPublisherReceipt {
  const artifactFiles = input.artifacts.map((artifact) => artifact.path);
  const layoutRoot = `hf-compatible/${slugify(input.artifactId)}`;
  const publishability = classifyPublishability(input);
  const card = buildCardMetadata(input);

  return {
    schemaVersion: HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION,
    type: 'HFCompatibleHoloScriptArtifactPublisherDryRunReceipt',
    createdAt: new Date().toISOString(),
    noTokenDryRun: true,
    secretsIncluded: false,
    layout: {
      root: layoutRoot,
      files: [
        'README.md',
        'model-card.md',
        'dataset-card.md',
        'spaces/README.md',
        'holohub.json',
        'receipts/publish-receipt.json',
        ...artifactFiles,
      ],
    },
    cards: {
      modelCard: card,
      datasetCard: {
        ...card,
        artifacts: input.artifacts
          .filter((artifact) => artifact.kind === 'example-dataset')
          .map(toCardArtifact),
      },
    },
    spacesDemo: {
      sdk: input.spacesDemo.sdk,
      appFile: input.spacesDemo.appFile,
      readmeBlock: buildSpacesReadmeBlock(input),
    },
    provenance: {
      ...input.provenance,
      redacted: true,
    },
    holohub: {
      collection: input.holohub.collection,
      curationTags: [...input.holohub.curationTags],
      marketplaceCompatible: input.holohub.curationTags.length > 0,
    },
    publishability,
  };
}

export function validateHfArtifactPublisherReceipt(
  receipt: unknown
): HfArtifactPublisherValidation {
  const errors: string[] = [];
  if (!isRecord(receipt)) {
    return { valid: false, errors: ['receipt must be an object'] };
  }

  if (receipt.schemaVersion !== HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION}`);
  }
  if (receipt.type !== 'HFCompatibleHoloScriptArtifactPublisherDryRunReceipt') {
    errors.push('type must be "HFCompatibleHoloScriptArtifactPublisherDryRunReceipt"');
  }
  if (receipt.noTokenDryRun !== true) {
    errors.push('noTokenDryRun must be true');
  }
  if (receipt.secretsIncluded !== false) {
    errors.push('secretsIncluded must be false');
  }

  requireRecord(receipt, 'layout', ['root', 'files'], errors);
  requireRecord(receipt, 'cards', ['modelCard', 'datasetCard'], errors);
  requireRecord(receipt, 'spacesDemo', ['sdk', 'appFile', 'readmeBlock'], errors);
  requireRecord(
    receipt,
    'provenance',
    ['caelTraceHash', 'holomeshSignature', 'x402ReceiptHash', 'sourceCommit', 'redacted'],
    errors
  );
  requireRecord(
    receipt,
    'holohub',
    ['collection', 'curationTags', 'marketplaceCompatible'],
    errors
  );
  requireRecord(receipt, 'publishability', ['classification', 'reasons'], errors);

  if (isRecord(receipt.cards)) {
    validateCard('cards.modelCard', receipt.cards.modelCard, errors);
    validateCard('cards.datasetCard', receipt.cards.datasetCard, errors);
  }

  if (isRecord(receipt.provenance)) {
    if (receipt.provenance.redacted !== true) {
      errors.push('provenance.redacted must be true');
    }
    for (const key of ['caelTraceHash', 'holomeshSignature', 'x402ReceiptHash', 'sourceCommit']) {
      if (!hasText(receipt.provenance[key])) errors.push(`provenance.${key} is required`);
    }
  }

  if (isRecord(receipt.publishability)) {
    const value = receipt.publishability.classification;
    if (value !== 'hf-publishable' && value !== 'holohub-only' && value !== 'both') {
      errors.push('publishability.classification must be hf-publishable, holohub-only, or both');
    }
    if (!Array.isArray(receipt.publishability.reasons)) {
      errors.push('publishability.reasons must be an array');
    }
  }

  if (containsSecretLikeField(receipt)) {
    errors.push('receipt must not contain token, secret, apiKey, or credential fields');
  }

  return { valid: errors.length === 0, errors };
}

function buildCardMetadata(input: HfArtifactPublisherInput): HfCardMetadata {
  return {
    title: input.title,
    summary: input.summary,
    license: input.license,
    tags: [...input.tags],
    artifacts: input.artifacts.map(toCardArtifact),
  };
}

function toCardArtifact(
  artifact: HoloScriptArtifactDescriptor
): HfCardMetadata['artifacts'][number] {
  return {
    kind: artifact.kind,
    path: artifact.path,
    sha256: artifact.sha256,
  };
}

function classifyPublishability(
  input: HfArtifactPublisherInput
): HfArtifactPublisherReceipt['publishability'] {
  const reasons: string[] = [];
  const hasLicense = hasText(input.license);
  const hasPortableDemo = hasText(input.spacesDemo.appFile);
  const hasProvenance = Object.values(input.provenance).every(hasText);
  const hasHoloHubMetadata = input.holohub.curationTags.length > 0;
  const hasHoloHubOnlyArtifact = input.artifacts.some((artifact) => artifact.holohubOnly === true);

  if (hasLicense) reasons.push('license declared');
  if (hasPortableDemo) reasons.push('Spaces-style demo manifest declared');
  if (hasProvenance) reasons.push('CAEL/HoloMesh/x402 provenance hashes declared');
  if (hasHoloHubMetadata) reasons.push('HoloHub curation metadata declared');
  if (hasHoloHubOnlyArtifact) reasons.push('one or more artifacts require HoloHub runtime custody');

  if (hasLicense && hasPortableDemo && hasProvenance && !hasHoloHubOnlyArtifact) {
    return {
      classification: hasHoloHubMetadata ? 'both' : 'hf-publishable',
      reasons,
    };
  }

  return {
    classification: 'holohub-only',
    reasons,
  };
}

function buildSpacesReadmeBlock(input: HfArtifactPublisherInput): string {
  return [
    `# ${input.title}`,
    '',
    input.summary,
    '',
    `SDK: ${input.spacesDemo.sdk}`,
    `App file: ${input.spacesDemo.appFile}`,
    `HoloHub collection: ${input.holohub.collection}`,
  ].join('\n');
}

function validateCard(prefix: string, value: unknown, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${prefix} must be an object`);
    return;
  }
  for (const field of ['title', 'summary', 'license', 'tags', 'artifacts']) {
    if (!(field in value)) errors.push(`${prefix}.${field} is required`);
  }
  if (!hasText(value.title)) errors.push(`${prefix}.title is required`);
  if (!hasText(value.summary)) errors.push(`${prefix}.summary is required`);
  if (!hasText(value.license)) errors.push(`${prefix}.license is required`);
  if (!Array.isArray(value.tags)) errors.push(`${prefix}.tags must be an array`);
  if (!Array.isArray(value.artifacts)) errors.push(`${prefix}.artifacts must be an array`);
}

function requireRecord(
  parent: Record<string, unknown>,
  key: string,
  requiredFields: string[],
  errors: string[]
): void {
  const value = parent[key];
  if (!isRecord(value)) {
    errors.push(`${key} must be an object`);
    return;
  }
  for (const field of requiredFields) {
    if (!(field in value)) errors.push(`${key}.${field} is required`);
  }
}

function containsSecretLikeField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSecretLikeField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(([key, child]) => {
    if (key === 'noTokenDryRun' || key === 'secretsIncluded') return false;
    if (/token|secret|apikey|api_key|credential/i.test(key)) return true;
    return containsSecretLikeField(child);
  });
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'artifact';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
