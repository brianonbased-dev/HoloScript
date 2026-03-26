'use client';

/**
 * useHoloDebugger — parses scene code for errors and validates trait params.
 * Pure text analysis, no external fetch or compilation.
 */

import { useMemo } from 'react';
import { useSceneStore } from '@/lib/stores';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  line: number;
  col: number;
  message: string;
  source: 'syntax' | 'trait' | 'semantic';
  quickFix?: string; // suggested replacement text
}

// ─── Known trait param types ────────────────────────────────────────────────

const TRAIT_REQUIRED_PARAMS: Record<string, string[]> = {
  physics: ['type'],
  light: ['type'],
  audio: ['src'],
};

const TRAIT_VALID_ENUM: Record<string, Record<string, string[]>> = {
  physics: { type: ['static', 'dynamic', 'kinematic'] },
  light: { type: ['point', 'spot', 'directional', 'area'] },
  particles: { type: ['fire', 'smoke', 'sparkle', 'rain', 'snow', 'dust', 'debris', 'custom'] },
  lod: {},
  camera: {},
  animation: {},
  ai: { goal: ['idle', 'patrol', 'follow', 'flee', 'wander', 'attack'] },
  xr: {},
  material: {},
  transform: {},
  environment: {
    sky: ['procedural', 'hdri', 'solid'],
    fog: ['none', 'linear', 'exponential'],
  },
};

// ─── Analysers ───────────────────────────────────────────────────────────────

