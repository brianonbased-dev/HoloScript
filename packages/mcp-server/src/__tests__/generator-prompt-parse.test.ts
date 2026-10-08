import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHolo, validateCanonicalSource } from '@holoscript/core';
// From source, not the package: @holoscript/llm-provider resolves to its untracked
// dist/, which would test the last build instead of the prompt being edited.
import {
  HOLOSCRIPT_EXAMPLE_PROGRAM,
  HOLOSCRIPT_SYSTEM_PROMPT,
} from '../../../llm-provider/src/base-adapter';
// The strict layer (codes HS1001-HS1010) is plain ESM inside packages/core and is
// not in core's exports map, so it is reached by path. It parses with core's build.
import { coreInfo, parseStrict } from '../../../core/strict/index.mjs';

/**
 * generate_object and generate_scene send HOLOSCRIPT_SYSTEM_PROMPT to whichever
 * model writes the code. Whatever program that prompt shows is what the model
 * copies: shown this prompt's example program, eight frontier models passed 317 of
 * 336 attempts at the 14 author_holo tasks, against 227 without it (ai-ecosystem
 * receipts/holotune-native-authoring/2026-10-08-frontier-authoring-score.json).
 *
 * So the programs in the prompt must be programs. Before 2026-10-07 they were not:
 * the prompt never showed the `composition "Name" { ... }` root, and its
 * placeholder example, `cube { @color(red) @position(0, 1, 0) ... }`, parsed into
 * a program with no objects and a trait core does not declare. These tests make
 * a later edit that teaches broken syntax fail here instead of in a model's output.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REAL_FILE = path.resolve(HERE, '../../../../examples/quickstart/2-red-cube-teal-button.holo');

interface StrictDiagnostic {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  line: number;
  column: number;
}

async function strict(source: string): Promise<{ ok: boolean; diagnostics: StrictDiagnostic[] }> {
  return parseStrict(source);
}

/**
 * Every block in the prompt that starts a line with `composition "`, cut at its
 * matching close brace. Braces inside strings and `//` comments do not count.
 */
function programsIn(text: string): string[] {
  const programs: string[] = [];
  const start = /^composition "[^"]*" \{/gm;
  for (let m = start.exec(text); m; m = start.exec(text)) {
    let depth = 0;
    let inString = false;
    for (let i = m.index; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') {
        inString = true;
      } else if (c === '/' && text[i + 1] === '/') {
        i = text.indexOf('\n', i) - 1;
        if (i < 0) break;
      } else if (c === '{') {
        depth++;
      } else if (c === '}' && --depth === 0) {
        programs.push(text.slice(m.index, i + 1));
        start.lastIndex = i + 1;
        break;
      }
    }
  }
  return programs;
}

describe('the programs the HoloScript generator prompt shows are real programs', () => {
  const programs = programsIn(HOLOSCRIPT_SYSTEM_PROMPT);

  it('shows whole programs, including the real example', () => {
    expect(programs.length).toBeGreaterThanOrEqual(2);
    // Every program that starts must also close; one cut short would otherwise drop
    // out of the parse checks below without failing anything.
    const starts = HOLOSCRIPT_SYSTEM_PROMPT.match(/^composition "[^"]*" \{/gm) ?? [];
    expect(programs).toHaveLength(starts.length);
    expect(programs.some((p) => HOLOSCRIPT_EXAMPLE_PROGRAM.includes(p))).toBe(true);
  });

  it('the example is a verbatim copy of a real file, not one written to suit a task', () => {
    const real = readFileSync(REAL_FILE, 'utf8').replace(/\r\n/g, '\n').trim();
    expect(HOLOSCRIPT_EXAMPLE_PROGRAM.trim()).toBe(real);
  });

  it.each(programsIn(HOLOSCRIPT_SYSTEM_PROMPT).map((p) => [p.split('\n')[0], p]))(
    '%s parses with zero errors under parseHolo',
    (_first, program) => {
      const result = parseHolo(program);
      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
      expect(result.ast?.objects?.length ?? 0).toBeGreaterThan(0);
    }
  );

  // The prompt goes out with whichever format the caller asks for: generate_scene asks
  // for .holo, while generate_object and generateHoloScript default to .hsplus. A
  // program that is valid only as .holo (a `material "Name" { }` block, for one)
  // would teach an .hsplus request something its parser refuses.
  it.each(
    programsIn(HOLOSCRIPT_SYSTEM_PROMPT).flatMap((p) =>
      (['holo', 'hsplus'] as const).map((surface) => [p.split('\n')[0], surface, p] as const)
    )
  )('%s is valid as .%s under the canonical validator', (_first, surface, program) => {
    const result = validateCanonicalSource({ source: program, surface });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it.each(programsIn(HOLOSCRIPT_SYSTEM_PROMPT).map((p) => [p.split('\n')[0], p]))(
    '%s passes the strict layer with no diagnostics at all',
    async (_first, program) => {
      const result = await strict(program);
      // No error (HS1001-HS1010) and no warning either: an unknown trait (HS1006)
      // in an example teaches a trait nothing declares.
      expect(result.diagnostics).toEqual([]);
      expect(result.ok).toBe(true);
    }
  );

  it('shows no declaration outside a composition root', () => {
    let rest = HOLOSCRIPT_SYSTEM_PROMPT;
    for (const program of programs) rest = rest.replace(program, '');
    // A root-less fragment is what the old examples taught, at the start of a line
    // (`cube {`) or inline in a bullet (`material "Name" @advanced_pbr { base_color,
    // roughness }`, which also fails the strict layer). `material: {` is a property.
    const fragment =
      /(^|[\s`(])(object|material|template|spatial_group|light|scene|cube|sphere|plane|cylinder|cone|torus|capsule|mesh)(\s+"[^"]*")?(\s+@\w+(\([^)]*\))?)*\s*\{/m;
    expect(rest.match(fragment)?.[0]).toBeUndefined();
  });

  it('names only traits that core declares', async () => {
    // If core's trait lists fail to load, the strict layer skips HS1006 silently
    // and this test would pass having checked nothing.
    expect((await coreInfo({ fullVocabulary: true })).traitCheck).toBe(true);
    const named = [...new Set(HOLOSCRIPT_SYSTEM_PROMPT.match(/@[a-z_][a-z0-9_]*/g) ?? [])];
    expect(named.length).toBeGreaterThan(10);
    const allOnOneObject = `composition "Traits" {\n  object "A" {\n${named
      .map((t) => `    ${t}`)
      .join('\n')}\n    geometry: "cube"\n  }\n}`;

    const unknown = (await strict(allOnOneObject)).diagnostics
      .filter((d) => d.code === 'HS1006')
      .map((d) => d.message);
    expect(unknown).toEqual([]);
  });
});
