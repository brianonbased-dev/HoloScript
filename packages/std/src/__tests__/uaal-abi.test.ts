import { describe, expect, it } from 'vitest';

import {
  HOLOSCRIPT_AGGREGATE_VALUE_ABI,
  HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2,
  registerHoloScriptStdUaalAggregateReferenceHandlers,
  registerHoloScriptStdUaalOwnedBufferHandlers,
  registerHoloScriptStdUaalExecHandler,
  type HoloScriptStdUaalExecHandler,
  type HoloScriptStdUaalOperand,
} from '../uaal-abi.js';

class TestProxy {
  readonly stack: HoloScriptStdUaalOperand[] = [];
  readonly context: Record<string, HoloScriptStdUaalOperand> = {};

  push(value: HoloScriptStdUaalOperand): void {
    this.stack.push(value);
  }

  pop(): HoloScriptStdUaalOperand {
    const value = this.stack.pop();
    if (value === undefined) throw new Error('stack underflow');
    return value;
  }

  peek(): HoloScriptStdUaalOperand {
    const value = this.stack.at(-1);
    if (value === undefined) throw new Error('stack underflow');
    return value;
  }

  getState(): { context: Record<string, HoloScriptStdUaalOperand> } {
    return { context: this.context };
  }

  getContext(key: string): HoloScriptStdUaalOperand {
    return this.context[key] ?? null;
  }

  setContext(key: string, value: HoloScriptStdUaalOperand): void {
    this.context[key] = value;
  }
}

describe('HoloScript std UAAL EXEC ABI', () => {
  it('constructs and projects a layout-checked immutable aggregate value', () => {
    let handler: HoloScriptStdUaalExecHandler | undefined;
    registerHoloScriptStdUaalExecHandler(
      {
        registerHandler(_opcode, registered) {
          handler = registered;
        },
      },
      0x20
    );
    expect(handler).toBeDefined();

    const proxy = new TestProxy();
    proxy.push(1);
    proxy.push(2);
    proxy.push(3);
    handler?.(proxy, [
      HOLOSCRIPT_AGGREGATE_VALUE_ABI,
      'construct',
      'Vec3I32{x:i32,y:i32,z:i32}',
      ['x', 'y', 'z'],
      ['i32', 'i32', 'i32'],
    ]);
    const aggregate = proxy.peek();
    expect(Object.isFrozen(aggregate)).toBe(true);

    handler?.(proxy, [
      HOLOSCRIPT_AGGREGATE_VALUE_ABI,
      'project',
      'Vec3I32{x:i32,y:i32,z:i32}',
      'y',
      1,
      'i32',
    ]);
    expect(proxy.pop()).toBe(2);
  });

  it('fails closed on layout mismatch and malformed i32 fields', () => {
    let handler: HoloScriptStdUaalExecHandler | undefined;
    registerHoloScriptStdUaalExecHandler(
      {
        registerHandler(_opcode, registered) {
          handler = registered;
        },
      },
      0x20
    );
    const proxy = new TestProxy();
    proxy.push(1.5);
    expect(() =>
      handler?.(proxy, [
        HOLOSCRIPT_AGGREGATE_VALUE_ABI,
        'construct',
        'Packet{code:i32}',
        ['code'],
        ['i32'],
      ])
    ).toThrow('field `code` requires i32');

    proxy.push(5);
    handler?.(proxy, [
      HOLOSCRIPT_AGGREGATE_VALUE_ABI,
      'construct',
      'Packet{code:i32}',
      ['code'],
      ['i32'],
    ]);
    expect(() =>
      handler?.(proxy, [
        HOLOSCRIPT_AGGREGATE_VALUE_ABI,
        'project',
        'Other{code:i32}',
        'code',
        0,
        'i32',
      ])
    ).toThrow('layout mismatch');
  });

  it('constructs nested POD values and validates scalar projection paths', () => {
    let handler: HoloScriptStdUaalExecHandler | undefined;
    registerHoloScriptStdUaalExecHandler(
      {
        registerHandler(_opcode, registered) {
          handler = registered;
        },
      },
      0x20
    );
    const proxy = new TestProxy();
    const vecLayout = 'Vec3I32{x:i32,y:i32,z:i32}';
    const boundsLayout = 'Aabb3I32{min:Vec3I32{x:i32,y:i32,z:i32},max:Vec3I32{x:i32,y:i32,z:i32}}';
    const constructVec = (x: number, y: number, z: number): HoloScriptStdUaalOperand => {
      proxy.push(x);
      proxy.push(y);
      proxy.push(z);
      handler?.(proxy, [
        HOLOSCRIPT_AGGREGATE_VALUE_ABI,
        'construct',
        vecLayout,
        ['x', 'y', 'z'],
        ['i32', 'i32', 'i32'],
      ]);
      return proxy.pop();
    };

    proxy.push(constructVec(1, 2, 3));
    proxy.push(constructVec(4, 6, 8));
    handler?.(proxy, [
      HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2,
      'construct',
      boundsLayout,
      ['min', 'max'],
      [vecLayout, vecLayout],
    ]);
    const bounds = proxy.peek();
    expect(Object.isFrozen(bounds)).toBe(true);

    handler?.(proxy, [
      HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2,
      'project_path',
      boundsLayout,
      ['max', 'y'],
      [1, 1],
      'i32',
    ]);
    expect(proxy.pop()).toBe(6);
  });

  it('fails closed on nested layout and projection-path descriptor mismatch', () => {
    let handler: HoloScriptStdUaalExecHandler | undefined;
    registerHoloScriptStdUaalExecHandler(
      {
        registerHandler(_opcode, registered) {
          handler = registered;
        },
      },
      0x20
    );
    const proxy = new TestProxy();
    const vecLayout = 'Vec3I32{x:i32,y:i32,z:i32}';
    const boundsLayout = `Aabb3I32{min:${vecLayout},max:${vecLayout}}`;
    proxy.push(1);
    proxy.push(2);
    proxy.push(3);
    handler?.(proxy, [
      HOLOSCRIPT_AGGREGATE_VALUE_ABI,
      'construct',
      vecLayout,
      ['x', 'y', 'z'],
      ['i32', 'i32', 'i32'],
    ]);
    const min = proxy.pop();
    proxy.push(min);
    proxy.push(min);
    handler?.(proxy, [
      HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2,
      'construct',
      boundsLayout,
      ['min', 'max'],
      [vecLayout, vecLayout],
    ]);
    const bounds = proxy.pop();

    proxy.push(bounds);
    expect(() =>
      handler?.(proxy, [
        HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2,
        'project_path',
        boundsLayout,
        ['max', 'missing'],
        [1, 1],
        'i32',
      ])
    ).toThrow('projection path descriptor mismatch');

    proxy.push(min);
    proxy.push(min);
    expect(() =>
      handler?.(proxy, [
        HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2,
        'construct',
        boundsLayout,
        ['min', 'max'],
        [vecLayout, 'Other{x:i32}'],
      ])
    ).toThrow('nested layout mismatch');
  });
});

