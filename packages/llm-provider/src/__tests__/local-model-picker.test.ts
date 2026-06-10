/**
 * Local model picker tests (founder 2026-06-10: discovery over hardcodes).
 * The behavioral probe is the load-bearing part: capability flags lie
 * (qwen2.5-coder reports `tools` yet emits call JSON as text).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pickLocalModel, __clearLocalModelPickerCache } from '../local-model-picker';

const BOX = 'http://box:11434';

type FetchRoute = (url: string, init?: RequestInit) => Promise<unknown> | unknown;

function stubOllama(opts: {
  models: Array<{ name: string; paramsB: string; caps: string[]; emitsToolCalls: boolean }>;
  tagsFails?: boolean;
}): ReturnType<typeof vi.fn> {
  const route: FetchRoute = (url, init) => {
    const u = String(url);
    if (u.endsWith('/api/tags')) {
      if (opts.tagsFails) return { ok: false, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          models: opts.models.map((m) => ({
            name: m.name,
            details: { parameter_size: m.paramsB },
          })),
        }),
      };
    }
    if (u.endsWith('/api/show')) {
      const model = JSON.parse(String(init?.body ?? '{}')).model as string;
      const m = opts.models.find((x) => x.name === model);
      return { ok: true, json: async () => ({ capabilities: m?.caps ?? [] }) };
    }
    if (u.endsWith('/v1/chat/completions')) {
      const model = JSON.parse(String(init?.body ?? '{}')).model as string;
      const m = opts.models.find((x) => x.name === model);
      // Faithful create_object call (the representative probe's pass shape).
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: m?.emitsToolCalls
                ? {
                    tool_calls: [
                      {
                        function: {
                          name: 'create_object',
                          arguments: '{"name":"orb-probe","primitive":"sphere","radius":2,"position":[1,2,3]}',
                        },
                      },
                    ],
                  }
                : { content: '{"tool":"create_object","tool_args":{"name":"orb-probe"}}' },
            },
          ],
        }),
      };
    }
    return { ok: false, json: async () => ({}) };
  };
  const spy = vi.fn(async (url: string, init?: RequestInit) => route(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => __clearLocalModelPickerCache());
afterEach(() => vi.unstubAllGlobals());

describe('pickLocalModel', () => {
  it('an explicit override wins without any network traffic', async () => {
    const spy = stubOllama({ models: [] });
    const c = await pickLocalModel(BOX, { override: 'pinned:1b' });
    expect(c).toMatchObject({ model: 'pinned:1b', source: 'override' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('picks the modern tool-capable model and verifies it behaviorally', async () => {
    stubOllama({
      models: [
        { name: 'old-coder:7b', paramsB: '7.6B', caps: ['completion', 'tools'], emitsToolCalls: false },
        { name: 'fresh:4b', paramsB: '4.7B', caps: ['completion', 'tools', 'thinking'], emitsToolCalls: true },
        { name: 'embed:0.5b', paramsB: '0.5B', caps: ['completion'], emitsToolCalls: false },
      ],
    });
    const c = await pickLocalModel(BOX);
    expect(c).toMatchObject({ model: 'fresh:4b', source: 'discovery', toolCallVerified: true });
    // The no-tools embedder never even ranks.
    expect(c.candidates).not.toContain('embed:0.5b');
  });

  it('a capability liar is skipped by the probe in favor of the next candidate', async () => {
    stubOllama({
      models: [
        // Liar ranks FIRST (modern + bigger) but fails the live probe.
        { name: 'liar:8b', paramsB: '8B', caps: ['completion', 'tools', 'thinking'], emitsToolCalls: false },
        { name: 'honest:4b', paramsB: '4B', caps: ['completion', 'tools', 'thinking'], emitsToolCalls: true },
      ],
    });
    const c = await pickLocalModel(BOX);
    expect(c.model).toBe('honest:4b');
    expect(c.toolCallVerified).toBe(true);
  });

  it('falls back to the static default when discovery is unreachable', async () => {
    stubOllama({ models: [], tagsFails: true });
    const c = await pickLocalModel(BOX, { fallback: 'fallback:4b' });
    expect(c).toMatchObject({ model: 'fallback:4b', source: 'fallback', toolCallVerified: false });
  });

  it('respects the parameter-size cap', async () => {
    stubOllama({
      models: [
        { name: 'giant:70b', paramsB: '70B', caps: ['completion', 'tools', 'thinking'], emitsToolCalls: true },
        { name: 'fit:7b', paramsB: '7.6B', caps: ['completion', 'tools', 'thinking'], emitsToolCalls: true },
      ],
    });
    const c = await pickLocalModel(BOX);
    expect(c.model).toBe('fit:7b');
  });

  it('caches the choice per endpoint until cleared', async () => {
    const spy = stubOllama({
      models: [
        { name: 'fresh:4b', paramsB: '4.7B', caps: ['completion', 'tools', 'thinking'], emitsToolCalls: true },
      ],
    });
    await pickLocalModel(BOX);
    const callsAfterFirst = spy.mock.calls.length;
    await pickLocalModel(BOX);
    expect(spy.mock.calls.length).toBe(callsAfterFirst);
    __clearLocalModelPickerCache();
    await pickLocalModel(BOX);
    expect(spy.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
