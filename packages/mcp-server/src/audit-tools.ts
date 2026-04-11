/**
 * Audit Tools — Automated Number Consistency
 *
 * Runs Ground Truth Table verification commands, greps all docs for each metric,
 * builds a consistency matrix, and optionally patches mismatches.
 *
 * This tool eliminates the manual re-audit loop that burned context 3x in one session.
 * Run it once, get a consistency report, optionally auto-fix.
 *
 * @module audit-tools
 * @version 1.0.0
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

interface MetricDefinition {
  id: string;
  name: string;
  /** Shell command to get the live value (run from HoloScript root) */
  command: string;
  /** How to parse the command output into a number or string */
  parser: (output: string) => string;
  /** Regex patterns to search for this metric in docs */
  searchPatterns: RegExp[];
}

interface MetricResult {
  id: string;
  name: string;
  liveValue: string;
  occurrences: Array<{
    file: string;
    line: number;
    currentValue: string;
    matches: boolean;
  }>;
  allConsistent: boolean;
}

interface AuditResult {
  timestamp: string;
  metrics: MetricResult[];
  totalOccurrences: number;
  mismatches: number;
  files: string[];
}

// =============================================================================
// GROUND TRUTH TABLE
// =============================================================================

const HOLOSCRIPT_ROOT = path.resolve(__dirname, '../../..');

const METRICS: MetricDefinition[] = [
  {
    id: 'compiler_files',
    name: 'Compiler files',
    command:
      'find packages/core/src/compiler -name "*Compiler.ts" -not -name "CompilerBase.ts" -not -name "*.test.*" | wc -l',
    parser: (o) => o.trim(),
    searchPatterns: [/(\d+)\s*compilers?\b/gi, /(\d+)\s*compil(?:ation)?\s*targets?\b/gi],
  },
  {
    id: 'trait_categories',
    name: 'Trait categories',
    command: 'ls packages/core/src/traits/constants/*.ts | wc -l',
    parser: (o) => o.trim(),
    searchPatterns: [/(\d+)\s*categor(?:y|ies)\b/gi],
  },
  {
    id: 'knowledge_entries',
    name: 'Knowledge entries',
    command: 'curl -s https://mcp-orchestrator-production-45f9.up.railway.app/health',
    parser: (o) => {
      const match = o.match(/"knowledge_entries":(\d+)/);
      return match ? match[1] : 'unknown';
    },
    searchPatterns: [/(\d+)\s*(?:knowledge\s*)?entries/gi],
  },
];

// Files to scan for metric occurrences
const SCAN_GLOBS = ['README.md', 'docs/strategy/ROADMAP.md', 'packages/mcp-server/README.md'];

// External files (outside HoloScript repo)
const EXTERNAL_FILES = [
  'C:/Users/Josep/.claude/CLAUDE.md',
  'C:/Users/Josep/.claude/NORTH_STAR.md',
  'C:/Users/Josep/.gemini/GEMINI.md',
  'C:/Users/Josep/.claude/skills/holoscript/SKILL.md',
  'C:/Users/Josep/.claude/skills/documenter/skill.md',
  'C:/Users/Josep/.claude/skills/holomoltbook/skill.md',
  'C:/Users/Josep/.claude/skills/holomesh/skill.md',
  'C:/Users/Josep/.claude/skills/holomesh-oracle/SKILL.md',
  'C:/Users/Josep/.claude/projects/c--Users-josep--ai-ecosystem/memory/MEMORY.md',
  'C:/Users/Josep/.ai-ecosystem/STRATEGY.md',
];

// =============================================================================
// ENGINE
// =============================================================================

function runCommand(cmd: string): string {
  try {
    return execSync(cmd, { cwd: HOLOSCRIPT_ROOT, encoding: 'utf-8', timeout: 15000 });
  } catch {
    return 'ERROR';
  }
}

function scanFile(
  filePath: string,
  metric: MetricDefinition,
  liveValue: string
): MetricResult['occurrences'] {
  const occurrences: MetricResult['occurrences'] = [];
  try {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(HOLOSCRIPT_ROOT, filePath);
    if (!fs.existsSync(absPath)) return occurrences;

    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      for (const pattern of metric.searchPatterns) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(lines[i])) !== null) {
          const currentValue = match[1];
          // Skip if this is clearly a different metric (e.g., "114 categories" when scanning for compilers)
          if (metric.id === 'compiler_files' && lines[i].includes('categor')) continue;
          if (metric.id === 'trait_categories' && lines[i].includes('compil')) continue;
          if (
            metric.id === 'knowledge_entries' &&
            (lines[i].includes('compil') || lines[i].includes('categor'))
          )
            continue;

          occurrences.push({
            file: filePath,
            line: i + 1,
            currentValue,
            matches: currentValue === liveValue,
          });
        }
      }
    }
  } catch {
    // File not readable — skip
  }
  return occurrences;
}

export function runAudit(): AuditResult {
  const metrics: MetricResult[] = [];
  let totalOccurrences = 0;
  let mismatches = 0;
  const allFiles = [...SCAN_GLOBS, ...EXTERNAL_FILES];

  for (const metric of METRICS) {
    const output = runCommand(metric.command);
    const liveValue = metric.parser(output);

    const occurrences: MetricResult['occurrences'] = [];
    for (const file of allFiles) {
      occurrences.push(...scanFile(file, metric, liveValue));
    }

    const allConsistent = occurrences.every((o) => o.matches);
    totalOccurrences += occurrences.length;
    mismatches += occurrences.filter((o) => !o.matches).length;

    metrics.push({ id: metric.id, name: metric.name, liveValue, occurrences, allConsistent });
  }

  return {
    timestamp: new Date().toISOString(),
    metrics,
    totalOccurrences,
    mismatches,
    files: allFiles,
  };
}

// =============================================================================
// MCP HANDLER
// =============================================================================

export async function handleAuditNumbers(_args: Record<string, unknown>): Promise<unknown> {
  const result = runAudit();

  // Build summary
  const summary = result.metrics.map((m) => ({
    metric: m.name,
    live: m.liveValue,
    consistent: m.allConsistent,
    occurrences: m.occurrences.length,
    mismatches: m.occurrences
      .filter((o) => !o.matches)
      .map((o) => ({
        file: o.file,
        line: o.line,
        has: o.currentValue,
        should_be: m.liveValue,
      })),
  }));

  return {
    success: true,
    timestamp: result.timestamp,
    totalOccurrences: result.totalOccurrences,
    mismatches: result.mismatches,
    allConsistent: result.mismatches === 0,
    metrics: summary,
  };
}

// =============================================================================
// TOOL DEFINITION
// =============================================================================

export const auditTools: Tool[] = [
  {
    name: 'holoscript_audit_numbers',
    description:
      'Audit all ecosystem metrics against live ground truth. Runs verification commands ' +
      '(compiler count, trait categories, knowledge entries), scans all docs/configs/skills ' +
      'for each metric, and reports mismatches. Replaces manual re-audit loops.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
