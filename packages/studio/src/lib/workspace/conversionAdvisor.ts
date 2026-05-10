import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export type ConversionTarget =
  | '.holo'
  | '.hs'
  | '.hsplus'
  | 'trait-package'
  | 'mcp-tool'
  | 'compiler-export-target'
  | 'hololand-scene';

export type ConversionEffort = 'quick' | 'moderate' | 'deep';
export type ConversionRisk = 'low' | 'medium' | 'high';

export interface ConversionAdvisorProjectDNA {
  kind?: string;
  frameworks?: string[];
  languages?: string[];
  packageManagers?: string[];
  repoShape?: string;
  strengths?: string[];
  riskSignals?: string[];
}

export interface ConversionCandidate {
  id: string;
  rank: number;
  sourcePaths: string[];
  detectedPattern: string;
  target: ConversionTarget;
  confidence: number;
  value: number;
  effort: ConversionEffort;
  risk: ConversionRisk;
  whyItMatters: string;
  nextAction: string;
}

export interface ConversionAdvisorInput {
  paths: string[];
  projectDNA?: ConversionAdvisorProjectDNA | null;
  maxCandidates?: number;
}

export interface PersistConversionCandidatesInput {
  workspaceDir: string;
  candidates: ConversionCandidate[];
  metadata?: Record<string, unknown>;
}

interface CandidateRule {
  detectedPattern: string;
  target: ConversionTarget;
  value: number;
  effort: ConversionEffort;
  risk: ConversionRisk;
  confidence: number;
  priority: number;
  match: (path: string) => boolean;
  whyItMatters: string;
  nextAction: string;
}

const DEFAULT_MAX_CANDIDATES = 12;

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.?\/+/, '');
}

function ext(filePath: string): string {
  return path.posix.extname(normalizePath(filePath)).toLowerCase();
}

function hasSegment(filePath: string, segment: string): boolean {
  return normalizePath(filePath).toLowerCase().split('/').includes(segment.toLowerCase());
}

function includesAny(filePath: string, needles: string[]): boolean {
  const normalized = normalizePath(filePath).toLowerCase();
  return needles.some((needle) => normalized.includes(needle.toLowerCase()));
}

function stableId(parts: string[]): string {
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 12);
}

function clampConfidence(value: number): number {
  return Math.max(0.1, Math.min(0.98, Math.round(value * 100) / 100));
}

function riskPenalty(risk: ConversionRisk): number {
  if (risk === 'high') return 2;
  if (risk === 'medium') return 1;
  return 0;
}

function effortBoost(effort: ConversionEffort): number {
  if (effort === 'quick') return 2;
  if (effort === 'moderate') return 1;
  return 0;
}

function dnaBoost(rule: CandidateRule, dna?: ConversionAdvisorProjectDNA | null): number {
  if (!dna) return 0;
  const frameworks = new Set((dna.frameworks ?? []).map((value) => value.toLowerCase()));
  const kind = dna.kind?.toLowerCase();
  if (rule.target === 'hololand-scene' && (kind === 'spatial' || frameworks.has('three')))
    return 1.5;
  if (rule.target === 'mcp-tool' && (kind === 'service' || kind === 'agent-backend')) return 1.25;
  if (rule.target === '.hsplus' && (kind === 'frontend' || kind === 'automation')) return 1;
  if (rule.target === 'trait-package' && kind === 'library') return 1;
  return 0;
}

