import { describe, expect, it } from 'vitest';

import {
  HOLOSCRIPT_AGGREGATE_VALUE_ABI,
  HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2,
  registerHoloScriptStdUaalExecHandler,
  type HoloScriptStdUaalExecHandler,
  type HoloScriptStdUaalOperand,
} from '../uaal-abi.js';

class TestProxy {
  readonly stack: HoloScriptStdUaalOperand[] = [];

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
