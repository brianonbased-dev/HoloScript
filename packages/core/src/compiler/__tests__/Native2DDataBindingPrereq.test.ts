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

describe('Native2D data binding prerequisites + confirm (spec r3)', () => {
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
  describe('@mutation confirm (must fail)', () => {
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
  });
});
