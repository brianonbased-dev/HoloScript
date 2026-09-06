/**
 * HoloAbsorb product identity and executable ownership manifest.
 *
 * HoloAbsorb is the public umbrella for the capabilities historically shipped
 * under "Absorb" and `absorb-service`. Existing package names, service slugs,
 * tools, and the GEV entry point remain compatibility contracts.
 *
 * @packageDocumentation
 */

export const HOLOABSORB_PRODUCT_NAME = 'HoloAbsorb' as const;
export const HOLOABSORB_MANIFEST_SCHEMA = 'holoscript.holoabsorb.manifest.v1' as const;
export const HOLOABSORB_AUDIT_SCHEMA = 'holoscript.holoabsorb.audit.v1' as const;

export type HoloAbsorbCapabilityId =
  | 'ingest'
  | 'holograph'
  | 'holoembed'
  | 'graphrag'
  | 'synthesis'
  | 'spatial-output'
  | 'transport-authority'
  | 'self-improvement'
  | 'service-host'
  | 'evidence';

export interface HoloAbsorbCapability {
  id: HoloAbsorbCapabilityId;
  name: string;
  canonicalOwner: string;
  responsibility: string;
  entrypoints: readonly string[];
  toolNames: readonly string[];
  evidencePaths: readonly string[];
}

export type HoloAbsorbAliasDisposition =
  | 'compatibility-alias'
  | 'legacy-alias'
  | 'substrate-lane'
  | 'deployment-slug';

export interface HoloAbsorbAlias {
  kind: 'product' | 'package' | 'service' | 'spine' | 'subsystem' | 'tool' | 'provider' | 'cli';
  alias: string;
  canonical: string;
  disposition: HoloAbsorbAliasDisposition;
  removalPlanned: false;
  note: string;
}

export interface HoloAbsorbPaperEvidence {
  id: 'paper-5-graphrag' | 'paper-26-holograph';
  title: string;
  sourcePath: string;
  benchmarkCommands: readonly string[];
  claimBoundary: string;
  requiredReceiptKinds: readonly string[];
}

export interface HoloAbsorbWorkstream {
  id:
    | 'runtime-reliability'
    | 'retrieval-quality'
    | 'paper-evidence'
    | 'fleet-lifecycle'
    | 'promotion'
    | 'self-improvement';
  ownerCapability: HoloAbsorbCapabilityId;
  boardTags: readonly string[];
  completionEvidence: string;
}

export interface HoloAbsorbManifest {
  schemaVersion: typeof HOLOABSORB_MANIFEST_SCHEMA;
  productName: typeof HOLOABSORB_PRODUCT_NAME;
  canonicalPackage: '@holoscript/absorb-service';
  serviceSlug: 'absorb-service';
  consumerSpine: '@holoscript/absorb-service/gev';
  officialCliCommand: 'holoabsorb';
  officialMcpTool: 'holo_absorb_manifest';
  renameRequired: false;
  compatibilityPolicy: string;
  capabilities: readonly HoloAbsorbCapability[];
  aliases: readonly HoloAbsorbAlias[];
  papers: readonly HoloAbsorbPaperEvidence[];
  workstreams: readonly HoloAbsorbWorkstream[];
  coordination: {
    umbrellaTaskId: 'task_1785045258746_89kn';
    canonicalBoardTag: 'holoabsorb';
    duplicatePolicy: string;
    missingThreadPolicy: string;
  };
}

