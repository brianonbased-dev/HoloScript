#!/usr/bin/env node
/* global console, process */

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'hololand.model-village-art-direction.v2';
const ART_POLICY_SOURCE =
  'source/domains/agents/model-village-art-direction.hsplus';
const RESIDENT_KIT_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-resident-kit.holo';
const RESIDENT_ASSET_MANIFEST_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-resident-asset-manifest.holo';
const PUBLIC_EMBODIMENT_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-public-embodiments.holo';
const APPEARANCE_PROOF_SOURCE =
  'source/proofs/model-village-appearance-invariance.hs';
const WORLD_SOURCE =
  'source/layers/vr/frontier/model-village/model-village.holo';
const OBSERVER_SOURCE =
  'source/layers/vr/frontier/model-village/model-village-observer-projection.holo';
const ART_SPEC_SOURCE =
  'docs/specs/HOLOLAND_MODEL_VILLAGE_ART_DIRECTION.md';
const WORLD_CONCEPT_SOURCE =
  'docs/assets/model-village/model-village-stormglass-commons-concept-2026-07-25.png';
const RESIDENT_CONCEPT_SOURCE =
  'docs/assets/model-village/model-village-stormglass-craftfolk-lineup-2026-07-25.png';
const FAMILY_EMBODIMENT_CONCEPT_SOURCE =
  'docs/assets/model-village/model-village-stormglass-family-craftfolk-lineup-2026-07-25.png';
const DEFAULT_OUTPUT =
  path.join('.tmp', 'hololand', 'model-village', 'art-direction-receipt.json');
const INDEPENDENT_PROJECT_DISCLOSURE =
  'HoloLand-authored visual interpretation; not affiliated with or endorsed by the named providers.';
const INDEPENDENT_PROJECT_DISCLOSURE_HASH =
  '143ba2f892ea8259b0fbdfe4041aab632ced32225f57d7ffee03e67b4e6a7494';

const EXPECTED_RESEARCH_RESIDENTS = [
  {
    ordinal: 1,
    residentId: 'resident-01',
    personaId: 'persona-01',
    seatId: 'seat-01',
    researchAlias: 'Resident 01',
    villageRole: 'water_steward',
    silhouetteId: 'willow_crescent',
    glyphId: 'open_droplet',
    accentColor: '#77D4C8',
    roleProp: 'ceramic_water_measure',
    appearanceManifestId: 'stormglass-appearance-01-v1',
  },
  {
    ordinal: 2,
    residentId: 'resident-02',
    personaId: 'persona-02',
    seatId: 'seat-02',
    researchAlias: 'Resident 02',
    villageRole: 'repairwright',
    silhouetteId: 'broad_square',
    glyphId: 'bridge_knot',
    accentColor: '#79A8F2',
    roleProp: 'folding_gauge',
    appearanceManifestId: 'stormglass-appearance-02-v1',
  },
  {
    ordinal: 3,
    residentId: 'resident-03',
    personaId: 'persona-03',
    seatId: 'seat-03',
    researchAlias: 'Resident 03',
    villageRole: 'seedkeeper',
    silhouetteId: 'a_line_seedpod',
    glyphId: 'six_part_seed',
    accentColor: '#C69FF2',
    roleProp: 'seed_archive_case',
    appearanceManifestId: 'stormglass-appearance-03-v1',
  },
  {
    ordinal: 4,
    residentId: 'resident-04',
    personaId: 'persona-04',
    seatId: 'seat-04',
    researchAlias: 'Resident 04',
    villageRole: 'commons_host',
    silhouetteId: 'compact_hearth_ring',
    glyphId: 'hearth_ring',
    accentColor: '#F0BB78',
    roleProp: 'shared_serving_bowl',
    appearanceManifestId: 'stormglass-appearance-04-v1',
  },
  {
    ordinal: 5,
    residentId: 'resident-05',
    personaId: 'persona-05',
    seatId: 'seat-05',
    researchAlias: 'Resident 05',
    villageRole: 'courier_cartographer',
    silhouetteId: 'lean_kite',
    glyphId: 'path_chevron',
    accentColor: '#E98EAA',
    roleProp: 'rolled_map_case',
    appearanceManifestId: 'stormglass-appearance-05-v1',
  },
  {
    ordinal: 6,
    residentId: 'resident-06',
    personaId: 'persona-06',
    seatId: 'seat-06',
    researchAlias: 'Resident 06',
    villageRole: 'ledger_witness',
    silhouetteId: 'tall_angular_column',
    glyphId: 'woven_square',
    accentColor: '#9CCC7B',
    roleProp: 'civic_ledger',
    appearanceManifestId: 'stormglass-appearance-06-v1',
  },
];

const EXPECTED_PUBLIC_EMBODIMENTS_BY_ID = Object.freeze({
  'public-embodiment-anthropic': {
    publicEmbodimentId: 'public-embodiment-anthropic',
    publicDisplayName: 'Claude',
    familyId: 'anthropic',
    agentSurfaceId: 'claude-desktop',
    modelFamily: 'claude',
    familyEmbodimentManifestId:
      'stormglass-family-embodiment-anthropic-v1',
    familyMantleId: 'stormglass-mantle-anthropic-v1',
    familyMantlePatternId: 'quiet_nested_open_arcs',
    familyMantleGlyphId: 'open_arc_weave',
    familyMantleAccentColor: '#C16F45',
  },
  'public-embodiment-openai': {
    publicEmbodimentId: 'public-embodiment-openai',
    publicDisplayName: 'OpenAI',
    familyId: 'openai',
    agentSurfaceId: 'codex-hardware',
    modelFamily: 'gpt',
    familyEmbodimentManifestId: 'stormglass-family-embodiment-openai-v1',
    familyMantleId: 'stormglass-mantle-openai-v1',
    familyMantlePatternId: 'recursive_cell_interlock',
    familyMantleGlyphId: 'recursive_interlock_glyph',
    familyMantleAccentColor: '#D6D1C7',
  },
  'public-embodiment-google': {
    publicEmbodimentId: 'public-embodiment-google',
    publicDisplayName: 'Gemini',
    familyId: 'google',
    agentSurfaceId: 'gemini-antigravity',
    modelFamily: 'gemini',
    familyEmbodimentManifestId: 'stormglass-family-embodiment-google-v1',
    familyMantleId: 'stormglass-mantle-google-v1',
    familyMantlePatternId: 'paired_offset_prismatic_panels',
    familyMantleGlyphId: 'paired_prism_weave',
    familyMantleAccentColor: '#3F6D7A',
  },
  'public-embodiment-xai': {
    publicEmbodimentId: 'public-embodiment-xai',
    publicDisplayName: 'Grok',
    familyId: 'xai',
    agentSurfaceId: 'grok-hardware',
    modelFamily: 'grok',
    familyEmbodimentManifestId: 'stormglass-family-embodiment-xai-v1',
    familyMantleId: 'stormglass-mantle-xai-v1',
    familyMantlePatternId: 'off_axis_signal_bands',
    familyMantleGlyphId: 'diagonal_signal_weave',
    familyMantleAccentColor: '#A64B3C',
  },
  'public-embodiment-ollama': {
    publicEmbodimentId: 'public-embodiment-ollama',
    publicDisplayName: 'GLM',
    familyId: 'ollama',
    agentSurfaceId: 'ollama-cloud',
    modelFamily: 'glm',
    familyEmbodimentManifestId: 'stormglass-family-embodiment-ollama-v1',
    familyMantleId: 'stormglass-mantle-ollama-v1',
    familyMantlePatternId: 'modular_phase_lattice',
    familyMantleGlyphId: 'phase_lattice_glyph',
    familyMantleAccentColor: '#C8A84E',
  },
  'public-embodiment-sovereign': {
    publicEmbodimentId: 'public-embodiment-sovereign',
    publicDisplayName: 'Brittney',
    familyId: 'sovereign',
    agentSurfaceId: 'brittney-holoshell',
    modelFamily: 'brittney',
    familyEmbodimentManifestId:
      'stormglass-family-embodiment-sovereign-v1',
    familyMantleId: 'stormglass-mantle-sovereign-v1',
    familyMantlePatternId: 'sovereign_locality_mesh',
    familyMantleGlyphId: 'owned_mesh_glyph',
    familyMantleAccentColor: '#6D5A8C',
  },
});

const EXPECTED_PUBLIC_EMBODIMENTS = Object.values(
  EXPECTED_PUBLIC_EMBODIMENTS_BY_ID,
).sort(
  (left, right) => left.publicEmbodimentId.localeCompare(
    right.publicEmbodimentId,
  ),
);

