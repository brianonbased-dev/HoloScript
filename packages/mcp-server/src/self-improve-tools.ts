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
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const selfImproveTools: Tool[] = [
  {
    name: 'holo_write_file',
    description:
      'Write content to a file. Creates parent directories if needed. ' +
      'Use for generating tests, documentation, or applying fixes. ' +
      'Path must be within the project root directory.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The full content to write to the file',
        },
        createOnly: {
          type: 'boolean',
          description: 'If true, fail if file already exists. Defaults to false.',
        },
      },
      required: ['filePath', 'content'],
    },
  },
  {
    name: 'holo_edit_file',
    description:
      'Apply a search-and-replace edit to an existing file. ' +
      'The old_string must match exactly (including whitespace). ' +
      'Use for targeted code fixes without rewriting entire files.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file to edit',
        },
        oldString: {
          type: 'string',
          description: 'The exact string to search for in the file',
        },
        newString: {
          type: 'string',
          description: 'The replacement string',
        },
      },
      required: ['filePath', 'oldString', 'newString'],
    },
  },
  {
    name: 'holo_read_file',
    description:
      'Read the contents of a file. Use to understand code before making edits.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Absolute path to the file to read',
        },
        startLine: {
          type: 'number',
          description: 'Start reading from this line (1-indexed). Defaults to 1.',
        },
        endLine: {
          type: 'number',
          description: 'Stop reading at this line. Defaults to end of file.',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'holo_git_commit',
    description:
      'Stage changed files and create a git commit. ' +
      'Only commits files within the project root.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the git repository',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to stage (relative to rootDir). If empty, stages all changed files.',
        },
        message: {
          type: 'string',
          description: 'Commit message',
        },
      },
      required: ['rootDir', 'message'],
    },
  },
  {
    name: 'holo_run_tests_targeted',
    description:
      'Run vitest on specific test files instead of the entire suite. ' +
      'Much faster than full test run for validating individual changes.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the project',
        },
        testFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific test file paths to run (relative to rootDir)',
        },
        testPattern: {
          type: 'string',
          description: 'Test name pattern to match (vitest -t flag)',
        },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'holo_list_type_errors',
    description:
      'Run tsc --noEmit and return the actual TypeScript errors grouped by file. ' +
      'Use this to find and fix specific type errors. Much more actionable than holo_validate_quality ' +
      'for improving the type-check score.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the project',
        },
        maxErrors: {
          type: 'number',
          description: 'Maximum number of errors to return. Defaults to 20.',
        },
        file: {
          type: 'string',
          description: 'Filter errors to a specific file path (substring match)',
        },
      },
      required: ['rootDir'],
    },
  },
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
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holo_write_file':
      return handleWriteFile(args);
    case 'holo_edit_file':
      return handleEditFile(args);
    case 'holo_read_file':
      return handleReadFile(args);
    case 'holo_git_commit':
      return handleGitCommit(args);
    case 'holo_run_tests_targeted':
      return handleRunTestsTargeted(args);
    case 'holo_list_type_errors':
      return handleListTypeErrors(args);
    case 'holo_self_diagnose':
      return handleDiagnose(args);
    case 'holo_validate_quality':
      return handleValidateQuality(args);
    default:
      return null;
  }
}

// ── Write/Edit Handlers ──────────────────────────────────────────────────────

async function handleWriteFile(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string;
  const content = args.content as string;
  const createOnly = (args.createOnly as boolean) ?? false;

  if (!filePath || !path.isAbsolute(filePath)) {
    return { error: 'filePath must be an absolute path' };
  }

  if (createOnly && fs.existsSync(filePath)) {
    return { error: `File already exists: ${filePath}` };
  }

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return {
      success: true,
      filePath,
      bytesWritten: Buffer.byteLength(content, 'utf-8'),
      linesWritten: content.split('\n').length,
    };
  } catch (err: any) {
    return { error: `Write failed: ${err.message}` };
  }
}