const CAPABILITIES: readonly HoloAbsorbCapability[] = [
  {
    id: 'ingest',
    name: 'HoloAbsorb Ingest',
    canonicalOwner: 'packages/absorb-service/src/ingest',
    responsibility:
      'Repository discovery, language-aware scanning, inline-source custody, cancellation, and professional ingest contracts.',
    entrypoints: [
      '@holoscript/absorb-service/ingest',
      '@holoscript/absorb-service/engine',
      '@holoscript/absorb-service/mcp',
    ],
    toolNames: [
      'holo_absorb_repo',
      'holo_cancel_absorb',
      'holo_get_absorb_status',
      'absorb_typescript',
      'absorb_suggest_holoscript_transform',
    ],
    evidencePaths: [
      'packages/absorb-service/src/ingest/index.ts',
      'packages/absorb-service/src/engine/CodebaseScanner.ts',
      'packages/absorb-service/src/mcp/codebase-tools.ts',
    ],
  },
  {
    id: 'holograph',
    name: 'HoloGraph',
    canonicalOwner: 'packages/absorb-service/src/engine/CodebaseGraph.ts',
    responsibility:
      'Structural symbols, imports, calls, event edges, communities, provenance, impact analysis, and graph traversal.',
    entrypoints: [
      '@holoscript/absorb-service/engine',
      '@holoscript/absorb-service/gev',
      '@holoscript/absorb-service/mcp',
    ],
    toolNames: [
      'holo_query_codebase',
      'holo_impact_analysis',
      'holo_detect_changes',
      'holo_detect_drift',
      'holo_resolve_symbol',
    ],
    evidencePaths: [
      'packages/absorb-service/src/engine/CodebaseGraph.ts',
      'packages/absorb-service/src/engine/__tests__/EventEdge.test.ts',
      'packages/absorb-service/src/gev/index.ts',
    ],
  },
  {
    id: 'holoembed',
    name: 'HoloEmbed',
    canonicalOwner: 'packages/holoembed',
    responsibility:
      'Sovereign embeddings, hybrid exact-name and semantic retrieval, vector indexes, and manifest-selected embedding generations.',
    entrypoints: ['@holoscript/holoembed', '@holoscript/absorb-service/gev'],
    toolNames: ['holo_semantic_search'],
    evidencePaths: [
      'packages/holoembed/src/index.ts',
      'packages/absorb-service/src/engine/providers/HoloEmbedProvider.ts',
      'packages/absorb-service/src/engine/EmbeddingIndex.ts',
      'packages/absorb-service/src/engine/HybridRetrieval.ts',
    ],
  },
  {
    id: 'graphrag',
    name: 'HoloAbsorb GraphRAG',
    canonicalOwner: 'packages/absorb-service/src/engine/GraphRAGEngine.ts',
    responsibility:
      'Graph-aware hybrid retrieval, exact-name-preserving reranking, explicit visual-focus scoring, citations, query enrichment, and codebase answers.',
    entrypoints: ['@holoscript/absorb-service/gev', '@holoscript/absorb-service/mcp'],
    toolNames: ['holo_ask_codebase', 'absorb_query'],
    evidencePaths: [
      'packages/absorb-service/src/engine/GraphRAGEngine.ts',
      'packages/absorb-service/src/engine/HybridRetrieval.ts',
      'packages/absorb-service/src/mcp/graph-rag-tools.ts',
    ],
  },
  {
    id: 'synthesis',
    name: 'HoloAbsorb Synthesis',
    canonicalOwner: 'packages/absorb-service/src/pipeline',
    responsibility:
      'Grounded answer synthesis, provider routing, HoloLlama receipts, oracle consultation, and AI query execution.',
    entrypoints: [
      '@holoscript/absorb-service/pipeline',
      '@holoscript/holollama',
      '@holoscript/absorb-service/mcp',
    ],
    toolNames: ['absorb_run_query_ai', 'holo_oracle_consult'],
    evidencePaths: [
      'packages/absorb-service/src/pipeline/index.ts',
      'packages/absorb-service/src/pipeline/llmProvider.ts',
      'packages/absorb-service/src/mcp/oracle-tools.ts',
    ],
  },
  {
    id: 'spatial-output',
    name: 'HoloAbsorb Spatial Output',
    canonicalOwner: 'packages/absorb-service/src/engine/HoloEmitter.ts',
    responsibility:
      'Agent manifests, .holo codebase worlds, interactive layouts, collision-safe selection receipts, render jobs, and spatial graph visualization that agents can feed back into retrieval.',
    entrypoints: ['@holoscript/absorb-service/engine', '@holoscript/absorb-service/mcp'],
    toolNames: ['holo_visual_graph_context', 'absorb_run_render'],
    evidencePaths: [
      'packages/absorb-service/src/engine/HoloEmitter.ts',
      'packages/absorb-service/src/engine/visualization/CodebaseSceneCompiler.ts',
      'packages/absorb-service/src/engine/visualization/GraphSelectionManager.ts',
    ],
  },
  {
    id: 'transport-authority',
    name: 'HoloAbsorb Transport and Authority',
    canonicalOwner: 'packages/absorb-service/src/mcp/codebase-tools.ts',
    responsibility:
      'Sovereign graph transport, writer leases, isolated refresh workers, generation manifests, cache authority, drift, and recovery.',
    entrypoints: ['@holoscript/absorb-service/mcp', 'services/absorb-service'],
    toolNames: ['holo_graph_status', 'absorb_diff'],
    evidencePaths: [
      'packages/absorb-service/src/mcp/codebase-tools.ts',
      'packages/absorb-service/src/mcp/codebase-cache-storage.ts',
      'packages/absorb-service/src/engine/workers/WorkerPool.ts',
      'scripts/holoscript-mcp-stdio.mjs',
      'scripts/lib/mcp-process-lifecycle.mjs',
      'scripts/__tests__/mcp-process-lifecycle.test.mjs',
      'packages/absorb-service/scripts/bench-holoabsorb-transport.mjs',
    ],
  },
  {
    id: 'self-improvement',
    name: 'HoloAbsorb Self-Improvement',
    canonicalOwner: 'packages/absorb-service/src/self-improvement',
    responsibility:
      'Knowledge extraction, recursive improvement pipelines, GRPO rewards, daemon operation, and durable progress checkpoints.',
    entrypoints: [
      '@holoscript/absorb-service/self-improvement',
      '@holoscript/absorb-service/daemon',
      '@holoscript/absorb-service/pipeline',
    ],
    toolNames: [
      'absorb_extract_knowledge',
      'absorb_run_absorb',
      'absorb_run_improve',
      'absorb_run_pipeline',
    ],
    evidencePaths: [
      'packages/absorb-service/src/self-improvement/index.ts',
      'packages/absorb-service/src/daemon/index.ts',
      'packages/absorb-service/src/pipeline/index.ts',
    ],
  },
  {
    id: 'service-host',
    name: 'HoloAbsorb Service Host',
    canonicalOwner: 'services/absorb-service',
    responsibility:
      'Thin hosted API, project lifecycle, credits, metering, and deployment without duplicated engine business logic.',
    entrypoints: ['services/absorb-service', '@holoscript/absorb-service/credits'],
    toolNames: [
      'absorb_list_projects',
      'absorb_create_project',
      'absorb_delete_project',
      'absorb_check_credits',
    ],
    evidencePaths: [
      'services/absorb-service/package.json',
      'packages/absorb-service/src/mcp/absorb-tools.ts',
      'packages/absorb-service/src/credits/index.ts',
    ],
  },
  {
    id: 'evidence',
    name: 'HoloAbsorb Evidence',
    canonicalOwner: 'packages/absorb-service/src/holoabsorb',
    responsibility:
      'Official identity, ownership audits, paper claim boundaries, repeatable benchmarks, and timestamped receipts.',
    entrypoints: [
      '@holoscript/absorb-service/holoabsorb',
      'holoscript holoabsorb',
      'holo_absorb_manifest',
    ],
    toolNames: ['holo_absorb_manifest'],
    evidencePaths: [
      'packages/absorb-service/src/holoabsorb/index.ts',
      'packages/absorb-service/scripts/audit-holoabsorb.mjs',
      'packages/absorb-service/scripts/bench-holoabsorb.mjs',
      'packages/absorb-service/scripts/bench-holoabsorb-hybrid.mjs',
      'packages/absorb-service/scripts/bench-holoabsorb-refresh.mjs',
      'packages/absorb-service/scripts/audit-paper-5-visual-v4.mjs',
      'packages/absorb-service/scripts/prepare-paper-5-visual-v4.mjs',
      'packages/absorb-service/scripts/execute-paper-5-visual-v4.mjs',
      'packages/absorb-service/scripts/lib/paper-5-visual-v4.mjs',
      'packages/absorb-service/scripts/verify-paper-5-dataset.mjs',
      'packages/absorb-service/scripts/verify-scan-determinism.mjs',
      'packages/absorb-service/scripts/bench-paper-5-accuracy.mjs',
      'packages/absorb-service/scripts/bench-paper-5-visual-agent-study.mjs',
      'packages/absorb-service/scripts/lib/paper-5-visual-agent-study.mjs',
      'packages/absorb-service/scripts/bench-paper-5-gpu.mjs',
      'packages/absorb-service/benchmarks/paper-5-retrieval-v1.json',
      'packages/absorb-service/benchmarks/paper-5-visual-agent-study-v1.json',
      'packages/absorb-service/benchmarks/paper-5-visual-agent-study-v2.json',
      'packages/absorb-service/benchmarks/paper-5-visual-agent-study-v3.json',
      'packages/absorb-service/benchmarks/paper-5-visual-agent-study-v4.json',
      'research/holoabsorb-artifacts/2026-07-26-paper5-visual-agent-pilot-qwen3-4b-v2/README.md',
      'research/holoabsorb-artifacts/2026-07-26-paper5-visual-agent-pilot-qwen3-4b-v2/packets.json',
      'research/holoabsorb-artifacts/2026-07-26-paper5-visual-agent-pilot-qwen3-4b-v2/result.json',
      'research/holoabsorb-artifacts/2026-07-27-paper5-visual-agent-followup-v3-qwen3-4b/README.md',
      'research/holoabsorb-artifacts/2026-07-27-paper5-visual-agent-followup-v3-qwen3-4b/packets.json',
      'research/holoabsorb-artifacts/2026-07-27-paper5-visual-agent-followup-v3-qwen3-4b/result.json',
    ],
  },
];