const RULES: CandidateRule[] = [
  {
    detectedPattern: 'declarative config',
    target: '.hsplus',
    value: 8,
    effort: 'quick',
    risk: 'low',
    confidence: 0.86,
    priority: 10,
    match: (p) =>
      [
        'package.json',
        'docker-compose.yml',
        'docker-compose.yaml',
        'railway.json',
        'vercel.json',
        'netlify.toml',
        'render.yaml',
        'pnpm-workspace.yaml',
      ].includes(normalizePath(p).toLowerCase()) ||
      /(^|\/)(next|vite|astro|nuxt|svelte|tailwind|drizzle|eslint|vitest|playwright)\.config\.[cm]?[jt]s$/.test(
        normalizePath(p).toLowerCase()
      ),
    whyItMatters:
      'Configuration already describes system intent declaratively, so it is a low-risk entry point for HoloScript composition.',
    nextAction:
      'Generate an .hsplus system profile that captures commands, targets, env contracts, and deploy surfaces.',
  },
  {
    detectedPattern: 'route or page surface',
    target: '.hsplus',
    value: 9,
    effort: 'quick',
    risk: 'medium',
    confidence: 0.82,
    priority: 9,
    match: (p) =>
      /(^|\/)(app|src\/app)\/.+\/(page|layout)\.(tsx|jsx)$/.test(normalizePath(p)) ||
      /(^|\/)pages\/.+\.(tsx|jsx)$/.test(normalizePath(p)) ||
      /(^|\/)(routes|controllers)\/.+\.(ts|js)$/.test(normalizePath(p)),
    whyItMatters:
      'User-facing surfaces map well to HoloScript+ view and interaction compositions for reusable Studio workbench panels.',
    nextAction:
      'Extract props, data dependencies, and user actions into a .hsplus surface skeleton.',
  },
  {
    detectedPattern: 'api route or tool endpoint',
    target: 'mcp-tool',
    value: 8,
    effort: 'moderate',
    risk: 'medium',
    confidence: 0.8,
    priority: 8,
    match: (p) =>
      /(^|\/)(app|src\/app)\/api\/.+\/route\.(ts|js)$/.test(normalizePath(p)) ||
      /(^|\/)api\/.+\.(ts|js)$/.test(normalizePath(p)),
    whyItMatters:
      'API routes already define callable capabilities; converting them to MCP tools makes them composable by agents.',
    nextAction:
      'Derive input schema, auth requirements, side effects, and response contract for an MCP tool wrapper.',
  },
  {
    detectedPattern: 'Three.js or R3F scene',
    target: 'hololand-scene',
    value: 9,
    effort: 'moderate',
    risk: 'medium',
    confidence: 0.84,
    priority: 8,
    match: (p) =>
      includesAny(p, ['three', 'r3f', 'webxr', 'xr/', 'scene', 'canvas', 'viewport']) &&
      ['.tsx', '.jsx', '.ts', '.js', '.glb', '.gltf'].includes(ext(p)),
    whyItMatters:
      'Spatial scene code is a direct candidate for HoloLand and .holo scene graph extraction.',
    nextAction:
      'Identify meshes, cameras, controls, assets, and animation loops, then emit a HoloLand scene plan.',
  },
  {
    detectedPattern: 'workflow or automation script',
    target: '.hs',
    value: 7,
    effort: 'quick',
    risk: 'low',
    confidence: 0.78,
    priority: 7,
    match: (p) =>
      hasSegment(p, 'scripts') ||
      normalizePath(p).startsWith('.github/workflows/') ||
      includesAny(p, ['workflow', 'scheduler', 'cron', 'pipeline']),
    whyItMatters:
      'Workflow scripts often encode repeatable agent operations that can become typed HoloScript scripts.',
    nextAction:
      'Convert command sequence, inputs, and expected receipts into a .hs script with explicit failure modes.',
  },
  {
    detectedPattern: 'state machine or store',
    target: '.hsplus',
    value: 8,
    effort: 'moderate',
    risk: 'medium',
    confidence: 0.76,
    priority: 7,
    match: (p) =>
      includesAny(p, ['machine', 'state', 'store', 'workflow', 'zustand', 'redux', 'xstate']) &&
      ['.ts', '.tsx', '.js', '.jsx'].includes(ext(p)),
    whyItMatters:
      'State transitions and stores can become explicit HoloScript behavior graphs with replayable interaction truth.',
    nextAction:
      'Extract events, states, guards, and side effects into a .hsplus behavior composition.',
  },
  {
    detectedPattern: 'domain schema',
    target: 'trait-package',
    value: 8,
    effort: 'quick',
    risk: 'low',
    confidence: 0.83,
    priority: 7,
    match: (p) =>
      includesAny(p, ['schema', 'model', 'types', 'entities', 'dto', 'zod', 'openapi']) ||
      ['.prisma', '.proto', '.graphql', '.gql'].includes(ext(p)),
    whyItMatters:
      'Schemas describe domain meaning and constraints, which are the raw material for reusable HoloScript traits.',
    nextAction:
      'Generate trait interfaces, validation rules, and example .holo usage from the schema fields.',
  },
  {
    detectedPattern: 'compiler or export target',
    target: 'compiler-export-target',
    value: 7,
    effort: 'deep',
    risk: 'high',
    confidence: 0.72,
    priority: 5,
    match: (p) => includesAny(p, ['compiler', 'exporter', 'transform', 'codegen', 'adapter']),
    whyItMatters:
      'Compiler and exporter code can become first-class HoloScript compile targets, but the blast radius is higher.',
    nextAction:
      'Map input AST shape, emitted target, fixtures, and conformance tests before proposing a compiler target.',
  },
];

export function buildConversionCandidates(input: ConversionAdvisorInput): ConversionCandidate[] {
  const seen = new Set<string>();
  const candidates: Array<ConversionCandidate & { score: number }> = [];

  for (const rawPath of input.paths) {
    const sourcePath = normalizePath(rawPath);
    if (!sourcePath || seen.has(sourcePath)) continue;
    seen.add(sourcePath);

    for (const rule of RULES) {
      if (!rule.match(sourcePath)) continue;
      const score =
        rule.priority +
        rule.value +
        effortBoost(rule.effort) +
        dnaBoost(rule, input.projectDNA) -
        riskPenalty(rule.risk);
      candidates.push({
        id: stableId([sourcePath, rule.detectedPattern, rule.target]),
        rank: 0,
        sourcePaths: [sourcePath],
        detectedPattern: rule.detectedPattern,
        target: rule.target,
        confidence: clampConfidence(rule.confidence + dnaBoost(rule, input.projectDNA) / 20),
        value: rule.value,
        effort: rule.effort,
        risk: rule.risk,
        whyItMatters: rule.whyItMatters,
        nextAction: rule.nextAction,
        score,
      });
      break;
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.sourcePaths[0].localeCompare(b.sourcePaths[0]))
    .slice(0, input.maxCandidates ?? DEFAULT_MAX_CANDIDATES)
    .map(({ score: _score, ...candidate }, index) => ({
      ...candidate,
      rank: index + 1,
    }));
}

export function persistConversionCandidates(input: PersistConversionCandidatesInput): string {
  const manifestPath = path.join(input.workspaceDir, 'conversion-candidates.json');
  fs.mkdirSync(input.workspaceDir, { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        metadata: input.metadata ?? {},
        candidates: input.candidates,
      },
      null,
      2
    ),
    'utf-8'
  );
  return manifestPath;
}