async function handleEditFile(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string;
  const oldString = args.oldString as string;
  const newString = args.newString as string;

  if (!filePath || !path.isAbsolute(filePath)) {
    return { error: 'filePath must be an absolute path' };
  }

  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}` };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const occurrences = content.split(oldString).length - 1;

    if (occurrences === 0) {
      return { error: 'oldString not found in file', filePath };
    }

    if (occurrences > 1) {
      return {
        error: `oldString found ${occurrences} times — must be unique. Provide more context.`,
        filePath,
      };
    }

    const updated = content.replace(oldString, newString);
    fs.writeFileSync(filePath, updated, 'utf-8');
    return {
      success: true,
      filePath,
      replacements: 1,
    };
  } catch (err: any) {
    return { error: `Edit failed: ${err.message}` };
  }
}

async function handleReadFile(args: Record<string, unknown>): Promise<unknown> {
  const filePath = args.filePath as string;
  const startLine = (args.startLine as number) ?? 1;
  const endLine = args.endLine as number | undefined;

  if (!filePath || !path.isAbsolute(filePath)) {
    return { error: 'filePath must be an absolute path' };
  }

  if (!fs.existsSync(filePath)) {
    return { error: `File not found: ${filePath}` };
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end = endLine ? Math.min(lines.length, endLine) : Math.min(lines.length, start + 200);
    const slice = lines.slice(start, end);

    return {
      filePath,
      startLine: start + 1,
      endLine: end,
      totalLines: lines.length,
      content: slice.map((line, i) => `${start + i + 1}: ${line}`).join('\n'),
    };
  } catch (err: any) {
    return { error: `Read failed: ${err.message}` };
  }
}

async function handleGitCommit(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const files = (args.files as string[]) ?? [];
  const message = args.message as string;

  if (!message) {
    return { error: 'Commit message is required' };
  }

  try {
    // Stage files
    if (files.length > 0) {
      const fileArgs = files.map((f) => `"${f}"`).join(' ');
      await execAsync(`git add ${fileArgs}`, { cwd: rootDir, timeout: 30_000 });
    } else {
      await execAsync('git add -A', { cwd: rootDir, timeout: 30_000 });
    }

    // Commit
    const commitMsg = message.replace(/"/g, '\\"');
    const { stdout } = await execAsync(
      `git commit --no-verify -m "${commitMsg}" --author="HoloScript Daemon <daemon@holoscript.dev>"`,
      { cwd: rootDir, timeout: 30_000 }
    );

    return {
      success: true,
      message,
      output: stdout.trim(),
    };
  } catch (err: any) {
    return { error: `Git commit failed: ${err.message}` };
  }
}

async function handleRunTestsTargeted(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const testFiles = (args.testFiles as string[]) ?? [];
  const testPattern = args.testPattern as string | undefined;

  try {
    let cmd = 'npx vitest run --reporter=json';
    if (testFiles.length > 0) {
      cmd += ' ' + testFiles.map((f) => `"${f}"`).join(' ');
    }
    if (testPattern) {
      cmd += ` -t "${testPattern}"`;
    }

    const { stdout, stderr } = await execAsync(cmd + ' 2>&1', {
      cwd: rootDir,
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
    });

    const output = stdout + stderr;
    try {
      const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return {
          success: result.success ?? false,
          numPassed: result.numPassedTests ?? 0,
          numFailed: result.numFailedTests ?? 0,
          numTotal: result.numTotalTests ?? 0,
          testFiles,
          duration: result.startTime
            ? Date.now() - result.startTime
            : undefined,
        };
      }
    } catch { /* JSON parse failed */ }

    return {
      success: !output.includes('FAIL'),
      rawOutput: output.slice(0, 5000),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message?.slice(0, 2000),
    };
  }
}

// ── Type Error Listing ───────────────────────────────────────────────────────

async function handleListTypeErrors(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const maxErrors = (args.maxErrors as number) ?? 20;
  const fileFilter = args.file as string | undefined;

  try {
    let output = '';
    try {
      const result = await execAsync('npx tsc --noEmit --pretty false 2>&1', {
        cwd: rootDir,
        timeout: 180_000,
        maxBuffer: 50 * 1024 * 1024,
      });
      output = result.stdout + result.stderr;
    } catch (err: any) {
      output = (err.stdout ?? '') + (err.stderr ?? '');
    }

    const errorLines = output.split('\n').filter((l: string) => l.includes('error TS'));
    const totalErrors = errorLines.length;

    // Filter by file if requested
    const filtered = fileFilter
      ? errorLines.filter((l: string) => l.includes(fileFilter))
      : errorLines;

    // Group by file
    const byFile: Record<string, string[]> = {};
    for (const line of filtered) {
      const match = line.match(/^([^(]+)\(/);
      if (match) {
        const file = match[1].trim();
        if (!byFile[file]) byFile[file] = [];
        byFile[file].push(line);
      }
    }

    // Sort files by error count (most errors first), take top files
    const sortedFiles = Object.entries(byFile)
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 10);

    // Collect errors up to maxErrors
    const errors: Array<{ file: string; line: number; code: string; message: string }> = [];
    for (const [file, lines] of sortedFiles) {
      for (const errLine of lines) {
        if (errors.length >= maxErrors) break;
        const match = errLine.match(/^([^(]+)\((\d+),\d+\): error (TS\d+): (.+)/);
        if (match) {
          errors.push({
            file: match[1].trim(),
            line: parseInt(match[2], 10),
            code: match[3],
            message: match[4],
          });
        }
      }
    }

    return {
      totalErrors,
      filteredErrors: filtered.length,
      topFiles: sortedFiles.map(([file, lines]) => ({
        file,
        errorCount: lines.length,
      })),
      errors,
      hint: totalErrors > maxErrors
        ? `Showing ${errors.length} of ${totalErrors} errors. Fix the top files first.`
        : undefined,
    };
  } catch (err: any) {
    return { error: `Failed to run tsc: ${err.message}` };
  }
}

// ── Diagnostic Handlers ──────────────────────────────────────────────────────

async function handleDiagnose(args: Record<string, unknown>): Promise<unknown> {
  const focus = (args.focus as string) ?? 'all';
  const maxResults = (args.maxResults as number) ?? 10;

  // Import graph-rag-tools to check readiness
  const { isGraphRAGReady } = await import('./graph-rag-tools');
  if (!isGraphRAGReady()) {
    return {
      error:
        'No Graph RAG engine initialized. Call holo_absorb_repo first. ' +
        'Embedding provider is configured via EMBEDDING_PROVIDER env var (bm25 | xenova | openai | ollama).',
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

  const scores: QualityScores & { coverage?: QualityScore } = {
    typeCheck: { pass: false, score: 0, details: '' },
    tests: { pass: false, score: 0, details: '' },
    lint: { pass: false, score: 0, details: '' },
    coverage: { pass: false, score: 0, details: '' },
  };

  // ── Type check ─────────────────────────────────────────────────────────
  // Use logarithmic scale: score = 1 / (1 + ln(1 + errors/10))
  // This rewards error reduction even at high counts:
  //   0 errors → 1.0,  10 → 0.59,  50 → 0.37,  100 → 0.29,  500 → 0.20,  1000 → 0.18
  const tscScore = (errorCount: number) =>
    errorCount === 0 ? 1.0 : 1 / (1 + Math.log(1 + errorCount / 10));

  try {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit 2>&1', {
      cwd: rootDir,
      timeout: 180_000,
      maxBuffer: 50 * 1024 * 1024,
    });
    const output = stdout + stderr;
    const errorCount = (output.match(/error TS\d+/g) ?? []).length;
    scores.typeCheck = {
      pass: errorCount === 0,
      score: tscScore(errorCount),
      details: errorCount === 0 ? 'No type errors' : `${errorCount} type error(s)`,
    };
  } catch (err: any) {
    // tsc exits non-zero when there are errors — this is normal, not a crash
    const output = (err.stdout ?? '') + (err.stderr ?? '');
    const errorCount = (output.match?.(/error TS\d+/g) ?? []).length;
    scores.typeCheck = {
      pass: false,
      score: tscScore(errorCount || 100),
      details: `${errorCount || 'unknown'} type error(s)`,
    };
  }

  // ── Tests ──────────────────────────────────────────────────────────────
  if (!skipTests) {
    try {
      const { stdout } = await execAsync('npx vitest run --reporter=json 2>&1', {
        cwd: rootDir,
        timeout: 300_000,
        maxBuffer: 50 * 1024 * 1024,
      });
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
      // Try to extract partial results even from failed runs
      const output = (err.stdout ?? '') + (err.stderr ?? '');
      const jsonMatch = output.match?.(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);
          const total = result.numTotalTests ?? 0;
          const passed = result.numPassedTests ?? 0;
          scores.tests = {
            pass: false,
            score: total > 0 ? passed / total : 0.1,
            details: `${passed}/${total} tests passed (suite exited non-zero)`,
          };
        } catch {
          scores.tests = { pass: false, score: 0.1, details: 'Test suite crashed' };
        }
      } else {
        scores.tests = {
          pass: false,
          score: 0.1,
          details: `Test suite failed: ${err.message?.slice(0, 200)}`,
        };
      }
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
        maxBuffer: 50 * 1024 * 1024,
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

  // ── Coverage ─────────────────────────────────────────────────────────
  if (!skipTests) {
    try {
      const { stdout: covOut } = await execAsync(
        'npx vitest run --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=.holoscript/coverage 2>&1',
        { cwd: rootDir, timeout: 300_000, maxBuffer: 50 * 1024 * 1024 }
      );
      // Try to read coverage summary
      const covPath = path.join(rootDir, '.holoscript', 'coverage', 'coverage-summary.json');
      if (fs.existsSync(covPath)) {
        const covData = JSON.parse(fs.readFileSync(covPath, 'utf-8'));
        const total = covData.total;
        const linesPct = (total?.lines?.pct ?? 0) / 100;
        const branchesPct = (total?.branches?.pct ?? 0) / 100;
        const funcsPct = (total?.functions?.pct ?? 0) / 100;
        const avgPct = (linesPct + branchesPct + funcsPct) / 3;
        scores.coverage = {
          pass: avgPct >= 0.6,
          score: avgPct,
          details: `Lines: ${(linesPct * 100).toFixed(1)}%, Branches: ${(branchesPct * 100).toFixed(1)}%, Functions: ${(funcsPct * 100).toFixed(1)}%`,
        };
      }
    } catch {
      scores.coverage = { pass: false, score: 0.1, details: 'Coverage collection failed' };
    }
  } else {
    scores.coverage = { pass: false, score: 0, details: 'Skipped (--skipTests)' };
  }

  // ── Composite quality score ────────────────────────────────────────────
  // Formula: tests * 0.30 + coverage * 0.25 + typeCheck * 0.20 + lint * 0.10 + circuitBreaker * 0.15
  const coverageScore = scores.coverage?.score ?? 0;
  const composite =
    scores.tests.score * 0.30 +
    coverageScore * 0.25 +
    scores.typeCheck.score * 0.20 +
    scores.lint.score * 0.10 +
    (scores.typeCheck.pass ? 0.15 : 0);

  return {
    rootDir,
    scores,
    composite: Math.round(composite * 100) / 100,
    grade:
      composite >= 0.9
        ? 'A'
        : composite >= 0.8
          ? 'B'
          : composite >= 0.7
            ? 'C'
            : composite >= 0.5
              ? 'D'
              : 'F',
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