const RESEARCH_APPEARANCE_DIGEST_FIELDS = [
  'residentId',
  'personaId',
  'seatId',
  'researchAlias',
  'villageRole',
  'silhouetteId',
  'glyphId',
  'accentColor',
  'roleProp',
  'neutralSeatMantleId',
  'appearanceManifestId',
];

const PUBLIC_EMBODIMENT_DIGEST_FIELDS = [
  'publicEmbodimentId',
  'publicDisplayName',
  'familyId',
  'agentSurfaceId',
  'modelFamily',
  'familyEmbodimentManifestId',
  'familyMantleId',
  'familyMantlePatternId',
  'familyMantleGlyphId',
  'familyMantleAccentColor',
];

const FORBIDDEN_RESEARCH_IDENTITY_FIELDS = [
  'publicEmbodimentId',
  'publicStoryOrdinal',
  'publicDisplayName',
  'familyId',
  'agentSurfaceId',
  'modelFamily',
  'provider',
  'modelRevision',
  'exactModelRevision',
  'familyEmbodimentManifestId',
  'familyMantleId',
  'familyMantlePatternId',
  'familyMantleGlyphId',
  'familyMantleAccentColor',
  'embodimentBinding',
  'embodimentBindingReceiptHash',
];

const FORBIDDEN_PUBLIC_RESEARCH_JOIN_FIELDS = [
  'ordinal',
  'publicStoryOrdinal',
  'residentId',
  'personaId',
  'seatId',
  'researchAlias',
  'villageRole',
  'roleProp',
  'silhouetteId',
  'glyphId',
  'accentColor',
  'neutralSeatMantleId',
  'appearanceManifestId',
  'exactModelRevision',
];

const FORBIDDEN_PUBLIC_ROLE_TOKENS = [
  'water',
  'steward',
  'repair',
  'wright',
  'tool',
  'bridge',
  'seed',
  'keeper',
  'hearth',
  'commons',
  'host',
  'courier',
  'cartograph',
  'map',
  'path',
  'ledger',
  'witness',
  'bowl',
  'gauge',
];

const PUBLIC_STORY_REQUIREMENTS = [
  'verified_family_embodiment_manifest',
  'independent_project_disclosure',
];

const POSTLOCK_REPLAY_REQUIREMENTS = [
  'verified_terminal_commitment',
  'verified_family_binding_receipt',
  'verified_unblinding_receipt',
  'verified_family_embodiment_manifest',
  'independent_project_disclosure',
  'trusted_signer_verification',
  'canonical_hash_verification',
  'receipt_chain_verification',
  'exact_binding_match',
  'fail_neutral_mismatch_denial',
];

const REQUIRED_PRESENTATION_CANDIDATE_SCHEMA = [
  { name: 'presentationProfile', type: 'string', optional: false },
  { name: 'stateSpecificCue', type: 'boolean', optional: true },
  { name: 'receiptPresent', type: 'boolean', optional: true },
  { name: 'appearanceManifestPresent', type: 'boolean', optional: true },
  {
    name: 'appearanceDigestInvariantAcrossAssignments',
    type: 'boolean',
    optional: true,
  },
  { name: 'publicIdentityPresent', type: 'boolean', optional: true },
  { name: 'familyIdentityPresent', type: 'boolean', optional: true },
  { name: 'providerIdentityPresent', type: 'boolean', optional: true },
  { name: 'modelIdentityPresent', type: 'boolean', optional: true },
  { name: 'agentSurfaceIdentityPresent', type: 'boolean', optional: true },
  { name: 'familyMantlePresent', type: 'boolean', optional: true },
  {
    name: 'publicEmbodimentOverlayLoaded',
    type: 'boolean',
    optional: true,
  },
  {
    name: 'familyEmbodimentManifestPresent',
    type: 'boolean',
    optional: true,
  },
  {
    name: 'familyEmbodimentManifest',
    type: 'VerifiedFamilyEmbodimentManifest',
    optional: true,
  },
  { name: 'familyId', type: 'string', optional: true },
  { name: 'publicEmbodimentId', type: 'string', optional: true },
  { name: 'familyEmbodimentManifestId', type: 'string', optional: true },
  {
    name: 'independentProjectDisclosurePresent',
    type: 'boolean',
    optional: true,
  },
  {
    name: 'independentProjectDisclosureHashPresent',
    type: 'boolean',
    optional: true,
  },
  {
    name: 'independentProjectDisclosureText',
    type: 'string',
    optional: true,
  },
  {
    name: 'independentProjectDisclosureHash',
    type: 'string',
    optional: true,
  },
  { name: 'exactModelRevisionPresent', type: 'boolean', optional: true },
  { name: 'exactProviderRoutePresent', type: 'boolean', optional: true },
  { name: 'terminalCommitmentPresent', type: 'boolean', optional: true },
  {
    name: 'terminalCommitment',
    type: 'VerifiedTerminalCommitment',
    optional: true,
  },
  { name: 'familyBindingReceiptPresent', type: 'boolean', optional: true },
  {
    name: 'familyBindingReceipt',
    type: 'VerifiedFamilyBindingReceipt',
    optional: true,
  },
  { name: 'unblindingReceiptPresent', type: 'boolean', optional: true },
  {
    name: 'unblindingReceipt',
    type: 'VerifiedUnblindingReceipt',
    optional: true,
  },
  { name: 'adapterManifestHashPresent', type: 'boolean', optional: true },
  { name: 'adapterManifestHash', type: 'string', optional: true },
  {
    name: 'assignmentManifestHashPresent',
    type: 'boolean',
    optional: true,
  },
  { name: 'assignmentManifestHash', type: 'string', optional: true },
  { name: 'finalObservationRootPresent', type: 'boolean', optional: true },
  { name: 'finalObservationRoot', type: 'string', optional: true },
  { name: 'runId', type: 'string', optional: true },
  { name: 'residentId', type: 'string', optional: true },
];

const REQUIRED_EVIDENCE_STRUCT_FIELDS = {
  VerifiedFamilyEmbodimentManifest: [
    'manifestId',
    'verified',
    'canonicalHash',
    'canonicalHashVerified',
    'signature',
    'signatureVerified',
    'signerId',
    'trustedSigner',
    'publicEmbodimentId',
    'familyId',
    'independentProjectDisclosureHash',
    'failNeutral',
  ],
  VerifiedTerminalCommitment: [
    'commitmentId',
    'verified',
    'canonicalHash',
    'canonicalHashVerified',
    'signature',
    'signatureVerified',
    'signerId',
    'trustedSigner',
    'runId',
    'assignmentManifestHash',
    'finalObservationRoot',
    'failNeutral',
  ],
  VerifiedUnblindingReceipt: [
    'receiptId',
    'verified',
    'canonicalHash',
    'canonicalHashVerified',
    'signature',
    'signatureVerified',
    'signerId',
    'trustedSigner',
    'chainVerified',
    'priorReceiptHash',
    'runId',
    'residentId',
    'familyId',
    'adapterManifestHash',
    'terminalCommitmentId',
    'terminalCommitmentHash',
    'failNeutral',
    'mismatchDecision',
  ],
  VerifiedFamilyBindingReceipt: [
    'receiptId',
    'verified',
    'canonicalHash',
    'canonicalHashVerified',
    'signature',
    'signatureVerified',
    'signerId',
    'trustedSigner',
    'chainVerified',
    'priorReceiptHash',
    'runId',
    'residentId',
    'familyId',
    'publicEmbodimentId',
    'adapterManifestHash',
    'familyEmbodimentManifestId',
    'familyEmbodimentManifestHash',
    'terminalCommitmentId',
    'terminalCommitmentHash',
    'unblindingReceiptId',
    'unblindingReceiptHash',
    'failNeutral',
    'mismatchDecision',
  ],
  ResidentPresentationCandidate: REQUIRED_PRESENTATION_CANDIDATE_SCHEMA.map(
    (field) => field.name,
  ),
};

const REQUIRED_STORY_EVIDENCE_STRING_PATHS = [
  'candidate.familyId',
  'candidate.publicEmbodimentId',
  'candidate.familyEmbodimentManifestId',
  'candidate.independentProjectDisclosureText',
  'candidate.independentProjectDisclosureHash',
  'candidate.familyEmbodimentManifest.manifestId',
  'candidate.familyEmbodimentManifest.canonicalHash',
  'candidate.familyEmbodimentManifest.signature',
  'candidate.familyEmbodimentManifest.signerId',
  'candidate.familyEmbodimentManifest.publicEmbodimentId',
  'candidate.familyEmbodimentManifest.familyId',
  'candidate.familyEmbodimentManifest.independentProjectDisclosureHash',
];

