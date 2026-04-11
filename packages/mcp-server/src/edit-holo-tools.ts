/**
 * edit-holo-tools.ts — AST-directed source-level editor for HoloScript
 *
 * Enables AI agents to surgically edit .holo/.hsplus/.hs files without
 * rewriting the entire file. Uses the parser for node location only,
 * then applies text-level edits within the located block.
 *
 * Operations:
 *   - set_property   — upsert key: value in an object block
 *   - remove_property — delete a property line from an object block
 *   - add_trait       — append @trait to the object declaration line
 *   - remove_trait    — strip @trait from the declaration line
 *   - rename          — change the object's quoted name
 *
 * Design: source-level editing preserves formatting, comments, and
 * properties that the lossy convertToHolo() codegen would strip.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ── Types ──────────────────────────────────────────────────────────────────

export type EditOperation =
  | { op: 'set_property'; key: string; value: string }
  | { op: 'remove_property'; key: string }
  | { op: 'add_trait'; trait: string }
  | { op: 'remove_trait'; trait: string }
  | { op: 'rename'; newName: string };

export interface EditHoloArgs {
  code: string;
  target: string; // Object name/ID to edit
  edits: EditOperation[];
}

export interface EditHoloResult {
  success: boolean;
  code: string;
  diff: string[];
  summary: string;
  error?: string;
}

// ── Tool Definition ────────────────────────────────────────────────────────

export const editHoloTools: Tool[] = [
  {
    name: 'edit_holo',
    description:
      'Surgically edit a specific object in HoloScript code without rewriting the entire file. ' +
      'Preserves formatting, comments, and all other objects. Operations: ' +
      'set_property (upsert a property), remove_property, add_trait, remove_trait, rename. ' +
      'Multiple operations can be applied in a single call.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The full HoloScript source code containing the object to edit.',
        },
        target: {
          type: 'string',
          description:
            'Name or ID of the object to edit (e.g., "Player", "floor", "main_light"). ' +
            'Matches the quoted name in: object "Name" { ... }',
        },
        edits: {
          type: 'array',
          description: 'List of edit operations to apply to the target object.',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: ['set_property', 'remove_property', 'add_trait', 'remove_trait', 'rename'],
                description: 'The edit operation type.',
              },
              key: {
                type: 'string',
                description: 'Property key (for set_property, remove_property).',
              },
              value: {
                type: 'string',
                description:
                  'Property value as a string (for set_property). ' +
                  'Arrays: "[1, 2, 3]", numbers: "42", strings: \'"hello"\'.',
              },
              trait: {
                type: 'string',
                description: 'Trait name with or without @ prefix (for add_trait, remove_trait).',
              },
              newName: {
                type: 'string',
                description: 'New name for the object (for rename).',
              },
            },
            required: ['op'],
          },
        },
      },
      required: ['code', 'target', 'edits'],
    },
  },
];

// ── Handler ────────────────────────────────────────────────────────────────

export async function handleEditHoloTool(
  name: string,
  args: Record<string, unknown>
): Promise<EditHoloResult | null> {
  if (name !== 'edit_holo') return null;
  return runEditHolo(args as unknown as EditHoloArgs);
}

// ── Core Engine ────────────────────────────────────────────────────────────

/**
 * Find the object block in source code by name.
 * Returns { startLine, endLine, declarationLine } (0-indexed).
 *
 * Handles:
 *   .holo:   object "Name" @trait { ... }
 *   .hsplus: cube Name { ... }  or  object Name { ... }
 */
