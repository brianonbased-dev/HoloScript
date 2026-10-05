/**
 * Lifecycle bodies in the headless runtime are parsed into typed statements and
 * interpreted, never evaluated as text (task_1790602604837_whpw, item 3).
 *
 * Before, a body holding `;` or `{` went to `new Function`. It ran as JavaScript
 * with every host global in reach, a bare assignment made a global, and
 * `state.x = ...` wrote onto the state object instead of into state, so
 * getState() never saw it. These use ordinary bodies an author may write.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoloScriptPlusParser } from '@holoscript/core';
import { createHeadlessRuntime } from '../HeadlessRuntime';
import { LifecycleBodyError, parseLifecycleBody, runLifecycleBody } from '../HeadlessLifecycleBody';

/** Start a runtime whose one object has these lifecycle directives; no timer runs. */
function start(directives: string, initial: Record<string, unknown> = {}) {
  const parsed = new HoloScriptPlusParser().parse(
    `composition "Room" {\n  object "Box" {\n${directives}\n  }\n}`
  );
  expect(parsed.errors ?? []).toEqual([]);
  const runtime = createHeadlessRuntime(parsed.ast, { tickRate: 0 });
  for (const [key, value] of Object.entries(initial)) runtime.set(key, value);
  const events: unknown[] = [];
  runtime.on('mounted', (payload) => events.push(payload));
  const errors: string[] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
  });
  runtime.start();
  return { runtime, events, errors };
}

describe('HeadlessRuntime lifecycle bodies', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).lampCount;
  });

  it('runs an ordinary body: state, a local, an if, Math and emit', () => {
    const { runtime, events, errors } = start(
      `    @on_mount {
      let next = state.count + 1;
      state.count = next;
      if (next > 1) { state.label = "busy" } else { state.label = "idle" }
      emit("mounted", { count: next, root: Math.floor(Math.sqrt(next)) })
    }`,
      { count: 0 }
    );
    runtime.stop();
    expect(errors).toEqual([]);
    expect(runtime.getState()).toMatchObject({ count: 1, label: 'idle' });
    expect(events).toEqual([{ count: 1, root: 1 }]);
  });

  it('passes a hook its parameters', () => {
    const { runtime, errors } = start(
      `    @on_update(dt) {
      state.elapsed = state.elapsed + dt;
    }`,
      { elapsed: 0 }
    );
    runtime.manualTick(0.5);
    runtime.manualTick(0.25);
    runtime.stop();
    expect(errors).toEqual([]);
    expect(runtime.get('elapsed')).toBe(0.75);
  });

  it('does not run a body that uses a name the runtime does not provide, and says which', () => {
    const { runtime, errors } = start(`    @on_mount {
      state.startedAt = Date.now();
      setState({ mounted: true })
    }`);
    runtime.stop();
    // Nothing in the body ran: the check is made before the first statement.
    expect(runtime.getState()).not.toHaveProperty('mounted');
    expect(runtime.getState()).not.toHaveProperty('startedAt');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('Error in lifecycle handler on_mount');
    expect(errors[0]).toContain('calls "Date.now", which this runtime does not provide');
  });

  it('keeps a bare assignment inside the body instead of making a global', () => {
    const { runtime, errors } = start(`    @on_mount {
      lampCount = 3;
      state.lamps = lampCount
    }`);
    runtime.stop();
    expect((globalThis as Record<string, unknown>).lampCount).toBeUndefined();
    expect(errors).toEqual([]);
    expect(runtime.get('lamps')).toBe(3);
  });

  it('refuses a call to a method its provided function does not own before any of the body runs', () => {
    // `log` is provided, but `log.call` is Function.prototype's, not log's own. A check
    // that only looked at `log` admitted the body, which then stopped at that line on
    // every tick, after `ran_before` had already been written.
    const { runtime, errors } = start(`    @on_update(dt) {
      state.ran_before = 1;
      log.call(node, 1);
      state.ran_after = 1;
    }`);
    runtime.manualTick(0.1);
    runtime.manualTick(0.1);
    runtime.stop();
    expect(runtime.getState()).not.toHaveProperty('ran_before');
    expect(runtime.getState()).not.toHaveProperty('ran_after');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('calls "log.call", which this runtime does not provide');
  });

  it('refuses a body it cannot read, naming the hook, and says so once', () => {
    const { runtime, errors } = start(`    @on_update(dt) {
      for (lamp of lamps) { log(lamp) }
    }`);
    runtime.manualTick(0.1);
    runtime.manualTick(0.1);
    runtime.stop();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('the on_update body does not parse');
  });
});

describe('HeadlessLifecycleBody reads', () => {
  it('refuses a value behind a getter instead of running it', () => {
    const statements = parseLifecycleBody('on_mount', [], 'state.label = node.label', {});
    let getterRan = false;
    const node = {
      get label() {
        getterRan = true;
        return 'computed';
      },
    };
    const writes: Record<string, unknown> = {};
    const host = {
      functions: {},
      readState: (key: string) => writes[key],
      writeState: (key: string, value: unknown) => {
        writes[key] = value;
      },
      emit: () => undefined,
    };
    expect(() => runLifecycleBody(statements, host, {}, node)).toThrow(LifecycleBodyError);
    expect(() => runLifecycleBody(statements, host, {}, node)).toThrow(
      '"label" is read through a getter'
    );
    expect(getterRan).toBe(false);
    expect(writes).toEqual({});
  });
});
