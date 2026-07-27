import { describe, expect, it } from 'vitest';

import {
  HOLOSCRIPT_AGGREGATE_VALUE_ABI,
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
});