const REQUIRED_POSTLOCK_EVIDENCE_STRING_PATHS = [
  'candidate.runId',
  'candidate.residentId',
  'candidate.familyId',
  'candidate.publicEmbodimentId',
  'candidate.adapterManifestHash',
  'candidate.assignmentManifestHash',
  'candidate.finalObservationRoot',
  'candidate.familyEmbodimentManifestId',
  'candidate.independentProjectDisclosureText',
  'candidate.independentProjectDisclosureHash',
  'candidate.terminalCommitment.commitmentId',
  'candidate.terminalCommitment.canonicalHash',
  'candidate.terminalCommitment.signature',
  'candidate.terminalCommitment.signerId',
  'candidate.terminalCommitment.runId',
  'candidate.terminalCommitment.assignmentManifestHash',
  'candidate.terminalCommitment.finalObservationRoot',
  'candidate.familyBindingReceipt.receiptId',
  'candidate.familyBindingReceipt.canonicalHash',
  'candidate.familyBindingReceipt.signature',
  'candidate.familyBindingReceipt.signerId',
  'candidate.familyBindingReceipt.priorReceiptHash',
  'candidate.familyBindingReceipt.runId',
  'candidate.familyBindingReceipt.residentId',
  'candidate.familyBindingReceipt.familyId',
  'candidate.familyBindingReceipt.publicEmbodimentId',
  'candidate.familyBindingReceipt.adapterManifestHash',
  'candidate.familyBindingReceipt.familyEmbodimentManifestId',
  'candidate.familyBindingReceipt.familyEmbodimentManifestHash',
  'candidate.familyBindingReceipt.terminalCommitmentId',
  'candidate.familyBindingReceipt.terminalCommitmentHash',
  'candidate.familyBindingReceipt.unblindingReceiptId',
  'candidate.familyBindingReceipt.unblindingReceiptHash',
  'candidate.familyBindingReceipt.mismatchDecision',
  'candidate.unblindingReceipt.receiptId',
  'candidate.unblindingReceipt.canonicalHash',
  'candidate.unblindingReceipt.signature',
  'candidate.unblindingReceipt.signerId',
  'candidate.unblindingReceipt.priorReceiptHash',
  'candidate.unblindingReceipt.runId',
  'candidate.unblindingReceipt.residentId',
  'candidate.unblindingReceipt.familyId',
  'candidate.unblindingReceipt.adapterManifestHash',
  'candidate.unblindingReceipt.terminalCommitmentId',
  'candidate.unblindingReceipt.terminalCommitmentHash',
  'candidate.unblindingReceipt.mismatchDecision',
  'candidate.familyEmbodimentManifest.manifestId',
  'candidate.familyEmbodimentManifest.canonicalHash',
  'candidate.familyEmbodimentManifest.signature',
  'candidate.familyEmbodimentManifest.signerId',
  'candidate.familyEmbodimentManifest.publicEmbodimentId',
  'candidate.familyEmbodimentManifest.familyId',
  'candidate.familyEmbodimentManifest.independentProjectDisclosureHash',
];

