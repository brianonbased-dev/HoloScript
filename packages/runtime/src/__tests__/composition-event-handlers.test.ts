/**
 * A declared lifecycle hook must actually run when its event fires.
 *
 * THE DEFECT THIS PINS. A HoloScript author writes `on_memory_recalled { ... }`. The parser
 * accepts it — `LIFECYCLE_HOOKS` in packages/core/src/constants.ts declares that exact name,
 * so it is documented and spelled correctly. extractLogicFromAST collects it into
 * CompositionLogic.eventHandlers. And then nothing ever reads that map.
 *
 * Measured 2026-09-09 on BrowserRuntime.ts: four handler maps come out of the same builder,
 * and only three are ever dispatched —
 *     frameHandlers     1 dispatch site
 *     keyboardHandlers  2 dispatch sites
 *     actions           3 dispatch sites
 *     eventHandlers     0
 * `logic.eventHandlers` is read nowhere in packages/runtime or packages/core.
 * (`logic.actions` reads fine in the same file, so that count is not a blind search.)
 *
 * The second half of the break is the name. Traits emit the BARE event — AgentMemoryTrait
 * emits 'memory_recalled' — while the declared hook is 'on_memory_recalled', and the bare
 * name appears zero times in the catalog. The bus dispatches by literal string, so even a
 * wired map would miss. Compilers each paper over this locally: ColyseusCompiler tries
 * `h.event === eventName || h.event === \`on_${eventName}\` || h.event.includes(eventName)`,
 * DTDLCompiler strips /^on_/. The runtime resolved it nowhere.
 *
 * Net effect for a non-developer: you can write "when memory is recalled, do this", have it
 * accepted, and it silently never runs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventBus } from '../events.js';
import {
  handlerEventAliases,
  subscribeCompositionHandlers,
  type ActionDefinition,
} from '../browser/BrowserRuntime.js';

function handler(name: string): ActionDefinition {
  return { name, params: ['data'], body: [] };
}

describe('declared lifecycle hooks are dispatched', () => {
  let unsubscribe: (() => void) | undefined;

  beforeEach(() => eventBus.clear());
  afterEach(() => {
    unsubscribe?.();
    unsubscribe = undefined;
    eventBus.clear();
  });

  it('runs an on_-prefixed hook when the trait emits the BARE event name', () => {
    const ran: Array<{ name: string; data: unknown }> = [];
    const handlers = new Map([['on_memory_recalled', handler('on_memory_recalled')]]);

    unsubscribe = subscribeCompositionHandlers(handlers, (def, args) => {
      ran.push({ name: def.name, data: args[0] });
    });

    // AgentMemoryTrait.ts:402 emits exactly this, bare.
    eventBus.emit('memory_recalled', { query: 'q', total: 2 });

    expect(ran).toHaveLength(1);
    expect(ran[0].name).toBe('on_memory_recalled');
    expect(ran[0].data).toEqual({ query: 'q', total: 2 });
  });

  it('also runs when something emits the declared name verbatim', () => {
    const ran: string[] = [];
    const handlers = new Map([['on_twin_sync', handler('on_twin_sync')]]);
    unsubscribe = subscribeCompositionHandlers(handlers, (def) => ran.push(def.name));

    eventBus.emit('on_twin_sync', {});
    expect(ran).toEqual(['on_twin_sync']);
  });

  it('runs a hook declared WITHOUT the prefix too', () => {
    const ran: string[] = [];
    const handlers = new Map([['custom_thing', handler('custom_thing')]]);
    unsubscribe = subscribeCompositionHandlers(handlers, (def) => ran.push(def.name));

    eventBus.emit('custom_thing', {});
    expect(ran).toEqual(['custom_thing']);
  });

  // TEETH. Wiring dispatch must not make everything fire on everything.
  it('does not run a hook for an unrelated event', () => {
    const ran: string[] = [];
    const handlers = new Map([['on_memory_recalled', handler('on_memory_recalled')]]);
    unsubscribe = subscribeCompositionHandlers(handlers, (def) => ran.push(def.name));

    eventBus.emit('plane_lost', {});
    eventBus.emit('memory_recalled_extra', {});
    eventBus.emit('on_memory_recalled_extra', {});
    expect(ran).toEqual([]);
  });

  // A hook must fire ONCE even though it is subscribed under two aliases, or every handler
  // double-runs the moment anything emits the prefixed form.
  it('runs once per emit, not once per alias', () => {
    const ran: string[] = [];
    const handlers = new Map([['on_plane_updated', handler('on_plane_updated')]]);
    unsubscribe = subscribeCompositionHandlers(handlers, (def) => ran.push(def.name));

    eventBus.emit('plane_updated', {});
    expect(ran).toHaveLength(1);
    eventBus.emit('on_plane_updated', {});
    expect(ran).toHaveLength(2);
  });

  // Reloading a composition must not leave the old one listening.
  it('unsubscribes cleanly so a reloaded composition does not double-fire', () => {
    const ran: string[] = [];
    const handlers = new Map([['on_audio_start', handler('on_audio_start')]]);
    const stop = subscribeCompositionHandlers(handlers, (def) => ran.push(def.name));

    eventBus.emit('audio_start', {});
    expect(ran).toHaveLength(1);

    stop();
    eventBus.emit('audio_start', {});
    expect(ran).toHaveLength(1);
  });

  it('maps a declared name to the aliases it must listen on', () => {
    expect(handlerEventAliases('on_memory_recalled')).toEqual([
      'on_memory_recalled',
      'memory_recalled',
    ]);
    // No prefix to strip: one alias, and no empty-string alias that would match nothing.
    expect(handlerEventAliases('custom_thing')).toEqual(['custom_thing']);
    expect(handlerEventAliases('on_')).toEqual(['on_']);
  });
});
