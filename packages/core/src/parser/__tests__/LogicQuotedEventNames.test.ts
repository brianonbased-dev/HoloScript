/**
 * Creator Advocate audit 2026-10-14, item 3: Studio's settings / projects /
 * integrations compositions write `on "save" { ... }` in their logic block.
 * The parser only took a bare identifier there, so parsing stopped at the
 * first handler, the UI objects were lost, and Settings > Profile rendered
 * blank. A quoted event name (which may contain '-') is now accepted.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

const here = dirname(fileURLToPath(import.meta.url));
const studioComposition = (name: string) =>
  readFileSync(resolve(here, '../../../../../compositions/studio', `${name}.hsplus`), 'utf8');

function parse(code: string) {
  const r = new HoloScriptPlusParser().parse(code) as unknown as {
    success: boolean;
    errors?: Array<{ message: string }>;
    ast: { root?: { children?: Array<{ type: string; body?: { eventHandlers?: Array<{ event: string }> } }> } };
  };
  const root = (r.ast as { root?: unknown }).root ?? r.ast;
  return { r, children: ((root as { children?: unknown[] }).children ?? []) as Array<{ type: string; body?: { eventHandlers?: Array<{ event: string }> } }> };
}

describe('logic block: quoted event names (audit item 3)', () => {
  it('accepts on "name" and on "kebab-name" handlers', () => {
    const { r, children } = parse(
      'composition "X" {\n  logic {\n    on "save" { }\n    on "stripe-setup" { $a = true }\n  }\n  object "O" { type: "ui" }\n}'
    );
    expect(r.errors?.map((e) => e.message) ?? []).toEqual([]);
    expect(r.success).toBe(true);
    const logic = children.find((c) => c.type === 'logic');
    expect(logic?.body?.eventHandlers?.map((h) => h.event)).toEqual(['save', 'stripe-setup']);
    expect(children.some((c) => c.type === 'object')).toBe(true);
  });

  it('still accepts a bare identifier', () => {
    const { r } = parse('composition "X" {\n  logic {\n    on save { }\n  }\n}');
    expect(r.success).toBe(true);
  });

  it.each(['settings', 'projects', 'integrations'])('Studio %s.hsplus parses with its UI objects', (name) => {
    const { r, children } = parse(studioComposition(name));
    expect(r.errors?.map((e) => e.message) ?? []).toEqual([]);
    expect(children.some((c) => c.type === 'object')).toBe(true);
  });
});