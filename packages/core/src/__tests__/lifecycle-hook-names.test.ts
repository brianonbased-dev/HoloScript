/**
 * ONE canonical relationship between a declared hook and the event it reacts to.
 *
 * THE MISMATCH THIS SETTLES. The catalog and the emitters disagreed, and nothing owned the
 * relationship between them. Measured 2026-09-09 across packages/core/src/traits:
 *
 *   LIFECYCLE_HOOKS      164 entries, 164 of them `on_`-prefixed — a clean, uniform
 *                        DECLARATION vocabulary
 *   emitted event names  1,803 distinct: 1,592 bare, 211 `on_`-prefixed
 *   drift, not design    71 of the 77 files that emit a prefixed name ALSO emit bare ones,
 *                        so individual traits are inconsistent with themselves
 *
 * So `on_` is a declaration prefix — you declare `on_memory_recalled` to react to the event
 * `memory_recalled`, exactly as the DOM has you declare `onclick` for the `click` event. The
 * bare name is the event.
 *
 * Before this, five places each re-derived that rule differently and none of them shared:
 *   ColyseusCompiler:1104   `h.event === e || h.event === \`on_${e}\` || h.event.includes(e)`
 *   DTDLCompiler:586        `.replace(/^on_/, '')`
 *   DTDLCompiler:452        `event?.startsWith('on_')`
 *   A2AAgentCardCompiler:514 `event.startsWith('on_')`
 *   LensStudioCompiler:604  `\`on_${this.toVarName(handler.event)}\``
 * and the runtime resolved it nowhere at all, which is why a declared hook never ran.
 */
import { describe, it, expect } from 'vitest';
import {
  HOOK_PREFIX,
  LIFECYCLE_HOOKS,
  eventNameForHook,
  hookNameForEvent,
  hookListenNames,
  hasHookPrefix,
  isHookName,
} from '../constants';

describe('lifecycle hook <-> event name', () => {
  it('strips the declaration prefix to get the event', () => {
    expect(eventNameForHook('on_memory_recalled')).toBe('memory_recalled');
    expect(eventNameForHook('on_twin_sync')).toBe('twin_sync');
  });

  it('adds the declaration prefix to get the hook', () => {
    expect(hookNameForEvent('memory_recalled')).toBe('on_memory_recalled');
  });

  it('is idempotent in both directions, so double-prefixing is impossible', () => {
    // The drifted emitters send `on_accessory_connected`; asking for its hook must not
    // produce `on_on_accessory_connected`, which is what a bare concatenation would give.
    expect(hookNameForEvent('on_accessory_connected')).toBe('on_accessory_connected');
    expect(eventNameForHook('memory_recalled')).toBe('memory_recalled');
  });

  it('round-trips every one of the 164 catalog hooks', () => {
    for (const hook of LIFECYCLE_HOOKS) {
      expect(hookNameForEvent(eventNameForHook(hook))).toBe(hook);
    }
  });

  it('recognises catalog entries as hook names', () => {
    expect(isHookName('on_memory_recalled')).toBe(true);
    expect(isHookName('memory_recalled')).toBe(false);
  });

  // The catalog is NOT closed: the parser accepts hook blocks whose names are absent from
  // LIFECYCLE_HOOKS. Guarding on catalog membership instead of prefix shape therefore drops
  // every author-invented hook — which is exactly the mistake three compiler tests caught
  // when this adoption first used isHookName as the guard.
  it('separates hook SHAPE from catalog membership', () => {
    expect(hasHookPrefix('on_something_nobody_catalogued')).toBe(true);
    expect(isHookName('on_something_nobody_catalogued')).toBe(false);
    expect(hasHookPrefix('memory_recalled')).toBe(false);
    // The bare prefix is not a hook shape either — it would strip to nothing.
    expect(hasHookPrefix(HOOK_PREFIX)).toBe(false);
  });

  // TEETH: the prefix alone must not strip to an empty string, which would map a hook onto a
  // name nothing can ever emit — a listener silently subscribed to nothing.
  it('refuses to produce an empty event name', () => {
    expect(eventNameForHook(HOOK_PREFIX)).toBe(HOOK_PREFIX);
    expect(eventNameForHook('')).toBe('');
    expect(hookListenNames(HOOK_PREFIX)).toEqual([HOOK_PREFIX]);
  });

  it('lists both names a declared hook must listen on, without duplicates', () => {
    expect(hookListenNames('on_memory_recalled')).toEqual([
      'on_memory_recalled',
      'memory_recalled',
    ]);
    // A hook declared without the prefix listens on one name, not the same name twice.
    expect(hookListenNames('custom_thing')).toEqual(['custom_thing']);
  });

  // The catalog is the reason the rule is what it is; if it stops being uniform, the rule
  // needs revisiting rather than silently misfiling half the hooks.
  it('the catalog is still uniformly prefixed', () => {
    const unprefixed = LIFECYCLE_HOOKS.filter((h) => !h.startsWith(HOOK_PREFIX));
    expect(unprefixed).toEqual([]);
    expect(LIFECYCLE_HOOKS.length).toBeGreaterThan(150);
  });
});
