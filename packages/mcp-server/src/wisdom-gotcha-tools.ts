/**
 * MCP Wisdom/Gotcha Tools for HoloScript
 *
 * Provides AI agents and IDE integrations with queryable access to
 * @wisdom and @gotcha meta-traits declared in compositions.
 *
 * Tools:
 * - holo_query_wisdom:  Search wisdom patterns by trait, category, or keyword
 * - holo_list_gotchas:  List gotchas filtered by severity or trigger event
 * - holo_check_gotchas: Validate a composition for critical gotcha violations
 *
 * @see proposals/WISDOM_AND_GOTCHA_TRAITS_v1.md
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { HoloScriptPlusParser } from '@holoscript/core';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const wisdomGotchaTools: Tool[] = [
  {
    name: 'holo_query_wisdom',
    description:
      'Query @wisdom meta-traits from HoloScript compositions. ' +
      'Returns battle-tested insights with provenance, applicable traits, and examples. ' +
      'Use to learn best practices before making changes.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the HoloScript project',
        },
        trait: {
          type: 'string',
          description: 'Filter wisdoms that apply to a specific trait (e.g. "credit", "networked")',
        },
        keyword: {
          type: 'string',
          description: 'Search keyword to match against wisdom descriptions',
        },
        compositionFile: {
          type: 'string',
          description: 'Specific .holo or .hsplus file to scan. If omitted, scans all compositions.',
        },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'holo_list_gotchas',
    description:
      'List @gotcha meta-traits from HoloScript compositions. ' +
      'Returns known failure modes with severity levels, mitigation strategies, and trigger events. ' +
      'Use before making changes to understand failure risks.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the HoloScript project',
        },
        severity: {
          type: 'string',
          enum: ['info', 'warning', 'critical'],
          description: 'Filter by severity level',
        },
        triggerEvent: {
          type: 'string',
          description: 'Filter by trigger event (e.g. "hot_reload", "absorb", "onClick")',
        },
        compositionFile: {
          type: 'string',
          description: 'Specific .holo or .hsplus file to scan. If omitted, scans all compositions.',
        },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'holo_check_gotchas',
    description:
      'Validate a composition for critical @gotcha violations. ' +
      'Returns pass/fail with details on which gotchas would trigger. ' +
      'Use as a pre-commit check or CI gate with --enforce-gotchas semantics.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Root directory of the HoloScript project',
        },
        compositionFile: {
          type: 'string',
          description: 'The .holo or .hsplus file to validate (relative to rootDir)',
        },
        failOnCritical: {
          type: 'boolean',
          description: 'If true, returns error status for critical gotchas. Defaults to true.',
        },
      },
      required: ['rootDir', 'compositionFile'],
    },
  },
];

// =============================================================================
// TYPES
// =============================================================================

interface WisdomEntry {
  description: string;
  source: string;
  applies_to: string[];
  examples: string[];
  file: string;
  objectName?: string;
}

interface GotchaEntry {
  warning: string;
  severity: 'info' | 'warning' | 'critical';
  mitigation: string;
  triggers_on: string[];
  file: string;
  objectName?: string;
}

// =============================================================================
// EXTRACTION — Parse .holo/.hsplus files for @wisdom/@gotcha traits
// =============================================================================

function findCompositionFiles(rootDir: string): string[] {
  const files: string[] = [];
  const dirs = ['compositions', 'examples', 'scenes', '.'];
  for (const dir of dirs) {
    const full = path.join(rootDir, dir);
    if (!fs.existsSync(full)) continue;
    try {
      const entries = fs.readdirSync(full);
      for (const entry of entries) {
        if (entry.endsWith('.holo') || entry.endsWith('.hsplus')) {
          files.push(path.join(full, entry));
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }
  return files;
}

function extractWisdomsFromSource(source: string, filePath: string): WisdomEntry[] {
  const wisdoms: WisdomEntry[] = [];
  // Match @wisdom { ... } blocks (simplified regex extraction)
  const wisdomRe = /@wisdom\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = wisdomRe.exec(source)) !== null) {
    const block = match[1];
    const description = extractProp(block, 'description') || '';
    const source_ = extractProp(block, 'source') || 'community';
    const appliesTo = extractArrayProp(block, 'applies_to');
    const examples = extractArrayProp(block, 'examples');

    // Try to find enclosing object name
    const beforeBlock = source.slice(0, match.index);
    const objectMatch = beforeBlock.match(/object\s+"([^"]+)"\s*\{[^}]*$/);

    if (description) {
      wisdoms.push({
        description,
        source: source_,
        applies_to: appliesTo,
        examples,
        file: filePath,
        objectName: objectMatch?.[1],
      });
    }
  }
  return wisdoms;
}

function extractGotchasFromSource(source: string, filePath: string): GotchaEntry[] {
  const gotchas: GotchaEntry[] = [];
  const gotchaRe = /@gotcha\s*\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = gotchaRe.exec(source)) !== null) {
    const block = match[1];
    const warning = extractProp(block, 'warning') || '';
    const severity = (extractProp(block, 'severity') || 'warning') as GotchaEntry['severity'];
    const mitigation = extractProp(block, 'mitigation') || '';
    const triggersOn = extractArrayProp(block, 'triggers_on');

    const beforeBlock = source.slice(0, match.index);
    const objectMatch = beforeBlock.match(/object\s+"([^"]+)"\s*\{[^}]*$/);

    if (warning) {
      gotchas.push({
        warning,
        severity,
        mitigation,
        triggers_on: triggersOn,
        file: filePath,
        objectName: objectMatch?.[1],
      });
    }
  }
  return gotchas;
}

function extractProp(block: string, name: string): string | null {
  const re = new RegExp(`${name}:\\s*"([^"]*)"`, 'i');
  const match = block.match(re);
  return match?.[1] ?? null;
}

function extractArrayProp(block: string, name: string): string[] {
  const re = new RegExp(`${name}:\\s*\\[([^\\]]*)]`, 'i');
  const match = block.match(re);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/^["@]|"$/g, ''))
    .filter(Boolean);
}

// =============================================================================
// HANDLER
// =============================================================================

export async function handleWisdomGotchaTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  switch (name) {
    case 'holo_query_wisdom':
      return handleQueryWisdom(args);
    case 'holo_list_gotchas':
      return handleListGotchas(args);
    case 'holo_check_gotchas':
      return handleCheckGotchas(args);
    default:
      return null;
  }
}

// ── Query Wisdom ──────────────────────────────────────────────────────────────

async function handleQueryWisdom(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const traitFilter = args.trait as string | undefined;
  const keyword = args.keyword as string | undefined;
  const compositionFile = args.compositionFile as string | undefined;

  if (!rootDir || !fs.existsSync(rootDir)) {
    return { error: 'rootDir does not exist' };
  }

  const files = compositionFile
    ? [path.resolve(rootDir, compositionFile)]
    : findCompositionFiles(rootDir);

  let allWisdoms: WisdomEntry[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const source = fs.readFileSync(file, 'utf-8');
      allWisdoms.push(...extractWisdomsFromSource(source, path.relative(rootDir, file)));
    } catch {
      // Skip unreadable files
    }
  }

  // Apply filters
  if (traitFilter) {
    const normalized = traitFilter.replace(/^@/, '');
    allWisdoms = allWisdoms.filter(w =>
      w.applies_to.some(t => t.replace(/^@/, '') === normalized),
    );
  }
  if (keyword) {
    const lower = keyword.toLowerCase();
    allWisdoms = allWisdoms.filter(w =>
      w.description.toLowerCase().includes(lower),
    );
  }

  return {
    count: allWisdoms.length,
    wisdoms: allWisdoms,
    filesScanned: files.length,
  };
}

// ── List Gotchas ──────────────────────────────────────────────────────────────

async function handleListGotchas(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const severityFilter = args.severity as string | undefined;
  const triggerFilter = args.triggerEvent as string | undefined;
  const compositionFile = args.compositionFile as string | undefined;

  if (!rootDir || !fs.existsSync(rootDir)) {
    return { error: 'rootDir does not exist' };
  }

  const files = compositionFile
    ? [path.resolve(rootDir, compositionFile)]
    : findCompositionFiles(rootDir);

  let allGotchas: GotchaEntry[] = [];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const source = fs.readFileSync(file, 'utf-8');
      allGotchas.push(...extractGotchasFromSource(source, path.relative(rootDir, file)));
    } catch {
      // Skip unreadable files
    }
  }

  if (severityFilter) {
    allGotchas = allGotchas.filter(g => g.severity === severityFilter);
  }
  if (triggerFilter) {
    allGotchas = allGotchas.filter(g => g.triggers_on.includes(triggerFilter));
  }

  return {
    count: allGotchas.length,
    gotchas: allGotchas,
    filesScanned: files.length,
    criticalCount: allGotchas.filter(g => g.severity === 'critical').length,
  };
}

// ── Check Gotchas ─────────────────────────────────────────────────────────────

async function handleCheckGotchas(args: Record<string, unknown>): Promise<unknown> {
  const rootDir = args.rootDir as string;
  const compositionFile = args.compositionFile as string;
  const failOnCritical = (args.failOnCritical as boolean) ?? true;

  if (!rootDir || !fs.existsSync(rootDir)) {
    return { error: 'rootDir does not exist' };
  }

  const filePath = path.resolve(rootDir, compositionFile);
  if (!fs.existsSync(filePath)) {
    return { error: `Composition file not found: ${compositionFile}` };
  }

  const source = fs.readFileSync(filePath, 'utf-8');
  const gotchas = extractGotchasFromSource(source, compositionFile);
  const critical = gotchas.filter(g => g.severity === 'critical');
  const warnings = gotchas.filter(g => g.severity === 'warning');
  const infos = gotchas.filter(g => g.severity === 'info');

  const passed = !failOnCritical || critical.length === 0;

  return {
    file: compositionFile,
    passed,
    summary: {
      total: gotchas.length,
      critical: critical.length,
      warning: warnings.length,
      info: infos.length,
    },
    criticalGotchas: critical.map(g => ({
      warning: g.warning,
      mitigation: g.mitigation,
      triggers_on: g.triggers_on,
      object: g.objectName,
    })),
    warningGotchas: warnings.map(g => ({
      warning: g.warning,
      mitigation: g.mitigation,
    })),
  };
}
