/**
 * The frame contract shared by every frame reader (G15, proposals/Agent_Frame_Tool_Allowlist_v1.md):
 * the look-alike key rule, and the shape of the shared cases in
 * fixtures/frame-allowlist-cases.json that core, the Rust reader, the agent loader and the
 * MCP gate each run.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FRAME_ALLOW_ALL_TOOLS,
  FRAME_DECLARATION_KEYS,
  describeFrameKeyLookalike,
  frameKeyLookalike,
} from '../index';

describe('frameKeyLookalike', () => {
  it('names the frame key a misspelled key looks like', () => {
    const cases: Array<[string, string | undefined]> = [
      ['allowedTools', 'allowed_tools'],
      ['allowed_tool', 'allowed_tools'],
      ['allow_tools', 'allowed_tools'],
      ['Allowed-Tools', 'allowed_tools'],
      ['ALLOWED_TOOLS', 'allowed_tools'],
      ['alowed_tools', 'allowed_tools'],
      [' allowed_tools', 'allowed_tools'],
      ['deniedDomains', 'denied_domains'],
      ['capabilityTier', 'capability_tier'],
      ['trustTier', 'trust_tier'],
      ['Domain', 'domain'],
      ['horizons', 'horizon'],
    ];
    for (const [written, meant] of cases) {
      expect(frameKeyLookalike(written), written).toBe(meant);
    }
  });

  it('names nothing for a frame key itself, or for a key far from every frame key', () => {
    for (const key of [...FRAME_DECLARATION_KEYS, 'notes', 'tools', 'allowed', 'description']) {
      expect(frameKeyLookalike(key), key).toBeUndefined();
    }
  });

  it('refuses in one sentence that names both keys', () => {
    expect(describeFrameKeyLookalike({ written: 'allowedTools', meant: 'allowed_tools' })).toBe(
      '@frame_declaration has the key "allowedTools", which is not a frame key but looks like ' +
        '"allowed_tools". Read as written, "allowed_tools" would count as left out, and a ' +
        'left-out "allowed_tools" is its widest value (for allowed_tools: every tool), so this ' +
        'frame is refused. Write "allowed_tools", or remove the key.'
    );
  });
});

interface SharedFrameCase {
  id: string;
  form?: string;
  body: unknown;
  allowed_tools: unknown;
  core?: unknown;
  rust?: unknown;
  agent?: unknown;
  rust_frames?: unknown;
  permits?: unknown;
  denies?: unknown;
}

describe('the shared frame cases (fixtures/frame-allowlist-cases.json)', () => {
  const fixture = JSON.parse(
    readFileSync(resolve(import.meta.dirname, 'fixtures/frame-allowlist-cases.json'), 'utf8')
  ) as { schema: string; cases: SharedFrameCase[] };
  const isList = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((entry) => typeof entry === 'string');
  const permits = (list: string[], tool: string) =>
    list.includes(FRAME_ALLOW_ALL_TOOLS) || list.includes(tool);

  it('is the v2 format, and every case is well formed', () => {
    expect(fixture.schema).toBe('holoscript.frame-allowlist-cases.v2');
    expect(new Set(fixture.cases.map((c) => c.id)).size).toBe(fixture.cases.length);
    for (const c of fixture.cases) {
      expect(typeof c.body, c.id).toBe('string');
      expect([undefined, 'parens', 'source'], c.id).toContain(c.form);
      expect(isList(c.allowed_tools), c.id).toBe(true);
      for (const reader of ['core', 'rust', 'agent'] as const) {
        const own = c[reader];
        expect(own === undefined || own === 'rejects' || isList(own), `${c.id} ${reader}`).toBe(
          true
        );
      }
    }
  });

  it("never lets the agent's list permit a tool the canonical parser's list denies", () => {
    for (const c of fixture.cases) {
      if (c.core === 'rejects' || c.agent === 'rejects') continue;
      const canonical = (isList(c.core) ? c.core : c.allowed_tools) as string[];
      const agent = (isList(c.agent) ? c.agent : c.allowed_tools) as string[];
      const probes = [...agent, ...canonical, 'read', 'a_tool_nobody_named'];
      const wider = probes.filter((tool) => permits(agent, tool) && !permits(canonical, tool));
      expect(wider, c.id).toEqual([]);
    }
  });

  it('refuses a look-alike key in every reader, or in none', () => {
    for (const c of fixture.cases) {
      if (c.agent !== 'rejects') continue;
      expect([c.core, c.rust], c.id).toEqual(['rejects', 'rejects']);
    }
  });

  it('says which tools a list permits or denies only where every reader reads it alike', () => {
    const withExpectations = fixture.cases.filter((c) => c.permits || c.denies);
    expect(withExpectations.length).toBeGreaterThan(0);
    for (const c of withExpectations) {
      expect([c.core, c.rust, c.agent, c.rust_frames], c.id).toEqual([
        undefined,
        undefined,
        undefined,
        undefined,
      ]);
      const list = c.allowed_tools as string[];
      for (const tool of (c.permits ?? []) as string[]) {
        expect(permits(list, tool), `${c.id} permits ${JSON.stringify(tool)}`).toBe(true);
      }
      for (const tool of (c.denies ?? []) as string[]) {
        expect(permits(list, tool), `${c.id} denies ${JSON.stringify(tool)}`).toBe(false);
      }
    }
  });
});
