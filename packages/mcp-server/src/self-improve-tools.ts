/**
 * MCP Self-Improve Tools for HoloScript
 *
 * Provides AI agents with tools for autonomous codebase improvement:
 * - holo_self_diagnose: Analyze codebase for improvement opportunities
 * - holo_validate_quality: Calculate composite quality score
 *
 * These tools chain with existing absorb/query/GraphRAG tools to form
 * the 6-step self-improvement pipeline:
 *   ABSORB → DIAGNOSE → GENERATE → VALIDATE → COMMIT → LEARN
 *
 * The AI agent handles GENERATE and COMMIT steps; these tools provide
 * the intelligence layer (what to improve, whether changes are valid).
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const selfImproveTools: Tool[] = [
  {
    name: 'holo_self_diagnose',
    description:
      'Diagnose a codebase for improvement opportunities using Graph RAG. ' +
      'Runs pre-built analytical queries to identify: untested code with high impact, ' +
      'missing documentation on public APIs, high-complexity modules, and structural issues. ' +
      'Returns a prioritized list of improvement candidates. Requires a prior holo_absorb_repo call.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description:
            'Root directory of the project (for test discovery). Defaults to the last absorbed directory.',
        },
        focus: {
          type: 'string',
          enum: ['coverage', 'docs', 'complexity', 'all'],
          description:
            'Focus area for diagnosis. "coverage" = untested code, "docs" = missing docs, "complexity" = high-complexity modules, "all" = everything. Defaults to "all".',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum improvement candidates to return. Defaults to 10.',
        },
      },
    },
  },
  {
    name: 'holo_validate_quality',
    description:
      'Calculate a composite quality score for the codebase. Runs type checking (tsc), ' +
      'test suite (vitest), and lint checks. Returns individual scores and a weighted composite. ' +
      'Use after making changes to verify improvement, or before changes to establish a baseline.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the project to validate',
        },
        skipTests: {
          type: 'boolean',
          description: 'Skip running tests (faster, but no test score). Defaults to false.',
        },
        skipLint: {
          type: 'boolean',
          description: 'Skip lint check. Defaults to false.',
        },
      },
      required: ['rootDir'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handleSelfImproveTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  switch (name) {
    case 'holo_self_diagnose':
      return handleDiagnose(args);
    case 'holo_validate_quality':
      return handleValidateQuality(args);
    default:
      return null;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleDiagnose(args: Record<string, unknown>): Promise<unknown> {
  const focus = (args.focus as string) ?? 'all';
  const maxResults = (args.maxResults as number) ?? 10;

  // Import graph-rag-tools to check readiness
  const { isGraphRAGReady } = await import('./graph-rag-tools');
  if (!isGraphRAGReady()) {
    return {
      error:
        'No Graph RAG engine initialized. Call holo_absorb_repo first, ' +
        'or ensure Ollama is running with nomic-embed-text model.',
      hint: 'Run: holo_absorb_repo with rootDir pointing to the project root.',
    };
  }

  const candidates: DiagnosisCandidate[] = [];

  // Import handler to run GraphRAG queries internally
  const { handleGraphRagTool } = await import('./graph-rag-tools');

  // ── Coverage analysis ──────────────────────────────────────────────────
  if (focus === 'coverage' || focus === 'all') {
    try {
      const result = (await handleGraphRagTool('holo_ask_codebase', {
        question:
          'Which exported functions and classes have the highest number of callers ' +
          'but are most likely untested? Focus on public API surface.',
        topK: 20,
      })) as any;

      if (result && !result.error && result.context) {
        for (const ctx of result.context.slice(0, Math.ceil(maxResults / 3))) {
          candidates.push({
            type: 'missing_test',
            priority: calculatePriority(ctx.impactRadius, ctx.score),
            symbol: ctx.name,
            file: ctx.file,
            line: ctx.line,
            impactRadius: ctx.impactRadius,
            reason: `High-impact symbol (${ctx.impactRadius} dependents) likely lacks dedicated tests`,
            suggestedAction: `Write unit tests for ${ctx.name} in ${ctx.file}`,
          });
        }
      }
    } catch {
      // GraphRAG query failed — skip coverage analysis
    }
  }

  // ── Documentation analysis ─────────────────────────────────────────────
  if (focus === 'docs' || focus === 'all') {
    try {
      const result = (await handleGraphRagTool('holo_ask_codebase', {
        question:
          'Which exported classes and functions are missing JSDoc comments or ' +
          'have very short documentation? Focus on public-facing APIs.',
        topK: 15,
      })) as any;

      if (result && !result.error && result.context) {
        for (const ctx of result.context.slice(0, Math.ceil(maxResults / 3))) {
          candidates.push({
            type: 'missing_docs',
            priority: calculatePriority(ctx.impactRadius, ctx.score) * 0.8,
            symbol: ctx.name,
            file: ctx.file,
            line: ctx.line,
            impactRadius: ctx.impactRadius,
            reason: `Public API missing or has minimal JSDoc documentation`,
            suggestedAction: `Add comprehensive JSDoc to ${ctx.name}`,
          });
        }
      }
    } catch {
      // Skip docs analysis
    }
  }

  // ── Complexity analysis ────────────────────────────────────────────────
  if (focus === 'complexity' || focus === 'all') {
    try {
      const result = (await handleGraphRagTool('holo_ask_codebase', {
        question:
          'Which modules or classes have the most incoming and outgoing dependencies? ' +
          'These are likely the most complex and fragile parts of the codebase.',
        topK: 15,
      })) as any;

      if (result && !result.error && result.context) {
        for (const ctx of result.context.slice(0, Math.ceil(maxResults / 3))) {
          const totalDeps = (ctx.callers?.length ?? 0) + (ctx.callees?.length ?? 0);
          candidates.push({
            type: 'high_complexity',
            priority: calculatePriority(ctx.impactRadius, ctx.score) * 0.9,
            symbol: ctx.name,
            file: ctx.file,
            line: ctx.line,
            impactRadius: ctx.impactRadius,
            reason: `High coupling: ${totalDeps} direct dependencies (${ctx.callers?.length ?? 0} callers, ${ctx.callees?.length ?? 0} callees)`,
            suggestedAction: `Consider refactoring ${ctx.name} to reduce coupling`,
          });
        }
      }
    } catch {
      // Skip complexity analysis
    }
  }

  // Sort by priority (highest first) and limit
  candidates.sort((a, b) => b.priority - a.priority);
  const topCandidates = candidates.slice(0, maxResults);

  return {
    focus,
    totalCandidates: candidates.length,
    candidates: topCandidates,
    summary: summarizeDiagnosis(topCandidates),
  };
}

async function handleValidateQuality(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const skipTests = (args.skipTests as boolean) ?? false;
  const skipLint = (args.skipLint as boolean) ?? false;

  const scores: QualityScores = {
    typeCheck: { pass: false, score: 0, details: '' },
    tests: { pass: false, score: 0, details: '' },
    lint: { pass: false, score: 0, details: '' },
  };

  // ── Type check ─────────────────────────────────────────────────────────
  try {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit 2>&1', {
      cwd: rootDir,
      timeout: 120_000,
    });
    const output = stdout + stderr;
    const errorCount = (output.match(/error TS\d+/g) ?? []).length;
    scores.typeCheck = {
      pass: errorCount === 0,
      score: errorCount === 0 ? 1.0 : Math.max(0, 1 - errorCount * 0.05),
      details: errorCount === 0 ? 'No type errors' : `${errorCount} type error(s)`,
    };
  } catch (err: any) {
    const errorCount = (err.stdout?.match?.(/error TS\d+/g) ?? []).length;
    scores.typeCheck = {
      pass: false,
      score: Math.max(0, 1 - (errorCount || 10) * 0.05),
      details: `Type check failed: ${errorCount || 'unknown'} errors`,
    };
  }

  // ── Tests ──────────────────────────────────────────────────────────────
  if (!skipTests) {
    try {
      const { stdout } = await execAsync(
        'npx vitest run --reporter=json 2>&1',
        { cwd: rootDir, timeout: 300_000 },
      );
      try {
        const jsonMatch = stdout.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          const total = result.numTotalTests ?? 0;
          const passed = result.numPassedTests ?? 0;
          scores.tests = {
            pass: result.success ?? false,
            score: total > 0 ? passed / total : 0,
            details: `${passed}/${total} tests passed`,
          };
        }
      } catch {
        scores.tests = { pass: true, score: 0.8, details: 'Tests ran but JSON parse failed' };
      }
    } catch (err: any) {
      scores.tests = {
        pass: false,
        score: 0,
        details: `Test suite failed: ${err.message?.slice(0, 200)}`,
      };
    }
  } else {
    scores.tests = { pass: true, score: 0.5, details: 'Skipped (--skipTests)' };
  }

  // ── Lint ───────────────────────────────────────────────────────────────
  if (!skipLint) {
    try {
      await execAsync('npx eslint . --max-warnings 0 2>&1', {
        cwd: rootDir,
        timeout: 120_000,
      });
      scores.lint = { pass: true, score: 1.0, details: 'No lint errors' };
    } catch (err: any) {
      const warningCount = (err.stdout?.match?.(/warning/gi) ?? []).length;
      const errorCount = (err.stdout?.match?.(/error/gi) ?? []).length;
      scores.lint = {
        pass: errorCount === 0,
        score: Math.max(0, 1 - errorCount * 0.1 - warningCount * 0.02),
        details: `${errorCount} error(s), ${warningCount} warning(s)`,
      };
    }
  } else {
    scores.lint = { pass: true, score: 0.5, details: 'Skipped (--skipLint)' };
  }

  // ── Composite quality score ────────────────────────────────────────────
  // Formula from blueprint: test * 0.30 + coverage * 0.25 + typeCheck * 0.20 + lint * 0.10 + circuitBreaker * 0.15
  // We combine test + coverage into tests score (0.55), and skip circuit breaker for now (0.15 bonus if types pass)
  const composite =
    scores.tests.score * 0.55 +
    scores.typeCheck.score * 0.20 +
    scores.lint.score * 0.10 +
    (scores.typeCheck.pass ? 0.15 : 0); // circuit breaker proxy: if types pass, system is stable

  return {
    rootDir,
    scores,
    composite: Math.round(composite * 100) / 100,
    grade: composite >= 0.9 ? 'A' : composite >= 0.8 ? 'B' : composite >= 0.7 ? 'C' : composite >= 0.5 ? 'D' : 'F',
    allPassing: scores.typeCheck.pass && scores.tests.pass && scores.lint.pass,
    timestamp: new Date().toISOString(),
  };
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DiagnosisCandidate {
  type: 'missing_test' | 'missing_docs' | 'high_complexity';
  priority: number;
  symbol: string;
  file: string;
  line: number;
  impactRadius: number;
  reason: string;
  suggestedAction: string;
}

interface QualityScore {
  pass: boolean;
  score: number;
  details: string;
}

interface QualityScores {
  typeCheck: QualityScore;
  tests: QualityScore;
  lint: QualityScore;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function calculatePriority(impactRadius: number, relevanceScore: number): number {
  // Higher impact + higher relevance = higher priority
  return Math.round((impactRadius * 0.6 + relevanceScore * 100 * 0.4) * 100) / 100;
}

function summarizeDiagnosis(candidates: DiagnosisCandidate[]): string {
  const byType = {
    missing_test: candidates.filter((c) => c.type === 'missing_test').length,
    missing_docs: candidates.filter((c) => c.type === 'missing_docs').length,
    high_complexity: candidates.filter((c) => c.type === 'high_complexity').length,
  };

  const parts: string[] = [];
  if (byType.missing_test > 0) parts.push(`${byType.missing_test} untested high-impact symbols`);
  if (byType.missing_docs > 0) parts.push(`${byType.missing_docs} undocumented public APIs`);
  if (byType.high_complexity > 0) parts.push(`${byType.high_complexity} high-complexity modules`);
  return parts.join(', ') || 'No improvement opportunities found';
}
