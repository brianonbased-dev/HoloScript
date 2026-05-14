/**
 * HoloScript Evidence Envelope
 *
 * Reusable manifest builder for paper-grade calibration/setup/reproducibility
 * evidence. The envelope binds hardware tier, runtime environment, seed,
 * harness command, artifact paths, and a one-command rerun into one hashable
 * JSON object that papers can cite directly.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { arch, cpus, platform, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export const EVIDENCE_ENVELOPE_SCHEMA = 'holoscript.evidence-envelope.v1' as const;
export const EVIDENCE_ENVELOPE_GENERATOR =
  '@holoscript/hololand-platform/evidence-envelope' as const;

export type EvidenceArtifactRole =
  | 'source'
  | 'schema'
  | 'generator'
  | 'harness'
  | 'receipt'
  | 'trace-corpus'
  | 'paper'
  | 'documentation'
  | 'output';

export interface EvidenceEnvelopePaper {
  id: string;
  title: string;
  target?: string;
  basename?: string;
}

export interface EvidenceEnvelopeRuntime {
  os: string;
  release: string;
  arch: string;
  nodeVersion: string;
  v8Version: string;
  pnpmVersion?: string;
  cpuModel: string;
  logicalCores: number;
  totalMemoryGB: number;
}

export interface EvidenceSourceRevision {
  repo: string;
  commit?: string;
  dirty?: boolean;
  path?: string;
}

export interface EvidenceCalibrationCheck {
  id: string;
  label: string;
  required: boolean;
  command?: string;
  artifactRole?: EvidenceArtifactRole;
}

export interface EvidenceArtifactInput {
  repo?: string;
  path: string;
  localPath?: string;
  role: EvidenceArtifactRole;
  description?: string;
  required?: boolean;
  sha256?: string;
  bytes?: number;
}

export interface EvidenceArtifact {
  repo?: string;
  path: string;
  role: EvidenceArtifactRole;
  description?: string;
  required: boolean;
  exists: boolean;
  sha256?: string;
  bytes?: number;
}

export interface EvidenceEnvelopeInput {
  cwd?: string;
  generatedAt?: string;
  paper: EvidenceEnvelopePaper;
  hardwareTier: string;
  runtime?: EvidenceEnvelopeRuntime;
  sourceRevisions?: EvidenceSourceRevision[];
  setupCommand?: string;
  seed: string;
  harnessCommand: string;
  rerunCommand: string;
  artifacts: EvidenceArtifactInput[];
  calibrationChecks?: EvidenceCalibrationCheck[];
  notes?: string[];
}

export interface EvidenceEnvelopeManifest {
  schemaVersion: typeof EVIDENCE_ENVELOPE_SCHEMA;
  manifestId: string;
  manifestHash: string;
  generatedAt: string;
  generatedBy: typeof EVIDENCE_ENVELOPE_GENERATOR;
  paper: EvidenceEnvelopePaper;
  hardwareTier: string;
  environment: {
    hash: string;
    runtime: EvidenceEnvelopeRuntime;
    sourceRevisions: EvidenceSourceRevision[];
  };
  calibration: {
    setupCommand?: string;
    checks: EvidenceCalibrationCheck[];
  };
  reproducibility: {
    seed: string;
    harnessCommand: string;
    rerunCommand: string;
    artifactPaths: string[];
  };
  artifacts: EvidenceArtifact[];
  notes: string[];
}

export interface EvidenceEnvelopeVerification {
  valid: boolean;
  expectedHash: string;
  actualHash?: string;
  reason?: string;
}

type EvidenceEnvelopeBody = Omit<EvidenceEnvelopeManifest, 'manifestId' | 'manifestHash'>;

export function buildEvidenceEnvelope(input: EvidenceEnvelopeInput): EvidenceEnvelopeManifest {
  const cwd = resolve(input.cwd ?? process.cwd());
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const runtime = input.runtime ?? collectEvidenceRuntime();
  const sourceRevisions = (input.sourceRevisions ?? []).map(cleanSourceRevision);
  const artifacts = input.artifacts.map((artifact) => enrichArtifact(artifact, cwd));
  const checks = input.calibrationChecks ?? defaultCalibrationChecks();

  const environment = {
    hash: hashValue({ runtime, sourceRevisions }),
    runtime,
    sourceRevisions,
  };

  const body: EvidenceEnvelopeBody = {
    schemaVersion: EVIDENCE_ENVELOPE_SCHEMA,
    generatedAt,
    generatedBy: EVIDENCE_ENVELOPE_GENERATOR,
    paper: cleanPaper(input.paper),
    hardwareTier: input.hardwareTier,
    environment,
    calibration: {
      ...(input.setupCommand ? { setupCommand: input.setupCommand } : {}),
      checks,
    },
    reproducibility: {
      seed: input.seed,
      harnessCommand: input.harnessCommand,
      rerunCommand: input.rerunCommand,
      artifactPaths: artifacts.map(formatArtifactPath),
    },
    artifacts,
    notes: input.notes ?? [],
  };

  const manifestHash = hashValue(body);
  return {
    manifestId: `eenv_${manifestHash.replace('sha256:', '').slice(0, 16)}`,
    manifestHash,
    ...body,
  };
}

export function buildPaper12HololandEvidenceEnvelope(
  options: Partial<Omit<EvidenceEnvelopeInput, 'paper' | 'artifacts'>> & {
    cwd?: string;
    hololandRoot?: string;
    outputPath?: string;
    artifacts?: EvidenceArtifactInput[];
  } = {},
): EvidenceEnvelopeManifest {
  const cwd = resolve(options.cwd ?? process.cwd());
  const hololandRoot = resolve(options.hololandRoot ?? `${cwd}/../Hololand`);
  const outputPath = options.outputPath ?? 'docs/public/evidence/paper-12-hololand-envelope.json';

  return buildEvidenceEnvelope({
    cwd,
    generatedAt: options.generatedAt,
    hardwareTier: options.hardwareTier ?? 'codex-hardware-local',
    runtime: options.runtime,
    sourceRevisions: options.sourceRevisions ?? [
      collectGitRevision(cwd, 'HoloScript'),
      collectGitRevision(hololandRoot, 'Hololand'),
    ],
    paper: {
      id: '12',
      title: 'HoloLand',
      target: "I3D '27 (Nov '26)",
      basename: 'paper-12-holo-i3d.tex',
    },
    setupCommand: options.setupCommand ?? 'pnpm install --frozen-lockfile',
    seed: options.seed ?? 'paper-12-hololand-evidence-envelope-v1',
    harnessCommand:
      options.harnessCommand ??
      'pnpm --filter @holoscript/hololand-platform run device-lab -- --task task_1778722625102_us8y',
    rerunCommand:
      options.rerunCommand ??
      `pnpm --filter @holoscript/hololand-platform run evidence-envelope -- --preset paper-12-hololand --out ${outputPath}`,
    calibrationChecks: options.calibrationChecks ?? [
      {
        id: 'runtime-inventory',
        label: 'Node, pnpm, OS, CPU, and memory inventory captured in the envelope.',
        required: true,
        artifactRole: 'generator',
      },
      {
        id: 'device-lab',
        label: 'HoloLand hardware probe captures WASM SIMD, WebGPU, headset, and replay evidence.',
        required: true,
        command:
          'pnpm --filter @holoscript/hololand-platform run device-lab -- --task task_1778722625102_us8y',
        artifactRole: 'harness',
      },
      {
        id: 'trace-corpus',
        label: 'CAEL/user-study trace corpus source is listed as reviewer-visible evidence.',
        required: true,
        artifactRole: 'trace-corpus',
      },
    ],
    artifacts:
      options.artifacts ??
      [
        {
          repo: 'HoloScript',
          path: 'packages/hololand-platform/src/evidence-envelope/index.ts',
          role: 'generator',
          description: 'Canonical TypeScript generator for evidence envelopes.',
        },
        {
          repo: 'HoloScript',
          path: 'packages/hololand-platform/src/evidence-envelope/cli.ts',
          role: 'harness',
          description: 'One-command envelope generation CLI.',
        },
        {
          repo: 'HoloScript',
          path: 'packages/hololand-platform/src/device-lab/index.ts',
          role: 'harness',
          description: 'Hardware-native HoloLand readiness receipt builder.',
        },
        {
          repo: 'HoloScript',
          path: 'docs/public/evidence/evidence-envelope.schema.json',
          role: 'schema',
          description: 'Public JSON schema for reviewer validation.',
        },
        {
          repo: 'HoloScript',
          path: 'docs/paper-program/evidence-envelope-manifests.md',
          role: 'documentation',
          description: 'Paper citation and rerun instructions.',
        },
        {
          repo: 'Hololand',
          path: 'examples/hololand-central/src/evidence/cael-user-study-corpus.hsplus',
          localPath: `${hololandRoot}/examples/hololand-central/src/evidence/cael-user-study-corpus.hsplus`,
          role: 'trace-corpus',
          description: 'Paper 12 HoloLand CAEL/user-study corpus source.',
        },
      ],
    notes: options.notes ?? [
      'Paper 12 cites this envelope for the Calibration/Setup/Reproducibility row.',
      'The manifest hash covers the runtime, source revisions, calibration checks, rerun command, and artifact hashes.',
    ],
  });
}

export function verifyEvidenceEnvelope(manifest: EvidenceEnvelopeManifest): EvidenceEnvelopeVerification {
  if (manifest.schemaVersion !== EVIDENCE_ENVELOPE_SCHEMA) {
    return {
      valid: false,
      expectedHash: '',
      actualHash: manifest.manifestHash,
      reason: `unsupported schemaVersion ${String(manifest.schemaVersion)}`,
    };
  }

  const { manifestId: _manifestId, manifestHash: _manifestHash, ...body } = manifest;
  const expectedHash = hashValue(body);
  return {
    valid: expectedHash === manifest.manifestHash,
    expectedHash,
    actualHash: manifest.manifestHash,
    ...(expectedHash === manifest.manifestHash ? {} : { reason: 'manifest hash mismatch' }),
  };
}

export function collectEvidenceRuntime(): EvidenceEnvelopeRuntime {
  const cpu = cpus()[0];
  const pnpmVersion = runVersionCommand('pnpm', ['--version']);

  return {
    os: platform(),
    release: release(),
    arch: arch(),
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    ...(pnpmVersion ? { pnpmVersion } : {}),
    cpuModel: cpu?.model ?? 'unknown',
    logicalCores: cpus().length,
    totalMemoryGB: roundGB(totalmem()),
  };
}

export function collectGitRevision(repoPath: string, repo: string): EvidenceSourceRevision {
  const path = resolve(repoPath);
  const commit = runGit(path, ['rev-parse', 'HEAD']);
  const status = runGit(path, ['status', '--porcelain']);
  return cleanSourceRevision({
    repo,
    path,
    ...(commit ? { commit } : {}),
    dirty: status.length > 0,
  });
}

export function hashValue(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortForJson(value));
}

function enrichArtifact(input: EvidenceArtifactInput, cwd: string): EvidenceArtifact {
  const readPath = resolve(cwd, input.localPath ?? input.path);
  const exists = existsSync(readPath);
  const fileStats = exists ? statSync(readPath) : undefined;
  return cleanArtifact({
    repo: input.repo,
    path: input.path.replace(/\\/g, '/'),
    role: input.role,
    description: input.description,
    required: input.required ?? true,
    exists,
    sha256: input.sha256 ?? (exists ? hashFile(readPath) : undefined),
    bytes: input.bytes ?? (fileStats?.isFile() ? fileStats.size : undefined),
  });
}

function cleanArtifact(input: EvidenceArtifact): EvidenceArtifact {
  return omitUndefined({
    repo: input.repo,
    path: input.path,
    role: input.role,
    description: input.description,
    required: input.required,
    exists: input.exists,
    sha256: input.sha256,
    bytes: input.bytes,
  });
}

function cleanPaper(input: EvidenceEnvelopePaper): EvidenceEnvelopePaper {
  return omitUndefined({
    id: input.id,
    title: input.title,
    target: input.target,
    basename: input.basename,
  });
}

function cleanSourceRevision(input: EvidenceSourceRevision): EvidenceSourceRevision {
  return omitUndefined({
    repo: input.repo,
    commit: input.commit,
    dirty: input.dirty,
    path: input.path,
  });
}

function defaultCalibrationChecks(): EvidenceCalibrationCheck[] {
  return [
    {
      id: 'environment-hash',
      label: 'Runtime and source revisions are hashed into environment.hash.',
      required: true,
    },
    {
      id: 'rerun-command',
      label: 'One-command rerun is present in reproducibility.rerunCommand.',
      required: true,
    },
  ];
}

function formatArtifactPath(artifact: EvidenceArtifact): string {
  return artifact.repo ? `${artifact.repo}:${artifact.path}` : artifact.path;
}

function hashFile(path: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function runGit(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    timeout: 5_000,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function runVersionCommand(command: string, args: string[]): string | undefined {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 5_000,
  });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function roundGB(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

function sortForJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const child = record[key];
    if (child !== undefined) sorted[key] = sortForJson(child);
  }
  return sorted;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (child !== undefined) out[key] = child;
  }
  return out as T;
}