function analyseSyntax(lines: string[]): Diagnostic[] {
  const diags: Diagnostic[] = [];
  let braceDepth = 0;
  let openBraceLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    for (const ch of line) {
      if (ch === '{') {
        braceDepth++;
        openBraceLine = lineNum;
      }
      if (ch === '}') {
        braceDepth--;
      }
    }

    // Detect @trait without braces on the same line AND no block follows
    const traitMatch = line.match(/^\s*@(\w+)\s*\{/);
    if (traitMatch === null && /@\w+/.test(line) && !line.includes('{')) {
      // inline trait — fine, but warn if followed by nothing
    }

    // Detect property assignments with no colon (potential typo)
    // Match: property "value", property value, property [1, 2, 3], property { ... }
    const propLike = line.match(/^\s+(\w+)\s+(".*?"|\[.*?\]|\{.*?\}|[^:{\s]\S*)\s*$/);
    if (
      propLike &&
      !line.trim().startsWith('@') &&
      !line.trim().startsWith('//') &&
      braceDepth > 0
    ) {
      diags.push({
        id: `syn-${i}-nocolon`,
        severity: 'warning',
        line: lineNum,
        col: 1,
        message: `"${propLike[1]}" looks like a property assignment but is missing a colon (:)`,
        source: 'syntax',
        quickFix: `${propLike[1]}: ${propLike[2]}`,
      });
    }
  }

  if (braceDepth > 0) {
    diags.push({
      id: 'syn-unclosed',
      severity: 'error',
      line: openBraceLine,
      col: 1,
      message: `Unclosed brace — opened at line ${openBraceLine}`,
      source: 'syntax',
    });
  }
  if (braceDepth < 0) {
    diags.push({
      id: 'syn-extra-brace',
      severity: 'error',
      line: lines.length,
      col: 1,
      message: 'Extra closing brace "}" with no matching opener',
      source: 'syntax',
    });
  }
  return diags;
}

function analyseTraits(lines: string[]): Diagnostic[] {
  const diags: Diagnostic[] = [];
  let currentTrait: string | null = null;
  let traitLine = -1;
  const seenTraits: Map<string, number> = new Map(); // for duplicate detection
  const seenTraitsInObj: string[] = [];

  let inObject = false;
  const objDepth = 0;
  let baseDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    // Track object/scene block boundaries
    // Match any HoloScript object type: scene, object, group, box, sphere, light, camera, etc.
    if (
      /^(object|scene|group|box|sphere|cylinder|plane|cone|torus|capsule|mesh|light|camera|audio|text|model|particles|terrain|water|sky|fog|portal|trigger|zone|path|waypoint|spawn|checkpoint|enemy|player|npc|item|collectible|weapon|projectile|vehicle|building|prop|decor|effect|emitter|force|field|constraint|joint|sensor|actuator|controller|manager|system|component|entity)\s+(".+?"|[\w\-\.]+)\s*\{/.test(
        trimmed
      )
    ) {
      inObject = true;
      baseDepth = (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      seenTraitsInObj.length = 0;
    }

    // Enter @trait block
    const traitMatch = trimmed.match(/^@(\w+)\s*\{?/);
    if (traitMatch) {
      currentTrait = traitMatch[1];
      traitLine = lineNum;

      // Duplicate trait in same object
      if (inObject) {
        if (seenTraitsInObj.includes(currentTrait)) {
          diags.push({
            id: `trait-dup-${i}`,
            severity: 'warning',
            line: lineNum,
            col: 1,
            message: `Duplicate @${currentTrait} trait in this object — only the last one will apply`,
            source: 'trait',
          });
        }
        seenTraitsInObj.push(currentTrait);
      }

      // Unknown trait
      if (!(currentTrait in TRAIT_VALID_ENUM)) {
        // Typo heuristic: known trait fuzzy-ish match
        const known = Object.keys(TRAIT_VALID_ENUM);
        const close = known.find((k) => k.startsWith(currentTrait!.slice(0, 3)));
        diags.push({
          id: `trait-unknown-${i}`,
          severity: close ? 'warning' : 'info',
          line: lineNum,
          col: 1,
          message: `Unknown trait @${currentTrait}${close ? ` — did you mean @${close}?` : ''}`,
          source: 'trait',
          quickFix: close ? `@${close}` : undefined,
        });
      }
      seenTraits.set(currentTrait, lineNum);

      // Check for inline trait parameters: @physics { type: "invalid" }
      const inlineMatch = trimmed.match(/^@\w+\s*\{(.+?)\}/);
      if (inlineMatch && currentTrait in TRAIT_VALID_ENUM) {
        const inlineContent = inlineMatch[1];
        // Split by comma or newline to get individual parameters
        const params = inlineContent
          .split(/[,\n]/)
          .map((p) => p.trim())
          .filter((p) => p);
        for (const param of params) {
          const paramMatch = param.match(/^(\w+)\s*:\s*(.+)$/);
          if (paramMatch) {
            const [, key, rawVal] = paramMatch;
            const val = rawVal.trim().replace(/"/g, '');
            const enumDef = TRAIT_VALID_ENUM[currentTrait]?.[key];
            if (enumDef && enumDef.length > 0 && !enumDef.includes(val)) {
              diags.push({
                id: `trait-invalid-${i}`,
                severity: 'error',
                line: lineNum,
                col: 1,
                message: `Invalid value "${val}" for @${currentTrait}.${key} — valid: ${enumDef.map((v) => `"${v}"`).join(', ')}`,
                source: 'trait',
              });
            }
          }
        }
      }
    }

    // Inside a trait block — check param values
    if (
      currentTrait &&
      trimmed !== '' &&
      !trimmed.startsWith('@') &&
      !trimmed.startsWith('//') &&
      trimmed !== '{' &&
      trimmed !== '}'
    ) {
      const paramMatch = trimmed.match(/^(\w+)\s*:\s*(.+)$/);
      if (paramMatch && currentTrait in TRAIT_VALID_ENUM) {
        const [, key, rawVal] = paramMatch;
        const val = rawVal.trim().replace(/"/g, '');
        const enumDef = TRAIT_VALID_ENUM[currentTrait]?.[key];
        if (enumDef && enumDef.length > 0 && !enumDef.includes(val)) {
          diags.push({
            id: `trait-invalid-${i}`,
            severity: 'error',
            line: lineNum,
            col: 1,
            message: `Invalid value "${val}" for @${currentTrait}.${key} — valid: ${enumDef.map((v) => `"${v}"`).join(', ')}`,
            source: 'trait',
          });
        }
      }
    }

    // Exit trait block
    if (currentTrait && trimmed === '}') {
      // Check required params present — would need multi-line tracking; simplified: warn at close
      const required = TRAIT_REQUIRED_PARAMS[currentTrait];
      if (required) {
        // Scan back through recent lines for required params
        const traitBody = lines.slice(traitLine, i + 1).join('\n');
        for (const req of required) {
          if (!new RegExp(`\\b${req}\\s*:`).test(traitBody)) {
            diags.push({
              id: `trait-missing-${i}-${req}`,
              severity: 'error',
              line: traitLine,
              col: 1,
              message: `@${currentTrait} is missing required param "${req}"`,
              source: 'trait',
            });
          }
        }
      }
      currentTrait = null;
    }
  }

  return diags;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface DebuggerResult {
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lineCount: number;
}

export function useHoloDebugger(): DebuggerResult {
  const code = useSceneStore((s) => s.code) ?? '';

  return useMemo<DebuggerResult>(() => {
    const lines = code.split('\n');
    const diagnostics: Diagnostic[] = [...analyseSyntax(lines), ...analyseTraits(lines)].sort(
      (a, b) => a.line - b.line || a.severity.localeCompare(b.severity)
    );

    return {
      diagnostics,
      errorCount: diagnostics.filter((d) => d.severity === 'error').length,
      warningCount: diagnostics.filter((d) => d.severity === 'warning').length,
      infoCount: diagnostics.filter((d) => d.severity === 'info').length,
      lineCount: lines.length,
    };
  }, [code]);
}