const ALIASES: readonly HoloAbsorbAlias[] = [
  {
    kind: 'product',
    alias: 'Absorb',
    canonical: HOLOABSORB_PRODUCT_NAME,
    disposition: 'compatibility-alias',
    removalPlanned: false,
    note: 'Historical short name retained in prose, APIs, and existing automation.',
  },
  {
    kind: 'package',
    alias: '@holoscript/absorb-service',
    canonical: HOLOABSORB_PRODUCT_NAME,
    disposition: 'compatibility-alias',
    removalPlanned: false,
    note: 'Canonical npm package and source boundary; no package rename is required.',
  },
  {
    kind: 'service',
    alias: 'absorb-service',
    canonical: HOLOABSORB_PRODUCT_NAME,
    disposition: 'deployment-slug',
    removalPlanned: false,
    note: 'Stable Railway and local service slug.',
  },
  {
    kind: 'spine',
    alias: 'GEV',
    canonical: 'HoloAbsorb GEV',
    disposition: 'substrate-lane',
    removalPlanned: false,
    note: 'Graph + Embedding + Vector/RAG consumer spine, not the whole product.',
  },
  {
    kind: 'subsystem',
    alias: 'HoloGraph',
    canonical: 'HoloAbsorb/HoloGraph',
    disposition: 'substrate-lane',
    removalPlanned: false,
    note: 'Structural graph subsystem.',
  },
  {
    kind: 'subsystem',
    alias: 'HoloEmbed',
    canonical: 'HoloAbsorb/HoloEmbed',
    disposition: 'substrate-lane',
    removalPlanned: false,
    note: 'Sovereign embedding and hybrid retrieval subsystem.',
  },
  {
    kind: 'subsystem',
    alias: 'HoloLlama',
    canonical: 'HoloAbsorb/Synthesis',
    disposition: 'substrate-lane',
    removalPlanned: false,
    note: 'Owned synthesis provider lane; GraphRAG remains usable without it.',
  },
  {
    kind: 'tool',
    alias: 'absorb_query',
    canonical: 'holo_semantic_search',
    disposition: 'compatibility-alias',
    removalPlanned: false,
    note: 'Hosted-service wrapper over the shared semantic retrieval responsibility.',
  },
  {
    kind: 'provider',
    alias: 'structural',
    canonical: 'holoembed',
    disposition: 'legacy-alias',
    removalPlanned: false,
    note: 'Accepted request spelling that resolves to the native HoloEmbed provider.',
  },
  {
    kind: 'cli',
    alias: 'absorb-manifest',
    canonical: 'holoabsorb',
    disposition: 'compatibility-alias',
    removalPlanned: false,
    note: 'Machine-oriented CLI alias for the official HoloAbsorb discovery command.',
  },
];