function findObjectBlock(
  lines: string[],
  targetName: string
): { startLine: number; endLine: number; declarationLine: number } | null {
  // Pattern 1: object "Name" ... {  (holo format, quoted name)
  const holoPattern = new RegExp(
    `^(\\s*)(?:object|cube|sphere|model|plane|cylinder|cone|light|camera|group)\\s+"${escapeRegex(targetName)}"`,
    'i'
  );
  // Pattern 2: type Name {  (hsplus format, unquoted name)
  const hsplusPattern = new RegExp(
    `^(\\s*)(?:object|cube|sphere|model|plane|cylinder|cone|light|camera|group)\\s+${escapeRegex(targetName)}\\s*(?:@|\\{)`,
    'i'
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (holoPattern.test(line) || hsplusPattern.test(line)) {
      // Found the declaration line — now find the matching closing brace
      const _indent = line.match(/^(\s*)/)?.[1] ?? '';
      let braceDepth = 0;
      let foundOpen = false;

      for (let j = i; j < lines.length; j++) {
        const l = lines[j];
        for (const ch of l) {
          if (ch === '{') {
            braceDepth++;
            foundOpen = true;
          }
          if (ch === '}') {
            braceDepth--;
          }
        }
        if (foundOpen && braceDepth === 0) {
          return { startLine: i, endLine: j, declarationLine: i };
        }
      }

      // Unclosed block — return to end of file
      return { startLine: i, endLine: lines.length - 1, declarationLine: i };
    }
  }

  return null;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Detect indentation used inside the block body.
 */
function detectBlockIndent(lines: string[], startLine: number, endLine: number): string {
  for (let i = startLine + 1; i < endLine; i++) {
    const line = lines[i];
    const match = line.match(/^(\s+)\S/);
    if (match) return match[1];
  }
  return '    '; // default 4 spaces
}

function runEditHolo(args: EditHoloArgs): EditHoloResult {
  const { code, target, edits } = args;

  if (!code || !target || !edits || edits.length === 0) {
    return {
      success: false,
      code: code ?? '',
      diff: [],
      summary: 'Missing required arguments: code, target, and edits.',
      error: 'Missing code, target, or edits.',
    };
  }

  const lines = code.split('\n');
  const block = findObjectBlock(lines, target);

  if (!block) {
    return {
      success: false,
      code,
      diff: [],
      summary: `Object "${target}" not found in source code.`,
      error: `Object "${target}" not found. Available objects can be discovered with parse_hs or parse_holo.`,
    };
  }

  const diffLog: string[] = [];
  let editedLines = [...lines];

  // Apply edits sequentially — each edit may shift line numbers
  for (const edit of edits) {
    const currentBlock = findObjectBlock(editedLines, target);
    if (!currentBlock) {
      diffLog.push(`⚠ Lost track of "${target}" after previous edit`);
      break;
    }

    switch (edit.op) {
      case 'set_property': {
        if (!edit.key) {
          diffLog.push('⚠ set_property: key is required');
          break;
        }
        const result = applySetProperty(editedLines, currentBlock, edit.key, edit.value ?? '');
        editedLines = result.lines;
        diffLog.push(result.diff);
        break;
      }

      case 'remove_property': {
        if (!edit.key) {
          diffLog.push('⚠ remove_property: key is required');
          break;
        }
        const result = applyRemoveProperty(editedLines, currentBlock, edit.key);
        editedLines = result.lines;
        diffLog.push(result.diff);
        break;
      }

      case 'add_trait': {
        if (!edit.trait) {
          diffLog.push('⚠ add_trait: trait is required');
          break;
        }
        const result = applyAddTrait(editedLines, currentBlock, edit.trait);
        editedLines = result.lines;
        diffLog.push(result.diff);
        break;
      }

      case 'remove_trait': {
        if (!edit.trait) {
          diffLog.push('⚠ remove_trait: trait is required');
          break;
        }
        const result = applyRemoveTrait(editedLines, currentBlock, edit.trait);
        editedLines = result.lines;
        diffLog.push(result.diff);
        break;
      }

      case 'rename': {
        if (!edit.newName) {
          diffLog.push('⚠ rename: newName is required');
          break;
        }
        const result = applyRename(editedLines, currentBlock, target, edit.newName);
        editedLines = result.lines;
        diffLog.push(result.diff);
        break;
      }

      default:
        diffLog.push(`⚠ Unknown operation: ${(edit as unknown as { op: string }).op}`);
    }
  }

  const newCode = editedLines.join('\n');
  const changed = newCode !== code;

  return {
    success: true,
    code: newCode,
    diff: diffLog,
    summary: changed
      ? `Applied ${edits.length} edit(s) to "${target}": ${diffLog.filter((d) => !d.startsWith('⚠')).join('; ')}`
      : `No changes made to "${target}".`,
  };
}

// ── Edit Operations ────────────────────────────────────────────────────────

interface EditResult {
  lines: string[];
  diff: string;
}

function applySetProperty(
  lines: string[],
  block: { startLine: number; endLine: number },
  key: string,
  value: string
): EditResult {
  const indent = detectBlockIndent(lines, block.startLine, block.endLine);
  const propPattern = new RegExp(`^(\\s*)${escapeRegex(key)}\\s*:`);

  // Look for existing property
  for (let i = block.startLine + 1; i <= block.endLine; i++) {
    if (propPattern.test(lines[i])) {
      const oldLine = lines[i];
      const match = oldLine.match(/^(\s*)/);
      const existingIndent = match ? match[1] : indent;
      lines[i] = `${existingIndent}${key}: ${value}`;
      return { lines, diff: `set ${key}: ${value} (was: ${oldLine.trim()})` };
    }
  }

  // Property not found — insert before closing brace
  const newLine = `${indent}${key}: ${value}`;
  lines.splice(block.endLine, 0, newLine);
  return { lines, diff: `+${key}: ${value}` };
}

function applyRemoveProperty(
  lines: string[],
  block: { startLine: number; endLine: number },
  key: string
): EditResult {
  const propPattern = new RegExp(`^\\s*${escapeRegex(key)}\\s*:`);

  for (let i = block.startLine + 1; i <= block.endLine; i++) {
    if (propPattern.test(lines[i])) {
      const removed = lines[i].trim();
      lines.splice(i, 1);
      return { lines, diff: `-${removed}` };
    }
  }

  return { lines, diff: `⚠ property "${key}" not found` };
}

function applyAddTrait(
  lines: string[],
  block: { startLine: number; endLine: number },
  trait: string
): EditResult {
  const normalizedTrait = trait.startsWith('@') ? trait : `@${trait}`;
  const declLine = lines[block.startLine];

  // Check if trait already exists
  if (declLine.includes(normalizedTrait)) {
    return { lines, diff: `⚠ trait ${normalizedTrait} already present` };
  }

  // Insert trait before the opening brace
  const braceIdx = declLine.lastIndexOf('{');
  if (braceIdx >= 0) {
    lines[block.startLine] =
      declLine.slice(0, braceIdx).trimEnd() + ` ${normalizedTrait} ` + declLine.slice(braceIdx);
  } else {
    // No brace on declaration line — append at end
    lines[block.startLine] = declLine + ` ${normalizedTrait}`;
  }

  return { lines, diff: `+trait ${normalizedTrait}` };
}

function applyRemoveTrait(
  lines: string[],
  block: { startLine: number; endLine: number },
  trait: string
): EditResult {
  const normalizedTrait = trait.startsWith('@') ? trait : `@${trait}`;
  const declLine = lines[block.startLine];

  if (!declLine.includes(normalizedTrait)) {
    return { lines, diff: `⚠ trait ${normalizedTrait} not found` };
  }

  // Remove the trait (with potential surrounding whitespace)
  lines[block.startLine] = declLine
    .replace(new RegExp(`\\s*${escapeRegex(normalizedTrait)}\\s*`, 'g'), ' ')
    .replace(/\s+\{/, ' {')
    .replace(/\s{2,}/g, ' ');

  return { lines, diff: `-trait ${normalizedTrait}` };
}

function applyRename(
  lines: string[],
  block: { startLine: number; endLine: number },
  oldName: string,
  newName: string
): EditResult {
  const declLine = lines[block.startLine];

  // Replace quoted name: "oldName" → "newName"
  const quotedOld = `"${oldName}"`;
  const quotedNew = `"${newName}"`;
  if (declLine.includes(quotedOld)) {
    lines[block.startLine] = declLine.replace(quotedOld, quotedNew);
    return { lines, diff: `rename "${oldName}" → "${newName}"` };
  }

  // Replace unquoted name (hsplus): oldName → newName
  const unquotedPattern = new RegExp(
    `(\\b(?:object|cube|sphere|model)\\s+)${escapeRegex(oldName)}(\\s)`,
    'i'
  );
  if (unquotedPattern.test(declLine)) {
    lines[block.startLine] = declLine.replace(unquotedPattern, `$1${newName}$2`);
    return { lines, diff: `rename ${oldName} → ${newName}` };
  }

  return { lines, diff: `⚠ could not locate name "${oldName}" in declaration` };
}
