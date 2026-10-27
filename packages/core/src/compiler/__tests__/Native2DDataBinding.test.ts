import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Native2DCompiler } from '../Native2DCompiler';
import { parseHolo } from '../../parser/HoloCompositionParser';
import { diagnoseVerifiedView } from '../../reconstruction/enforceVerifiedViewReceipts';
import { legacyFetchComposition } from './legacyFetchFixture';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

function trait(name: string, config: HoloObjectTrait['config']): HoloObjectTrait {
  return { type: 'ObjectTrait', name, config };
}

function obj(
  name: string,
  traits: HoloObjectTrait[],
  children: HoloObjectDecl[] = []
): HoloObjectDecl {
  return { type: 'Object', name, properties: [], traits, children };
}

function comp(objects: HoloObjectDecl[], state?: HoloComposition['state']): HoloComposition {
  return {
    type: 'Composition',
    name: 'ReactiveProbe',
    objects,
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...(state ? { state } : {}),
  } as HoloComposition;
}

const html = (c: HoloComposition) =>
  new Native2DCompiler().compile(c, '', undefined, { format: 'html' }) as string;
const react = (c: HoloComposition) =>
  new Native2DCompiler().compile(c, '', undefined, { format: 'react' }) as string;
/**
 * Native2DDataBinding.test.ts: compile tests for the Studio panel data-binding spec
 * (vision/specs/studio-panel-data-binding-proposal-20261026.md r3, sha FB259DAB...1177).
 * P1 and P2 pin what already worked; the rest pin the new @fetch status path, @when
 * operators, @mutation and @action{call|set|remove}, including every must-fail rule.
 */
const fetchApps = (extra: Record<string, unknown> = {}) =>
  trait('fetch', {
    endpoint: '/api/oauth/grants',
    into: 'apps',
    select: 'grants',
    cache: 'no-store',
    status: 'appsStatus',
    error: 'appsError',
    ...extra,
  });
const revokeMutation = (extra: Record<string, unknown> = {}) =>
  trait('mutation', {
    name: 'revoke',
    method: 'DELETE',
    endpoint: '/api/oauth/grants?id={id}',
    ok_status: [204, 404],
    pending: 'revokingId',
    error: 'appsError',
    error_text: "Couldn't revoke that app. Try again?",
    confirm: 'Revoke this app?',
    on_ok: { remove: { from: 'apps', where: 'id' } },
    ...extra,
  });
const revokeButton = () =>
  obj('Row', [trait('each', { state: 'apps', as: 'app' })], [
    obj('Revoke', [
      trait('button', { content: 'Revoke' }),
      trait('action', { call: 'revoke', args: { id: 'app.id' } }),
    ]),
  ]);
const panel = (traits: HoloObjectTrait[], children: HoloObjectDecl[] = []) =>
  react(comp([obj('Root', traits, children)]));

