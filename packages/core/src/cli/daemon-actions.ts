/**
 * Daemon Action Handlers for HoloScript Self-Improvement Daemon
 *
 * Maps BT action names to host operations (shell exec, file I/O, LLM calls).
 * Used by the `holoscript daemon` CLI subcommand.
 *
 * Each handler receives (params, blackboard, context) and returns true/false.
 * The blackboard is the BT's shared state, passed automatically by the
 * native action bridge in BehaviorTreeTrait.
 */

import type { ActionHandler } from '../runtime/profiles/HeadlessRuntime';
import path from 'path';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  buildDaemonPromptContext,
  getDaemonSystemPrompt,
  type DaemonProvider,
  type DaemonToolProfile,
} from './daemon-prompt-profiles';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface DaemonConfig {
  repoRoot: string;
  commit: boolean;
  model: string;
  provider?: DaemonProvider;
  toolProfile?: DaemonToolProfile;
  verbose: boolean;
  trial?: number;
  focusRotation: string[];
  stateDir: string;
  /** Current cycle's focus — set by the runner per cycle */
  cycleFocus?: string;
  /** Path to the daemon composition file */
  daemonFile?: string;
  /** Failure count before permanent skip — from composition blackboard */
  quarantineThreshold?: number;
  /** Quality score from previous cycle (carried forward) */
  qualityBefore?: number;
  /** Files already committed in previous cycles (skip in diagnose) */
  committedFiles?: string[];
  /** Failure counts from previous cycles (restore quarantine state) */
  failedFiles?: Record<string, number>;
  /** Historical type error baseline for quality scoring (e.g., 3506 at first run) */
  typeErrorBaseline?: number;
  /** Optional runtime tool policy for general-purpose daemon actions. */
  toolPolicy?: {
    allowShell?: boolean;
    allowedShellCommands?: string[];
    allowedPaths?: string[];
    allowedHosts?: string[];
    maxFileBytes?: number;
    maxShellOutputBytes?: number;
    requireSignedInbox?: boolean;
    inboxSignatureSecret?: string;
  };
  /** Directory where runtime-created skills are persisted. */
  skillsDir?: string;
}

export interface DaemonExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface LLMProvider {
  chat(params: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}

export interface DaemonHost {
  readFile(filePath: string): string;
  writeFile(filePath: string, content: string): void;
  exists(filePath: string): boolean;
  exec(command: string, args?: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<DaemonExecResult>;
}

// ── Contamination Check ──────────────────────────────────────────────────────

const CONTAMINATION_SIGNATURES = [
  /^\s*(\u2713|\u2717|\u2192|\u2502|\u2500|\u23af|\.{3,})\s/m,
  /^\s*\d+\s+(passing|failing|pending)\b/m,
  /^\s*PASS\s|^\s*FAIL\s/m,
  /^error TS\d{4}:/m,
  /^\s*at\s+\S+\s+\(\S+:\d+:\d+\)/m,
];

function isContaminatedEdit(content: string): boolean {
  return CONTAMINATION_SIGNATURES.some(re => re.test(content));
}

// ── Quality Scorer ───────────────────────────────────────────────────────────

/** Count type errors from tsc output, optionally scoped to a path prefix */
function countTypeErrors(output: string, scopeFilter?: RegExp): number {
  const lines = output.split('\n').filter(l => /error TS\d{4}:/.test(l));
  if (!scopeFilter) return lines.length;
  return lines.filter(l => scopeFilter.test(l)).length;
}

/**
 * Delta-based quality scoring. Measures improvement relative to baseline
 * error count captured at cycle start (not absolute normalization).
 *
 * Score = typeScore * 0.6 + testScore * 0.4
 */
async function computeQuality(
  host: DaemonHost,
  repoRoot: string,
  stateDir: string,
  baselineErrors?: number,
  /** Only count type errors matching this pattern (e.g., /packages\/core\/src\//) */
  errorScopeFilter?: RegExp,
  /** Current cycle focus — affects type score calculation */
  focus?: string,
): Promise<{ score: number; typeErrors: number; testsPassed: number; testsTotal: number }> {
  const [tsc, test] = await Promise.all([
    host.exec('npx', tscCheckArgs(stateDir), { cwd: repoRoot, timeoutMs: 120_000 }),
    host.exec('npx', ['vitest', 'run', '--reporter=json', '--no-color', '--passWithNoTests'], { cwd: repoRoot, timeoutMs: 120_000 }),
  ]);

  const typeErrors = countTypeErrors(tsc.stdout + tsc.stderr, errorScopeFilter);
  // Use provided baseline (historical reference, e.g. 3506 from first run).
  // Fall back to current count only when no baseline exists (first-ever run).
  const baseline = baselineErrors && baselineErrors > 0 ? baselineErrors : typeErrors;
  const isTypefixFocus = !focus || focus === 'typefix' || focus === 'all';
  // For typefix: measure improvement (1 - errors/baseline).
  // For lint/coverage/other: maintaining type safety = full marks (no regressions).
  const typeScore = isTypefixFocus
    ? (baseline === 0 ? 1 : Math.max(0, Math.min(1, 1 - typeErrors / Math.max(baseline, 1))))
    : (typeErrors <= baseline ? 1 : 0);

  let testsPassed = 0;
  let testsTotal = 0;
  let testScore = 0.5;
  try {
    const json = JSON.parse(test.stdout);
    testsTotal = json.numTotalTests || 0;
    testsPassed = json.numPassedTests || 0;
    testScore = testsTotal > 0 ? testsPassed / testsTotal : (test.code === 0 ? 1 : 0.5);
  } catch {
    testScore = test.code === 0 ? 0.8 : 0.3;
  }

  const score = Number((typeScore * 0.6 + testScore * 0.4).toFixed(3));
  return { score, typeErrors, testsPassed, testsTotal };
}

// ── Incremental tsc ──────────────────────────────────────────────────────────

/** tsc args with incremental caching — subsequent runs in same cycle reuse .tsbuildinfo */
function tscCheckArgs(stateDir: string): string[] {
  return ['tsc', '--noEmit', '--pretty', 'false',
    '--incremental', '--tsBuildInfoFile', `${stateDir}/.daemon-tsbuildinfo`];
}

// ── Lightweight Import Graph (GraphRAG-lite) ─────────────────────────────────

/** Count how many candidate files import each candidate (downstream impact) */
function computeDownstreamImpact(
  candidates: Array<[string, number]>,
  host: DaemonHost,
): Map<string, number> {
  const impact = new Map<string, number>();
  for (const [file] of candidates) {
    try {
      const content = host.readFile(file);
      const re = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const importedBase = m[1].split('/').pop()?.replace(/\.(ts|tsx|js)$/, '') || '';
        for (const [cFile] of candidates) {
          if (cFile === file) continue;
          const cBase = cFile.split(/[/\\]/).pop()?.replace(/\.(ts|tsx)$/, '') || '';
          if (importedBase === cBase) {
            impact.set(cFile, (impact.get(cFile) || 0) + 1);
          }
        }
      }
    } catch { /* skip unreadable */ }
  }
  return impact;
}

/** Extract exported type signatures from imported files for LLM context */
function extractDependencyContext(content: string, file: string, host: DaemonHost): string {
  const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
  let im: RegExpExecArray | null;
  const exports: string[] = [];
  const dir = file.replace(/[/\\][^/\\]+$/, '');
  while ((im = importRe.exec(content))) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const resolved = `${dir}/${im[1]}${ext}`.replace(/\\/g, '/');
      try {
        if (host.exists(resolved)) {
          const depContent = host.readFile(resolved);
          const exportLines = depContent.split('\n')
            .filter(l => /^export\s/.test(l))
            .slice(0, 10)
            .join('\n');
          if (exportLines) exports.push(`// ${im[1]}:\n${exportLines}`);
          break;
        }
      } catch { /* skip */ }
    }
  }
  return exports.length > 0 ? `\n\nImported type signatures:\n${exports.join('\n')}` : '';
}

/**
 * Multi-file context: resolve base class and closely related files for coordinated patches.
 * Returns array of { path, content } for files the LLM can patch alongside the candidate.
 * Paths are normalized to project-relative format for consistent matching in patch application.
 */
interface RelatedFile { path: string; content: string; relation: string }

function resolveRelatedFiles(content: string, file: string, host: DaemonHost, errorContext: string, repoRoot: string): RelatedFile[] {
  const related: RelatedFile[] = [];
  const fileDir = path.dirname(file);

  // 1. Find base class — look for 'extends XXX' in the source
  const extendsMatch = content.match(/class\s+\w+\s+extends\s+(\w+)/);
  if (extendsMatch) {
    const baseClass = extendsMatch[1];
    // Find which import provides this base class
    const importRe = new RegExp(`import[^'"]*['"](\\.[\\/][^'"]+)['"]`);
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes(baseClass) && importRe.test(line)) {
        const importMatch = line.match(importRe);
        if (importMatch) {
          for (const ext of ['.ts', '.tsx', '/index.ts']) {
            // Construct absolute path, then normalize back to project-relative
            const absPath = path.resolve(fileDir, importMatch[1] + ext);
            const relPath = path.relative(repoRoot, absPath).replace(/\\/g, '/');
            try {
              if (host.exists(relPath)) {
                related.push({ path: relPath, content: host.readFile(relPath), relation: `base class (${baseClass})` });
                break;
              }
            } catch { /* skip */ }
          }
        }
        break;
      }
    }
  }

  // 2. If errors mention a type from another file, include that file
  const errorTypeMatch = errorContext.match(/Type '(\w+)' is not assignable|missing.*from type '(\w+)'/);
  if (errorTypeMatch) {
    const typeName = errorTypeMatch[1] || errorTypeMatch[2];
    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = importRe.exec(content))) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        // Construct absolute path, then normalize back to project-relative
        const absPath = path.resolve(fileDir, im[1] + ext);
        const relPath = path.relative(repoRoot, absPath).replace(/\\/g, '/');
        try {
          if (host.exists(relPath) && !related.some(r => r.path === relPath)) {
            const depContent = host.readFile(relPath);
            if (depContent.includes(typeName)) {
              related.push({ path: relPath, content: depContent, relation: `defines ${typeName}` });
              break;
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  // 3. Sibling class discovery — if this file extends a base class that was found,
  // find other subclasses in the same directory that were recently committed by the daemon.
  // This gives the LLM evidence of the "correct" approach (what the sibling did to match the base).
  if (extendsMatch && related.length > 0) {
    const baseClass = extendsMatch[1];
    const baseRelated = related.find(r => r.relation.includes('base class'));
    if (baseRelated) {
      const siblingDir = path.dirname(file);
      try {
        // List .ts files in the same directory
        const lsResult = host.exists(siblingDir) ? true : false;
        if (lsResult) {
          const importRe2 = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
          // Check recently committed siblings by scanning the provenance log
          for (const record of provenanceLog) {
            if (record.result !== 'committed') continue;
            const siblingPath = normalizeRepoPath(record.candidate);
            if (siblingPath === normalizeRepoPath(file)) continue;
            // Sibling must be in same directory and not already in related
            if (path.dirname(siblingPath) !== path.dirname(normalizeRepoPath(file))) continue;
            if (related.some(r => normalizeRepoPath(r.path) === siblingPath)) continue;
            try {
              if (!host.exists(siblingPath)) continue;
              const sibContent = host.readFile(siblingPath);
              // Verify it extends the same base class
              if (sibContent.includes(`extends ${baseClass}`)) {
                related.push({ path: siblingPath, content: sibContent, relation: `sibling (also extends ${baseClass}, recently fixed by daemon)` });
                break; // One sibling is enough
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* skip directory listing */ }
    }
  }

  // Cap at 3 related files (base + error type + sibling)
  return related.slice(0, 3);
}

// ── Symbol Investigation ────────────────────────────────────────────────────

interface SymbolInvestigation {
  symbol: string;
  definition?: string;   // File + line range where symbol is defined
  contract?: string;     // Interface/base class shape
  importers: string[];   // Files that import this symbol (max 3)
  recentDaemonTouches: string[]; // Recent daemon commits in this area
}

/**
 * Investigate error symbols before patching. Extracts:
 * - Where the symbol is defined
 * - Its interface/class contract
 * - Who imports it (co-change risk)
 * - Whether the daemon recently touched this area
 */
function investigateSymbols(
  errorContext: string,
  content: string,
  file: string,
  host: DaemonHost,
  repoRoot: string,
): SymbolInvestigation[] {
  const investigations: SymbolInvestigation[] = [];
  const dir = file.replace(/[/\\][^/\\]+$/, '');

  // Extract symbol names from TypeScript errors
  const symbolPatterns = [
    /Type '(\w+)' is not assignable/g,
    /Property '(\w+)' does not exist/g,
    /Cannot find name '(\w+)'/g,
    /has no exported member '(\w+)'/g,
    /missing.*from type '(\w+)'/g,
    /Argument of type '(\w+)'/g,
  ];

  const symbols = new Set<string>();
  for (const pattern of symbolPatterns) {
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(errorContext))) {
      if (m[1] && m[1].length > 2 && m[1] !== 'any' && m[1] !== 'void' && m[1] !== 'null') {
        symbols.add(m[1]);
      }
    }
  }

  for (const symbol of [...symbols].slice(0, 3)) {
    const investigation: SymbolInvestigation = { symbol, importers: [], recentDaemonTouches: [] };

    // Find definition in imported files
    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = importRe.exec(content))) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const resolved = `${dir}/${im[1]}${ext}`.replace(/\\/g, '/');
        try {
          if (!host.exists(resolved)) continue;
          const depContent = host.readFile(resolved);
          // Find the symbol's definition block (interface, class, type, function)
          const defRe = new RegExp(`(?:export\\s+)?(?:interface|class|type|function|const|enum)\\s+${symbol}[\\s<({]`, 'm');
          const defMatch = defRe.exec(depContent);
          if (defMatch) {
            const lines = depContent.split('\n');
            const defLine = depContent.slice(0, defMatch.index).split('\n').length - 1;
            // Extract ±5 lines around definition
            const start = Math.max(0, defLine - 1);
            const end = Math.min(lines.length, defLine + 15);
            investigation.definition = `${resolved}:${defLine + 1}`;
            investigation.contract = lines.slice(start, end).join('\n');
            break;
          }
        } catch { /* skip */ }
      }
    }

    // Find importers of the candidate file by checking known candidates
    // (avoids async fs scan — uses content already loaded during diagnose)
    const candBaseName = file.split(/[/\\]/).pop()?.replace(/\.tsx?$/, '') || '';
    const importPattern = new RegExp(`['"]\\./[^'"]*${candBaseName}['"]`);
    // Scan imports in the candidate file's own content for reverse dependency hints
    const importRe2 = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let im2: RegExpExecArray | null;
    while ((im2 = importRe2.exec(content))) {
      const importedBase = im2[1].split('/').pop()?.replace(/\.(ts|tsx|js)$/, '') || '';
      if (importedBase && importPattern.test(im2[0])) {
        investigation.importers.push(im2[1]);
      }
    }
    // Cap importers
    investigation.importers = investigation.importers.slice(0, 3);

    investigations.push(investigation);
  }

  return investigations;
}

