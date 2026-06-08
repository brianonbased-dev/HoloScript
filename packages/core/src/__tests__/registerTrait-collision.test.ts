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
});