describe('HoloScript std UAAL owned-buffer ABI', () => {
  const opcodes = {
    allocate: 0xb7,
    move: 0xb8,
    load: 0xb9,
    store: 0xba,
    drop: 0xbb,
    length: 0xbc,
  } as const;

  function handlers(): Map<number, HoloScriptStdUaalExecHandler> {
    const registered = new Map<number, HoloScriptStdUaalExecHandler>();
    registerHoloScriptStdUaalOwnedBufferHandlers(
      {
        registerHandler(opcode, handler) {
          registered.set(opcode, handler);
        },
      },
      opcodes
    );
    return registered;
  }

  it('allocates, moves, mutates, reads, measures, and drops without copying storage', () => {
    const registered = handlers();
    const proxy = new TestProxy();

    proxy.push(3);
    proxy.push(5);
    registered.get(opcodes.allocate)?.(proxy, ['i32']);
    const original = proxy.pop();

    proxy.push(original);
    registered.get(opcodes.move)?.(proxy, ['i32']);
    const moved = proxy.pop();
    expect(moved).not.toBe(original);

    proxy.push(moved);
    proxy.push(1);
    proxy.push(9);
    registered.get(opcodes.store)?.(proxy, ['i32']);

    proxy.push(moved);
    proxy.push(1);
    registered.get(opcodes.load)?.(proxy, ['i32']);
    expect(proxy.pop()).toBe(9);

    proxy.push(moved);
    registered.get(opcodes.length)?.(proxy, ['i32']);
    expect(proxy.pop()).toBe(3);

    proxy.push(moved);
    registered.get(opcodes.drop)?.(proxy, ['i32']);
  });

  it('fails closed on stale owners, bounds violations, malformed fills, and double drop', () => {
    const registered = handlers();
    const proxy = new TestProxy();

    proxy.push(2);
    proxy.push(7);
    registered.get(opcodes.allocate)?.(proxy, ['i32']);
    const original = proxy.pop();
    proxy.push(original);
    registered.get(opcodes.move)?.(proxy, ['i32']);
    const moved = proxy.pop();

    proxy.push(original);
    proxy.push(0);
    expect(() => registered.get(opcodes.load)?.(proxy, ['i32'])).toThrow('stale owner');

    proxy.stack.length = 0;
    proxy.push(moved);
    proxy.push(2);
    expect(() => registered.get(opcodes.load)?.(proxy, ['i32'])).toThrow('out of bounds');

    proxy.stack.length = 0;
    proxy.push(moved);
    registered.get(opcodes.drop)?.(proxy, ['i32']);
    proxy.push(moved);
    expect(() => registered.get(opcodes.drop)?.(proxy, ['i32'])).toThrow('already dropped');

    proxy.stack.length = 0;
    proxy.push(1);
    proxy.push(1.5);
    expect(() => registered.get(opcodes.allocate)?.(proxy, ['i32'])).toThrow('requires i32');
  });
});