/** Format symbol investigations as context for the LLM prompt */
function formatInvestigations(investigations: SymbolInvestigation[]): string {
  if (investigations.length === 0) return '';
  const parts = ['', '=== SYMBOL INVESTIGATION ==='];
  for (const inv of investigations) {
    parts.push(`Symbol: ${inv.symbol}`);
    if (inv.definition) parts.push(`  Defined at: ${inv.definition}`);
    if (inv.contract) {
      parts.push('  Contract:');
      parts.push(inv.contract.split('\n').map(l => `    ${l}`).join('\n'));
    }
    if (inv.importers.length > 0) parts.push(`  Imported by: ${inv.importers.join(', ')}`);
  }
  return parts.join('\n');
}

// ── Fix Provenance ──────────────────────────────────────────────────────────

interface FixProvenanceRecord {
  timestamp: string;
  candidate: string;
  focus: string;
  errorsBefore: number;
  errorsAfter: number;
  fileErrorsBefore: number;
  fileErrorsAfter: number;
  symbolsTargeted: string[];
  relatedFilesTouched: string[];
  patchCount: number;
  rollbackReason?: string;
  commitSha?: string;
  result: 'committed' | 'rolled_back' | 'skipped';
}

const provenanceLog: FixProvenanceRecord[] = [];

function recordProvenance(record: FixProvenanceRecord, stateDir: string, host: DaemonHost): void {
  provenanceLog.push(record);
  try {
    const ledgerPath = `${stateDir}/fix-ledger.json`;
    let existing: FixProvenanceRecord[] = [];
    if (host.exists(ledgerPath)) {
      try { existing = JSON.parse(host.readFile(ledgerPath)); } catch { /* start fresh */ }
    }
    existing.push(record);
    // Keep last 200 records
    while (existing.length > 200) existing.shift();
    host.writeFile(ledgerPath, JSON.stringify(existing, null, 2));
  } catch { /* non-fatal */ }
}

// ── File-Local Error Delta ──────────────────────────────────────────────────

/**
 * Count type errors belonging to a specific file.
 * Much faster than full tsc — just filters the error output.
 */
function countFileErrors(errorOutput: string, filePath: string): number {
  const normalized = filePath.replace(/\\/g, '/');
  const baseName = normalized.split('/').pop() || '';
  return errorOutput.split('\n').filter(l => {
    if (!/error TS\d{4}:/.test(l)) return false;
    const m = l.match(/^(.+?)\(\d+,\d+\):/);
    if (!m) return false;
    const errFile = m[1].replace(/\\/g, '/');
    return errFile === normalized || errFile.endsWith('/' + baseName);
  }).length;
}

function normalizeRepoPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

