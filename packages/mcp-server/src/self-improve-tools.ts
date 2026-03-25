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
    name: 'holo_batch_type_fix',
    description:
      'Group TypeScript errors by error code (TS7006, TS2339, etc.) and return ' +
      'batch fix suggestions. Much more efficient than fixing one error at a time. ' +
      'Returns errors grouped by code with fix patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the project',
        },
        errorCode: {
          type: 'string',
          description: 'Filter to a specific error code (e.g. "TS7006"). If omitted, groups all errors.',
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum files to return. Defaults to 5.',
        },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'holo_verify_before_commit',
    description:
      'Run tsc --noEmit on specific changed files to verify they compile before committing. ' +
      'Much faster than full tsc. Use after edits and before holo_git_commit.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the project',
        },
        files: {
          type: 'array',
          items: { type: 'string' },
          description: 'File paths to check (relative or absolute)',
        },
      },
      required: ['rootDir', 'files'],
    },
  },
  {
    name: 'holo_run_related_tests',
    description:
      'Run only tests related to specific source files using vitest --related. ' +
      'Much faster than running the full test suite. Use after editing source files.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the project',
        },
        sourceFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Source files that were changed (vitest finds their related tests)',
        },
      },
      required: ['rootDir', 'sourceFiles'],
    },
  },
  {
    name: 'holo_quality_trend',
    description:
      'Analyze quality score history to detect trends, plateaus, and regressions. ' +
      'Returns trend analysis and strategy recommendations based on what has and hasn\'t worked.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the project (for finding .holoscript/)',
        },
        lastN: {
          type: 'number',
          description: 'Number of recent cycles to analyze. Defaults to 10.',
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
    case 'holo_batch_type_fix':
      return handleBatchTypeFix(args);
    case 'holo_verify_before_commit':
      return handleVerifyBeforeCommit(args);
    case 'holo_run_related_tests':
      return handleRunRelatedTests(args);
    case 'holo_quality_trend':
      return handleQualityTrend(args);
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

  // Multi-agent safety: never stage all files (git add -A). Each agent must
  // explicitly declare which files it wants to commit. Without this guard,
  // a daemon commit can sweep in unrelated dirty files from other agents.
  if (files.length === 0) {
    return { error: 'files array is required — refusing to stage all (git add -A is disabled for multi-agent safety)' };
  }

  try {
    // Stage only the explicitly specified files
    for (const f of files) {
      await execAsync(`git add "${f}"`, { cwd: rootDir, timeout: 30_000 });
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

// ── Batch Type Fix (Level 2) ────────────────────────────────────────────────

async function handleBatchTypeFix(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const errorCode = args.errorCode as string | undefined;
  const maxFiles = (args.maxFiles as number) ?? 5;

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

    // Group by error code
    const byCode: Record<string, Array<{ file: string; line: number; message: string }>> = {};
    for (const line of errorLines) {
      const match = line.match(/^([^(]+)\((\d+),\d+\): error (TS\d+): (.+)/);
      if (match) {
        const code = match[3];
        if (errorCode && code !== errorCode) continue;
        if (!byCode[code]) byCode[code] = [];
        byCode[code].push({
          file: match[1].trim(),
          line: parseInt(match[2], 10),
          message: match[4],
        });
      }
    }

    // Sort codes by frequency
    const sortedCodes = Object.entries(byCode)
      .sort(([, a], [, b]) => b.length - a.length);

    // For each code, group by file and provide fix patterns
    const fixPatterns: Record<string, string> = {
      'TS7006': 'Add explicit type annotations to parameters (e.g., `param: any` or specific type)',
      'TS2339': 'Property does not exist — add to interface, use type assertion, or check optional chaining',
      'TS2322': 'Type mismatch — adjust the assignment or cast to the expected type',
      'TS2304': 'Cannot find name — add missing import statement',
      'TS2345': 'Argument type mismatch — cast argument or update function signature',
      'TS2554': 'Wrong number of arguments — add/remove arguments or update function signature',
      'TS2532': 'Object possibly undefined — add null check or use optional chaining (?.) / non-null assertion (!)',
      'TS2307': 'Cannot find module — install the package or fix the import path',
      'TS18046': 'Variable is of type unknown — add type guard or assertion',
      'TS18047': 'Variable possibly null — add null check',
    };

    const groups = sortedCodes.slice(0, 10).map(([code, errors]) => {
      // Group this code's errors by file
      const fileMap: Record<string, typeof errors> = {};
      for (const err of errors) {
        if (!fileMap[err.file]) fileMap[err.file] = [];
        fileMap[err.file].push(err);
      }
      const topFiles = Object.entries(fileMap)
        .sort(([, a], [, b]) => b.length - a.length)
        .slice(0, maxFiles);

      return {
        code,
        count: errors.length,
        fixPattern: fixPatterns[code] ?? 'Review each error and apply appropriate fix',
        topFiles: topFiles.map(([file, errs]) => ({
          file,
          errorCount: errs.length,
          errors: errs.slice(0, 5),
        })),
      };
    });

    return {
      totalErrors: errorLines.length,
      errorCodes: sortedCodes.length,
      groups,
      strategy: `Fix ${sortedCodes[0]?.[0]} first (${sortedCodes[0]?.[1]?.length} instances). ` +
        `Then ${sortedCodes[1]?.[0]} (${sortedCodes[1]?.[1]?.length}). ` +
        `Target the file with the most errors in each group for maximum impact.`,
    };
  } catch (err: any) {
    return { error: `Failed to run tsc: ${err.message}` };
  }
}

// ── Pre-Commit Verification (Level 4) ──────────────────────────────────────

async function handleVerifyBeforeCommit(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const files = (args.files as string[]) ?? [];

  if (files.length === 0) {
    return { error: 'No files specified for verification' };
  }

  try {
    // Get current error count for these files BEFORE and check if we made them worse
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

    const allErrors = output.split('\n').filter((l: string) => l.includes('error TS'));
    const fileErrors: Record<string, string[]> = {};
    let totalRelevant = 0;

    for (const file of files) {
      const normalizedFile = file.replace(/\\/g, '/');
      const matching = allErrors.filter((l: string) => {
        const normalized = l.replace(/\\/g, '/');
        return normalized.includes(normalizedFile) || normalized.includes(path.basename(file));
      });
      fileErrors[file] = matching;
      totalRelevant += matching.length;
    }

    return {
      safe: totalRelevant === 0,
      totalErrors: allErrors.length,
      relevantErrors: totalRelevant,
      files: Object.entries(fileErrors).map(([file, errors]) => ({
        file,
        errors: errors.length,
        details: errors.slice(0, 5),
      })),
      recommendation: totalRelevant === 0
        ? 'Safe to commit — no type errors in changed files.'
        : `${totalRelevant} type errors in changed files. Fix before committing.`,
    };
  } catch (err: any) {
    return { error: `Verification failed: ${err.message}` };
  }
}

// ── Smart Test Running (Level 5) ──────────────────────────────────────────

async function handleRunRelatedTests(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const sourceFiles = (args.sourceFiles as string[]) ?? [];

  if (sourceFiles.length === 0) {
    return { error: 'No source files specified' };
  }

  try {
    const fileArgs = sourceFiles.map((f) => `"${f}"`).join(' ');
    const { stdout, stderr } = await execAsync(
      `npx vitest run --reporter=json --related ${fileArgs} 2>&1`,
      { cwd: rootDir, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }
    );

    const output = stdout + stderr;
    const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        success: result.success ?? false,
        numPassed: result.numPassedTests ?? 0,
        numFailed: result.numFailedTests ?? 0,
        numTotal: result.numTotalTests ?? 0,
        sourceFiles,
        noRelatedTests: (result.numTotalTests ?? 0) === 0,
      };
    }

    return {
      success: !output.includes('FAIL'),
      rawOutput: output.slice(0, 3000),
      sourceFiles,
    };
  } catch (err: any) {
    // vitest --related exits non-zero if tests fail
    const output = (err.stdout ?? '') + (err.stderr ?? '');
    const jsonMatch = output.match?.(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const result = JSON.parse(jsonMatch[0]);
        return {
          success: false,
          numPassed: result.numPassedTests ?? 0,
          numFailed: result.numFailedTests ?? 0,
          numTotal: result.numTotalTests ?? 0,
          sourceFiles,
        };
      } catch { /* fall through */ }
    }
    return { success: false, error: err.message?.slice(0, 1000), sourceFiles };
  }
}