const PERMUTATION_FIELDS = [
  'mixedBlock1Appearance',
  'mixedBlock2Appearance',
  'mixedBlock3Appearance',
  'adapterAOnlyAppearance',
  'adapterBOnlyAppearance',
  'adapterCOnlyAppearance',
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    root: process.cwd(),
    output: DEFAULT_OUTPUT,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') args.root = argv[++index];
    else if (arg === '--output') args.output = argv[++index];
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`HoloLand Model Village art-direction check

Usage:
  node scripts/check-hololand-model-village-art-direction.mjs [options]

Options:
  --root <path>       HoloLand repository root
  --output <path>     Receipt output path
  --json              Print the complete receipt
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function fileHash(filePath) {
  return sha256(readFileSync(filePath));
}

function repoPath(root, relativePath) {
  return path.resolve(root, relativePath);
}

function read(root, relativePath) {
  return readFileSync(repoPath(root, relativePath), 'utf8');
}

function propertyMap(node) {
  return Object.fromEntries(
    (node?.properties || []).map((entry) => [entry.key, entry.value]),
  );
}

function holoObjects(ast) {
  return [
    ...(ast?.objects || []),
    ...(ast?.spatialGroups || []).flatMap((group) => group.objects || []),
  ];
}

function holoObjectRecord(node) {
  const direct = propertyMap(node);
  return {
    objectId: node.name,
    label: direct.label,
    position: direct.position,
    scale: direct.scale,
    material: direct.material,
    ...(direct.properties || {}),
  };
}

function indexBy(values, key) {
  return new Map(values.map((value) => [value[key], value]));
}

function pngDimensions(filePath) {
  const bytes = readFileSync(filePath);
  if (
    bytes.length < 24
    || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a'
  ) {
    throw new Error(`${filePath} is not a PNG`);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return {
    width,
    height,
    aspectRatio: Number((width / height).toFixed(6)),
    aspectRatioClass:
      width / height >= 1.70 && width / height <= 1.82
        ? 'wide_landscape'
        : 'other',
  };
}

function findHoloScriptRoot(root) {
  const candidates = [
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(root, '..', 'HoloScript'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    const corePath = path.join(candidate, 'packages', 'core', 'dist', 'index.js');
    if (existsSync(corePath)) return { root: candidate, corePath };
  }
  throw new Error(
    'Built HoloScript core not found. Set HOLOSCRIPT_ROOT or place HoloScript beside HoloLand.',
  );
}

function requireNode(nodes, predicate, message) {
  const matching = nodes.filter(predicate);
  if (matching.length !== 1) {
    throw new Error(`${message}; expected 1, observed ${matching.length}`);
  }
  return matching[0];
}

function normalizeFields(record, fields) {
  return Object.fromEntries(
    fields.map((field) => [field, record[field]]),
  );
}

function receiptHash(receipt) {
  const { receiptHash: _ignored, ...unsigned } = receipt;
  return sha256(canonicalJson(unsigned));
}

export function verifyModelVillageArtDirectionReceipt(receipt) {
  return Boolean(
    receipt
    && receipt.schemaVersion === SCHEMA_VERSION
    && typeof receipt.receiptHash === 'string'
    && receipt.receiptHash === receiptHash(receipt),
  );
}

export async function runModelVillageArtDirectionCheck(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const output = path.resolve(root, options.output ?? DEFAULT_OUTPUT);
  const holoScript = findHoloScriptRoot(root);
  const core = await import(pathToFileURL(holoScript.corePath).href);

  const sourcePaths = [
    ART_POLICY_SOURCE,
    RESIDENT_KIT_SOURCE,
    RESIDENT_ASSET_MANIFEST_SOURCE,
    PUBLIC_EMBODIMENT_SOURCE,
    APPEARANCE_PROOF_SOURCE,
    WORLD_SOURCE,
    OBSERVER_SOURCE,
    ART_SPEC_SOURCE,
    WORLD_CONCEPT_SOURCE,
    RESIDENT_CONCEPT_SOURCE,
    FAMILY_EMBODIMENT_CONCEPT_SOURCE,
  ];
  const missingSources = sourcePaths.filter(
    (relativePath) => !existsSync(repoPath(root, relativePath)),
  );
  if (missingSources.length > 0) {
    throw new Error(`Missing art-direction sources: ${missingSources.join(', ')}`);
  }

  const texts = {
    policy: read(root, ART_POLICY_SOURCE),
    kit: read(root, RESIDENT_KIT_SOURCE),
    residentAssetManifest: read(root, RESIDENT_ASSET_MANIFEST_SOURCE),
    publicEmbodiments: read(root, PUBLIC_EMBODIMENT_SOURCE),
    proof: read(root, APPEARANCE_PROOF_SOURCE),
    world: read(root, WORLD_SOURCE),
    observer: read(root, OBSERVER_SOURCE),
    spec: read(root, ART_SPEC_SOURCE),
  };
  const normalizedPolicyText = texts.policy.replace(/\s+/g, ' ');

  const parsed = {
    policy: new core.HoloScriptPlusParser().parse(texts.policy),
    kit: new core.HoloCompositionParser().parse(texts.kit),
    residentAssetManifest: new core.HoloCompositionParser().parse(
      texts.residentAssetManifest,
    ),
    publicEmbodiments: new core.HoloCompositionParser().parse(
      texts.publicEmbodiments,
    ),
    proof: new core.HoloScriptCodeParser().parse(texts.proof),
    world: new core.HoloCompositionParser().parse(texts.world),
    observer: new core.HoloCompositionParser().parse(texts.observer),
  };

  const parserFailures = Object.entries(parsed)
    .filter(([, result]) => !result.success)
    .map(([name, result]) => ({
      name,
      errors: result.errors || [],
    }));
  if (parserFailures.length > 0) {
    throw new Error(
      `HoloScript parsing failed: ${canonicalJson(parserFailures)}`,
    );
  }

  const failures = [];
  const assertions = {};
  function assert(name, condition, detail) {
    assertions[name] = Boolean(condition);
    if (!condition) failures.push({ name, detail });
  }

  const policyComposition = requireNode(
    parsed.policy.ast.children || [],
    (node) => node.type === 'composition',
    'Art-direction .hsplus composition is missing',
  );
  const evidenceStructNodes = (parsed.policy.ast.children || [])
    .filter((node) => (
      node.type === 'struct'
      && Object.hasOwn(REQUIRED_EVIDENCE_STRUCT_FIELDS, node.name)
    ));
  const evidenceStructFields = Object.fromEntries(
    evidenceStructNodes.map((node) => [
      node.name,
      (node.fields || []).map((field) => field.name),
    ]),
  );
  const evidenceStructSchemas = Object.fromEntries(
    evidenceStructNodes.map((node) => [
      node.name,
      (node.fields || []).map((field) => ({
        name: field.name,
        type: field.type,
        optional: field.optional === true,
      })),
    ]),
  );
  const policyConfig = requireNode(
    policyComposition.children || [],
    (node) => node.type === 'config',
    'Art-direction config is missing',
  ).properties;
  const policyTemplates = policyComposition.children || [];
  const presentationPolicy = requireNode(
    policyTemplates,
    (node) => (
      node.type === 'template'
      && node.name === 'ResidentPresentationInvariance'
    ),
    'ResidentPresentationInvariance is missing',
  ).properties;
  const residentBudgetPolicy = requireNode(
    policyTemplates,
    (node) => (
      node.type === 'template'
      && node.name === 'ResidentPlatformBudgets'
    ),
    'ResidentPlatformBudgets is missing',
  ).properties;
  const presentationProfilesPolicy = requireNode(
    policyTemplates,
    (node) => (
      node.type === 'template'
      && node.name === 'ModelVillagePresentationProfiles'
    ),
    'ModelVillagePresentationProfiles is missing',
  ).properties;
  const familyMantlePolicy = requireNode(
    policyTemplates,
    (node) => (
      node.type === 'template'
      && node.name === 'StormglassFamilyMantleKit'
    ),
    'StormglassFamilyMantleKit is missing',
  ).properties;
  const sharedResidentKitPolicy = requireNode(
    policyTemplates,
    (node) => (
      node.type === 'template'
      && node.name === 'StormglassCraftfolkSharedKit'
    ),
    'StormglassCraftfolkSharedKit is missing',
  ).properties;
  const partialResidentAssetPolicy = requireNode(
    policyTemplates,
    (node) => (
      node.type === 'template'
      && node.name === 'NeutralSeat01Lod0AssetSlice'
    ),
    'NeutralSeat01Lod0AssetSlice is missing',
  ).properties;

  const worldObjects = holoObjects(parsed.world.ast).map(holoObjectRecord);
  const observerObjects = holoObjects(parsed.observer.ast).map(holoObjectRecord);
  const kitObjects = holoObjects(parsed.kit.ast).map(holoObjectRecord);
  const publicEmbodimentObjects = holoObjects(
    parsed.publicEmbodiments.ast,
  ).map(holoObjectRecord);
  const publicEmbodimentState = propertyMap(
    parsed.publicEmbodiments.ast.state,
  );
  const publicEmbodimentMetadata =
    parsed.publicEmbodiments.ast.metadata || {};
  const kitMetadata = parsed.kit.ast.metadata || {};
  const worldState = propertyMap(parsed.world.ast.state);
  const observerState = propertyMap(parsed.observer.ast.state);
  const kitState = propertyMap(parsed.kit.ast.state);
  const worldResidents = worldObjects.filter((entry) => (
    /^ResidentSeat0[1-6]$/.test(entry.objectId)
  ));
  const observerResidents = observerObjects.filter((entry) => (
    /^ObserverResident0[1-6]$/.test(entry.objectId)
  ));
  const kitResidents = kitObjects.filter((entry) => (
    /^StormglassResident0[1-6]$/.test(entry.objectId)
  ));
  const publicEmbodiments = publicEmbodimentObjects.filter((entry) => (
    typeof entry.familyEmbodimentManifestId === 'string'
  ));
  const worldByResident = indexBy(worldResidents, 'residentId');
  const observerByResident = indexBy(observerResidents, 'residentId');
  const kitByResident = indexBy(kitResidents, 'residentId');
  const publicById = indexBy(publicEmbodiments, 'publicEmbodimentId');

  const proofNodes = Array.isArray(parsed.proof.ast) ? parsed.proof.ast : [];
  const proofGate = requireNode(
    proofNodes,
    (node) => node.properties?.type === 'model_village_appearance_invariance_gate',
    'Appearance-invariance gate is missing',
  ).properties;
  const proofResidents = proofNodes
    .filter((node) => node.properties?.type === 'resident_appearance_invariant')
    .map((node) => node.properties);
  const proofByResident = indexBy(proofResidents, 'residentId');

  assert(
    'lockedWorldIdentity',
    policyConfig.worldName === 'Stormglass Commons'
      && policyConfig.artStyle === 'hearthlight_biorealism'
      && policyConfig.residentDesignSystem === 'stormglass_craftfolk'
      && policyConfig.status === 'locked_production_direction',
    policyConfig,
  );
  assert(
    'conceptArtNotRuntimeClaim',
    policyConfig.authoredProductionAssetsObserved === false
      && policyConfig.photorealisticClaimed === false
      && policyConfig.nativeWebGPUClaimed === false,
    policyConfig,
  );
  assert(
    'neutralSeat01Lod0ManifestSourceObserved',
    policyConfig.residentAssetManifestSource
        === RESIDENT_ASSET_MANIFEST_SOURCE
      && policyConfig.partialResidentAssetManifestObserved === true
      && kitMetadata.residentAssetManifestSource
        === RESIDENT_ASSET_MANIFEST_SOURCE
      && kitMetadata.neutralSeat01Lod0ManifestObserved === true
      && partialResidentAssetPolicy.manifestSource
        === RESIDENT_ASSET_MANIFEST_SOURCE
      && partialResidentAssetPolicy.manifestSourceObserved === true
      && partialResidentAssetPolicy.manifestSchema
        === 'hololand.model-village.neutral-resident-asset-candidate.v1'
      && partialResidentAssetPolicy.sourceAdmissionStatus
        === 'manifest_source_observed'
      && partialResidentAssetPolicy.manifestHashEmbeddedInArtPolicy === false,
    {
      policyConfig,
      kitMetadata,
      partialResidentAssetPolicy,
    },
  );
  assert(
    'partialResidentAssetTruthRemainsBounded',
    partialResidentAssetPolicy.manifestScope
        === 'neutral_research_seat_01_lod0'
      && partialResidentAssetPolicy.assetPurpose
        === 'technical_loader_fixture_not_complete_stormglass_production_art'
      && partialResidentAssetPolicy.boundResidentId === 'resident-01'
      && partialResidentAssetPolicy.boundSeatId === 'seat-01'
      && partialResidentAssetPolicy.lod === 'lod0'
      && partialResidentAssetPolicy.presentationProfile
        === 'research_live_blinded'
      && partialResidentAssetPolicy.publicFamilyMantleBinding === 'none'
      && partialResidentAssetPolicy.publicFamilyIdentityPresent === false
      && partialResidentAssetPolicy.adapterIdentityPresent === false
      && partialResidentAssetPolicy.runtimeAttachmentStatus
        === 'target_until_rendering_truth_receipt'
      && partialResidentAssetPolicy.runtimeAttachmentObservedByArtDirectionGate
        === false
      && partialResidentAssetPolicy.productionArtObserved === false
      && partialResidentAssetPolicy.completeStormglassKitObserved === false
      && partialResidentAssetPolicy.completeLodSetObserved === false
      && partialResidentAssetPolicy.otherSeatRuntimeAssetsObserved === false
      && partialResidentAssetPolicy.authoredHumanoidRigObserved === false
      && partialResidentAssetPolicy.neutralClipSetObserved === false
      && partialResidentAssetPolicy.productionTextureSetObserved === false
      && partialResidentAssetPolicy.photorealismObserved === false
      && partialResidentAssetPolicy.eligibleForCompleteKitPromotion === false
      && sharedResidentKitPolicy.productionAssetStatus
        === 'partial_manifest_observed_runtime_attachment_unverified'
      && policyConfig.authoredProductionAssetsObserved === false
      && kitMetadata.authoredProductionAssetsObserved === false,
    {
      policyConfig,
      kitMetadata,
      sharedResidentKitPolicy,
      partialResidentAssetPolicy,
    },
  );
  assert(
    'canonicalWorldObjectCountPreserved',
    worldObjects.length === 12,
    { observed: worldObjects.length, expected: 12 },
  );
  assert(
    'sixNeutralResidentsAndSixPublicEmbodiments',
    worldResidents.length === 6
      && observerResidents.length === 6
      && kitResidents.length === 6
      && publicEmbodiments.length === 6
      && proofResidents.length === 6,
    {
      world: worldResidents.length,
      observer: observerResidents.length,
      kit: kitResidents.length,
      publicEmbodiments: publicEmbodiments.length,
      proof: proofResidents.length,
    },
  );
  assert(
    'presentationProfilesSeparated',
    kitState.presentationProfile === 'research_live_blinded'
      && worldState.presentationProfile === 'research_live_blinded'
      && observerState.presentationProfile === 'research_live_blinded'
      && canonicalJson(presentationProfilesPolicy.profiles)
        === canonicalJson([
          'village_story_unblinded',
          'research_live_blinded',
          'research_replay_postlock',
        ])
      && presentationProfilesPolicy.defaultResearchProfile
        === 'research_live_blinded'
      && publicEmbodimentState.supportedPresentationProfiles?.includes(
        'village_story_unblinded',
      )
      && publicEmbodimentState.supportedPresentationProfiles?.includes(
        'research_replay_postlock',
      )
      && publicEmbodimentState.forbiddenPresentationProfiles?.includes(
        'research_live_blinded',
      )
      && publicEmbodimentState.liveResearchLoadAllowed === false,
    {
      kitState,
      worldState,
      observerState,
      presentationProfilesPolicy,
      publicEmbodimentState,
    },
  );
  assert(
    'publicEmbodimentRevealReceiptGated',
    canonicalJson(publicEmbodimentState.publicStoryRequirements)
      === canonicalJson(PUBLIC_STORY_REQUIREMENTS)
      && canonicalJson(presentationProfilesPolicy.villageStoryRequirements)
        === canonicalJson(PUBLIC_STORY_REQUIREMENTS)
      && canonicalJson(publicEmbodimentState.postlockReplayRequirements)
        === canonicalJson(POSTLOCK_REPLAY_REQUIREMENTS)
      && canonicalJson(presentationProfilesPolicy.postlockReplayRequirements)
        === canonicalJson(POSTLOCK_REPLAY_REQUIREMENTS)
      && publicEmbodimentState.defaultVisibility === false
      && publicEmbodimentState.familyEmbodimentImpliesLiveAdapterBinding
        === false
      && publicEmbodimentState.sixLiveModelFamiliesClaimed === false
      && familyMantlePolicy.presentationOnly === true
      && familyMantlePolicy.adapterAssignmentAuthority === false
      && familyMantlePolicy.impliesSixLiveModelFamilies === false
      && familyMantlePolicy.exactModelRevisionVisible === false
      && familyMantlePolicy.providerLogosRequired === false,
    {
      publicEmbodimentState,
      presentationProfilesPolicy,
      familyMantlePolicy,
    },
  );
  assert(
    'publicCatalogHasNoStaticResearchJoin',
    publicEmbodimentState.publicCatalogHasStaticResearchJoin === false
      && publicEmbodimentState.publicCatalogOrderDefinesResearchSeat === false
      && publicEmbodimentState.publicCatalogOrderDefinesAdapterAssignment
        === false
      && publicEmbodimentState.publicEmbodimentIdDefinesResearchSeat === false
      && publicEmbodimentState.publicEmbodimentIdDefinesAdapterAssignment
        === false
      && publicEmbodimentState.postlockResearchJoinSource
        === 'verified_family_binding_receipt_only'
      && publicEmbodimentState.publicCatalogHasStaticSpatialJoin === false
      && publicEmbodimentState.staticTransformsMayTargetResearchSeats === false
      && canonicalJson(publicEmbodimentState.catalogRestPosition)
        === canonicalJson([0, 0, 0])
      && kitResidents.every(
        (resident) => canonicalJson(resident.position)
          !== canonicalJson(publicEmbodimentState.catalogRestPosition),
      )
      && publicEmbodimentState.villageStoryPlacementSource
        === 'public_gallery_layout_manifest'
      && publicEmbodimentState.postlockPlacementSource
        === 'verified_family_binding_receipt_resident_target'
      && familyMantlePolicy.publicCatalogHasStaticResearchJoin === false
      && familyMantlePolicy.publicCatalogOrderDefinesResearchSeat === false
      && familyMantlePolicy.publicCatalogOrderDefinesAdapterAssignment === false
      && familyMantlePolicy.publicCatalogHasStaticSpatialJoin === false
      && familyMantlePolicy.staticTransformsMayTargetResearchSeats === false
      && canonicalJson(familyMantlePolicy.catalogRestPosition)
        === canonicalJson([0, 0, 0])
      && familyMantlePolicy.villageStoryPlacementSource
        === 'public_gallery_layout_manifest'
      && familyMantlePolicy.postlockPlacementSource
        === 'verified_family_binding_receipt_resident_target'
      && proofGate.publicCatalogSerialization
        === 'keyed_by_public_embodiment_id'
      && proofGate.publicCatalogOrderDefinesResearchSeat === false
      && proofGate.publicCatalogOrderDefinesAdapterAssignment === false
      && proofGate.publicMantlePaletteDisjointFromResearchAccentPalette
        === true
      && proofGate.publicMantleRoleSemanticBinding === 'none'
      && proofGate.publicMantlePatternRoleSemanticsAllowed === false
      && proofGate.publicCatalogStaticSpatialBindingsAllowed === false
      && canonicalJson(proofGate.publicCatalogRestPosition)
        === canonicalJson([0, 0, 0])
      && proofGate.villageStoryPlacementSource
        === 'public_gallery_layout_manifest'
      && proofGate.postlockPlacementSource
        === 'verified_family_binding_receipt_resident_target',
    {
      publicEmbodimentState,
      familyMantlePolicy,
    },
  );
  assert(
    'typedPostlockEvidenceContractsLocked',
    Object.entries(REQUIRED_EVIDENCE_STRUCT_FIELDS).every(
      ([name, fields]) => canonicalJson(evidenceStructFields[name])
        === canonicalJson(fields),
    )
      && canonicalJson(evidenceStructSchemas.ResidentPresentationCandidate)
        === canonicalJson(REQUIRED_PRESENTATION_CANDIDATE_SCHEMA)
      && normalizedPolicyText.includes(
        'action admit_resident_presentation(candidate: ResidentPresentationCandidate)',
      )
      && normalizedPolicyText.includes(
        'return { allowed: false, reason: "public_story_evidence_required_string_missing" }',
      )
      && REQUIRED_STORY_EVIDENCE_STRING_PATHS.every(
        (fieldPath) => normalizedPolicyText.includes(`!${fieldPath}`),
      )
      && normalizedPolicyText.includes(
        'return { allowed: false, reason: "postlock_evidence_object_missing" }',
      )
      && normalizedPolicyText.includes(
        'return { allowed: false, reason: "postlock_evidence_required_string_missing" }',
      )
      && REQUIRED_POSTLOCK_EVIDENCE_STRING_PATHS.every(
        (fieldPath) => normalizedPolicyText.includes(`!${fieldPath}`),
      )
      && presentationProfilesPolicy.postlockPolicyExecutionStatus
        === 'declarative_source_contract_not_observed_runtime_execution'
      && [
        'candidate.familyBindingReceipt.canonicalHashVerified',
        'candidate.familyBindingReceipt.signatureVerified',
        'candidate.familyBindingReceipt.trustedSigner',
        'candidate.familyBindingReceipt.chainVerified',
        'candidate.familyBindingReceipt.runId != candidate.runId',
        'candidate.familyBindingReceipt.residentId != candidate.residentId',
        'candidate.familyBindingReceipt.familyId != candidate.familyId',
        'candidate.familyBindingReceipt.publicEmbodimentId != candidate.publicEmbodimentId',
        'candidate.terminalCommitment.assignmentManifestHash != candidate.assignmentManifestHash',
        'candidate.terminalCommitment.finalObservationRoot != candidate.finalObservationRoot',
        'candidate.unblindingReceipt.residentId != candidate.residentId',
        'candidate.unblindingReceipt.familyId != candidate.familyId',
        'candidate.unblindingReceipt.adapterManifestHash != candidate.adapterManifestHash',
        'candidate.familyEmbodimentManifest.independentProjectDisclosureHash != candidate.independentProjectDisclosureHash',
        'return { allowed: false, reason: "verified_receipt_binding_mismatch" }',
      ].every((snippet) => normalizedPolicyText.includes(snippet)),
    {
      observedStructs: evidenceStructFields,
      expectedStructs: REQUIRED_EVIDENCE_STRUCT_FIELDS,
      observedCandidateSchema:
        evidenceStructSchemas.ResidentPresentationCandidate,
      expectedCandidateSchema: REQUIRED_PRESENTATION_CANDIDATE_SCHEMA,
      postlockPolicyExecutionStatus:
        presentationProfilesPolicy.postlockPolicyExecutionStatus,
    },
  );
  assert(
    'independentProjectDisclosureLocked',
    sha256(INDEPENDENT_PROJECT_DISCLOSURE)
      === INDEPENDENT_PROJECT_DISCLOSURE_HASH
      && policyConfig.independentProjectDisclosure
        === INDEPENDENT_PROJECT_DISCLOSURE
      && policyConfig.independentProjectDisclosureHash
        === INDEPENDENT_PROJECT_DISCLOSURE_HASH
      && publicEmbodimentMetadata.independentProjectDisclosure
        === INDEPENDENT_PROJECT_DISCLOSURE
      && publicEmbodimentMetadata.independentProjectDisclosureHash
        === INDEPENDENT_PROJECT_DISCLOSURE_HASH
      && texts.spec.replace(/\s+/g, ' ').includes(
        INDEPENDENT_PROJECT_DISCLOSURE,
      )
      && normalizedPolicyText.split(
        `candidate.independentProjectDisclosureText != "${INDEPENDENT_PROJECT_DISCLOSURE}"`,
      ).length - 1 === 2
      && normalizedPolicyText.split(
        `candidate.independentProjectDisclosureHash != "${INDEPENDENT_PROJECT_DISCLOSURE_HASH}"`,
      ).length - 1 === 2,
    {
      observedDisclosure:
        publicEmbodimentMetadata.independentProjectDisclosure,
      expectedDisclosure: INDEPENDENT_PROJECT_DISCLOSURE,
      observedDisclosureHash:
        publicEmbodimentMetadata.independentProjectDisclosureHash,
      expectedDisclosureHash: INDEPENDENT_PROJECT_DISCLOSURE_HASH,
    },
  );
  assert(
    'liveResearchContainsNoPublicFamilyNames',
    EXPECTED_PUBLIC_EMBODIMENTS.every((expected) => (
      [texts.world, texts.observer, texts.kit].every(
        (source) => !source.includes(`"${expected.publicDisplayName}"`),
      )
    )),
    EXPECTED_PUBLIC_EMBODIMENTS.map((entry) => entry.publicDisplayName),
  );
  assert(
    'researchAppearanceDigestFieldsLocked',
    canonicalJson(proofGate.appearanceDigestFields)
      === canonicalJson(RESEARCH_APPEARANCE_DIGEST_FIELDS)
      && canonicalJson(proofGate.researchAppearanceDigestFields)
        === canonicalJson(RESEARCH_APPEARANCE_DIGEST_FIELDS),
    {
      legacyAlias: proofGate.appearanceDigestFields,
      observed: proofGate.researchAppearanceDigestFields,
      expected: RESEARCH_APPEARANCE_DIGEST_FIELDS,
    },
  );
  assert(
    'publicEmbodimentDigestFieldsLocked',
    canonicalJson(proofGate.publicEmbodimentDigestFields)
      === canonicalJson(PUBLIC_EMBODIMENT_DIGEST_FIELDS),
    {
      observed: proofGate.publicEmbodimentDigestFields,
      expected: PUBLIC_EMBODIMENT_DIGEST_FIELDS,
    },
  );
  assert(
    'forbiddenIdentityFieldsExcluded',
    FORBIDDEN_RESEARCH_IDENTITY_FIELDS.every(
      (field) => proofGate.forbiddenResearchDigestFields?.includes(field),
    )
      && presentationPolicy.researchAppearanceMustIgnore?.includes(
        'adapter_alias',
      )
      && presentationPolicy.researchAppearanceMustIgnore?.includes('provider')
      && presentationPolicy.researchAppearanceMustIgnore?.includes(
        'public_display_name',
      )
      && presentationPolicy.researchAppearanceMustIgnore?.includes(
        'family_mantle_id',
      )
      && presentationPolicy.researchAppearanceMustIgnore?.includes('condition')
      && presentationProfilesPolicy.liveResearchForbiddenIdentityFields
        ?.includes('public_display_name')
      && presentationProfilesPolicy.liveResearchForbiddenIdentityFields
        ?.includes('exact_model_revision'),
    {
      proof: proofGate.forbiddenResearchDigestFields,
      policy: presentationPolicy.researchAppearanceMustIgnore,
      profiles:
        presentationProfilesPolicy.liveResearchForbiddenIdentityFields,
    },
  );
  assert(
    'lockedResidentBudgets',
    residentBudgetPolicy.desktopLod0TrianglesPerResidentMaximum === 15000
      && residentBudgetPolicy.midLod1TrianglesPerResidentMaximum === 6000
      && residentBudgetPolicy.farLod2TrianglesPerResidentMaximum === 2000
      && residentBudgetPolicy.materialsPerResidentMaximum === 2,
    residentBudgetPolicy,
  );
  const seat01AssetCandidate = kitByResident.get('resident-01');
  const otherSeatAssetCandidates = EXPECTED_RESEARCH_RESIDENTS
    .filter((entry) => entry.residentId !== 'resident-01')
    .map((entry) => kitByResident.get(entry.residentId));
  assert(
    'neutralSeat01IsOnlyManifestedAssetCandidate',
    kitState.partialRuntimeAssetManifestSource
        === RESIDENT_ASSET_MANIFEST_SOURCE
      && kitState.partialRuntimeAssetManifestStatus
        === 'observed_source_manifest'
      && kitState.partialRuntimeAssetManifestSchema
        === 'hololand.model-village.neutral-resident-asset-candidate.v1'
      && kitState.partialRuntimeAssetScope
        === 'neutral_research_seat_01_lod0'
      && kitState.partialRuntimeAssetPurpose
        === 'technical_loader_fixture_not_complete_stormglass_production_art'
      && kitState.partialRuntimeAssetResidentId === 'resident-01'
      && kitState.partialRuntimeAssetSeatId === 'seat-01'
      && kitState.partialRuntimeAssetLod === 'lod0'
      && kitState.partialRuntimeAssetRuntimeAttachmentStatus
        === 'target_until_rendering_truth_receipt'
      && kitState.completeResidentKitObserved === false
      && kitState.completeLodSetObserved === false
      && kitState.authoredHumanoidRigObserved === false
      && kitState.neutralClipSetObserved === false
      && kitState.productionTextureSetObserved === false
      && kitState.photorealismObserved === false
      && kitState.familyMantleAssetCoupling === 'none'
      && seat01AssetCandidate?.residentAssetManifestSource
        === RESIDENT_ASSET_MANIFEST_SOURCE
      && seat01AssetCandidate?.residentAssetManifestAdmission
        === 'source_manifest_observed'
      && seat01AssetCandidate?.residentAssetCandidateKind
        === 'neutral_research_lod0'
      && seat01AssetCandidate?.residentAssetPurpose
        === 'technical_loader_fixture_not_complete_stormglass_production_art'
      && seat01AssetCandidate?.residentAssetLod === 'lod0'
      && seat01AssetCandidate?.residentAssetRuntimeAttachmentStatus
        === 'target_until_rendering_truth_receipt'
      && seat01AssetCandidate?.productionResidentClaimed === false
      && otherSeatAssetCandidates.every(
        (entry) => !Object.hasOwn(entry, 'residentAssetManifestSource'),
      ),
    {
      kitState,
      seat01AssetCandidate,
      otherSeatAssetCandidates,
    },
  );

  const researchResidentEvidence = [];
  for (const expected of EXPECTED_RESEARCH_RESIDENTS) {
    const worldResident = worldByResident.get(expected.residentId);
    const observerResident = observerByResident.get(expected.residentId);
    const kitResident = kitByResident.get(expected.residentId);
    const proofResident = proofByResident.get(expected.residentId);
    const surfaceMatches = [worldResident, observerResident, kitResident].every(
      (record) => (
        record
        && [
          'residentId',
          'personaId',
          'seatId',
          'researchAlias',
          'villageRole',
          'silhouetteId',
          'glyphId',
          'accentColor',
          'appearanceManifestId',
        ].every((field) => record[field] === expected[field])
        && record.displayName === expected.researchAlias
        && record.neutralSeatMantleId
          === `neutral-seat-mantle-${String(expected.ordinal).padStart(2, '0')}`
      ),
    );
    assert(
      `resident${expected.ordinal}ResearchSurfaceIdentity`,
      surfaceMatches,
      { expected, worldResident, observerResident, kitResident },
    );
    assert(
      `resident${expected.ordinal}ProxyIntegrity`,
      observerResident?.assignmentInvariant === true
        && observerResident?.adapterIdentity === 'absent'
        && observerResident?.causalEffect === false
        && observerResident?.familyMantleVisible === false
        && kitResident?.assignmentInvariant === true
        && kitResident?.adapterIdentity === 'absent'
        && [worldResident, observerResident, kitResident].every((record) => (
          !FORBIDDEN_RESEARCH_IDENTITY_FIELDS.some(
            (field) => Object.hasOwn(record, field),
          )
        )),
      { worldResident, observerResident, kitResident },
    );
    assert(
      `resident${expected.ordinal}PermutationInvariant`,
      proofResident
        && proofResident.personaId === expected.personaId
        && proofResident.seatId === expected.seatId
        && proofResident.appearanceManifestId === expected.appearanceManifestId
        && PERMUTATION_FIELDS.every(
          (field) => proofResident[field] === expected.appearanceManifestId,
        ),
      proofResident,
    );

    const researchAppearanceProjection = normalizeFields({
      ...kitResident,
      roleProp: expected.roleProp,
    }, RESEARCH_APPEARANCE_DIGEST_FIELDS);
    const researchIdentity = { ...expected };
    delete researchIdentity.ordinal;
    researchResidentEvidence.push({
      ...researchIdentity,
      researchAppearanceDigest: sha256(
        canonicalJson(researchAppearanceProjection),
      ),
      observerScale: observerResident?.scale,
      proxyAssetStatus: observerResident?.assetStatus,
    });
  }

  const publicEmbodimentEvidence = [];
  for (const expected of EXPECTED_PUBLIC_EMBODIMENTS) {
    const assertionId = expected.familyId.replaceAll(/[^a-z0-9]+/g, '_');
    const publicEmbodiment = publicById.get(expected.publicEmbodimentId);
    const publicFieldsMatch = publicEmbodiment
      && PUBLIC_EMBODIMENT_DIGEST_FIELDS.every(
        (field) => publicEmbodiment[field] === expected[field],
      )
      && publicEmbodiment.label === expected.publicDisplayName
      && canonicalJson(publicEmbodiment.scale)
        === canonicalJson([0.60, 1.35, 0.60]);
    assert(
      `publicEmbodiment_${assertionId}_manifest`,
      publicFieldsMatch,
      { expected, publicEmbodiment },
    );
    assert(
      `publicEmbodiment_${assertionId}_hasNoStaticSpatialJoin`,
      canonicalJson(publicEmbodiment?.position)
        === canonicalJson(publicEmbodimentState.catalogRestPosition),
      {
        publicEmbodimentId: expected.publicEmbodimentId,
        observedPosition: publicEmbodiment?.position,
        catalogRestPosition: publicEmbodimentState.catalogRestPosition,
      },
    );
    assert(
      `publicEmbodiment_${assertionId}_hasNoResearchJoin`,
      publicEmbodiment
        && [
          'researchResidentBinding',
          'researchSeatBinding',
          'researchPersonaBinding',
          'researchRoleBinding',
          'adapterAssignmentBinding',
        ].every((field) => publicEmbodiment[field] === 'none')
        && FORBIDDEN_PUBLIC_RESEARCH_JOIN_FIELDS.every(
          (field) => !Object.hasOwn(publicEmbodiment, field),
        ),
      { publicEmbodiment, forbidden: FORBIDDEN_PUBLIC_RESEARCH_JOIN_FIELDS },
    );

    const publicEmbodimentProjection = normalizeFields(
      publicEmbodiment || {},
      PUBLIC_EMBODIMENT_DIGEST_FIELDS,
    );
    publicEmbodimentEvidence.push({
      ...expected,
      researchResidentBinding: publicEmbodiment?.researchResidentBinding,
      researchSeatBinding: publicEmbodiment?.researchSeatBinding,
      researchPersonaBinding: publicEmbodiment?.researchPersonaBinding,
      researchRoleBinding: publicEmbodiment?.researchRoleBinding,
      adapterAssignmentBinding: publicEmbodiment?.adapterAssignmentBinding,
      publicEmbodimentDigest: sha256(
        canonicalJson(publicEmbodimentProjection),
      ),
    });
  }

  assert(
    'uniqueSilhouettes',
    new Set(
      researchResidentEvidence.map((entry) => entry.silhouetteId),
    ).size === 6,
    researchResidentEvidence.map((entry) => entry.silhouetteId),
  );
  assert(
    'uniqueGlyphs',
    new Set(researchResidentEvidence.map((entry) => entry.glyphId)).size === 6,
    researchResidentEvidence.map((entry) => entry.glyphId),
  );
  assert(
    'uniqueAccentColors',
    new Set(
      researchResidentEvidence.map((entry) => entry.accentColor),
    ).size === 6,
    researchResidentEvidence.map((entry) => entry.accentColor),
  );
  assert(
    'uniquePublicModelFamilies',
    new Set(
      publicEmbodimentEvidence.map((entry) => entry.publicDisplayName),
    ).size === 6
      && new Set(
        publicEmbodimentEvidence.map((entry) => entry.familyId),
      ).size === 6
      && new Set(
        publicEmbodimentEvidence.map((entry) => entry.agentSurfaceId),
      ).size === 6,
    publicEmbodimentEvidence.map((entry) => ({
      publicDisplayName: entry.publicDisplayName,
      familyId: entry.familyId,
      agentSurfaceId: entry.agentSurfaceId,
    })),
  );
  assert(
    'publicMantlePaletteDisjointFromResearchPalette',
    publicEmbodimentEvidence.every(
      (publicEntry) => !researchResidentEvidence.some(
        (researchEntry) => (
          researchEntry.accentColor === publicEntry.familyMantleAccentColor
        ),
      ),
    ),
    {
      researchAccentColors: researchResidentEvidence.map(
        (entry) => entry.accentColor,
      ),
      publicMantleAccentColors: publicEmbodimentEvidence.map(
        (entry) => entry.familyMantleAccentColor,
      ),
    },
  );
  assert(
    'uniqueDetachableFamilyMantles',
    new Set(
      publicEmbodimentEvidence.map((entry) => entry.familyMantleId),
    ).size === 6
      && new Set(
        publicEmbodimentEvidence.map(
          (entry) => entry.familyMantlePatternId,
        ),
      ).size === 6
      && new Set(
        publicEmbodimentEvidence.map((entry) => entry.familyMantleGlyphId),
      ).size === 6
      && publicEmbodimentState.familyMantlesDetachable === true
      && publicEmbodimentState.civicRoleKitsIndependentFromFamilyMantles
        === true
      && publicEmbodimentState.publicMantleRoleSemanticBinding === 'none'
      && canonicalJson(
        publicEmbodimentState.forbiddenPublicMantleRoleSemanticStems,
      ) === canonicalJson(FORBIDDEN_PUBLIC_ROLE_TOKENS)
      && familyMantlePolicy.publicMantleRoleSemanticBinding === 'none'
      && canonicalJson(
        familyMantlePolicy.forbiddenPublicMantleRoleSemanticStems,
      ) === canonicalJson(FORBIDDEN_PUBLIC_ROLE_TOKENS)
      && publicEmbodimentEvidence.every((entry) => {
        const semanticIds = [
          entry.familyMantlePatternId,
          entry.familyMantleGlyphId,
        ].join('_').toLowerCase();
        return FORBIDDEN_PUBLIC_ROLE_TOKENS.every(
          (token) => !semanticIds.includes(token),
        );
      }),
    publicEmbodimentEvidence.map((entry) => ({
      familyMantleId: entry.familyMantleId,
      familyMantlePatternId: entry.familyMantlePatternId,
      familyMantleGlyphId: entry.familyMantleGlyphId,
    })),
  );
  assert(
    'distinctProxySilhouettes',
    new Set(
      researchResidentEvidence.map(
        (entry) => canonicalJson(entry.observerScale),
      ),
    ).size === 6,
    researchResidentEvidence.map((entry) => entry.observerScale),
  );
  assert(
    'identityDoesNotDependOnColorAlone',
    proofGate.colorAloneSufficient === false
      && presentationPolicy.colorAloneSufficient === false
      && presentationPolicy.redundantIdentityChannels?.length >= 4,
    presentationPolicy,
  );

  const imageEvidence = [
    WORLD_CONCEPT_SOURCE,
    RESIDENT_CONCEPT_SOURCE,
    FAMILY_EMBODIMENT_CONCEPT_SOURCE,
  ].map((relativePath) => {
    const filePath = repoPath(root, relativePath);
    return {
      source: relativePath,
      sha256: fileHash(filePath),
      bytes: readFileSync(filePath).length,
      dimensions: pngDimensions(filePath),
      evidenceClass: 'concept_target_not_runtime_proof',
    };
  });
  assert(
    'conceptImagesAreWideTargets',
    imageEvidence.every(
      (entry) => (
        entry.dimensions.aspectRatioClass === 'wide_landscape'
        && entry.dimensions.width >= 1600
        && entry.dimensions.height >= 900
      ),
    ),
    imageEvidence,
  );
  assert(
    'artSpecNamesLockedDirection',
    texts.spec.includes('**World:** Stormglass Commons')
      && texts.spec.includes('**Style:** Hearthlight Biorealism')
      && texts.spec.includes('Stormglass Craftfolk'),
    ART_SPEC_SOURCE,
  );

  const sourceEvidence = Object.fromEntries(
    sourcePaths.map((relativePath) => [
      relativePath,
      {
        sha256: fileHash(repoPath(root, relativePath)),
        bytes: readFileSync(repoPath(root, relativePath)).length,
      },
    ]),
  );
  const publicEmbodimentCatalog = Object.fromEntries(
    publicEmbodimentEvidence.map((entry) => [
      entry.publicEmbodimentId,
      entry,
    ]),
  );
  const publicFamilyCatalog = Object.fromEntries(
    publicEmbodimentEvidence.map((entry) => [
      entry.publicEmbodimentId,
      entry.publicDisplayName,
    ]),
  );
  const residentAssetTruth = {
    manifestSource: RESIDENT_ASSET_MANIFEST_SOURCE,
    manifestSourceObserved: true,
    manifestSchema:
      partialResidentAssetPolicy.manifestSchema,
    manifestSourceSha256:
      sourceEvidence[RESIDENT_ASSET_MANIFEST_SOURCE].sha256,
    manifestScope: partialResidentAssetPolicy.manifestScope,
    assetPurpose: partialResidentAssetPolicy.assetPurpose,
    residentId: partialResidentAssetPolicy.boundResidentId,
    seatId: partialResidentAssetPolicy.boundSeatId,
    lod: partialResidentAssetPolicy.lod,
    presentationProfile: partialResidentAssetPolicy.presentationProfile,
    sourceAdmissionStatus: partialResidentAssetPolicy.sourceAdmissionStatus,
    runtimeAttachmentStatus:
      partialResidentAssetPolicy.runtimeAttachmentStatus,
    runtimeAttachmentObservedByArtDirectionGate: false,
    productionArtObserved: false,
    completeStormglassKitObserved: false,
    completeLodSetObserved: false,
    authoredHumanoidRigObserved: false,
    neutralClipSetObserved: false,
    productionTextureSetObserved: false,
    publicFamilyMantleBinding: 'none',
    photorealismObserved: false,
  };

  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    status: failures.length === 0 ? 'pass' : 'fail',
    generatedAt: new Date().toISOString(),
    world: {
      name: 'Stormglass Commons',
      artStyle: 'hearthlight_biorealism',
      residentDesignSystem: 'stormglass_craftfolk',
      publicEmbodimentSystem: 'stormglass_family_craftfolk',
      directionStatus: 'locked',
    },
    identityContract: {
      defaultResearchProfile: 'research_live_blinded',
      publicStoryProfile: 'village_story_unblinded',
      postlockReplayProfile: 'research_replay_postlock',
      researchAliasVisibility: 'Resident 01-06 only',
      publicFamilyCatalog,
      publicCatalogBinding: 'none',
      postlockResearchJoinSource: 'verified_family_binding_receipt_only',
      independentProjectDisclosure: INDEPENDENT_PROJECT_DISCLOSURE,
      independentProjectDisclosureHash:
        INDEPENDENT_PROJECT_DISCLOSURE_HASH,
      researchAppearanceDigestFields: RESEARCH_APPEARANCE_DIGEST_FIELDS,
      publicEmbodimentDigestFields: PUBLIC_EMBODIMENT_DIGEST_FIELDS,
      forbiddenResearchIdentityFields: FORBIDDEN_RESEARCH_IDENTITY_FIELDS,
      forbiddenPublicMantleRoleTokens: FORBIDDEN_PUBLIC_ROLE_TOKENS,
    },
    parserEvidence: {
      preferredSurface: 'mcp__holoscript_local',
      executedFallback: 'local_built_holoscript_core',
      corePath: path.relative(root, holoScript.corePath).replaceAll('\\', '/'),
      coreSha256: fileHash(holoScript.corePath),
      parsers: {
        holo: 'HoloCompositionParser',
        hsplus: 'HoloScriptPlusParser',
        hs: 'HoloScriptCodeParser',
      },
      parsedSources: [
        RESIDENT_KIT_SOURCE,
        RESIDENT_ASSET_MANIFEST_SOURCE,
        PUBLIC_EMBODIMENT_SOURCE,
        ART_POLICY_SOURCE,
        APPEARANCE_PROOF_SOURCE,
        WORLD_SOURCE,
        OBSERVER_SOURCE,
      ],
    },
    residentAssetTruth,
    residents: researchResidentEvidence,
    publicEmbodiments: publicEmbodimentCatalog,
    imageEvidence,
    sourceEvidence,
    assertions,
    failures,
    claimBoundary: {
      observed: [
        'locked_three_format_art_direction_source',
        'six_neutral_cross_surface_research_appearance_manifests',
        'six_separate_public_family_embodiment_manifests',
        'research_and_public_identity_digest_separation',
        'receipt_gated_public_and_postlock_presentation_profiles',
        'typed_fail_neutral_postlock_evidence_source_contract',
        'adapter_and_condition_research_appearance_invariance_manifest',
        'distinct_q0_capsule_proxy_scales',
        'neutral_seat_01_lod0_asset_source_manifest',
        'locally_custodied_concept_targets',
      ],
      targetNotObserved: [
        'renderer_observed_neutral_seat_01_lod0_attachment',
        'complete_six_resident_stormglass_asset_kit',
        'complete_resident_lod0_lod1_lod2_set',
        'facial_rig',
        'authored_humanoid_rig',
        'neutral_resident_clip_set',
        'production_character_animation',
        'authored_family_mantle_glb_nodes',
        'six_live_model_family_adapter_bindings',
        'postlock_binding_receipt_runtime_execution',
        'production_resident_texture_set',
        'production_texture_atlas',
        'production_audio',
        'dynamic_weather',
        'advanced_physics_visual_adapters',
        'native_webgpu_feature_parity',
        'photorealism',
      ],
    },
  };
  receipt.receiptHash = receiptHash(receipt);

  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);

  return {
    receipt,
    output,
  };
}

async function main() {
  const args = parseArgs();
  const result = await runModelVillageArtDirectionCheck(args);
  if (args.json) {
    console.log(JSON.stringify(result.receipt, null, 2));
  } else {
    console.log(
      `Model Village art direction: ${result.receipt.status.toUpperCase()}`,
    );
    console.log(`World: ${result.receipt.world.name}`);
    console.log(`Style: ${result.receipt.world.artStyle}`);
    console.log(`Research residents: ${result.receipt.residents.length}`);
    console.log(
      `Public embodiments: ${Object.values(result.receipt.publicEmbodiments)
        .map((entry) => entry.publicDisplayName)
        .sort((left, right) => left.localeCompare(right))
        .join(', ')}`,
    );
    console.log(`Receipt: ${result.receipt.receiptHash}`);
    console.log(`Output: ${result.output}`);
    if (result.receipt.failures.length > 0) {
      console.error(JSON.stringify(result.receipt.failures, null, 2));
    }
  }
  if (result.receipt.status !== 'pass') process.exitCode = 1;
}

const isMain = Boolean(
  process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url),
);
if (isMain) {
  main().catch((error) => {
    console.error(error.stack || error.message || String(error));
    process.exitCode = 1;
  });
}
