import { canonicalizeHeadlessValue } from '@holoscript/engine/runtime';
import { describe, expect, it } from 'vitest';
import { RUST_WASM_UAAL_HS_PLAN_KERNEL, executeHsPlanKernel } from '../native-hs-plan-runner';

function sourceForPlan(records: unknown[]): string {
  return sourceForLiteral(canonicalizeHeadlessValue(records));
}

function sourceForLiteral(value: string): string {
  return `export function main(): string {
  return ${JSON.stringify(value)}
}`;
}

describe('native .hs deterministic plan kernel', () => {
  it('compiles main() with Rust/WASM and executes its canonical plan through UAAL', async () => {
    expect(RUST_WASM_UAAL_HS_PLAN_KERNEL).toBe('holoscript-rust-wasm-uaal-plan-kernel-v1');
    const records = [
      {
        kind: 'manifest',
        schema: 'holoscript.headless-experiment-plan.v1',
        runId: 'native-hs-kernel-test',
      },
      {
        kind: 'observation',
        scheduleEntryId: 'observe-1',
      },
    ];

    await expect(executeHsPlanKernel(sourceForPlan(records))).resolves.toEqual({
      count: 2,
      data: records,
    });
    await expect(executeHsPlanKernel(sourceForPlan(records))).resolves.toEqual({
      count: 2,
      data: records,
    });
  });

  it('rejects ambiguous entrypoints and code outside the single constant-return kernel', async () => {
    await expect(
      executeHsPlanKernel(`pipeline "LegacyPlan" {
  sink Captured { type: "stdout" }
}`)
    ).rejects.toThrow(/Rust\/WASM parser rejected/i);

    await expect(
      executeHsPlanKernel(`export function plan(): string {
  return "[]"
}`)
    ).rejects.toThrow(/main\(\)/i);

    await expect(
      executeHsPlanKernel(`export function helper(): string {
  return "[]"
}

export function main(): string {
  return "[]"
}`)
    ).rejects.toThrow(/exactly one exported main/i);

    await expect(
      executeHsPlanKernel(`export function main(seed: string): string {
  return "[]"
}`)
    ).rejects.toThrow(/no parameters/i);

    await expect(
      executeHsPlanKernel(`export function main<'a>(): string {
  return "[]"
}`)
    ).rejects.toThrow(/no lifetime binders/i);

    await expect(
      executeHsPlanKernel(`export function main(): string {
  return "[]"
  return "[]"
}`)
    ).rejects.toThrow(/one return statement/i);

    await expect(
      executeHsPlanKernel(`export function main(): string {
  return 1
}`)
    ).rejects.toThrow(/return one string literal/i);
  });

  it('rejects non-canonical or non-array JSON results', async () => {
    await expect(executeHsPlanKernel(sourceForLiteral('[{"b":1,"a":2}]'))).rejects.toThrow(
      /canonical JSON encoding/i
    );
    await expect(executeHsPlanKernel(sourceForLiteral('{"kind":"manifest"}'))).rejects.toThrow(
      /must be a JSON array/i
    );
    await expect(executeHsPlanKernel(sourceForLiteral('not-json'))).rejects.toThrow(
      /result is not JSON/i
    );
  });

  it('rejects source beyond the kernel resource bound', async () => {
    const oversized = `${' '.repeat(256 * 1024)}${sourceForLiteral('[]')}`;
    await expect(executeHsPlanKernel(oversized)).rejects.toThrow(/source exceeds 262144 bytes/i);
  });
});
