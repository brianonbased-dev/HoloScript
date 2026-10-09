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
      // Objects inside a spatial_group count: they are objects of the program.
      const grouped = (result.ast?.spatialGroups ?? []).flatMap((g) => g.objects ?? []);
      expect((result.ast?.objects?.length ?? 0) + grouped.length).toBeGreaterThan(0);
    }
  );

  // The prompt goes out with whichever format the caller asks for: generate_scene asks
  // for .holo, while generate_object and generateHoloScript default to .hsplus. A
  // program that is valid only as .holo (a `material "Name" { }` block, for one)
  // would teach an .hsplus request something its parser refuses. The one exception
  // is a program with a state_machine: the .hsplus parser reads no state transitions
  // (board task_1791522939238_4z0m), so that program is labelled ".holo only" in the
  // prompt and checked as .holo here.
  const holoOnly = (program: string) => /^\s*state_machine "/m.test(program);
  it.each(
    programsIn(HOLOSCRIPT_SYSTEM_PROMPT).flatMap((p) =>
      (holoOnly(p) ? (['holo'] as const) : (['holo', 'hsplus'] as const)).map(
        (surface) => [p.split('\n')[0], surface, p] as const
      )
    )
  )('%s is valid as .%s under the canonical validator', (_first, surface, program) => {
    const result = validateCanonicalSource({ source: program, surface });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('labels the state-machine program .holo only, for as long as .hsplus refuses it', () => {
    const machines = programs.filter(holoOnly);
    expect(machines.length).toBeGreaterThan(0);
    for (const program of machines) {
      const label = HOLOSCRIPT_SYSTEM_PROMPT.slice(0, HOLOSCRIPT_SYSTEM_PROMPT.indexOf(program));
      expect(label.slice(label.lastIndexOf('\n\n', label.length - 3))).toMatch(/\.holo only/);
      // When this starts passing, .hsplus reads state transitions: drop the label and
      // the holoOnly exception above, so the program is checked on both surfaces.
      expect(validateCanonicalSource({ source: program, surface: 'hsplus' }).valid).toBe(false);
    }
  });

  // What the parser drops, the program never said. Each form below is shown because
  // it is the language's documented spelling AND the parser keeps it; a later edit
  // that swaps in a spelling the parser drops fails here.
  it('every template an object uses exists and is kept as that object’s template', () => {
    const shown = programs.filter((p) => /\busing "/.test(p));
    expect(shown.length).toBeGreaterThan(0);
    for (const program of shown) {
      const ast = parseHolo(program).ast!;
      const all = [...(ast.objects ?? []), ...(ast.spatialGroups ?? []).flatMap((g) => g.objects ?? [])];
      const using = [...program.matchAll(/object "([^"]+)" using "([^"]+)"/g)];
      expect(using.length).toBeGreaterThan(0);
      for (const [, name, template] of using) {
        expect(all.find((o) => o.name === name)?.template).toBe(template);
        expect((ast.templates ?? []).some((t) => t.name === template)).toBe(true);
      }
    }
  });

  it('every template state block the prompt shows is kept with its values', () => {
    const templates = programs.flatMap((p) => parseHolo(p).ast?.templates ?? []);
    const withState = templates.filter((t) => t.state);
    expect(withState.length).toBeGreaterThan(0);
    for (const template of withState) {
      expect(template.state!.properties.length).toBeGreaterThan(0);
    }
  });

  it('every spatial_group is placed with position:, which the compilers read', () => {
    const groups = programs.flatMap((p) => parseHolo(p).ast?.spatialGroups ?? []);
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      const keys = (group.properties ?? []).map((prop) => prop.key);
      expect(keys).toContain('position');
    }
  });

  it('every state transition the prompt shows is kept with its target and event', () => {
    const machines = programs.flatMap((p) => parseHolo(p).ast?.stateMachines ?? []);
    expect(machines.length).toBeGreaterThan(0);
    for (const machine of machines) {
      const states = Object.values(machine.states ?? {});
      expect(states.length).toBeGreaterThan(1);
      for (const state of states) {
        // `on: { event: "next" }` parses with no error and keeps no transition, and
        // the comma form `{ target: "x", event: "y" }` does not parse at all.
        expect(state.transitions.length).toBeGreaterThan(0);
        for (const t of state.transitions) {
          expect(t.target).toMatch(/\S/);
          expect(t.event).toMatch(/\S/);
          expect(Object.keys(machine.states)).toContain(t.target);
        }
      }
    }
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