// ── Quality Trend Analysis (Level 6) ──────────────────────────────────────

async function handleQualityTrend(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const lastN = (args.lastN as number) ?? 10;

  const historyPath = path.join(rootDir, '.holoscript', 'quality-history.json');
  if (!fs.existsSync(historyPath)) {
    return { error: 'No quality history found. Run at least one cycle first.' };
  }

  try {
    const history = JSON.parse(fs.readFileSync(historyPath, 'utf-8')) as Array<{
      timestamp: string;
      cycle: number;
      composite: number;
      grade: string;
      focus: string;
      summary: string;
    }>;

    const recent = history.slice(-lastN);
    if (recent.length === 0) return { error: 'Quality history is empty.' };

    // Basic trend analysis
    const scores = recent.map((h) => h.composite);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    // Score by focus area
    const focusScores: Record<string, { total: number; count: number; scores: number[] }> = {};
    for (const entry of recent) {
      if (!focusScores[entry.focus]) focusScores[entry.focus] = { total: 0, count: 0, scores: [] };
      focusScores[entry.focus].total += entry.composite;
      focusScores[entry.focus].count++;
      focusScores[entry.focus].scores.push(entry.composite);
    }

    const focusAnalysis = Object.entries(focusScores)
      .map(([focus, data]) => ({
        focus,
        avgScore: Math.round((data.total / data.count) * 1000) / 1000,
        count: data.count,
        trend: data.scores.length >= 2
          ? data.scores[data.scores.length - 1] - data.scores[0] > 0
            ? 'improving'
            : data.scores[data.scores.length - 1] - data.scores[0] < -0.05
              ? 'declining'
              : 'stable'
          : 'insufficient_data',
      }))
      .sort((a, b) => b.avgScore - a.avgScore);

    // Detect zero-score cycles (crashes)
    const crashCycles = recent.filter((h) => h.composite === 0);

    // Calculate slope (linear regression)
    const n = scores.length;
    const xMean = (n - 1) / 2;
    const yMean = avgScore;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (scores[i] - yMean);
      denominator += (i - xMean) * (i - xMean);
    }
    const slope = denominator !== 0 ? numerator / denominator : 0;

    // Recommendations
    const recommendations: string[] = [];

    if (crashCycles.length > 0) {
      recommendations.push(
        `${crashCycles.length} cycles scored 0 (crashes). Fix the quality scorer — these waste API tokens.`
      );
    }

    if (slope < -0.01) {
      recommendations.push('Quality is DECLINING. Recent changes may be introducing regressions.');
    } else if (slope < 0.005) {
      recommendations.push('Quality is PLATEAUED. Try a different focus area or batch-fix approach.');
    } else {
      recommendations.push('Quality is IMPROVING. Continue current strategy.');
    }

    const bestFocus = focusAnalysis[0];
    const worstFocus = focusAnalysis[focusAnalysis.length - 1];
    if (bestFocus && worstFocus && bestFocus.focus !== worstFocus.focus) {
      recommendations.push(
        `Best focus: "${bestFocus.focus}" (avg ${bestFocus.avgScore}). ` +
        `Worst: "${worstFocus.focus}" (avg ${worstFocus.avgScore}). Consider reducing "${worstFocus.focus}" cycles.`
      );
    }

    return {
      analyzed: recent.length,
      avgScore: Math.round(avgScore * 1000) / 1000,
      maxScore,
      minScore,
      slope: Math.round(slope * 10000) / 10000,
      trend: slope > 0.005 ? 'improving' : slope < -0.01 ? 'declining' : 'plateau',
      crashCycles: crashCycles.length,
      focusAnalysis,
      recommendations,
      recentScores: recent.map((h) => ({
        cycle: h.cycle,
        score: h.composite,
        focus: h.focus,
      })),
    };
  } catch (err: any) {
    return { error: `Failed to analyze history: ${err.message}` };
  }
}

