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
import { eventBus, bridgeCoreEventBus } from '../events.js';
import { getSharedEventBus } from '@holoscript/core';
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

/**
 * The two buses, bridged.
 *
 * THE GAP. Traits emit through core's shared bus (HoloScriptRuntime.globalBusEmit ->
 * getSharedEventBus().emit). Compositions listen on the runtime bus
 * (packages/runtime/src/events.ts). They are different classes with different APIs — core's
 * on() returns a numeric listener id and off(id) takes it; runtime's on() returns an
 * unsubscribe function — so they were never interchangeable, and nothing joined them.
 * setSharedEventBus is exported and called nowhere in the repo.
 *
 * Consequence: a trait announcing `memory_recalled` and a composition declaring
 * `on_memory_recalled { ... }` were on opposite sides of a wall, each working correctly.
 *
 * Direction is core -> runtime ONLY. runtime's emit never calls into core, so one-way
 * forwarding cannot loop; the guard below exists so that a future second direction, or a
 * handler that re-emits the event it is handling, cannot turn this into a stack overflow.
 * The bridge lives in runtime because runtime depends on @holoscript/core and not the
 * reverse — putting it in core would invert the package dependency.
 */
describe('bridging the core bus to the runtime bus', () => {
  let stop: (() => void) | undefined;

  beforeEach(() => {
    eventBus.clear();
    getSharedEventBus().clear();
  });
  afterEach(() => {
    stop?.();
    stop = undefined;
    eventBus.clear();
    getSharedEventBus().clear();
  });

  it('delivers a core-bus emit to a runtime-bus listener, name and payload intact', () => {
    const seen: Array<{ name: string; data: unknown }> = [];
    eventBus.on('memory_recalled', (data) => seen.push({ name: 'memory_recalled', data }));

    stop = bridgeCoreEventBus();
    getSharedEventBus().emit('memory_recalled', { query: 'q', total: 2 });

    expect(seen).toHaveLength(1);
    // The wildcard listener receives {event, data}; forwarding must unwrap it, or every
    // listener gets the envelope instead of its payload.
    expect(seen[0].data).toEqual({ query: 'q', total: 2 });
  });

  // THE WHOLE CHAIN. This is the property the two commits exist for: a trait announces the
  // bare name on core's bus, and a composition's declared on_-prefixed hook runs.
  it('runs a composition hook declared on_X when a trait emits X on the core bus', () => {
    const ran: string[] = [];
    const handlers = new Map([
      ['on_memory_recalled', { name: 'on_memory_recalled', params: ['data'], body: [] }],
    ]);
    const unsubHandlers = subscribeCompositionHandlers(handlers, (def) => ran.push(def.name));
    stop = () => {
      unsubHandlers();
      bridgeStop();
    };
    const bridgeStop = bridgeCoreEventBus();

    // AgentMemoryTrait.ts:402 emits exactly this, on exactly this bus.
    getSharedEventBus().emit('memory_recalled', { query: 'q' });

    expect(ran).toEqual(['on_memory_recalled']);
  });

  it('delivers once per emit, not once per listener registration', () => {
    let count = 0;
    eventBus.on('twin_sync', () => {
      count += 1;
    });
    stop = bridgeCoreEventBus();

    getSharedEventBus().emit('twin_sync', {});
    expect(count).toBe(1);
  });

  // TEETH: the bridge must be removable, or a disposed runtime keeps receiving forever.
  it('stops forwarding once unbridged', () => {
    let count = 0;
    eventBus.on('plane_lost', () => {
      count += 1;
    });
    const off = bridgeCoreEventBus();

    getSharedEventBus().emit('plane_lost', {});
    expect(count).toBe(1);

    off();
    getSharedEventBus().emit('plane_lost', {});
    expect(count).toBe(1);
  });

  // TEETH: one-way. Runtime-bus traffic must NOT appear on the core bus, or the next person
  // to bridge the other direction gets an infinite loop and this test is why they don't.
  it('does not forward runtime-bus events back onto the core bus', () => {
    const onCore: string[] = [];
    getSharedEventBus().on('*', (p) => onCore.push((p as { event: string }).event));
    stop = bridgeCoreEventBus();

    eventBus.emit('runtime_only_event', {});
    expect(onCore).toEqual([]);
  });

  // TEETH: the re-entrancy guard must be per EVENT, not a single flag. A global flag would
  // silently swallow an unrelated event emitted while another was mid-forward — a real
  // cascade dropped with no error, which is the failure shape this whole arc keeps finding.
  it('still forwards a DIFFERENT event emitted while one is being forwarded', () => {
    const seen: string[] = [];
    eventBus.on('first', () => {
      seen.push('first');
      getSharedEventBus().emit('second', {});
    });
    eventBus.on('second', () => seen.push('second'));
    stop = bridgeCoreEventBus();

    getSharedEventBus().emit('first', {});
    expect(seen).toEqual(['first', 'second']);
  });

  // TEETH: a handler that re-emits the event it is handling must not recurse forever.
  it('survives a handler that re-emits the same event on the core bus', () => {
    let count = 0;
    eventBus.on('echo', () => {
      count += 1;
      if (count < 50) getSharedEventBus().emit('echo', {});
    });
    stop = bridgeCoreEventBus();

    expect(() => getSharedEventBus().emit('echo', {})).not.toThrow();
    // Re-entrant forwarding is suppressed, so the echo does not cascade.
    expect(count).toBe(1);
  });
});
