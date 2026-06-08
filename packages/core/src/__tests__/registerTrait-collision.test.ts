/**
 * registerTrait collision guard (premortem 2026-06-07, task_1780881034070_wnlv).
 *
 * The trait-handler map is shared across all plugins. Wiring ~50 domain plugins
 * risks two registering the same trait name, and a blind `Map.set` silently
 * shadows the first solver with the second (wrong-solver-runs-silently — a
 * dangerous class in e.g. medical surfaces). The guard is keep-first + warn.
 *
 * This drives the REAL dispatch path (executeNode -> orb-executor ->
 * applyDirectives -> traitHandlers.get -> onAttach) to prove WHICH handler runs,
 * rather than inspecting the private map directly.
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '../HoloScriptRuntime';
import { registerPluginTraits } from '../runtime/plugin-trait-registrar';

function dupOrb(): unknown {
  return {
    type: 'orb',
    name: 'collider',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#ffffff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'dup_trait', config: {} }],
  };
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('registerTrait collision guard (task_1780881034070_wnlv)', () => {
  it('keep-first: a duplicate trait name does NOT overwrite the first handler', async () => {
    const runtime = new HoloScriptRuntime();
    const fired: string[] = [];

    const makeHandler = (marker: string) => ({
      name: 'dup_trait',
      onAttach: (
        _node: unknown,
        _config: unknown,
        ctx: { emit: (event: string, payload?: unknown) => void },
      ) => ctx.emit('dup_fired', { marker }),
    });

    runtime.registerTrait('dup_trait', makeHandler('FIRST') as never);
    runtime.registerTrait('dup_trait', makeHandler('SECOND') as never); // must be ignored

    runtime.on('dup_fired', (e: unknown) => fired.push((e as { marker: string }).marker));

    await runtime.executeNode(dupOrb() as never);
    await flush();

    // Only the first-registered handler runs; the duplicate was rejected
    // (keep-first), not silently shadowing the original.
    expect(fired).toEqual(['FIRST']);
  });

  it('shared registrar (registerPluginTraits): two plugins claiming one name -> keep-first', async () => {
    const runtime = new HoloScriptRuntime();
    const fired: string[] = [];

    const handlerFor = (marker: string) => ({
      name: 'shared_dup',
      onAttach: (
        _node: unknown,
        _config: unknown,
        ctx: { emit: (event: string, payload?: unknown) => void },
      ) => ctx.emit('shared_dup_fired', { marker }),
    });

    // Two different plugins register the same trait name through the shared
    // P1 registrar; the owner-tagged collision guard keeps the first.
    registerPluginTraits(runtime, 'plugin-alpha', [handlerFor('ALPHA')]);
    registerPluginTraits(runtime, 'plugin-beta', [handlerFor('BETA')]);

    runtime.on('shared_dup_fired', (e: unknown) => fired.push((e as { marker: string }).marker));

    const orb = {
      type: 'orb',
      name: 'shared_collider',
      properties: {},
      methods: [],
      position: [0, 0, 0],
      hologram: { shape: 'orb', color: '#ffffff', size: 1, glow: false, interactive: false },
      directives: [{ type: 'trait', name: 'shared_dup', config: {} }],
    };
    await runtime.executeNode(orb as never);
    await flush();

    expect(fired).toEqual(['ALPHA']);
  });
});