const PAPERS: readonly HoloAbsorbPaperEvidence[] = [
  {
    id: 'paper-5-graphrag',
    title: 'Graph-Augmented Retrieval for Codebase Intelligence',
    sourcePath: 'ai-ecosystem/research/paper-5-graphrag-icse.tex',
    benchmarkCommands: [
      'node packages/absorb-service/scripts/verify-paper-5-dataset.mjs',
      'node packages/absorb-service/scripts/bench-paper-5-accuracy.mjs',
      'node packages/absorb-service/scripts/bench-holoabsorb-hybrid.mjs --visual-focus-only --repo=packages/absorb-service --max-files=2000',
      'node packages/absorb-service/scripts/bench-paper-5-visual-agent-study.mjs --prepare-only',
      'node packages/absorb-service/scripts/execute-paper-5-visual-v4.mjs --help',
      'node packages/absorb-service/scripts/bench-paper-5-gpu.mjs',
    ],
    claimBoundary:
      'The accuracy harness uses 54 frozen held-out, source-audited queries with multi-relevance labels and bootstrap confidence intervals. The real-repository visual-focus ablation freezes duplicate-symbol targets before running no-selection, correct-selection, stale-unresolved, and wrong-resolved arms; it measures structured graph.holo selection intent, not literal pixels. The preregistered Qwen3-4B v2 pilot measured blinded selection from a gold-complete eight-candidate view; its raw structured visual-graph arm did not support the hypothesis and exceeded the invalid-response ceiling. The outcome-exposed v3 engineering follow-up eliminated invalid responses with strict JSON Schema and found diagnostic Precision@5 gains for explicit relational graph summaries, but it is ineligible for a superiority claim. The frozen v4 protocol and provider-neutral executor specify an external multi-codebase four-arm factorial confirmation that isolates literal image pixels from structured relational text, but no admitted external dataset or result exists yet. Existing measurements are model-specific controlled-navigation results, not end-to-end retrieval or literal pixel vision. The timing harness is synthetic unless explicitly captured on verified target hardware.',
    requiredReceiptKinds: ['accuracy-json', 'timing-json', 'hardware-inventory', 'claim-boundary'],
  },
  {
    id: 'paper-26-holograph',
    title: 'HoloGraph Structural Event Retrieval and HoloEmbed Recall',
    sourcePath: 'ai-ecosystem/research/paper-26-main.tex',
    benchmarkCommands: [
      'pnpm --filter @holoscript/absorb-service exec vitest run src/engine/__tests__/Paper26Benchmark.test.ts',
      'pnpm --filter @holoscript/absorb-service exec vitest run src/engine/__tests__/Paper26Table2NLRecall.test.ts',
    ],
    claimBoundary:
      'O(1) event lookup uses synthetic event corpora. HoloEmbed recall uses name-derived natural-language queries; Xenova is an optional ablation and must be reported as skipped when not run.',
    requiredReceiptKinds: ['test-log', 'hardware-inventory', 'claim-boundary'],
  },
];