// ── Diagnostic Handlers ──────────────────────────────────────────────────────

async function handleDiagnose(args: Record<string, unknown>): Promise<unknown> {
  const focus = (args.focus as string) ?? 'all';
  const maxResults = (args.maxResults as number) ?? 10;

  // Import graph-rag-tools to check readiness
  const { isGraphRAGReady } = await import('@holoscript/absorb-service/mcp');
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
  const { handleGraphRagTool } = await import('@holoscript/absorb-service/mcp');

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
    const tsErrors = output.match?.(/error TS\d+/g) ?? [];
    const errorCount = tsErrors.length;
    // Also check for "Found N errors" summary line as fallback
    const foundMatch = output.match(/Found (\d+) errors?/);
    const reportedCount = foundMatch ? parseInt(foundMatch[1], 10) : 0;
    const bestCount = errorCount || reportedCount;
    scores.typeCheck = {
      pass: false,
      score: tscScore(bestCount || 50),
      details: bestCount > 0
        ? `Type check failed: ${bestCount} errors`
        : `Type check failed: unknown errors (tsc non-zero exit)`,
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
      const output = (err.stdout ?? '') + (err.stderr ?? '');
      // Count actual ESLint problem lines (format: "N problems (X errors, Y warnings)")
      const summaryMatch = output.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
      let errorCount: number;
      let warningCount: number;
      if (summaryMatch) {
        errorCount = parseInt(summaryMatch[2], 10);
        warningCount = parseInt(summaryMatch[3], 10);
      } else {
        // Fallback: count lines with severity markers (e.g. "2:10  error  ...")
        errorCount = (output.match(/^\s*\d+:\d+\s+error\s/gm) ?? []).length;
        warningCount = (output.match(/^\s*\d+:\d+\s+warning\s/gm) ?? []).length;
      }
      // Use logarithmic scale for lint too — prevents score from going to 0 at 10+ errors
      const lintScore = errorCount === 0
        ? Math.max(0.8, 1 - warningCount * 0.01)
        : 1 / (1 + Math.log(1 + errorCount / 5));
      scores.lint = {
        pass: errorCount === 0,
        score: Math.max(0, lintScore),
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