function truncateText(value: string, max: number): string {
  if (!Number.isFinite(max) || max <= 0 || value.length <= max) return value;
  return `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map(entry => entry.trim())
    .filter(Boolean);
}

function resolvePolicy(config: DaemonConfig) {
  const policy = config.toolPolicy ?? {};
  return {
    allowShell: policy.allowShell ?? false,
    allowedShellCommands: (policy.allowedShellCommands ?? []).map(c => c.trim()).filter(Boolean),
    allowedPaths: (policy.allowedPaths ?? ['packages/core/src', 'packages/studio/src', 'compositions', '.holoscript'])
      .map(p => p.replace(/\\/g, '/').replace(/^\.\//, '').trim())
      .filter(Boolean),
    allowedHosts: (policy.allowedHosts ?? ['api.anthropic.com', 'api.x.ai', 'api.openai.com', 'localhost', '127.0.0.1'])
      .map(h => h.toLowerCase().trim())
      .filter(Boolean),
    maxFileBytes: Math.max(1_024, policy.maxFileBytes ?? 2 * 1024 * 1024),
    maxShellOutputBytes: Math.max(1_024, policy.maxShellOutputBytes ?? 100_000),
    requireSignedInbox: policy.requireSignedInbox ?? false,
    inboxSignatureSecret: typeof policy.inboxSignatureSecret === 'string'
      ? policy.inboxSignatureSecret
      : '',
  };
}

function resolveRepoRelativePath(targetPath: string, repoRoot: string): { ok: true; rel: string; abs: string } | { ok: false; error: string } {
  const normalized = targetPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
  if (!normalized) return { ok: false, error: 'Path is required' };
  const abs = path.resolve(repoRoot, normalized);
  const rel = path.relative(repoRoot, abs).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, error: 'Path escapes repository root' };
  }
  return { ok: true, rel, abs };
}

function isPathAllowed(relPath: string, allowedRoots: string[]): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return allowedRoots.some(root => normalized === root || normalized.startsWith(`${root}/`));
}

function parseHostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseHexSignature(signature: string): Buffer | null {
  const normalized = signature.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) return null;
  try {
    return Buffer.from(normalized, 'hex');
  } catch {
    return null;
  }
}

function verifyInboxEnvelopeSignature(
  envelope: Record<string, unknown>,
  signature: string,
  secret: string,
): boolean {
  const signedPayload: Record<string, unknown> = {
    timestamp: envelope.timestamp ?? null,
    channel: envelope.channel ?? null,
    authorId: envelope.authorId ?? null,
    authorName: envelope.authorName ?? null,
    message: envelope.message ?? null,
    metadata: envelope.metadata ?? null,
  };

  const payload = stableJson(signedPayload);
  const expectedHex = createHmac('sha256', secret).update(payload).digest('hex');
  const provided = parseHexSignature(signature);
  const expected = parseHexSignature(expectedHex);
  if (!provided || !expected || provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

// ── Feature Sweep Helpers ───────────────────────────────────────────────────

const SWEEP_TARGETS = ['node', 'python'] as const;
const PROFILE_MATRIX = ['headless', 'minimal', 'full'] as const;

type SweepTarget = (typeof SWEEP_TARGETS)[number];
type RuntimeProfile = (typeof PROFILE_MATRIX)[number];

interface CompilerSweepResult {
  target: SweepTarget;
  ok: boolean;
  output: string;
  error: string;
}

interface RuntimeProfileResult {
  profile: RuntimeProfile;
  ok: boolean;
  error: string;
}

interface AbsorbRoundtripResult {
  sourceFile: string;
  absorbedFile: string;
  compiledFile: string;
  absorbOk: boolean;
  compileOk: boolean;
  error: string;
}

interface TraitCoverageResult {
  sampledFiles: number;
  sampledTraits: number;
  sampledCategories: number;
  categories: string[];
}

function sanitizeName(filePath: string): string {
  return filePath
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
}

function collectTraitCoverage(content: string): TraitCoverageResult {
  const traits = new Set<string>();
  const categories = new Set<string>();

  const inferCategory = (trait: string): string => {
    const t = trait.toLowerCase();
    if (/grab|throw|click|hover|drag|point|hold|equip|consume/.test(t)) return 'interaction';
    if (/collid|physics|rigid|kinematic|trigger|gravity|mass|friction/.test(t)) return 'physics';
    if (/glow|emiss|transparent|reflect|billboard|particle|animat/.test(t)) return 'visual';
    if (/network|sync|replicat|persistent|owned|host/.test(t)) return 'networking';
    if (/npc|path|llm|state_machine|crowd|agent/.test(t)) return 'ai-behavior';
    if (/anchor|track|world_locked|hand|eye|plane/.test(t)) return 'spatial';
    if (/audio|voice|reverb|doppler/.test(t)) return 'audio';
    if (/state|reactive|observable|computed/.test(t)) return 'state';
    if (/iot|digital_twin|mqtt|telemetry|sensor/.test(t)) return 'iot';
    if (/wallet|nft|token|marketplace|zora|economy/.test(t)) return 'economics-web3';
    if (/zero_knowledge|zk_|rsa|audit|security|encrypt/.test(t)) return 'security';
    return 'other';
  };

  const traitRe = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = traitRe.exec(content))) {
    const trait = match[1];
    traits.add(trait);
    categories.add(inferCategory(trait));
  }

  return {
    sampledFiles: 1,
    sampledTraits: traits.size,
    sampledCategories: categories.size,
    categories: [...categories].sort(),
  };
}

async function runCompilerSweep(
  host: DaemonHost,
  repoRoot: string,
  stateDir: string,
  compositionFile: string,
): Promise<CompilerSweepResult[]> {
  const runner = 'packages/core/src/cli/holoscript-runner.ts';
  const safeName = sanitizeName(compositionFile.split(/[/\\]/).pop() || 'composition.hsplus');
  const results: CompilerSweepResult[] = [];

  for (const target of SWEEP_TARGETS) {
    const output = `${stateDir}/sweep-${safeName}.${target === 'python' ? 'py' : 'js'}`;
    const execResult = await host.exec('npx', [
      'tsx',
      runner,
      'compile',
      compositionFile,
      '--target',
      target,
      '--output',
      output,
    ], {
      cwd: repoRoot,
      timeoutMs: 120_000,
    });

    results.push({
      target,
      ok: execResult.code === 0,
      output,
      error: (execResult.stderr || execResult.stdout || '').trim(),
    });
  }

  return results;
}

async function runRuntimeProfileMatrix(
  host: DaemonHost,
  repoRoot: string,
  compositionFile: string,
): Promise<RuntimeProfileResult[]> {
  const runner = 'packages/core/src/cli/holoscript-runner.ts';
  const results: RuntimeProfileResult[] = [];

  for (const profile of PROFILE_MATRIX) {
    const execResult = await host.exec('npx', [
      'tsx',
      runner,
      'run',
      compositionFile,
      '--profile',
      profile,
      '--ticks',
      '1',
    ], {
      cwd: repoRoot,
      timeoutMs: 120_000,
    });

    results.push({
      profile,
      ok: execResult.code === 0,
      error: (execResult.stderr || execResult.stdout || '').trim(),
    });
  }

  return results;
}

async function runAbsorbRoundtrip(
  host: DaemonHost,
  repoRoot: string,
  stateDir: string,
  sourceFile: string,
): Promise<AbsorbRoundtripResult> {
  const runner = 'packages/core/src/cli/holoscript-runner.ts';
  const safeName = sanitizeName(sourceFile.split(/[/\\]/).pop() || 'source.ts');
  const absorbedFile = `${stateDir}/roundtrip-${safeName}.hsplus`;
  const compiledFile = `${stateDir}/roundtrip-${safeName}.js`;

  const absorbResult = await host.exec('npx', [
    'tsx',
    runner,
    'absorb',
    sourceFile,
    '--output',
    absorbedFile,
  ], {
    cwd: repoRoot,
    timeoutMs: 120_000,
  });

  const compileResult = absorbResult.code === 0
    ? await host.exec('npx', [
      'tsx',
      runner,
      'compile',
      absorbedFile,
      '--target',
      'node',
      '--output',
      compiledFile,
    ], {
      cwd: repoRoot,
      timeoutMs: 120_000,
    })
    : { code: 1, stdout: '', stderr: 'absorb step failed' };

  return {
    sourceFile,
    absorbedFile,
    compiledFile,
    absorbOk: absorbResult.code === 0,
    compileOk: compileResult.code === 0,
    error: ((absorbResult.stderr || '') + '\n' + (compileResult.stderr || '')).trim(),
  };
}

// ── Patch Types & Helpers ────────────────────────────────────────────────────

interface Patch {
  old: string;
  new: string;
  /** Optional file path for multi-file patches. If omitted, applies to primary candidate. */
  file?: string;
}

interface PatchResponse {
  analysis: string;
  patches: Patch[];
}

/** Parse LLM JSON response into structured patches */
function parsePatchResponse(text: string): PatchResponse | null {
  let jsonStr = text.trim();
  // Strip markdown code fences if LLM wraps output
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.patches)) return null;

    const patches: Patch[] = [];
    for (const p of parsed.patches) {
      if (typeof p.old === 'string' && typeof p.new === 'string' && p.old !== p.new) {
        patches.push({ old: p.old, new: p.new, file: typeof p.file === 'string' ? p.file : undefined });
      }
    }

    return {
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
      patches,
    };
  } catch {
    return null;
  }
}

/** Apply patches to file content via exact string matching (like Edit tool's old→new) */
function applyPatches(content: string, patches: Patch[]): { result: string; applied: number; failed: string[] } {
  let result = content;
  let applied = 0;
  const failed: string[] = [];

  for (const patch of patches) {
    const idx = result.indexOf(patch.old);
    if (idx === -1) {
      failed.push(`Not found: "${patch.old.slice(0, 80)}..."`);
      continue;
    }
    // Require unique match — ambiguous patches are dangerous
    if (result.indexOf(patch.old, idx + 1) !== -1) {
      failed.push(`Ambiguous (2+ matches): "${patch.old.slice(0, 80)}..."`);
      continue;
    }
    result = result.slice(0, idx) + patch.new + result.slice(idx + patch.old.length);
    applied++;
  }

  return { result, applied, failed };
}

/** Safety guards — reject destructive LLM edits */
function validatePatchSafety(original: string, patched: string): { safe: boolean; reason?: string } {
  const origLines = original.split('\n').length;
  const patchedLines = patched.split('\n').length;

  // Guard 1: Reject if >20% of lines deleted
  if (patchedLines < origLines * 0.8) {
    return { safe: false, reason: `Deleted ${origLines - patchedLines} lines (${((1 - patchedLines / origLines) * 100).toFixed(0)}% reduction)` };
  }

  // Guard 2: Reject if too many `as any` added
  const origAsAny = (original.match(/as any/g) || []).length;
  const patchedAsAny = (patched.match(/as any/g) || []).length;
  if (patchedAsAny - origAsAny > 2) {
    return { safe: false, reason: `Added ${patchedAsAny - origAsAny} "as any" casts (max 2 allowed)` };
  }

  // Guard 3: Reject if exported symbols decreased
  const origExports = (original.match(/^export\s/gm) || []).length;
  const patchedExports = (patched.match(/^export\s/gm) || []).length;
  if (patchedExports < origExports - 1) {
    return { safe: false, reason: `Removed ${origExports - patchedExports} exports` };
  }

  return { safe: true };
}

// ── Wisdom Readback ──────────────────────────────────────────────────────────

/** Extract relevant prior wisdom entries for a specific file + focus */
function extractFileWisdom(
  wisdom: unknown,
  filePath: string,
  focus: string,
): string[] {
  if (!Array.isArray(wisdom)) return [];
  const normalized = filePath.replace(/\\/g, '/');
  const baseName = normalized.split('/').pop() || '';
  const relevant = (wisdom as Array<Record<string, unknown>>).filter(w => {
    const candidate = String(w.candidate || '').replace(/\\/g, '/');
    return (candidate.includes(baseName) || candidate === normalized) &&
           (w.focus === focus || w.focus === 'all');
  });
  if (relevant.length === 0) return [];
  // Summarize: show last 3 attempts with their delta
  return relevant.slice(-3).map(w =>
    `- ${w.focus} attempt (delta: ${w.delta}): ${w.candidate || 'unknown file'}`,
  );
}

/**
 * Build a focused context snippet for the LLM: only the lines around each
 * error (±CONTEXT_RADIUS lines), with the error line annotated.
 * Sending a windowed view rather than the whole file reduces hallucination
 * and steers the LLM to patch exactly the failing span.
 */
function buildErrorFocusedContext(content: string, errorLines: string[]): string {
  const lines = content.split('\n');
  const errorLineNums = new Set<number>();
  for (const err of errorLines) {
    const m = err.match(/\((\d+),\d+\):/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= lines.length) errorLineNums.add(n);
    }
  }
  if (errorLineNums.size === 0) return '(no specific line numbers found)';

  const CONTEXT_RADIUS = 10;
  const contextSet = new Set<number>();
  for (const n of errorLineNums) {
    for (let i = Math.max(1, n - CONTEXT_RADIUS); i <= Math.min(lines.length, n + CONTEXT_RADIUS); i++) {
      contextSet.add(i);
    }
  }

  const sorted = [...contextSet].sort((a, b) => a - b);
  const out: string[] = [];
  let prev = -1;
  for (const ln of sorted) {
    if (prev !== -1 && ln > prev + 1) out.push('  ... omitted ...');
    out.push(`${String(ln).padStart(4)}: ${lines[ln - 1]}${errorLineNums.has(ln) ? '  // ← ERROR' : ''}`);
    prev = ln;
  }
  return out.join('\n');
}

// ── Quarantine ───────────────────────────────────────────────────────────────

/** Threshold read from composition blackboard (default 3) */
let quarantineThreshold = 3;
const failureCounts = new Map<string, number>();
const committedFiles = new Set<string>();

/** Returns true if the file should be permanently skipped */
function quarantineFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const count = (failureCounts.get(normalized) || 0) + 1;
  failureCounts.set(normalized, count);
  return count >= quarantineThreshold;
}

/** Check if a file is already quarantined without incrementing */
function isQuarantined(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (failureCounts.get(normalized) || 0) >= quarantineThreshold;
}

/** Check if a file was already committed this daemon run */
function isCommitted(filePath: string): boolean {
  return committedFiles.has(filePath.replace(/\\/g, '/'));
}

/** Get serializable file tracking state for persistence */
export function getDaemonFileState(): { committed: string[]; failures: Record<string, number> } {
  return {
    committed: [...committedFiles],
    failures: Object.fromEntries(failureCounts),
  };
}

// ── Action Handler Factory ───────────────────────────────────────────────────

export function createDaemonActions(
  host: DaemonHost,
  llm: LLMProvider,
  config: DaemonConfig,
): Record<string, ActionHandler> {
  // Apply composition-driven quarantine threshold
  if (config.quarantineThreshold !== undefined) {
    quarantineThreshold = config.quarantineThreshold;
  }

  // Restore persisted file tracking from previous cycles
  if (config.committedFiles) {
    for (const f of config.committedFiles) committedFiles.add(f);
  }
  if (config.failedFiles) {
    for (const [f, count] of Object.entries(config.failedFiles)) {
      failureCounts.set(f, Math.max(failureCounts.get(f) || 0, count));
    }
  }

  const log = (msg: string) => {
    if (config.verbose) console.log(`[daemon] ${msg}`);
  };

  const promptContext = buildDaemonPromptContext(
    config.provider || 'anthropic',
    config.toolProfile || 'standard',
  );
  const { provider, toolProfile } = promptContext;
  const policy = resolvePolicy(config);

  log(`LLM provider=${provider} | toolProfile=${toolProfile} | model=${config.model}`);

  /** Advance blackboard to next candidate (shared by generate_fix skip paths) */
  const advanceCandidate = (bb: Record<string, unknown>) => {
    const idx = ((bb.candidateIndex as number) || 0) + 1;
    bb.candidateIndex = idx;
    bb.has_candidates = idx < ((bb.candidates as string[])?.length || 0);
  };

  const actions: Record<string, ActionHandler> = {
    // ── General-Purpose Host Tools ─────────────────────────────────────
    shell_exec: async (params, bb, ctx) => {
      if (!policy.allowShell) {
        bb.shell_exec_error = 'shell_exec is disabled by policy';
        return false;
      }

      const command = typeof params.command === 'string' ? params.command.trim() : '';
      const args = toStringArray(params.args);
      if (!command) {
        bb.shell_exec_error = 'command is required';
        return false;
      }

      if (policy.allowedShellCommands.length > 0) {
        const executable = command.split(/\s+/)[0].toLowerCase();
        const allowed = policy.allowedShellCommands.some(c => c.toLowerCase() === executable);
        if (!allowed) {
          bb.shell_exec_error = `command "${executable}" is not allowlisted`;
          return false;
        }
      }

      const timeoutMs = typeof params.timeoutMs === 'number' && Number.isFinite(params.timeoutMs)
        ? Math.max(1_000, Math.min(300_000, Math.floor(params.timeoutMs)))
        : 60_000;

      const result = await host.exec(command, args, { cwd: config.repoRoot, timeoutMs });
      bb.shell_exec_code = result.code ?? -1;
      bb.shell_exec_stdout = truncateText(result.stdout, policy.maxShellOutputBytes);
      bb.shell_exec_stderr = truncateText(result.stderr, policy.maxShellOutputBytes);
      ctx.emit('daemon:tool:shell_exec', {
        command,
        code: result.code,
        stdoutBytes: result.stdout.length,
        stderrBytes: result.stderr.length,
      });
      return result.code === 0;
    },

    file_read: async (params, bb, ctx) => {
      const filePath = typeof params.path === 'string' ? params.path : '';
      const resolved = resolveRepoRelativePath(filePath, config.repoRoot);
      if (!resolved.ok) {
        bb.file_read_error = resolved.error;
        return false;
      }
      if (!isPathAllowed(resolved.rel, policy.allowedPaths)) {
        bb.file_read_error = `path "${resolved.rel}" is outside allowed roots`;
        return false;
      }
      if (!host.exists(resolved.rel)) {
        bb.file_read_error = `file not found: ${resolved.rel}`;
        return false;
      }
      const content = host.readFile(resolved.rel);
      if (Buffer.byteLength(content, 'utf-8') > policy.maxFileBytes) {
        bb.file_read_error = `file exceeds max size (${policy.maxFileBytes} bytes)`;
        return false;
      }
      bb.file_read_path = resolved.rel;
      bb.file_read_content = content;
      ctx.emit('daemon:tool:file_read', { path: resolved.rel, bytes: Buffer.byteLength(content, 'utf-8') });
      return true;
    },

    file_write: async (params, bb, ctx) => {
      const filePath = typeof params.path === 'string' ? params.path : '';
      const content = typeof params.content === 'string' ? params.content : null;
      const append = params.append === true;
      if (content === null) {
        bb.file_write_error = 'content is required';
        return false;
      }
      if (Buffer.byteLength(content, 'utf-8') > policy.maxFileBytes) {
        bb.file_write_error = `content exceeds max size (${policy.maxFileBytes} bytes)`;
        return false;
      }
      const resolved = resolveRepoRelativePath(filePath, config.repoRoot);
      if (!resolved.ok) {
        bb.file_write_error = resolved.error;
        return false;
      }
      if (!isPathAllowed(resolved.rel, policy.allowedPaths)) {
        bb.file_write_error = `path "${resolved.rel}" is outside allowed roots`;
        return false;
      }
      const current = append && host.exists(resolved.rel) ? host.readFile(resolved.rel) : '';
      host.writeFile(resolved.rel, append ? `${current}${content}` : content);
      bb.file_write_path = resolved.rel;
      bb.file_write_bytes = Buffer.byteLength(content, 'utf-8');
      ctx.emit('daemon:tool:file_write', { path: resolved.rel, append, bytes: Buffer.byteLength(content, 'utf-8') });
      return true;
    },

    web_fetch: async (params, bb, ctx) => {
      const url = typeof params.url === 'string' ? params.url.trim() : '';
      if (!url) {
        bb.web_fetch_error = 'url is required';
        return false;
      }
      const hostName = parseHostFromUrl(url);
      if (!hostName) {
        bb.web_fetch_error = 'invalid url';
        return false;
      }
      const allowed = policy.allowedHosts.includes(hostName) || policy.allowedHosts.some(h => hostName.endsWith(`.${h}`));
      if (!allowed) {
        bb.web_fetch_error = `host "${hostName}" is not allowlisted`;
        return false;
      }
      try {
        const response = await (globalThis.fetch as typeof fetch)(url, {
          method: typeof params.method === 'string' ? params.method : 'GET',
          headers: typeof params.headers === 'object' && params.headers
            ? params.headers as Record<string, string>
            : undefined,
        });
        const text = await response.text();
        bb.web_fetch_status = response.status;
        bb.web_fetch_body = truncateText(text, policy.maxShellOutputBytes);
        bb.web_fetch_ok = response.ok;
        ctx.emit('daemon:tool:web_fetch', { url, status: response.status, ok: response.ok });
        return response.ok;
      } catch (error) {
        bb.web_fetch_error = (error as Error).message;
        return false;
      }
    },

    create_skill: async (params, bb, ctx) => {
      const name = typeof params.name === 'string' ? params.name.trim() : '';
      if (!name) {
        bb.create_skill_error = 'name is required';
        return false;
      }
      const safeName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!safeName) {
        bb.create_skill_error = 'name must contain alphanumeric characters';
        return false;
      }

      const skillsRoot = config.skillsDir
        ? resolveRepoRelativePath(config.skillsDir, config.repoRoot)
        : resolveRepoRelativePath('compositions/skills', config.repoRoot);
      if (!skillsRoot.ok) {
        bb.create_skill_error = skillsRoot.error;
        return false;
      }

      const targetPath = `${skillsRoot.rel}/${safeName}.hsplus`;
      const content = typeof params.content === 'string' && params.content.trim().length > 0
        ? params.content
        : `composition "${safeName}" {\n  // Generated by create_skill\n  action "${safeName}" {\n    // Fill implementation\n  }\n}\n`;

      if (Buffer.byteLength(content, 'utf-8') > policy.maxFileBytes) {
        bb.create_skill_error = `skill content exceeds max size (${policy.maxFileBytes} bytes)`;
        return false;
      }

      host.writeFile(targetPath, content);
      bb.created_skill_path = targetPath;
      bb.created_skill_name = safeName;
      ctx.emit('daemon:skill_created', { name: safeName, path: targetPath });
      return true;
    },

    channel_send: async (params, bb, ctx) => {
      const channel = typeof params.channel === 'string' ? params.channel.trim() : 'default';
      const message = typeof params.message === 'string' ? params.message : '';
      if (!message) {
        bb.channel_send_error = 'message is required';
        return false;
      }
      const outboxPath = `${config.stateDir}/outbox.jsonl`;
      const entry = {
        timestamp: new Date().toISOString(),
        channel,
        message,
        metadata: typeof params.metadata === 'object' && params.metadata ? params.metadata : {},
      };
      const prev = host.exists(outboxPath) ? host.readFile(outboxPath) : '';
      host.writeFile(outboxPath, `${prev}${JSON.stringify(entry)}\n`);
      bb.channel_send_ok = true;
      ctx.emit('daemon:channel:send', entry);
      return true;
    },

    channel_ingest: async (_params, bb, ctx) => {
      const inboxPath = `${config.stateDir}/inbox.jsonl`;
      if (!host.exists(inboxPath)) {
        bb.channel_ingest_ok = false;
        return false;
      }
      const lines = host.readFile(inboxPath).split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) {
        bb.channel_ingest_ok = false;
        return false;
      }
      try {
        const latest = JSON.parse(lines[lines.length - 1]) as Record<string, unknown>;

        if (policy.requireSignedInbox) {
          const secret = policy.inboxSignatureSecret;
          if (!secret) {
            bb.channel_ingest_error = 'Signed inbox required, but inboxSignatureSecret is not configured';
            return false;
          }

          const metadata = latest.metadata && typeof latest.metadata === 'object'
            ? latest.metadata as Record<string, unknown>
            : {};
          const signature = typeof metadata.signature === 'string' ? metadata.signature : '';
          if (!signature) {
            bb.channel_ingest_error = 'Inbox envelope missing metadata.signature';
            return false;
          }

          const envelopeForVerification: Record<string, unknown> = {
            ...latest,
            metadata: { ...metadata },
          };
          delete (envelopeForVerification.metadata as Record<string, unknown>).signature;

          const valid = verifyInboxEnvelopeSignature(envelopeForVerification, signature, secret);
          if (!valid) {
            bb.channel_ingest_error = 'Inbox envelope signature validation failed';
            return false;
          }
        }

        bb.channel_message = latest;
        bb.channel_ingest_ok = true;
        ctx.emit('user:message', latest);
        return true;
      } catch (error) {
        bb.channel_ingest_error = (error as Error).message;
        return false;
      }
    },

    // ── Identity & Wisdom ──────────────────────────────────────────────
    identity_intake: async (_params, bb) => {
      const wisdomPath = `${config.stateDir}/accumulated-wisdom.json`;
      if (host.exists(wisdomPath)) {
        try {
          const wisdom = JSON.parse(host.readFile(wisdomPath));
          bb.wisdom = wisdom;
          bb.wisdomCount = Array.isArray(wisdom) ? wisdom.length : 0;
          log(`Loaded ${bb.wisdomCount} wisdom entries`);
        } catch {
          bb.wisdom = [];
          bb.wisdomCount = 0;
        }
      } else {
        bb.wisdom = [];
        bb.wisdomCount = 0;
      }
      // Inject cycle focus and daemon file from config (reliable path —
      // AST blackboard injection may not survive parse→clone→materialize)
      if (config.cycleFocus) bb.focus = config.cycleFocus;
      if (config.daemonFile) bb.daemon_file = config.daemonFile;

      bb.identity_ready = true;
      return true;
    },

    // ── Diagnosis ──────────────────────────────────────────────────────
    diagnose: async (_params, bb) => {
      const focus = (bb.focus as string) || 'typefix';
      log(`Diagnosing with focus: ${focus}`);
      const daemonCompositionFile = (bb.daemon_file as string) || '';
      const validationFocuses = new Set(['target-sweep', 'trait-sampling', 'runtime-matrix', 'absorb-roundtrip']);
      bb.validation_focus = validationFocuses.has(focus);
      bb.edit_focus = !bb.validation_focus;

      let candidates: string[] = [];

      if (focus === 'typefix' || focus === 'all') {
        // Run tsc and collect files with type errors (incremental for speed)
        const result = await host.exec('npx', tscCheckArgs(config.stateDir), {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const errorLines = (result.stdout + result.stderr).split('\n').filter(l => /error TS\d{4}:/.test(l));

        // Count errors per file for prioritization
        const errorCounts = new Map<string, number>();
        for (const line of errorLines) {
          const match = line.match(/^(.+?)\(\d+,\d+\):\s*error/);
          if (match) {
            errorCounts.set(match[1], (errorCounts.get(match[1]) || 0) + 1);
          }
        }

        // Filter: packages/core/src/ and packages/studio/src/ (skip examples/, benchmarks, external packages)
        // Then remove quarantined files
        const filtered = [...errorCounts.entries()]
          .filter(([f]) => /packages\/(core|studio)\/src\//.test(f.replace(/\\/g, '/')))
          .filter(([f]) => !isCommitted(f))
          .filter(([f]) => !isQuarantined(f));

        // Rank by downstream impact × error tractability
        // Tier 1: files with ≤3 errors (highest elimination chance) go first.
        // Within each tier: impact × tractability score breaks ties.
        const FEW_ERRORS_THRESHOLD = 3;
        const impact = computeDownstreamImpact(filtered, host);
        filtered.sort((a, b) => {
          const errorsA = a[1];
          const errorsB = b[1];
          // Tier-based bucketing: few-error files are promoted to the front
          const aTier = errorsA <= FEW_ERRORS_THRESHOLD ? 0 : 1;
          const bTier = errorsB <= FEW_ERRORS_THRESHOLD ? 0 : 1;
          if (aTier !== bTier) return aTier - bTier;
          // Within tier: impact × tractability score
          const scoreA = (1 + (impact.get(a[0]) || 0)) / (1 + errorsA);
          const scoreB = (1 + (impact.get(b[0]) || 0)) / (1 + errorsB);
          return scoreB - scoreA;
        });

        candidates = filtered.map(([f]) => f);
        bb.typeErrorCount = errorLines.length;
        bb.typeErrorBaseline = errorLines.length;

        // Store per-file error lines so generate_fix can filter precisely
        const perFileErrors: Record<string, string[]> = {};
        for (const line of errorLines) {
          const match = line.match(/^(.+?)\(\d+,\d+\):\s*error/);
          if (match) {
            const f = match[1];
            if (!perFileErrors[f]) perFileErrors[f] = [];
            perFileErrors[f].push(line);
          }
        }
        bb.perFileErrors = perFileErrors;
      } else if (focus === 'coverage') {
        // Find source files that lack corresponding test files
        const result = await host.exec('npx', ['tsc', '--noEmit', '--listFiles'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const sourceFiles = (result.stdout + result.stderr).split('\n')
          .map(l => l.trim())
          .filter(f => /packages\/core\/src\//.test(f.replace(/\\/g, '/')))
          .filter(f => /\.ts$/.test(f) && !f.includes('.test.') && !f.includes('__tests__') && !f.includes('.d.ts'));

        for (const f of sourceFiles) {
          const testFile = f.replace(/\.ts$/, '.test.ts').replace(/\/src\//, '/src/__tests__/');
          if (!host.exists(testFile) && !isQuarantined(f) && !isCommitted(f)) {
            candidates.push(f);
          }
        }
        // Prioritize shorter files (easier to generate tests for)
        candidates.sort((a, b) => {
          try {
            return host.readFile(a).length - host.readFile(b).length;
          } catch { return 0; }
        });
        bb.typeErrorCount = 0;
      } else if (focus === 'lint') {
        // Find files with common lint issues: unused imports, any casts, console.log
        const result = await host.exec('npx', ['tsc', '--noEmit', '--listFiles'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const sourceFiles = (result.stdout + result.stderr).split('\n')
          .map(l => l.trim())
          .filter(f => /packages\/core\/src\//.test(f.replace(/\\/g, '/')))
          .filter(f => /\.ts$/.test(f) && !f.includes('.test.') && !f.includes('__tests__') && !f.includes('.d.ts'));

        for (const f of sourceFiles) {
          // tsc --listFiles emits absolute paths on Windows; normalise to relative for consistent
          // quarantine/committed checks, git operations, and ledger recording.
          const relF = path.isAbsolute(f) ? path.relative(config.repoRoot, f).replace(/\\/g, '/') : f;
          if (isQuarantined(relF) || isCommitted(relF)) continue;
          try {
            const content = host.readFile(f);
            // Strip block comments (JSDoc, /* */) before checking for console statements
            // to avoid false positives from console.log in doc examples
            const codeOnly = content.replace(/\/\*[\s\S]*?\*\//g, '');
            const hasLintIssues =
              /\bas\s+any\b/.test(content) ||
              /\/\/\s*@ts-ignore/.test(content) ||
              /console\.(log|warn|error)\(/.test(codeOnly);
            if (hasLintIssues) candidates.push(relF);
          } catch { /* skip unreadable */ }
        }
        // Sort by fix-type priority: console.log removals (~100% success) first,
        // then @ts-ignore removals (~90%), then as any casts (~50%).
        // Within each tier, smaller files first (easier to patch).
        candidates.sort((a, b) => {
          try {
            const ca = host.readFile(a);
            const cb = host.readFile(b);
            const caCode = ca.replace(/\/\*[\s\S]*?\*\//g, '');
            const cbCode = cb.replace(/\/\*[\s\S]*?\*\//g, '');
            // Tier: 0 = console-only, 1 = ts-ignore, 2 = as any
            const tierA = /console\.(log|warn|error)\(/.test(caCode) && !/\bas\s+any\b/.test(ca) ? 0
              : /\/\/\s*@ts-ignore/.test(ca) && !/\bas\s+any\b/.test(ca) ? 1 : 2;
            const tierB = /console\.(log|warn|error)\(/.test(cbCode) && !/\bas\s+any\b/.test(cb) ? 0
              : /\/\/\s*@ts-ignore/.test(cb) && !/\bas\s+any\b/.test(cb) ? 1 : 2;
            if (tierA !== tierB) return tierA - tierB;
            return ca.length - cb.length;
          } catch { return 0; }
        });
        bb.typeErrorCount = 0;
      } else if (focus === 'docs') {
        // Find exported functions/classes missing JSDoc descriptions
        const result = await host.exec('npx', ['tsc', '--noEmit', '--listFiles'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const sourceFiles = (result.stdout + result.stderr).split('\n')
          .map(l => l.trim())
          .filter(f => /packages\/core\/src\//.test(f.replace(/\\/g, '/')))
          .filter(f => /\.ts$/.test(f) && !f.includes('.test.') && !f.includes('__tests__') && !f.includes('.d.ts'));

        for (const f of sourceFiles) {
          const relF = path.isAbsolute(f) ? path.relative(config.repoRoot, f).replace(/\\/g, '/') : f;
          if (isQuarantined(relF) || isCommitted(relF)) continue;
          try {
            const content = host.readFile(f);
            // Check for undocumented exports (export without preceding JSDoc)
            if (/^export\s+(function|class|const|interface|type|enum)\s/m.test(content) &&
                !/\/\*\*[\s\S]*?\*\/\s*\nexport\s/m.test(content)) {
              candidates.push(relF);
            }
          } catch { /* skip unreadable */ }
        }
        candidates.sort((a, b) => {
          try { return host.readFile(a).length - host.readFile(b).length; }
          catch { return 0; }
        });
        bb.typeErrorCount = 0;
      } else if (focus === 'target-sweep') {
        if (!daemonCompositionFile) {
          bb.sweep_results = [];
          bb.sweep_passed = false;
          bb.has_candidates = false;
          log('Target sweep skipped: daemon file not available on blackboard');
          return true;
        }

        const sweepResults = await runCompilerSweep(host, config.repoRoot, config.stateDir, daemonCompositionFile);
        bb.sweep_results = sweepResults;
        bb.sweep_passed = sweepResults.every(r => r.ok);
        candidates = [daemonCompositionFile];
        bb.typeErrorCount = 0;
      } else if (focus === 'trait-sampling') {
        if (!daemonCompositionFile || !host.exists(daemonCompositionFile)) {
          bb.trait_sampling = {
            sampledFiles: 0,
            sampledTraits: 0,
            sampledCategories: 0,
            categories: [],
          };
          bb.trait_sampling_passed = false;
          bb.has_candidates = false;
          log('Trait sampling skipped: daemon file not available');
          return true;
        }

        const content = host.readFile(daemonCompositionFile);
        const sampling = collectTraitCoverage(content);
        bb.trait_sampling = sampling;
        bb.trait_sampling_passed = sampling.sampledCategories >= 3;
        candidates = [daemonCompositionFile];
        bb.typeErrorCount = 0;
      } else if (focus === 'runtime-matrix') {
        if (!daemonCompositionFile) {
          bb.runtime_matrix = [];
          bb.runtime_matrix_passed = false;
          bb.has_candidates = false;
          log('Runtime profile matrix skipped: daemon file not available on blackboard');
          return true;
        }

        const matrix = await runRuntimeProfileMatrix(host, config.repoRoot, daemonCompositionFile);
        bb.runtime_matrix = matrix;
        bb.runtime_matrix_passed = matrix.every(r => r.ok);
        candidates = [daemonCompositionFile];
        bb.typeErrorCount = 0;
      } else if (focus === 'absorb-roundtrip') {
        const sourceFile = 'packages/core/src/cli/daemon-actions.ts';
        if (!host.exists(sourceFile)) {
          bb.absorb_roundtrip = undefined;
          bb.absorb_roundtrip_passed = false;
          bb.has_candidates = false;
          log('Absorb roundtrip skipped: source fixture not found');
          return true;
        }

        const roundtrip = await runAbsorbRoundtrip(host, config.repoRoot, config.stateDir, sourceFile);
        bb.absorb_roundtrip = roundtrip;
        bb.absorb_roundtrip_passed = roundtrip.absorbOk && roundtrip.compileOk;
        candidates = [sourceFile];
        bb.typeErrorCount = 0;
      } else {
        bb.typeErrorCount = 0;
      }

      bb.candidates = candidates;
      bb.candidateIndex = 0;
      bb.has_candidates = candidates.length > 0;
      log(`Found ${candidates.length} candidates (focus: ${focus})`);
      return true;
    },

    // ── Read Candidate ─────────────────────────────────────────────────
    read_candidate: async (_params, bb) => {
      const candidates = bb.candidates as string[];
      const idx = bb.candidateIndex as number;
      if (!candidates || idx >= candidates.length) {
        bb.has_candidates = false;
        return false;
      }
      const filePath = candidates[idx];
      try {
        bb.currentCandidate = filePath;
        bb.candidateContent = host.readFile(filePath);

        // Store file-local error count before fix for delta scoring
        const perFileErrors = (bb.perFileErrors as Record<string, string[]>) || {};
        const fileErrs = perFileErrors[filePath] || perFileErrors[filePath.replace(/\\/g, '/')] || [];
        bb.fileErrorsBefore = fileErrs.length;

        log(`Read candidate: ${filePath} (${fileErrs.length} file-local errors)`);
        return true;
      } catch (err: unknown) {
        log(`Failed to read ${filePath}: ${(err as Error).message}`);
        return false;
      }
    },

    // ── Generate Fix (LLM Call) ────────────────────────────────────────
    // Think→Patch architecture: LLM reasons about errors, proposes JSON patches,
    // patches are applied programmatically. Prevents file truncation/deletion.
    generate_fix: async (_params, bb, ctx) => {
      const file = bb.currentCandidate as string;
      const content = bb.candidateContent as string;
      const focus = (bb.focus as string) || 'typefix';

      // ── Coverage/Docs: full-file approach (generating new content) ────
      if (focus === 'coverage') {
        const systemPrompt = getDaemonSystemPrompt('coverage', promptContext);
        try {
          const result = await llm.chat({ system: systemPrompt, prompt: `File: ${file}\n\n${content}`, maxTokens: 8192 });
          bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
          bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
          ctx.emit('economy:spend', { action: 'generate_fix', focus, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
          const edited = result.text.trim();
          if (edited.length > 10 && !isContaminatedEdit(edited)) {
            const testPath = file.replace(/\\/g, '/').replace(/\.ts$/, '.test.ts').replace(/\/src\//, '/src/__tests__/');
            host.writeFile(testPath, edited);
            bb.fileEdited = true;
            bb.generatedTestFile = testPath;
            log(`Generated test: ${testPath.split('/').pop()}`);
            return true;
          }
        } catch (err: unknown) { log(`LLM error: ${(err as Error).message}`); }
        advanceCandidate(bb);
        return false;
      }

      if (focus === 'target-sweep') {
        const sweep = (bb.sweep_results as CompilerSweepResult[]) || [];
        bb.fileEdited = false;
        bb.generatedTestFile = undefined;
        log(`Target sweep: ${sweep.filter(r => r.ok).length}/${sweep.length} targets passed`);
        return sweep.length > 0 && sweep.every(r => r.ok);
      }

      if (focus === 'trait-sampling') {
        const sampling = bb.trait_sampling as TraitCoverageResult | undefined;
        bb.fileEdited = false;
        bb.generatedTestFile = undefined;
        if (!sampling) {
          log('Trait sampling: no data');
          return false;
        }
        log(`Trait sampling: ${sampling.sampledTraits} traits across ${sampling.sampledCategories} categories`);
        return sampling.sampledCategories >= 3;
      }

      if (focus === 'runtime-matrix') {
        const matrix = (bb.runtime_matrix as RuntimeProfileResult[]) || [];
        bb.fileEdited = false;
        bb.generatedTestFile = undefined;
        log(`Runtime matrix: ${matrix.filter(r => r.ok).length}/${matrix.length} profiles passed`);
        return matrix.length > 0 && matrix.every(r => r.ok);
      }

      if (focus === 'absorb-roundtrip') {
        const roundtrip = bb.absorb_roundtrip as AbsorbRoundtripResult | undefined;
        bb.fileEdited = false;
        bb.generatedTestFile = undefined;
        if (!roundtrip) {
          log('Absorb roundtrip: no result');
          return false;
        }
        log(`Absorb roundtrip: absorb=${roundtrip.absorbOk ? 'ok' : 'fail'} compile=${roundtrip.compileOk ? 'ok' : 'fail'}`);
        return roundtrip.absorbOk && roundtrip.compileOk;
      }

      if (focus === 'lint') {
        // Lint focus uses think→patch architecture (same as typefix)
        const lintErrors: string[] = [];
        const lines = content.split('\n');
        let inBlockComment = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Track block comment state to avoid false positives from JSDoc examples
          if (inBlockComment) {
            if (/\*\//.test(line)) inBlockComment = false;
            continue;
          }
          if (/\/\*/.test(line) && !/\*\//.test(line)) { inBlockComment = true; continue; }
          if (/\bas\s+any\b/.test(line)) lintErrors.push(`${file}(${i + 1}): lint: unsafe 'as any' cast`);
          if (/\/\/\s*@ts-ignore/.test(line)) lintErrors.push(`${file}(${i + 1}): lint: @ts-ignore suppression`);
          if (/console\.(log|warn|error)\(/.test(line) && !file.includes('cli/')) lintErrors.push(`${file}(${i + 1}): lint: console statement in library code`);
        }
        if (lintErrors.length === 0) {
          advanceCandidate(bb);
          return false;
        }
        const systemPrompt = getDaemonSystemPrompt('typefix', promptContext);
        const compileErrors = bb.compileErrors as string[] | undefined;

        // Extract type context from imports and interfaces so the LLM can choose correct types.
        const typeContext: string[] = [];
        const importLines = lines.filter(l => /^\s*(import\s|export\s+type|interface\s|type\s+\w+\s*=)/.test(l));
        if (importLines.length > 0) {
          typeContext.push('Available types (from file imports/declarations):', ...importLines.slice(0, 30));
        }
        // Check related files for type declarations used by this file
        try {
          const relatedFiles = resolveRelatedFiles(content, file, host, '', config.repoRoot);
          const relatedTypes: string[] = [];
          for (const rel of relatedFiles) {
            const relLines = rel.content.split('\n')
              .filter(l => /^\s*(export\s+)?(interface|type|enum)\s+\w+/.test(l));
            if (relLines.length > 0) {
              relatedTypes.push(`// From ${rel.path.split('/').pop()} (${rel.relation}):`);
              relatedTypes.push(...relLines.slice(0, 15));
            }
          }
          if (relatedTypes.length > 0) typeContext.push('', ...relatedTypes);
        } catch { /* skip related type resolution if it fails */ }

        const lintPromptParts = [
          `File: ${file}`,
          '',
          'Lint issues to fix (replace unsafe casts with proper types, remove @ts-ignore, remove console statements from library code):',
          lintErrors.join('\n'),
        ];
        if (typeContext.length > 0) {
          lintPromptParts.push('', ...typeContext);
        }
        if (compileErrors && compileErrors.length > 0) {
          lintPromptParts.push(
            '',
            'IMPORTANT: A previous fix attempt caused these compile errors (do NOT introduce these again):',
            compileErrors.slice(0, 10).join('\n'),
            '',
            'Only fix lint issues where you can provide a type-safe replacement. Skip issues where removing `as any` would require changes to external type definitions.',
          );
        }
        lintPromptParts.push('', `Source (${lines.length} lines):`, content);
        const lintPrompt = lintPromptParts.join('\n');
        try {
          const result = await llm.chat({ system: systemPrompt, prompt: lintPrompt, maxTokens: 4096 });
          bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
          bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
          ctx.emit('economy:spend', { action: 'generate_fix', focus: 'lint', inputTokens: result.inputTokens, outputTokens: result.outputTokens });
          const patchResponse = parsePatchResponse(result.text);
          if (!patchResponse || patchResponse.patches.length === 0) {
            // LLM analyzed but couldn't produce patches — mark as committed to skip in future cycles
            committedFiles.add(file.replace(/\\/g, '/'));
            advanceCandidate(bb);
            return false;
          }
          if (patchResponse.analysis) log(`Analysis: ${patchResponse.analysis.slice(0, 200)}`);
          const { result: patched, applied } = applyPatches(content, patchResponse.patches);
          if (applied === 0) {
            committedFiles.add(file.replace(/\\/g, '/'));
            advanceCandidate(bb);
            return false;
          }
          const safety = validatePatchSafety(content, patched);
          if (!safety.safe) { log(`SAFETY REJECT: ${safety.reason}`); advanceCandidate(bb); return false; }
          if (isContaminatedEdit(patched)) { advanceCandidate(bb); return false; }
          host.writeFile(file, patched);
          bb.fileEdited = true;
          log(`Applied ${applied} lint fixes to ${file.split(/[/\\]/).pop()}`);
          return true;
        } catch (err: unknown) { log(`LLM error: ${(err as Error).message}`); }
        advanceCandidate(bb);
        return false;
      }

      if (focus === 'docs') {
        // Docs focus: add plain JSDoc descriptions via think→patch
        // CRITICAL: Only add /** description */ comments — never @param/@returns
        // with type annotations, as those conflict with TypeScript signatures.
        const lines = content.split('\n');
        const undocumented: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^export\s+(function|class|const|interface|type|enum)\s/.test(line)) {
            // Check if preceding line has JSDoc
            const prev = i > 0 ? lines[i - 1].trim() : '';
            if (!prev.endsWith('*/')) {
              undocumented.push(`${file}(${i + 1}): missing JSDoc for: ${line.trim().slice(0, 80)}`);
            }
          }
        }
        if (undocumented.length === 0) { advanceCandidate(bb); return false; }

        const systemPrompt = getDaemonSystemPrompt('typefix', promptContext);
        const docsPrompt = [
          `File: ${file}`,
          '',
          'Add brief JSDoc comments (/** one-line description */) above these undocumented exports.',
          'RULES:',
          '- Only add /** description */ comments, nothing else',
          '- Do NOT add @param, @returns, @throws, or any other JSDoc tags',
          '- Do NOT change any code, types, or signatures',
          '- Keep descriptions concise (1 sentence max)',
          '',
          undocumented.join('\n'),
          '',
          `Source (${lines.length} lines):`,
          content,
        ].join('\n');

        try {
          const result = await llm.chat({ system: systemPrompt, prompt: docsPrompt, maxTokens: 4096 });
          bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
          bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
          ctx.emit('economy:spend', { action: 'generate_fix', focus: 'docs', inputTokens: result.inputTokens, outputTokens: result.outputTokens });
          const patchResponse = parsePatchResponse(result.text);
          if (!patchResponse || patchResponse.patches.length === 0) { advanceCandidate(bb); return false; }
          if (patchResponse.analysis) log(`Analysis: ${patchResponse.analysis.slice(0, 200)}`);
          const { result: patched, applied } = applyPatches(content, patchResponse.patches);
          if (applied === 0) { advanceCandidate(bb); return false; }
          const safety = validatePatchSafety(content, patched);
          if (!safety.safe) { log(`SAFETY REJECT: ${safety.reason}`); advanceCandidate(bb); return false; }
          if (isContaminatedEdit(patched)) { advanceCandidate(bb); return false; }

          // Docs-specific guard: verify only comment lines were added (no code changes)
          const origCode = content.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('/**') && !l.trim().startsWith('*/') && l.trim() !== '');
          const patchedCode = patched.split('\n').filter(l => !l.trim().startsWith('*') && !l.trim().startsWith('/**') && !l.trim().startsWith('*/') && l.trim() !== '');
          if (origCode.join('\n') !== patchedCode.join('\n')) {
            log(`DOCS SAFETY: LLM changed code lines, not just comments. Rejecting.`);
            advanceCandidate(bb);
            return false;
          }

          host.writeFile(file, patched);
          bb.fileEdited = true;
          log(`Applied docs to ${file.split(/[/\\]/).pop()}`);
          return true;
        } catch (err: unknown) { log(`LLM error: ${(err as Error).message}`); }
        advanceCandidate(bb);
        return false;
      }

      // ── Type fixes: think→patch→apply architecture ────────────────────
      // The LLM reasons about each error, then proposes minimal patches.
      // Patches are applied programmatically — no full-file rewrite.

      // Collect errors specific to THIS file using exact path match
      const perFileErrors = (bb.perFileErrors as Record<string, string[]>) || {};
      const compileErrors = (bb.compileErrors as string[]) || [];
      const baseName = file.split(/[/\\]/).pop() || '';

      // Prefer exact path match from diagnose, fall back to basename match from verify
      const fileErrors = perFileErrors[file]
        || perFileErrors[file.replace(/\\/g, '/')]
        || compileErrors.filter(e => {
          const m = e.match(/^(.+?)\(\d+,\d+\):/);
          return m && m[1].replace(/\\/g, '/') === file.replace(/\\/g, '/');
        });
      const errorContext = fileErrors.length > 0
        ? fileErrors.join('\n')
        : '';

      // Skip LLM call entirely if no errors belong to this file — saves tokens
      if (!errorContext) {
        log(`No errors in ${baseName} (errors are in other files), skipping`);
        advanceCandidate(bb);
        return false;
      }

      // Multi-file context: resolve base class and related files
      const relatedFiles = resolveRelatedFiles(content, file, host, errorContext, config.repoRoot);
      const depContext = extractDependencyContext(content, file, host);

      const systemPrompt = getDaemonSystemPrompt('typefix', promptContext);

      // Extract relevant prior wisdom for this file (avoid repeating failed approaches)
      const priorWisdom = extractFileWisdom(bb.wisdom, file, focus);

      // Investigate error symbols before building the prompt
      const investigations = investigateSymbols(errorContext, content, file, host, config.repoRoot);
      if (investigations.length > 0) {
        bb.symbolsTargeted = investigations.map(i => i.symbol);
        log(`Investigated ${investigations.length} symbols: ${investigations.map(i => i.symbol).join(', ')}`);
      }

      // Build prompt — include related file content for coordinated patches
      const promptParts = [
        `Primary file: ${file}`,
        '',
        'Type errors to fix:',
        errorContext || '(no specific errors — check file for type issues)',
        depContext,
      ];

      // Error-focused context: only the lines around each error (±10 lines).
      // This steers the LLM to patch the exact failing span instead of making
      // unrelated changes across the whole file.
      const focusedCtx = buildErrorFocusedContext(content, fileErrors.length > 0 ? fileErrors : errorContext.split('\n'));
      promptParts.push(
        '',
        '=== ERROR-FOCUSED CONTEXT (error lines ± 10 lines each) ===',
        'Your patches MUST target the lines marked with ← ERROR.',
        focusedCtx,
      );

      // Inject wisdom context if this file has been attempted before
      if (priorWisdom.length > 0) {
        promptParts.push(
          '',
          '=== PRIOR ATTEMPTS ON THIS FILE ===',
          'The daemon has already attempted fixes on this file. Avoid repeating the same approach:',
          ...priorWisdom,
          '',
        );
      }

      // Inject symbol investigation results (definitions, contracts)
      const investigationCtx = formatInvestigations(investigations);
      if (investigationCtx) {
        promptParts.push(investigationCtx);
      }

      // Graph-RAG: test-aware retry — if a previous fix attempt passed compilation
      // but failed tests, include the test file content and failure output.
      // This lets the LLM understand what the tests expect and produce a fix
      // that satisfies BOTH type safety AND test assertions.
      const testCtx = bb.testFailureContext as { testFile: string; testContent: string; failOutput: string } | undefined;
      if (testCtx) {
        promptParts.push(
          '',
          '=== TEST FAILURE CONTEXT (previous attempt compiled but tests failed) ===',
          `Test file: ${testCtx.testFile}`,
          'IMPORTANT: Your fix must satisfy these test assertions. Do NOT just cast types —',
          'ensure the runtime behavior matches what the tests expect.',
          '',
          'Test source:',
          testCtx.testContent,
          '',
          'Test failure output:',
          testCtx.failOutput,
        );
        log(`Test-aware: injected ${testCtx.testFile.split('/').pop()} context into prompt`);
      }

      promptParts.push(
        '',
        `Full source reference (${content.split('\n').length} lines):`,
        content,
      );

      // Add related files (base classes, type definitions)
      if (relatedFiles.length > 0) {
        promptParts.push('', '=== RELATED FILES (you may also patch these) ===');
        for (const rf of relatedFiles) {
          promptParts.push(
            '',
            `Related file (${rf.relation}): ${rf.path}`,
            `Source (${rf.content.split('\n').length} lines):`,
            rf.content,
          );
        }
        promptParts.push('', 'NOTE: To patch a related file, add "file": "<path>" to the patch object. Patches without a "file" field apply to the primary file.');
      }

      const prompt = promptParts.join('\n');

      try {
        const result = await llm.chat({ system: systemPrompt, prompt, maxTokens: relatedFiles.length > 0 ? 6144 : 4096 });
        bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
        bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
        ctx.emit('economy:spend', { action: 'generate_fix', focus, inputTokens: result.inputTokens, outputTokens: result.outputTokens });

        // Parse structured response
        const patchResponse = parsePatchResponse(result.text);
        if (!patchResponse) {
          log(`Failed to parse LLM JSON for ${baseName}, skipping`);
          advanceCandidate(bb);
          return false;
        }

        if (patchResponse.analysis) {
          log(`Analysis: ${patchResponse.analysis.slice(0, 200)}`);
        }

        if (patchResponse.patches.length === 0) {
          log(`No patches proposed for ${baseName}`);
          advanceCandidate(bb);
          return false;
        }

        // Group patches by file (multi-file support)
        const primaryPatches = patchResponse.patches.filter(p => !p.file);
        const relatedPatchGroups = new Map<string, Patch[]>();
        for (const p of patchResponse.patches) {
          if (p.file) {
            const key = p.file.replace(/\\/g, '/');
            if (!relatedPatchGroups.has(key)) relatedPatchGroups.set(key, []);
            relatedPatchGroups.get(key)!.push(p);
          }
        }

        // Apply primary file patches
        let totalApplied = 0;
        const { result: patched, applied, failed } = applyPatches(content, primaryPatches.length > 0 ? primaryPatches : patchResponse.patches.filter(p => !p.file));
        totalApplied += applied;

        if (applied === 0 && relatedPatchGroups.size === 0) {
          log(`All ${failed.length} patches failed to match in ${baseName}`);
          for (const f of failed.slice(0, 3)) log(`  ${f}`);
          advanceCandidate(bb);
          return false;
        }
        if (failed.length > 0) {
          log(`${applied}/${primaryPatches.length || patchResponse.patches.length} patches applied (${failed.length} failed) in ${baseName}`);
        }

        // Safety validation — reject destructive edits
        const safety = validatePatchSafety(content, patched);
        if (!safety.safe) {
          log(`SAFETY REJECT: ${safety.reason} — skipping ${baseName}`);
          advanceCandidate(bb);
          return false;
        }

        if (isContaminatedEdit(patched)) {
          log(`Contaminated edit detected for ${baseName}, skipping`);
          advanceCandidate(bb);
          return false;
        }

        // Apply related file patches (multi-file)
        const relatedEdits: { path: string; original: string; patched: string }[] = [];
        for (const [relPath, relPatches] of relatedPatchGroups) {
          // Match exact path first, then allow repo-relative suffix matching.
          const requestedPath = normalizeRepoPath(relPath);
          const rf = relatedFiles.find(r => {
            const candidatePath = normalizeRepoPath(r.path);
            return candidatePath === requestedPath
              || candidatePath.endsWith(`/${requestedPath}`)
              || requestedPath.endsWith(`/${candidatePath}`);
          });
          if (!rf) { log(`Related file ${relPath} not found, skipping its patches`); continue; }
          const { result: relPatched, applied: relApplied } = applyPatches(rf.content, relPatches);
          if (relApplied > 0) {
            const relSafety = validatePatchSafety(rf.content, relPatched);
            if (relSafety.safe && !isContaminatedEdit(relPatched)) {
              relatedEdits.push({ path: rf.path, original: rf.content, patched: relPatched });
              totalApplied += relApplied;
              log(`Applied ${relApplied} patches to related file ${rf.path.split(/[/\\]/).pop()}`);
            }
          }
        }

        // Write all files atomically
        if (applied > 0) host.writeFile(file, patched);
        for (const edit of relatedEdits) host.writeFile(edit.path, edit.patched);
        // Track related files for rollback
        bb.relatedEdits = relatedEdits.map(e => ({ path: e.path, original: e.original }));

        bb.fileEdited = true;
        log(`Applied ${totalApplied} patches to ${baseName}${relatedEdits.length > 0 ? ` + ${relatedEdits.length} related file(s)` : ''}`);
        return true;
      } catch (err: unknown) {
        log(`LLM error: ${(err as Error).message}`);
        return false;
      }
    },

    // ── Verify Compilation ─────────────────────────────────────────────
    // Always returns true (check completed). Sets bb.compilation_passed flag
    // for the BT condition node to decide commit vs rollback path.
    verify_compilation: async (_params, bb) => {
      const result = await host.exec('npx', tscCheckArgs(config.stateDir), {
        cwd: config.repoRoot, timeoutMs: 120_000,
      });
      const errorOutput = result.stdout + result.stderr;
      const errors = errorOutput.split('\n').filter(l => /error TS\d{4}:/.test(l));
      bb.compileErrors = errors.slice(0, 20);

      // File-local error delta: must be computed BEFORE compilation_passed for non-typefix modes.
      const candidateFile = bb.currentCandidate as string;
      const fileErrorsBeforeCount = (bb.fileErrorsBefore as number) ?? 0;
      let fileErrorsAfterCount = 0;
      if (candidateFile) {
        fileErrorsAfterCount = countFileErrors(errorOutput, candidateFile);
        bb.fileErrorsAfter = fileErrorsAfterCount;
        if (fileErrorsBeforeCount !== fileErrorsAfterCount) {
          log(`File-local errors: ${fileErrorsBeforeCount} → ${fileErrorsAfterCount} (delta: ${fileErrorsAfterCount - fileErrorsBeforeCount})`);
        }
      }

      // compilation_passed: typefix checks global count; other modes only check for file-local regressions.
      // In non-typefix modes bb.typeErrorCount is 0 (lint count), so comparing against global tsc errors
      // (~3500) would always fail — we gate on file-local delta instead.
      const isTypefixFocus = !config.cycleFocus || config.cycleFocus === 'typefix' || config.cycleFocus === 'all';
      if (isTypefixFocus) {
        const baseline = (bb.typeErrorCount as number) ?? Infinity;
        bb.compilation_passed = errors.length === 0 || errors.length <= baseline;
      } else {
        // Pass if the fix didn't introduce new type errors in the candidate file.
        bb.compilation_passed = fileErrorsAfterCount <= fileErrorsBeforeCount;
      }

      if (candidateFile) {

        // Multi-file delta: include candidate + any related files that were edited.
        const relatedEdits = (bb.relatedEdits as { path: string }[] | undefined) || [];
        const perFileErrors = (bb.perFileErrors as Record<string, string[]>) || {};
        const touchedFiles = [candidateFile, ...relatedEdits.map(e => e.path)];
        const touchedBefore = touchedFiles.reduce((sum, f) => {
          const normalized = normalizeRepoPath(f);
          const errs = perFileErrors[normalized]
            || perFileErrors[f]
            || perFileErrors[f.replace(/\\/g, '/')]
            || [];
          return sum + errs.length;
        }, 0);
        const touchedAfter = touchedFiles.reduce((sum, f) => sum + countFileErrors(errorOutput, f), 0);
        bb.touchedErrorsBefore = touchedBefore;
        bb.touchedErrorsAfter = touchedAfter;
        if (touchedBefore !== touchedAfter) {
          log(`Touched-file errors: ${touchedBefore} → ${touchedAfter} (delta: ${touchedAfter - touchedBefore})`);
        }
      }

      log(`Compilation: ${bb.compilation_passed ? 'PASS' : 'FAIL'} (${errors.length} errors)`);
      return true;
    },

    // ── Fix From Compile Errors ────────────────────────────────────────
    fix_from_compile_errors: async (_params, bb, ctx) => {
      const file = bb.currentCandidate as string;
      try {
        bb.candidateContent = host.readFile(file);
      } catch {
        return false;
      }

      // Enrich compile errors with type context: extract referenced type names
      // from error messages and resolve their definitions so the LLM knows exactly
      // what interface/type it needs to satisfy.
      const compileErrors = (bb.compileErrors as string[]) || [];
      const enrichedErrors: string[] = [...compileErrors];
      try {
        // Extract type names from common error patterns:
        // "not assignable to parameter of type 'X'"
        // "Property 'X' does not exist on type 'Y'"
        // "Argument of type 'X' is not assignable to type 'Y'"
        const typeRefs = new Set<string>();
        for (const err of compileErrors) {
          const typeMatches = err.match(/type '([A-Z]\w+)'/g);
          if (typeMatches) {
            for (const m of typeMatches) {
              const name = m.slice(6, -1);
              if (name.length > 2 && name.length < 50) typeRefs.add(name);
            }
          }
        }
        // Resolve type definitions from related files
        if (typeRefs.size > 0) {
          const content = bb.candidateContent as string;
          const relatedFiles = resolveRelatedFiles(content, file, host, '', config.repoRoot);
          for (const rel of relatedFiles) {
            for (const typeName of typeRefs) {
              const defRegex = new RegExp(`(export\\s+)?(interface|type|class)\\s+${typeName}[\\s{<]`);
              if (defRegex.test(rel.content)) {
                // Extract the definition (up to 15 lines)
                const lines = rel.content.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  if (defRegex.test(lines[i])) {
                    const defLines = lines.slice(i, i + 15).join('\n');
                    enrichedErrors.push(`\n// Type definition for ${typeName} (from ${rel.path.split('/').pop()}):\n${defLines}`);
                    break;
                  }
                }
              }
            }
          }
        }
      } catch { /* type resolution failed, continue with original errors */ }

      bb.compileErrors = enrichedErrors;
      // Invoke generate_fix with the enriched compile error context
      return actions.generate_fix(_params, bb, ctx);
    },

    // ── Run Related Tests ──────────────────────────────────────────────
    run_related_tests: async (_params, bb) => {
      const file = bb.currentCandidate as string;
      const normalized = file.replace(/\\/g, '/');

      // Try multiple test file resolution patterns
      const testCandidates = [
        normalized.replace(/\.ts$/, '.test.ts').replace(/\/src\//, '/src/__tests__/'),
        normalized.replace(/\.ts$/, '.test.ts'),
        normalized.replace(/\.tsx$/, '.test.tsx').replace(/\/src\//, '/src/__tests__/'),
        normalized.replace(/\.ts$/, '.spec.ts').replace(/\/src\//, '/src/__tests__/'),
      ];

      const testFile = testCandidates.find(t => host.exists(t));

      if (!testFile) {
        // No test file exists — pass (don't block fixes on missing tests)
        log(`Tests: SKIP (no test file for ${normalized.split('/').pop()})`);
        bb.tests_passed = true;
        return true;
      }

      const result = await host.exec('npx', ['vitest', 'run', '--no-color', '--passWithNoTests', testFile], {
        cwd: config.repoRoot, timeoutMs: 120_000,
      });
      bb.tests_passed = result.code === 0;
      log(`Tests: ${bb.tests_passed ? 'PASS' : 'FAIL'} (${testFile.split('/').pop()})`);

      // Graph-RAG: on test failure, capture test context for test-aware retry.
      // Stores the test file content + failure output so the next generate_fix
      // attempt can include assertions the LLM must satisfy.
      if (!bb.tests_passed) {
        try {
          const testContent = host.readFile(testFile);
          // Extract just the failing test output (last 80 lines, avoid noise)
          const failOutput = (result.stdout + '\n' + result.stderr)
            .split('\n').slice(-80).join('\n');
          bb.testFailureContext = {
            testFile,
            testContent: testContent.slice(0, 4000), // Cap at 4K chars
            failOutput: failOutput.slice(0, 2000),
          };
          log(`Test-aware: captured ${testFile.split('/').pop()} (${testContent.split('\n').length} lines) for retry context`);
        } catch { /* test file unreadable, skip context */ }
      } else {
        bb.testFailureContext = undefined;
      }

      return bb.tests_passed as boolean;
    },

    // ── Validate Quality ───────────────────────────────────────────────
    validate_quality: async (_params, bb) => {
      // Use persistent baseline from config (historical reference, e.g. 3506).
      // Fall back to cycle-level baseline, then to per-diagnosis count.
      const baselineErrors = config.typeErrorBaseline
        || (bb.typeErrorBaseline as number)
        || (bb.typeErrorCount as number)
        || undefined;
      // Scope quality scoring to packages the daemon works on (avoids counting
      // errors from examples/, marketplace-web/, etc. that inflate the denominator).
      const scopeFilter = /packages\/(core|studio)\/src\//;
      const focus = config.cycleFocus || (bb.focus as string) || 'typefix';
      const result = await computeQuality(host, config.repoRoot, config.stateDir, baselineErrors, scopeFilter, focus);
      const qualityBefore = config.qualityBefore ?? (bb.quality_before as number) ?? 0;

      bb.quality_after = result.score;
      bb.quality_typeErrors = result.typeErrors;
      bb.quality_testsPassed = result.testsPassed;
      bb.quality_testsTotal = result.testsTotal;

      // Commit if quality improved OR if raw error count strictly decreased.
      // Quality delta alone is too coarse at 3500+ baseline errors —
      // fixing 1–3 errors moves quality by <0.001 which rounds away.
      const errorsAtDiagnosis = (bb.typeErrorCount as number) || Infinity;
      const errorsReduced = result.typeErrors < errorsAtDiagnosis;

      // File-local delta: additional commit signal when file's own errors decrease
      const fileBefore = (bb.fileErrorsBefore as number) ?? 0;
      const fileAfter = (bb.fileErrorsAfter as number) ?? 0;
      const fileErrorsReduced = fileBefore > 0 && fileAfter < fileBefore;

      // Multi-file delta: commit when candidate + related touched files improve.
      const touchedBefore = (bb.touchedErrorsBefore as number) ?? 0;
      const touchedAfter = (bb.touchedErrorsAfter as number) ?? 0;
      const touchedErrorsReduced = touchedBefore > 0 && touchedAfter < touchedBefore;

      bb.quality_improved = result.score > qualityBefore || errorsReduced || fileErrorsReduced || touchedErrorsReduced;

      if (errorsReduced) {
        log(`Error count reduced: ${errorsAtDiagnosis} → ${result.typeErrors} (committing even without quality delta)`);
      }
      if (fileErrorsReduced) {
        log(`File-local errors reduced: ${fileBefore} → ${fileAfter} (committing on file-level improvement)`);
      }
      if (touchedErrorsReduced) {
        log(`Touched-file errors reduced: ${touchedBefore} → ${touchedAfter} (committing on multi-file improvement)`);
      }
      log(`Quality: ${qualityBefore.toFixed(3)} -> ${result.score.toFixed(3)} | ` +
        `types: ${result.typeErrors} errors | tests: ${result.testsPassed}/${result.testsTotal} passed`);
      return bb.quality_improved as boolean;
    },

    // ── Commit Changes ─────────────────────────────────────────────────
    commit_changes: async (_params, bb) => {
      if (!bb.fileEdited) {
        log('No edits produced — skipping commit');
        bb.committed = false;
        advanceCandidate(bb);
        return true;
      }

      if (!config.commit) {
        log('Dry run — skipping commit');
        // Rollback file changes since we're not committing
        const file = bb.currentCandidate as string;
        const testFile = bb.generatedTestFile as string | undefined;
        if (file) await host.exec('git', ['checkout', '--', file], { cwd: config.repoRoot });
        if (testFile) await host.exec('git', ['checkout', '--', testFile], { cwd: config.repoRoot });
        bb.generatedTestFile = undefined;
        advanceCandidate(bb);
        return true;
      }
      const file = bb.currentCandidate as string;
      const testFile = bb.generatedTestFile as string | undefined;
      const focus = (bb.focus as string) || 'typefix';
      const relatedEdits = (bb.relatedEdits as { path: string }[] | undefined) || [];

      // Stage modified/created files
      const filesToAdd = Array.from(new Set([
        file,
        ...(testFile ? [testFile] : []),
        ...relatedEdits.map(e => e.path),
      ]));
      for (const f of filesToAdd) {
        const addResult = await host.exec('git', ['add', f], { cwd: config.repoRoot });
        if (addResult.code !== 0) {
          log(`git add FAILED for ${f} (stderr=${(addResult.stderr || '').trim()})`);
        }
      }

      const baseName = file.split(/[/\\]/).pop() || file;
      const commitType = focus === 'coverage' ? 'test' : focus === 'docs' ? 'docs' : 'fix';
      const msg = `${commitType}(${focus}): auto-fix ${baseName} [daemon]`;
      const result = await host.exec('git', [
        'commit', '--no-verify', '-m', `"${msg}"`,
      ], { cwd: config.repoRoot });
      bb.committed = result.code === 0;
      if (!bb.committed) {
        log(`Commit: FAILED (code=${result.code}, stderr=${(result.stderr || '').trim()})`);
      } else {
        committedFiles.add(file.replace(/\\/g, '/'));
        // Extract commit SHA for provenance
        const shaResult = await host.exec('git', ['rev-parse', '--short', 'HEAD'], { cwd: config.repoRoot });
        const commitSha = shaResult.code === 0 ? shaResult.stdout.trim() : undefined;
        log(`Commit: OK (${commitSha || 'unknown SHA'})`);

        // Record fix provenance
        recordProvenance({
          timestamp: new Date().toISOString(),
          candidate: file,
          focus,
          errorsBefore: (bb.typeErrorCount as number) || 0,
          errorsAfter: (bb.quality_typeErrors as number) || 0,
          fileErrorsBefore: (bb.fileErrorsBefore as number) || 0,
          fileErrorsAfter: (bb.fileErrorsAfter as number) || 0,
          symbolsTargeted: (bb.symbolsTargeted as string[]) || [],
          relatedFilesTouched: (bb.relatedEdits as { path: string }[] || []).map(e => e.path),
          patchCount: 1,
          commitSha,
          result: 'committed',
        }, config.stateDir, host);

        // Graph-RAG: cascade un-quarantine — if we just committed a root-cause file
        // (base class, shared type definition), re-enable quarantined files that
        // depend on it. This lets subclasses retry after their base class is fixed.
        const committedNorm = normalizeRepoPath(file);
        const committedBase = committedNorm.split('/').pop()?.replace(/\.tsx?$/, '') || '';
        const unquarantined: string[] = [];
        for (const [quarantinedFile, count] of failureCounts) {
          if (count < quarantineThreshold) continue; // not quarantined
          if (quarantinedFile === committedNorm) continue; // same file
          try {
            if (!host.exists(quarantinedFile)) continue;
            const qContent = host.readFile(quarantinedFile);
            // Check if the quarantined file imports or extends the committed file
            const importsCommitted = qContent.includes(`'${committedBase}'`) ||
              qContent.includes(`"${committedBase}"`) ||
              qContent.includes(`/${committedBase}'`) ||
              qContent.includes(`/${committedBase}"`);
            if (importsCommitted) {
              // Reset failure count to allow retry
              failureCounts.set(quarantinedFile, 0);
              unquarantined.push(quarantinedFile);
            }
          } catch { /* skip unreadable */ }
        }
        if (unquarantined.length > 0) {
          log(`Cascade un-quarantine: ${unquarantined.length} files re-enabled after fixing ${baseName}`);
          for (const f of unquarantined) {
            log(`  Re-enabled: ${f.split('/').pop()}`);
          }
          // Inject un-quarantined files back into candidates list for this cycle
          const candidates = (bb.candidates as string[]) || [];
          for (const f of unquarantined) {
            if (!candidates.includes(f)) candidates.push(f);
          }
          bb.candidates = candidates;
          bb.has_candidates = true;
        }
      }

      // Clear test failure context on successful commit
      bb.testFailureContext = undefined;
      advanceCandidate(bb);
      return bb.committed as boolean;
    },

    // ── Rollback Changes ───────────────────────────────────────────────
    rollback_changes: async (_params, bb) => {
      if (!bb.fileEdited) {
        log('No edits produced — skipping rollback');
        return true;
      }

      const file = bb.currentCandidate as string;
      const testFile = bb.generatedTestFile as string | undefined;
      if (file) {
        const rb = await host.exec('git', ['checkout', '--', file], { cwd: config.repoRoot });
        if (rb.code !== 0) {
          log(`Rollback FAILED for ${file} (stderr=${(rb.stderr || '').trim()})`);
        }
        if (testFile) {
          await host.exec('git', ['checkout', '--', testFile], { cwd: config.repoRoot });
        }

        // Rollback related files from multi-file patches
        const relatedEdits = bb.relatedEdits as { path: string; original: string }[] | undefined;
        if (relatedEdits && relatedEdits.length > 0) {
          for (const edit of relatedEdits) {
            host.writeFile(edit.path, edit.original);
            log(`Rolled back related file ${edit.path.split(/[/\\]/).pop()}`);
          }
          bb.relatedEdits = undefined;
        }

        const nowQuarantined = quarantineFile(file);
        if (nowQuarantined) {
          log(`Quarantined ${file} (${quarantineThreshold} failures)`);
        }
        log(`Rolled back ${file}`);

        // Record rollback provenance
        const focus = (bb.focus as string) || 'typefix';
        const rollbackReason = !(bb.compilation_passed as boolean)
          ? 'compilation_failed'
          : !(bb.tests_passed as boolean)
            ? 'tests_failed'
            : !(bb.quality_improved as boolean)
              ? 'no_quality_improvement'
              : 'unknown';
        recordProvenance({
          timestamp: new Date().toISOString(),
          candidate: file,
          focus,
          errorsBefore: (bb.typeErrorCount as number) || 0,
          errorsAfter: (bb.quality_typeErrors as number) || 0,
          fileErrorsBefore: (bb.fileErrorsBefore as number) || 0,
          fileErrorsAfter: (bb.fileErrorsAfter as number) || 0,
          symbolsTargeted: (bb.symbolsTargeted as string[]) || [],
          relatedFilesTouched: (relatedEdits || []).map(e => e.path),
          patchCount: 1,
          rollbackReason,
          result: 'rolled_back',
        }, config.stateDir, host);
      }
      bb.generatedTestFile = undefined;
      return true;
    },

    // ── Advance Candidate ──────────────────────────────────────────────
    advance_candidate: async (_params, bb) => {
      const candidates = bb.candidates as string[];
      const idx = ((bb.candidateIndex as number) || 0) + 1;
      bb.candidateIndex = idx;
      bb.has_candidates = idx < (candidates?.length || 0);
      if (bb.has_candidates) {
        log(`Advanced to candidate ${idx + 1}/${candidates.length}`);
      } else {
        log(`All candidates exhausted`);
      }
      return bb.has_candidates as boolean;
    },

    // ── Reporting ──────────────────────────────────────────────────────
    report_results: async (_params, bb) => {
      const before = (bb.quality_before as number) || 0;
      const after = (bb.quality_after as number) || 0;
      const delta = after - before;
      const iTokens = (bb.inputTokens as number) || 0;
      const oTokens = (bb.outputTokens as number) || 0;
      const typeErrors = (bb.quality_typeErrors as number) ?? '?';
      const testsPassed = (bb.quality_testsPassed as number) ?? '?';
      const testsTotal = (bb.quality_testsTotal as number) ?? '?';
      console.log(
        `[daemon] Cycle complete | quality: ${after.toFixed(3)} (${delta >= 0 ? '+' : ''}${delta.toFixed(3)}) | ` +
        `types: ${typeErrors} errors | tests: ${testsPassed}/${testsTotal} | ` +
        `tokens: ${iTokens}i/${oTokens}o`,
      );
      return true;
    },

    report_no_candidates: async (_params, bb) => {
      const focus = (bb.focus as string) || 'unknown';
      console.log(`[daemon] No candidates for focus: ${focus} — fast-fail`);
      return true;
    },

    // ── Knowledge Compression ──────────────────────────────────────────
    compress_knowledge: async (_params, bb) => {
      const wisdomPath = `${config.stateDir}/accumulated-wisdom.json`;
      const wisdom = (bb.wisdom as unknown[]) || [];
      const delta = ((bb.quality_after as number) || 0) - ((bb.quality_before as number) || 0);

      if (delta !== 0 || bb.fileEdited) {
        wisdom.push({
          cycle: bb.cycleNumber,
          focus: bb.focus,
          delta,
          candidate: bb.currentCandidate,
          timestamp: new Date().toISOString(),
        });
        while (wisdom.length > 200) wisdom.shift();
        host.writeFile(wisdomPath, JSON.stringify(wisdom, null, 2));
        log(`Saved ${wisdom.length} wisdom entries`);
      }
      return true;
    },

    // ── Motivation ─────────────────────────────────────────────────────
    praise_improvement: async (_params, _bb, ctx) => {
      ctx.emit('motivation:cycle_complete', { energy_level: 1.2 });
      ctx.emit('feedback:update_metric', { name: 'positive_energy', value: 1.0 });
      return true;
    },

    integrate_shadow: async (_params, _bb, ctx) => {
      ctx.emit('motivation:cycle_complete', { energy_level: 0.9 });
      ctx.emit('feedback:update_metric', { name: 'positive_energy', value: 0.6 });
      return true;
    },

    // ── Scheduler Job Handlers ──────────────────────────────────────────
    // These fire when @scheduler unpauses and triggers periodic jobs.
    // The scheduler emits the job's `action` event; these handlers
    // are registered via runtime.registerAction() to respond.

    'daemon:quality_heartbeat': async (_params, _bb, ctx) => {
      const tsc = await host.exec('npx', tscCheckArgs(config.stateDir),
        { cwd: config.repoRoot, timeoutMs: 120_000 });
      const errors = (tsc.stdout + tsc.stderr).split('\n')
        .filter(l => /error TS\d{4}:/.test(l)).length;
      ctx.emit('daemon:raw_quality', { value: errors === 0 ? 1 : Math.max(0, 1 - errors / 3500), source: 'heartbeat' });
      log(`Quality heartbeat: ${errors} type errors`);
      return true;
    },

    'daemon:test_watchdog': async (_params, _bb, ctx) => {
      const test = await host.exec('npx',
        ['vitest', 'run', '--reporter=json', '--no-color', '--passWithNoTests'],
        { cwd: config.repoRoot, timeoutMs: 120_000 });
      let passed = 0, total = 0;
      try {
        const json = JSON.parse(test.stdout);
        total = json.numTotalTests || 0;
        passed = json.numPassedTests || 0;
      } catch { /* parse failure */ }
      ctx.emit('daemon:test_watchdog_result', { passed, total, exitCode: test.code });
      log(`Test watchdog: ${passed}/${total} passed`);
      return true;
    },

    'daemon:evaluate_consciousness': async (_params, bb, ctx) => {
      const cycleCount = (bb.cycleNumber as number) || 0;
      const quality = (bb.quality_after as number) || 0;
      ctx.emit('daemon:consciousness_eval_result', {
        cycles: cycleCount,
        quality,
        wisdom_count: Array.isArray(bb.wisdom) ? (bb.wisdom as unknown[]).length : 0,
        timestamp: Date.now(),
      });
      log(`Consciousness eval: cycle=${cycleCount}, quality=${quality.toFixed(3)}`);
      return true;
    },
  };
  return actions;
}