describe('HoloScript std UAAL aggregate-reference ABI', () => {
  const opcodes = {
    borrow: 0xbd,
    load: 0xbe,
    store: 0xbf,
  } as const;
  const layout = 'Packet{code:i32}';

  function handlers(): Map<number, HoloScriptStdUaalExecHandler> {
    const registered = new Map<number, HoloScriptStdUaalExecHandler>();
    registerHoloScriptStdUaalAggregateReferenceHandlers(
      {
        registerHandler(opcode, handler) {
          registered.set(opcode, handler);
        },
      },
      opcodes
    );
    return registered;
  }

  function aggregate(proxy: TestProxy, value: number): HoloScriptStdUaalOperand {
    let exec: HoloScriptStdUaalExecHandler | undefined;
    registerHoloScriptStdUaalExecHandler(
      {
        registerHandler(_opcode, handler) {
          exec = handler;
        },
      },
      0x20
    );
    proxy.push(value);
    exec?.(proxy, [
      HOLOSCRIPT_AGGREGATE_VALUE_ABI,
      'construct',
      layout,
      ['code'],
      ['i32'],
    ]);
    return proxy.pop();
  }

  it('mutates through an exclusive call-scoped token while preserving frozen values', () => {
    const registered = handlers();
    const proxy = new TestProxy();
    const rootKey = 'main::packet';
    proxy.context[rootKey] = aggregate(proxy, 5);

    registered.get(opcodes.borrow)?.(proxy, ['acquire', layout, rootKey, true]);
    const writer = proxy.pop();
    proxy.push(writer);
    proxy.push(9);
    registered.get(opcodes.store)?.(proxy, [['code'], [0], 'i32']);

    proxy.push(writer);
    registered.get(opcodes.load)?.(proxy, [['code'], [0], 'i32']);
    expect(proxy.pop()).toBe(9);
    expect(Object.isFrozen(proxy.context[rootKey])).toBe(true);

    proxy.push(writer);
    registered.get(opcodes.borrow)?.(proxy, ['release']);
  });

  it('rejects mutable access through shared tokens, alias conflicts, and stale tokens', () => {
    const registered = handlers();
    const proxy = new TestProxy();
    const rootKey = 'main::packet';
    proxy.context[rootKey] = aggregate(proxy, 5);

    registered.get(opcodes.borrow)?.(proxy, ['acquire', layout, rootKey, false]);
    const reader = proxy.pop();
    proxy.push(reader);
    proxy.push(9);
    expect(() =>
      registered.get(opcodes.store)?.(proxy, [['code'], [0], 'i32'])
    ).toThrow('requires an exclusive borrow');

    proxy.stack.length = 0;
    expect(() =>
      registered.get(opcodes.borrow)?.(proxy, ['acquire', layout, rootKey, true])
    ).toThrow('borrow conflict');

    proxy.push(reader);
    registered.get(opcodes.borrow)?.(proxy, ['release']);
    proxy.push(reader);
    expect(() => registered.get(opcodes.load)?.(proxy, [['code'], [0], 'i32'])).toThrow(
      'stale borrow token'
    );
  });
});
