/**
 * Code Health MCP Tool
 *
 * Analyzes HoloScript and TypeScript code health using a weighted composite
 * of 5 dimensions: complexity (40%), trait coherence (20%), documentation (15%),
 * test presence (15%), and issue density (10%).
 *
 * Returns a 0-10.0 health score with letter grade (A+ through F).
 *
 * W.HEALTH.01: Code health scoring formula (5 dimensions, weighted composite)
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ComplexityAnalyzer } from '../../core/src/analysis/ComplexityMetrics';

/**
 * Tool definition for holoscript_code_health
 */
export const codeHealthTools: Tool[] = [
  {
    name: 'holoscript_code_health',
    description:
      'Analyze code health and return a 0-10 score with grade (A+ through F). ' +
      'Works with HoloScript (.hs, .hsplus, .holo) and TypeScript (.ts, .tsx) code. ' +
      'Scores 5 dimensions: complexity, trait coherence, documentation, test presence, issue density.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The source code to analyze',
        },
        filePath: {
          type: 'string',
          description: 'Optional file path for context (helps detect format and test presence)',
        },
      },
      required: ['code'],
    },
  },
];

// Grade thresholds (0-10 scale)
const GRADES = [
  { min: 9.5, grade: 'A+' },
  { min: 9.0, grade: 'A' },
  { min: 8.5, grade: 'A-' },
  { min: 8.0, grade: 'B+' },
  { min: 7.5, grade: 'B' },
  { min: 7.0, grade: 'B-' },
  { min: 6.5, grade: 'C+' },
  { min: 6.0, grade: 'C' },
  { min: 5.5, grade: 'C-' },
  { min: 5.0, grade: 'D' },
  { min: 0.0, grade: 'F' },
] as const;

function toGrade(score: number): string {
  for (const { min, grade } of GRADES) {
    if (score >= min) return grade;
  }
  return 'F';
}

interface HealthBreakdown {
  complexity: number;
  traitCoherence: number;
  documentation: number;
  testPresence: number;
  issueDensity: number;
}

interface HealthResult {
  score: number;
  grade: string;
  breakdown: HealthBreakdown;
  issues: string[];
  suggestions: string[];
  filesAnalyzed: number;
}

/**
 * Detect if source code is HoloScript format
 */