const WORKSTREAMS: readonly HoloAbsorbWorkstream[] = [
  {
    id: 'runtime-reliability',
    ownerCapability: 'transport-authority',
    boardTags: ['absorb', 'reliability'],
    completionEvidence: 'Crash, lease, cache-generation, memory, cancellation, and recovery tests.',
  },
  {
    id: 'retrieval-quality',
    ownerCapability: 'graphrag',
    boardTags: ['absorb', 'graphrag', 'retrieval'],
    completionEvidence: 'Labeled recall, exact-name, semantic, hybrid, and citation receipts.',
  },
  {
    id: 'paper-evidence',
    ownerCapability: 'evidence',
    boardTags: ['holoabsorb', 'paper-evidence', 'benchmark'],
    completionEvidence:
      'Timestamped receipt with hardware, commit, commands, outputs, and limitations.',
  },
  {
    id: 'fleet-lifecycle',
    ownerCapability: 'service-host',
    boardTags: ['absorb', 'fleet', 'jetson'],
    completionEvidence:
      'Owned-metal lifecycle and workload receipts with a safe resource envelope.',
  },
  {
    id: 'promotion',
    ownerCapability: 'service-host',
    boardTags: ['absorb', 'promotion'],
    completionEvidence:
      'Public API canaries, fleet-consumption decision, package build, and deploy receipts.',
  },
  {
    id: 'self-improvement',
    ownerCapability: 'self-improvement',
    boardTags: ['absorb', 'grpo', 'self-improvement'],
    completionEvidence:
      'Non-zero reward coverage, regression tests, and a replayable improvement receipt.',
  },
];