describe('Native2D data binding (spec r3)', () => {
  it('P1: nested @each compiles to nested maps with the inner loop var', () => {
    const r = react(
      comp([
        obj('Row', [trait('each', { state: 'apps', as: 'app' })], [
          obj('Scope', [
            trait('each', { state: 'app', path: 'scopes', as: 's' }),
            trait('text', { variant: 'caption' }),
            trait('bind', { state: 's' }),
          ]),
        ]),
      ], { type: 'State', properties: [{ type: 'StateProperty', key: 'apps', value: [] }] } as never)
    );
    expect(r).toContain('(apps ?? []).map((app, i)');
    expect(r).toContain('(app?.scopes ?? []).map((s, i)');
  });

  it('P2: role and data-testid pass through @theme attributes', () => {
    const r = panel([
      trait('theme', { attributes: '{"data-testid":"connected-apps","role":"alert"}' }),
    ]);
    expect(r).toContain('data-testid="connected-apps"');
    expect(r).toContain('role="alert"');
  });

  describe('@fetch status', () => {
    const r = panel([fetchApps({ error_text: "Couldn't load." })]);
    it('loads with AbortController, cache and select, and sets ready/empty', () => {
      expect(r).toContain('new AbortController()');
      expect(r).toContain("cache: \"no-store\", signal: ctrl.signal");
      expect(r).toContain('const value = body?.grants ?? null;');
      expect(r).toContain("? 'empty' : 'ready'");
      expect(r).toContain("useState<'loading' | 'error' | 'empty' | 'ready'>(\"loading\")");
      expect(r).toContain('ctrl.abort();');
    });
    it('non-OK throws before `into` is set, so into is left untouched', () => {
      const throwAt = r.indexOf('if (!r.ok) throw');
      expect(throwAt).toBeGreaterThan(-1);
      expect(throwAt).toBeLessThan(r.indexOf('setApps(value)'));
      expect(r).toContain("setAppsStatus('error');");
      expect(r).toContain('setAppsError("Couldn\'t load.");');
    });
    // Spec r3: "Without `status`, output is byte-identical to today". The golden files were
    // generated by the compiler at the merge base (a4fdbacc4), before this change.
    const golden = (name: string) => readFileSync(join(__dirname, '__golden__', name), 'utf8');
    it('a legacy @fetch (no status) compiles byte-identically to the pre-change output', () => {
      const c = new Native2DCompiler();
      expect(c.compile(legacyFetchComposition(), '', undefined, { format: 'react' })).toBe(
        golden('legacy-fetch.react.golden.txt')
      );
      expect(new Native2DCompiler().compile(legacyFetchComposition(), '', undefined, { format: 'html' })).toBe(
        golden('legacy-fetch.html.golden.txt')
      );
    });
    it('only `status` switches the guarded path: error/params/refresh alone leave legacy output unchanged', () => {
      const plain = panel([trait('fetch', { into: 'items', endpoint: '/api/x' })]);
      const extras = panel([
        trait('fetch', { into: 'items', endpoint: '/api/x', error: 'e', params: { q: 'query' }, refresh: { every_ms: 5000 } }),
      ]);
      expect(extras).toBe(plain);
      expect(plain).not.toContain('AbortController');
    });
    it('error_text absent: the error slot holds "HTTP <status>" or "Network error", never blank', () => {
      const p = panel([fetchApps()]);
      expect(p).toContain(
        "setAppsError((e instanceof Error && e.message.startsWith('HTTP ') ? e.message : 'Network error'));"
      );
    });
    it('refresh polls with cleanup', () => {
      const p = panel([fetchApps({ refresh: { every_ms: 5000 } })]);
      expect(p).toContain('setInterval(load, 5000)');
      expect(p).toContain('clearInterval(timer)');
    });
    it('MUST FAIL: every_ms < 5000', () => {
      expect(() => panel([fetchApps({ refresh: { every_ms: 4999 } })])).toThrow(/every_ms/);
    });
    it('params placeholders are encoded; unknown placeholders fail', () => {
      const p = react(
        comp([obj('Root', [fetchApps({ endpoint: '/api/x?q={q}', params: { q: 'query' } })])], {
          type: 'State',
          properties: [{ type: 'StateProperty', key: 'query', value: '' }],
        } as never)
      );
      expect(p).toContain("/api/x?q=${encodeURIComponent(String(query ?? ''))}");
      expect(() => panel([fetchApps({ endpoint: '/api/x?q={nope}' })])).toThrow(/unknown placeholder/);
    });
  });

  describe('@when operators', () => {
    const w = (cfg: Record<string, unknown>) =>
      panel([fetchApps(), revokeMutation()], [
        revokeButton(),
        obj('W', [trait('when', cfg), trait('text', { content: 'x' })]),
      ]);
    it('not_eq, present and eq{ref}', () => {
      expect(w({ state: 'appsStatus', not_eq: 'ready' })).toContain('(appsStatus) !== "ready"');
      expect(w({ state: 'appsError', present: true })).toContain('(appsError) != null');
      expect(w({ state: 'appsError', present: false })).toContain('(appsError) == null');
      expect(w({ state: 'revokingId', eq: { ref: 'apps.length' } })).toContain('(revokingId) === apps?.length');
    });
    it('MUST FAIL: a status literal outside loading|error|empty|ready', () => {
      expect(() => w({ state: 'appsStatus', eq: 'done' })).toThrow(/not a fetch status/);
      expect(() => w({ state: 'appsStatus', not_eq: 'done' })).toThrow(/not a fetch status/);
      expect(() => w({ state: 'appsStatus', eq: 'done' })).toThrow(/Use one of those four words/);
    });
    it('MUST FAIL: a numeric literal on a status slot', () => {
      expect(() => w({ state: 'appsStatus', eq: 1 })).toThrow(/holds a word, not a number/);
      expect(() => w({ state: 'appsStatus', not_eq: 0 })).toThrow(/holds a word, not a number/);
    });
    it('a numeric literal on a non-status slot is still fine', () => {
      expect(w({ state: 'revokingId', not_eq: 3 })).toContain('(revokingId) !== 3');
      expect(w({ state: 'revokingId', eq: 3 })).toContain('(revokingId) === 3');
    });
    it('MUST FAIL: not_eq with a { ref } (only eq takes a ref)', () => {
      expect(() => w({ state: 'revokingId', not_eq: { ref: 'apps.length' } })).toThrow(/not_eq takes a plain word or number/);
    });
    it('MUST FAIL: eq{ref} to an undeclared name is VIEW-UNGROUNDED', () => {
      expect(() => w({ state: 'appsStatus', eq: { ref: 'ghost.id' } })).toThrow(/VIEW-UNGROUNDED/);
    });
  });

  describe('@mutation', () => {
    const r = panel([fetchApps({ status: 'appsStatus' }), revokeMutation()], [revokeButton()]);
    it('confirms before the request, guards unmount, removes on OK', () => {
      expect(r.indexOf('window.confirm("Revoke this app?")')).toBeGreaterThan(-1);
      expect(r.indexOf('window.confirm(')).toBeLessThan(r.indexOf("method: 'DELETE'"));
      expect(r).toContain("/api/oauth/grants?id=${encodeURIComponent(String(args[\"id\"] ?? ''))}");
      expect(r).toContain('[204, 404].includes(r.status)');
      expect(r).toContain('if (!mountedRef.current) return;');
      expect(r).toContain('?.["id"] !== args["id"]');
      expect(r).toContain("import React, { useState, useEffect, useRef } from 'react';");
      expect(r).toContain('void revoke({ id: app?.id })');
      expect(r).toContain('disabled={revokingId != null && revokingId === app?.id}');
      expect(r).toContain("setAppsStatus('empty')");
    });
    const bad = (extra: Record<string, unknown>) => () =>
      panel([fetchApps(), revokeMutation(extra)], [revokeButton()]);
    it('MUST FAIL: DELETE without confirm', () => {
      expect(bad({ confirm: undefined })).toThrow(/This delete needs a confirm sentence/);
    });
    it('MUST FAIL: destructive without confirm', () => {
      expect(bad({ method: 'POST', destructive: true, confirm: undefined })).toThrow(/This destructive action needs a confirm sentence/);
    });
    it('MUST FAIL: confirm ""', () => {
      expect(bad({ confirm: '' })).toThrow(/non-empty/);
    });
    it('MUST FAIL: missing method or endpoint', () => {
      expect(bad({ method: undefined })).toThrow(/method is required/);
      expect(bad({ endpoint: undefined })).toThrow(/endpoint is required/);
    });
    it('MUST FAIL: on_error present', () => {
      expect(bad({ on_error: { set: { x: 1 } } })).toThrow(/on_error/);
    });
    it('MUST FAIL: unknown placeholder in endpoint or body; mixed text in body', () => {
      expect(bad({ endpoint: '/api/x?id={nope}' })).toThrow(/unknown placeholder/);
      expect(bad({ method: 'POST', confirm: undefined, body: { a: '{nope}' } })).toThrow(/unknown placeholder/);
      expect(bad({ method: 'POST', confirm: undefined, body: { a: 'id-{id}' } })).toThrow(/mixes text/);
    });
    it('body values: exact placeholder or literal, JSON encoded', () => {
      const p = bad({ method: 'POST', confirm: undefined, body: { id: '{id}', force: true } })();
      expect(p).toContain('body: JSON.stringify({ id: args["id"], force: true })');
    });
    it('MUST FAIL: the flat on_ok form (remove + remove_where) is not spec syntax', () => {
      expect(bad({ on_ok: { remove: 'apps', remove_where: 'id' } })).toThrow(/on_ok\.remove_where is not supported/);
      expect(bad({ on_ok: { remove: 'apps' } })).toThrow(/on_ok\.remove needs both from and where/);
      expect(bad({ on_ok: { remove: { from: 'apps' } } })).toThrow(/on_ok\.remove needs both from and where/);
    });
    it('MUST FAIL: destructive that is not true/false', () => {
      for (const v of ['yes', 'true', 1, 0, null]) {
        expect(bad({ method: 'POST', destructive: v })).toThrow(/destructive must be true or false/);
      }
    });
    it('destructive: true with a confirm is valid and confirms first; destructive: false needs none', () => {
      const ok = bad({ method: 'POST', destructive: true, confirm: 'Wipe everything?' })();
      expect(ok).toContain('window.confirm("Wipe everything?")');
      expect(ok.indexOf('window.confirm(')).toBeLessThan(ok.indexOf("method: 'POST'"));
      expect(bad({ method: 'POST', destructive: false, confirm: undefined })()).not.toContain('window.confirm');
    });
    it('MUST FAIL: notice is named in the spec but not implemented, so it is refused, not ignored', () => {
      expect(bad({ notice: 'appsNotice' })).toThrow(/notice is not supported yet/);
    });
    it('error messages end with a plain fix line', () => {
      expect(bad({ confirm: undefined })).toThrow(
        'This delete needs a confirm sentence. Add confirm: "Remove this app?" to the @mutation.'
      );
      expect(bad({ method: undefined })).toThrow(/Add method: "POST"/);
      expect(bad({ confirm: '' })).toThrow(/Write the question people will see/);
      expect(bad({ endpoint: '/api/x?id={nope}' })).toThrow(/Pass it as a named arg on the @action/);
    });
    it('error_text absent: the mutation error slot holds "HTTP <status>" or "Network error"', () => {
      const p = bad({ error_text: undefined })();
      expect(p).toContain(
        "setAppsError((e instanceof Error && e.message.startsWith('HTTP ') ? e.message : 'Network error'));"
      );
      expect(bad({})()).toContain('setAppsError("Couldn\'t revoke that app. Try again?");');
    });
    it('body: a literal with a quote is JSON-encoded; "a\"b{x}" (text mixed with a placeholder) is rejected', () => {
      const p = bad({ method: 'POST', confirm: undefined, body: { label: 'a"b' } })();
      expect(p).toContain('body: JSON.stringify({ label: "a\\"b" })');
      expect(bad({ method: 'POST', confirm: undefined, body: { label: 'a"b{id}' } })).toThrow(/mixes text/);
    });
    describe('on_ok.set and on_ok.refetch', () => {
      const note = {
        type: 'State',
        properties: [{ type: 'StateProperty', key: 'note', value: '' }],
      } as never;
      const withOnOk = (onOk: Record<string, unknown>, fetch = fetchApps()) => () =>
        react(
          comp(
            [obj('Root', [fetch, revokeMutation({ method: 'POST', confirm: undefined, on_ok: onOk })], [revokeButton()])],
            note
          )
        );
      it('set writes the literal into declared state after an OK response', () => {
        const p = withOnOk({ set: { note: 'saved' } })();
        expect(p).toContain('setNote("saved");');
        expect(p.indexOf("throw new Error(`HTTP")).toBeLessThan(p.indexOf('setNote("saved");'));
      });
      it('refetch bumps the target @fetch reload counter, which that @fetch depends on', () => {
        const p = withOnOk({ refetch: 'apps' })();
        expect(p).toContain('const [appsReload, setAppsReload] = useState(0);');
        expect(p).toContain('setAppsReload((n) => n + 1);');
        expect(p).toMatch(/\}, \[appsReload\]\);/);
      });
      it('MUST FAIL: set of an undeclared name; refetch of a @fetch without status', () => {
        expect(withOnOk({ set: { ghost: 1 } })).toThrow(/on_ok\.set "ghost" is not declared state\. Add it to state/);
        expect(() =>
          withOnOk({ refetch: 'items' }, trait('fetch', { into: 'items', endpoint: '/api/x' }))()
        ).toThrow(/is not a @fetch with status\. Add status/);
      });
    });
  });

  describe('through the .holo parser (text in, React out)', () => {
    const holo = (onOk: string, extra = '') => `composition "Apps" {
  @verified_view
  object "Root" {
    @fetch { endpoint: "/api/grants", into: "apps", select: "grants", status: "appsStatus", error: "appsError" }
    @mutation { name: "revoke", method: "DELETE", endpoint: "/api/grants?id={id}", ok_status: [204, 404], pending: "revokingId", error: "appsError", confirm: "Remove this app?", ${onOk}${extra} }
    object "Banner" { @when { state: "appsError", present: true } @text { variant: "body" } @bind { state: "appsError" } @projects { node: "appsError" } }
    object "Row" {
      @each { state: "apps", as: "app" }
      @projects { node: "apps" }
      object "Name" { @text { variant: "body" } @bind { state: "app", path: "name" } @projects { node: "app.name" } }
      object "Revoke" { @button { content: "Revoke" } @action { call: "revoke", args: { id: "app.id" } } }
    }
  }
}`;
    const compile = (src: string): string => {
      const parsed = parseHolo(src);
      expect(parsed.success).toBe(true);
      return new Native2DCompiler().compile(parsed.ast as HoloComposition, '', undefined, { format: 'react' }) as string;
    };
    const SPEC_ON_OK = 'on_ok: { remove: { from: "apps", where: "id" } }';
    it('the spec form on_ok: { remove: { from, where } } survives parsing and removes the row', () => {
      const r = compile(holo(SPEC_ON_OK));
      expect(r).toContain('setApps((prev: unknown) => (Array.isArray(prev) ? prev.filter(');
      expect(r).toContain('?.["id"] !== args["id"]');
      expect(r).toContain('window.confirm("Remove this app?")');
    });
    it('MUST FAIL (from text): the flat on_ok form', () => {
      expect(() => compile(holo('on_ok: { remove: "apps", remove_where: "id" }'))).toThrow(/on_ok\.remove_where is not supported/);
    });
    it('MUST FAIL (from text): DELETE with no confirm sentence', () => {
      const src = holo(SPEC_ON_OK).replace('confirm: "Remove this app?", ', '');
      expect(() => compile(src)).toThrow(/needs a confirm sentence/);
    });
    it('body "a\\"b{id}" written in .holo text is rejected as mixed text', () => {
      const src = holo(SPEC_ON_OK, ', body: { label: "a\\"b{id}" }');
      expect(() => compile(src)).toThrow(/mixes text|unknown placeholder/);
    });
  });

  describe('@verified_view: status / error / pending names are roots only when declared', () => {
    const src = (omit: 'status' | 'error' | 'pending' | null, node: string) => `composition "S" {
  @verified_view
  object "Root" {
    @fetch { endpoint: "/api/grants", into: "apps", ${omit === 'status' ? '' : 'status: "appsStatus", '}${omit === 'error' ? '' : 'error: "appsError", '}select: "grants" }
    @mutation { name: "revoke", method: "POST", endpoint: "/api/revoke", ${omit === 'pending' ? '' : 'pending: "revokingId", '}${omit === 'error' ? '' : 'error: "revokeError", '}ok_status: [200] }
    object "Slot" { @text { variant: "body" } @bind { state: "${node}" } @projects { node: "${node}" } }
  }
}`;
    const compile = (s: string): string => {
      const parsed = parseHolo(s);
      expect(parsed.success).toBe(true);
      return new Native2DCompiler().compile(parsed.ast as HoloComposition, '', undefined, { format: 'react' }) as string;
    };
    const cases: Array<['status' | 'error' | 'pending', string]> = [
      ['status', 'appsStatus'],
      ['error', 'appsError'],
      ['error', 'revokeError'],
      ['pending', 'revokingId'],
    ];
    for (const [key, node] of cases) {
      it(`declared ${key} "${node}" is a projection root`, () => {
        const s = src(null, node);
        expect(compile(s)).toContain(`data-holo-projects="${node}"`);
        expect(diagnoseVerifiedView(s).complete).toBe(true);
      });
      it(`MUST FAIL: ${key} "${node}" that nothing declares is VIEW-UNGROUNDED`, () => {
        const s = src(key, node);
        expect(() => compile(s)).toThrow(/VIEW-UNGROUNDED/);
      });
    }
    it('MUST FAIL: a made-up name is VIEW-UNGROUNDED even when other slots exist', () => {
      expect(() => compile(src(null, 'ghostStatus'))).toThrow(/VIEW-UNGROUNDED/);
    });
  });

  describe('@action call / remove', () => {
    const act = (cfg: Record<string, unknown>) => () =>
      panel([fetchApps(), revokeMutation()], [
        obj('Row', [trait('each', { state: 'apps', as: 'app' })], [obj('B', [trait('action', cfg)])]),
      ]);
    it('MUST FAIL: positional args with call', () => {
      expect(act({ call: 'revoke', args: ['x'] })).toThrow(/positional args/);
    });
    it('MUST FAIL: emit with call', () => {
      expect(act({ call: 'revoke', emit: 'x', args: { id: 'app.id' } })).toThrow(/emit cannot be combined/);
    });
    it('MUST FAIL: call names no @mutation; arg ref undeclared', () => {
      expect(act({ call: 'nope', args: { id: 'app.id' } })).toThrow(/names no @mutation/);
      expect(act({ call: 'revoke', args: { id: 'ghost.id' } })).toThrow(/VIEW-UNGROUNDED/);
    });
    it('remove filters locally by the named arg', () => {
      const p = panel([fetchApps()], [
        obj('Row', [trait('each', { state: 'apps', as: 'app' })], [
          obj('B', [trait('action', { remove: { from: 'apps', where: 'id' }, args: { id: 'app.id' } })]),
        ]),
      ]);
      expect(p).toContain('setApps((prev: unknown) => (Array.isArray(prev) ? prev.filter(');
      expect(p).toContain('?.["id"] !== app?.id');
    });
  });
});