function isHoloScript(code: string, filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (['hs', 'hsplus', 'holo'].includes(ext)) return true;
  // Heuristic: look for HoloScript patterns
  return /\b(composition|object)\s+"?\w+"?\s*\{/.test(code) && /@\w+/.test(code);
}

/**
 * Analyze HoloScript code using ComplexityAnalyzer
 */
async function analyzeHoloScript(code: string, filePath: string): Promise<HealthResult> {
  const analyzer = new ComplexityAnalyzer();
  const result = analyzer.analyze(code, filePath);

  const issues: string[] = [];
  const suggestions: string[] = [];

  // --- Complexity (40%) ---
  // ComplexityAnalyzer.overallScore is 0-100 where lower = less complex = better
  // Invert: health = 10 - (overallScore / 10), clamped to 0-10
  const complexityHealth = Math.max(0, Math.min(10, 10 - result.overallScore / 10));

  if (result.overallScore > 60) {
    issues.push(`High complexity score: ${result.overallScore}/100`);
    suggestions.push('Break complex functions into smaller units');
  }

  // --- Trait Coherence (20%) ---
  // Ratio of unique traits to total usages — too many repeated traits = low coherence
  const uniqueRatio = result.traits.totalUsages > 0
    ? result.traits.uniqueTraits / result.traits.totalUsages
    : 1.0;
  // Objects with excessive traits reduce coherence
  const avgTraitsPerObj = result.summary.avgTraitsPerObject;
  const traitPenalty = avgTraitsPerObj > 10 ? Math.min(3, (avgTraitsPerObj - 10) * 0.3) : 0;
  const traitCoherence = Math.max(0, Math.min(10, uniqueRatio * 10 - traitPenalty));

  if (avgTraitsPerObj > 10) {
    issues.push(`High trait density: avg ${avgTraitsPerObj.toFixed(1)} traits/object`);
    suggestions.push('Consider grouping related traits into template compositions');
  }

  // --- Documentation (15%) ---
  const commentRatio = result.lines.commentRatio;
  // Target: 10-30% comments. Below 5% is bad, above 40% is over-documented
  let docScore: number;
  if (commentRatio >= 0.1 && commentRatio <= 0.3) {
    docScore = 10;
  } else if (commentRatio >= 0.05) {
    docScore = 5 + (commentRatio - 0.05) / 0.05 * 5;
  } else {
    docScore = commentRatio / 0.05 * 5;
  }
  docScore = Math.max(0, Math.min(10, docScore));

  if (commentRatio < 0.05) {
    issues.push(`Low documentation: ${(commentRatio * 100).toFixed(1)}% comments`);
    suggestions.push('Add comments to complex sections');
  }

  // --- Test Presence (15%) ---
  // Heuristic: does the file path suggest tests exist nearby?
  const hasTestIndicator = filePath.includes('__tests__') || filePath.includes('.test.') || filePath.includes('.spec.');
  const hasAssertions = /\b(expect|assert|describe|it|test)\s*\(/.test(code);
  const testScore = hasTestIndicator || hasAssertions ? 10 : 3;

  if (!hasTestIndicator && !hasAssertions) {
    suggestions.push('Consider adding tests for this code');
  }

  // --- Issue Density (10%) ---
  // Fewer issues = higher score. Each issue costs 1 point (out of 10)
  const issueCount = result.issues.length;
  const issueDensityScore = Math.max(0, 10 - issueCount);

  for (const issue of result.issues.slice(0, 5)) {
    issues.push(`${issue.severity}: ${issue.message} (line ${issue.line})`);
  }
  if (result.issues.length > 5) {
    issues.push(`... and ${result.issues.length - 5} more issues`);
  }

  // --- Weighted composite ---
  const score = Number((
    complexityHealth * 0.40 +
    traitCoherence * 0.20 +
    docScore * 0.15 +
    testScore * 0.15 +
    issueDensityScore * 0.10
  ).toFixed(1));

  return {
    score,
    grade: toGrade(score),
    breakdown: {
      complexity: Number(complexityHealth.toFixed(1)),
      traitCoherence: Number(traitCoherence.toFixed(1)),
      documentation: Number(docScore.toFixed(1)),
      testPresence: Number(testScore.toFixed(1)),
      issueDensity: Number(issueDensityScore.toFixed(1)),
    },
    issues,
    suggestions,
    filesAnalyzed: 1,
  };
}

/**
 * Analyze TypeScript code using simple heuristics
 */
function analyzeTypeScript(code: string, filePath: string): HealthResult {
  const lines = code.split('\n');
  const totalLines = lines.length;
  const issues: string[] = [];
  const suggestions: string[] = [];

  // --- Complexity (40%) ---
  // Count decision points
  let decisionPoints = 0;
  let maxNesting = 0;
  let currentNesting = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    // Count decision points
    if (/\b(if|else if|switch|case|for|while|do|catch|\?\?|&&|\|\||\.catch)\b/.test(trimmed)) {
      decisionPoints++;
    }
    // Track nesting
    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/\}/g) || []).length;
    currentNesting += opens - closes;
    maxNesting = Math.max(maxNesting, currentNesting);
  }

  const complexityPerLine = totalLines > 0 ? decisionPoints / totalLines : 0;
  const complexityScore = Math.max(0, Math.min(10, 10 - complexityPerLine * 50 - (maxNesting > 5 ? (maxNesting - 5) : 0)));

  if (maxNesting > 5) {
    issues.push(`Deep nesting: max depth ${maxNesting}`);
    suggestions.push('Extract deeply nested blocks into separate functions');
  }
  if (totalLines > 500) {
    issues.push(`Large file: ${totalLines} lines`);
    suggestions.push('Consider splitting into smaller modules');
  }

  // --- Trait Coherence (20%) — N/A for TS, use import coherence instead ---
  const importLines = lines.filter(l => l.trim().startsWith('import ')).length;
  const importRatio = totalLines > 0 ? importLines / totalLines : 0;
  // Too many imports relative to code = low coherence
  const coherenceScore = Math.max(0, Math.min(10, importRatio < 0.3 ? 10 - importRatio * 20 : 4));

  // --- Documentation (15%) ---
  const commentLines = lines.filter(l => {
    const t = l.trim();
    return t.startsWith('//') || t.startsWith('/*') || t.startsWith('*') || t.startsWith('/**');
  }).length;
  const jsdocCount = (code.match(/\/\*\*/g) || []).length;
  const commentRatio = totalLines > 0 ? commentLines / totalLines : 0;

  let docScore: number;
  if (commentRatio >= 0.1 && commentRatio <= 0.3) {
    docScore = 10;
  } else if (commentRatio >= 0.05) {
    docScore = 5 + (commentRatio - 0.05) / 0.05 * 5;
  } else {
    docScore = commentRatio / 0.05 * 5;
  }
  docScore = Math.max(0, Math.min(10, docScore + (jsdocCount > 0 ? 1 : 0)));

  if (commentRatio < 0.05 && totalLines > 50) {
    suggestions.push('Add JSDoc comments to exported functions');
  }

  // --- Test Presence (15%) ---
  const hasTestIndicator = filePath.includes('__tests__') || filePath.includes('.test.') || filePath.includes('.spec.');
  const hasAssertions = /\b(expect|assert|describe|it|test)\s*\(/.test(code);
  const testScore = hasTestIndicator || hasAssertions ? 10 : 3;

  // --- Issue Density (10%) ---
  const todoCount = (code.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length;
  const anyCount = (code.match(/:\s*any\b/g) || []).length;
  const issueTotal = todoCount + anyCount;
  const issueDensityScore = Math.max(0, 10 - issueTotal);

  if (todoCount > 0) issues.push(`${todoCount} TODO/FIXME markers`);
  if (anyCount > 3) {
    issues.push(`${anyCount} uses of 'any' type`);
    suggestions.push('Replace any with specific types');
  }

  // --- Weighted composite ---
  const score = Number((
    complexityScore * 0.40 +
    coherenceScore * 0.20 +
    docScore * 0.15 +
    testScore * 0.15 +
    issueDensityScore * 0.10
  ).toFixed(1));

  return {
    score,
    grade: toGrade(score),
    breakdown: {
      complexity: Number(complexityScore.toFixed(1)),
      traitCoherence: Number(coherenceScore.toFixed(1)),
      documentation: Number(docScore.toFixed(1)),
      testPresence: Number(testScore.toFixed(1)),
      issueDensity: Number(issueDensityScore.toFixed(1)),
    },
    issues,
    suggestions,
    filesAnalyzed: 1,
  };
}

/**
 * Handle code health tool calls
 */
export async function handleCodeHealthTool(
  name: string,
  args: Record<string, unknown>
): Promise<HealthResult | null> {
  if (name !== 'holoscript_code_health') return null;

  const code = args.code as string;
  const filePath = (args.filePath as string) || 'input.holo';

  if (!code || code.trim().length === 0) {
    return {
      score: 0,
      grade: 'F',
      breakdown: {
        complexity: 0,
        traitCoherence: 0,
        documentation: 0,
        testPresence: 0,
        issueDensity: 0,
      },
      issues: ['Empty or missing code input'],
      suggestions: ['Provide code to analyze'],
      filesAnalyzed: 0,
    };
  }

  if (isHoloScript(code, filePath)) {
    return analyzeHoloScript(code, filePath);
  }

  return analyzeTypeScript(code, filePath);
}