const MANIFEST: HoloAbsorbManifest = {
  schemaVersion: HOLOABSORB_MANIFEST_SCHEMA,
  productName: HOLOABSORB_PRODUCT_NAME,
  canonicalPackage: '@holoscript/absorb-service',
  serviceSlug: 'absorb-service',
  consumerSpine: '@holoscript/absorb-service/gev',
  officialCliCommand: 'holoabsorb',
  officialMcpTool: 'holo_absorb_manifest',
  renameRequired: false,
  compatibilityPolicy:
    'HoloAbsorb is the official product identity. Existing package, deployment, tool, provider, and GEV names remain stable compatibility contracts; consolidation moves ownership and evidence under the umbrella without breaking callers.',
  capabilities: CAPABILITIES,
  aliases: ALIASES,
  papers: PAPERS,
  workstreams: WORKSTREAMS,
  coordination: {
    umbrellaTaskId: 'task_1785045258746_89kn',
    canonicalBoardTag: 'holoabsorb',
    duplicatePolicy:
      'One canonical HoloAbsorb workstream owns each outcome. Overlapping board tasks are linked as compatibility, validation, or duplicate candidates before either is closed.',
    missingThreadPolicy:
      'Every unresolved benchmark, fleet, retrieval, reliability, promotion, or self-improvement gap must be attached to the umbrella task or represented by a tagged child task.',
  },
};

export function buildHoloAbsorbManifest(): HoloAbsorbManifest {
  return MANIFEST;
}

export interface HoloAbsorbAuditOptions {
  observedToolNames?: readonly string[];
  observedPaths?: readonly string[];
}

export interface HoloAbsorbAuditCheck {
  id: string;
  status: 'pass' | 'fail';
  detail: string;
}

export interface HoloAbsorbAuditReceipt {
  schemaVersion: typeof HOLOABSORB_AUDIT_SCHEMA;
  productName: typeof HOLOABSORB_PRODUCT_NAME;
  status: 'pass' | 'fail';
  checks: readonly HoloAbsorbAuditCheck[];
  errors: readonly string[];
  summary: {
    capabilityCount: number;
    aliasCount: number;
    paperCount: number;
    workstreamCount: number;
    declaredToolCount: number;
    declaredEvidencePathCount: number;
  };
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicateValues = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicateValues.add(value);
    seen.add(value);
  }
  return [...duplicateValues].sort();
}

function normalizedPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function auditHoloAbsorbManifest(
  options: HoloAbsorbAuditOptions = {}
): HoloAbsorbAuditReceipt {
  const manifest = buildHoloAbsorbManifest();
  const checks: HoloAbsorbAuditCheck[] = [];
  const errors: string[] = [];

  const record = (id: string, ok: boolean, passDetail: string, failDetail: string) => {
    checks.push({ id, status: ok ? 'pass' : 'fail', detail: ok ? passDetail : failDetail });
    if (!ok) errors.push(failDetail);
  };

  const capabilityIds = manifest.capabilities.map((capability) => capability.id);
  const duplicateCapabilities = duplicates(capabilityIds);
  record(
    'unique-capability-owners',
    duplicateCapabilities.length === 0,
    `${capabilityIds.length} capabilities have unique owners.`,
    `Duplicate HoloAbsorb capability owners: ${duplicateCapabilities.join(', ')}`
  );

  const declaredTools = manifest.capabilities.flatMap((capability) => capability.toolNames);
  const duplicateTools = duplicates(declaredTools);
  record(
    'unique-tool-ownership',
    duplicateTools.length === 0,
    `${declaredTools.length} tools have one declared capability owner.`,
    `Tools declared by multiple HoloAbsorb capabilities: ${duplicateTools.join(', ')}`
  );

  const aliasKeys = manifest.aliases.map((alias) => `${alias.kind}:${alias.alias}`);
  const duplicateAliases = duplicates(aliasKeys);
  record(
    'explicit-aliases',
    duplicateAliases.length === 0 && manifest.aliases.every((alias) => alias.note.length > 0),
    `${manifest.aliases.length} compatibility and substrate aliases are explicit.`,
    `Duplicate or undocumented HoloAbsorb aliases: ${duplicateAliases.join(', ')}`
  );

  const evidencePaths = [
    ...new Set(manifest.capabilities.flatMap((capability) => capability.evidencePaths)),
  ];
  const capabilitiesWithoutEvidence = manifest.capabilities
    .filter((capability) => capability.evidencePaths.length === 0)
    .map((capability) => capability.id);
  record(
    'capability-evidence',
    capabilitiesWithoutEvidence.length === 0,
    `${manifest.capabilities.length} capabilities declare evidence paths.`,
    `Capabilities without evidence paths: ${capabilitiesWithoutEvidence.join(', ')}`
  );

  const incompletePapers = manifest.papers
    .filter(
      (paper) =>
        paper.sourcePath.length === 0 ||
        paper.benchmarkCommands.length === 0 ||
        paper.claimBoundary.length === 0 ||
        paper.requiredReceiptKinds.length === 0
    )
    .map((paper) => paper.id);
  record(
    'paper-claim-boundaries',
    incompletePapers.length === 0,
    `${manifest.papers.length} papers declare commands, receipts, and claim boundaries.`,
    `Papers with incomplete evidence contracts: ${incompletePapers.join(', ')}`
  );

  const invalidWorkstreams = manifest.workstreams
    .filter(
      (workstream) =>
        !capabilityIds.includes(workstream.ownerCapability) ||
        workstream.boardTags.length === 0 ||
        workstream.completionEvidence.length === 0
    )
    .map((workstream) => workstream.id);
  record(
    'workstream-ownership',
    invalidWorkstreams.length === 0,
    `${manifest.workstreams.length} workstreams map to capability owners and evidence.`,
    `Invalid HoloAbsorb workstreams: ${invalidWorkstreams.join(', ')}`
  );

  if (options.observedToolNames) {
    const observed = new Set(options.observedToolNames);
    const missing = declaredTools.filter((tool) => !observed.has(tool));
    record(
      'observed-tools',
      missing.length === 0,
      'Every declared HoloAbsorb tool is present on the observed tool surface.',
      `Missing observed HoloAbsorb tools: ${missing.join(', ')}`
    );
  }

  if (options.observedPaths) {
    const observed = new Set(options.observedPaths.map(normalizedPath));
    const missing = evidencePaths.filter((path) => !observed.has(normalizedPath(path)));
    record(
      'observed-paths',
      missing.length === 0,
      'Every declared HoloAbsorb evidence path exists in the observed repository.',
      `Missing observed HoloAbsorb paths: ${missing.join(', ')}`
    );
  }

  return {
    schemaVersion: HOLOABSORB_AUDIT_SCHEMA,
    productName: HOLOABSORB_PRODUCT_NAME,
    status: errors.length === 0 ? 'pass' : 'fail',
    checks,
    errors,
    summary: {
      capabilityCount: manifest.capabilities.length,
      aliasCount: manifest.aliases.length,
      paperCount: manifest.papers.length,
      workstreamCount: manifest.workstreams.length,
      declaredToolCount: declaredTools.length,
      declaredEvidencePathCount: evidencePaths.length,
    },
  };
}
