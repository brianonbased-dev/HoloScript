import { describe, it, expect } from 'vitest';
import { Native2DCompiler } from '../Native2DCompiler';
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
    it('a @fetch without r3 slots keeps the legacy output', () => {
      const legacy = panel([trait('fetch', { into: 'items', endpoint: '/api/x' })]);
      expect(legacy).toContain('fetch(`/api/x`)');
      expect(legacy).not.toContain('AbortController');
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
      expect(bad({ confirm: undefined })).toThrow(/DELETE requires confirm/);
    });
    it('MUST FAIL: destructive without confirm', () => {
      expect(bad({ method: 'POST', destructive: true, confirm: undefined })).toThrow(/destructive requires confirm/);
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
    it('on_ok flat form (remove + remove_where) matches the nested form', () => {
      const nested = bad({})();
      const flat = bad({ on_ok: { remove: 'apps', remove_where: 'id' } })();
      expect(flat).toBe(nested);
    });
    it('MUST FAIL: flat on_ok.remove without remove_where', () => {
      expect(bad({ on_ok: { remove: 'apps' } })).toThrow(/on_ok\.remove\.where/);
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
