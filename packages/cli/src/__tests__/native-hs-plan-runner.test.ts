import { canonicalizeHeadlessValue, hashHeadlessValue } from '@holoscript/engine/runtime';
import {
  UAAL_VM_EXECUTION_PROFILE_SCHEMA,
  UAAL_VM_IMPLEMENTATION_ID,
  UAALOpCode,
  UAALVirtualMachine,
  computeUAALBytecodeSha256,
  type UAALBytecode,
} from '@holoscript/uaal';
import { describe, expect, it, vi } from 'vitest';
import {
  HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA,
  HS_PLAN_KERNEL_TRACE_SCHEMA,
  RUST_WASM_UAAL_HS_PLAN_KERNEL,
  executeHsPlanKernel,
  verifyHsPlanKernelExecutionProvenance,
  type HsPlanKernelExecutionProvenance,
} from '../native-hs-plan-runner';

type MutableRecord = Record<string, unknown>;

function sourceForPlan(records: unknown[]): string {
  return sourceForLiteral(canonicalizeHeadlessValue(records));
}

function sourceForLiteral(value: string): string {
  return `export function main(): string {
  return ${JSON.stringify(value)}
}`;
}

function clone<T>(value: T): T {
  return JSON.parse(canonicalizeHeadlessValue(value)) as T;
}

function nested(record: MutableRecord, key: string): MutableRecord {
  const value = record[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${key} is not an object`);
  }
  return value as MutableRecord;
}

function resealedForgery(
  source: HsPlanKernelExecutionProvenance,
  mutate: (record: MutableRecord) => void
): HsPlanKernelExecutionProvenance {
  const record = clone(source) as unknown as MutableRecord;
  mutate(record);
  delete record.provenanceCommitment;
  record.provenanceCommitment = hashHeadlessValue(record);
  return record as unknown as HsPlanKernelExecutionProvenance;
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
    const source = sourceForPlan(records);
    const first = await executeHsPlanKernel(source);
    const second = await executeHsPlanKernel(source);
    const wasm = await import('@holoscript/wasm/node');
    const bytecode = JSON.parse(wasm.compile_to_uaal(source)) as UAALBytecode;

    expect(first.count).toBe(2);
    expect(first.data).toEqual(records);
    expect(canonicalizeHeadlessValue(first)).toBe(canonicalizeHeadlessValue(second));
    expect(first.provenance).toMatchObject({
      schema: HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA,
      engine: RUST_WASM_UAAL_HS_PLAN_KERNEL,
      compiler: {
        implementation: '@holoscript/wasm/node.compile_to_uaal',
        crateVersion: wasm.version(),
      },
      bytecode: {
        version: 1,
        instructionCount: 5,
        hashAlgorithm: 'sha256-uaal-bytecode-canonical-v1',
        sha256: computeUAALBytecodeSha256(bytecode),
      },
      vm: {
        implementation: UAAL_VM_IMPLEMENTATION_ID,
        profile: {
          schema: UAAL_VM_EXECUTION_PROFILE_SCHEMA,
          implementation: UAAL_VM_IMPLEMENTATION_ID,
          limits: {
            maxStackSize: 4,
            maxInstructions: 16,
            maxCallDepth: 2,
          },
          registeredHandlerOpcodes: [],
        },
        trace: {
          schema: HS_PLAN_KERNEL_TRACE_SCHEMA,
          executionLogVersion: 'uaal.execution-log.v0',
          executedInstructionCount: 4,
          programCounters: [0, 2, 3, 1],
          opcodes: [UAALOpCode.CALL, UAALOpCode.PUSH, UAALOpCode.RET, UAALOpCode.HALT],
          finalTaskStatus: 'HALTED',
        },
      },
      result: {
        returnedPlanHash: hashHeadlessValue(records),
        recordCount: 2,
      },
    });
    expect(first.provenance.result.returnedPlanHash).not.toBe(
      hashHeadlessValue(canonicalizeHeadlessValue(records))
    );
    expect(
      new TextEncoder().encode(canonicalizeHeadlessValue(first.provenance)).byteLength
    ).toBeLessThan(16 * 1024);
    await expect(
      verifyHsPlanKernelExecutionProvenance(first.provenance, {
        expectedSource: source,
        expectedRecords: records,
      })
    ).resolves.toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects fully resealed provenance that differs from trusted source/runtime evidence', async () => {
    const records = [{ kind: 'manifest', runId: 'reseal-adversary' }];
    const source = sourceForPlan(records);
    const original = (await executeHsPlanKernel(source)).provenance;
    const cases: Array<[string, (record: MutableRecord) => void]> = [
      ['schema downgrade', (record) => (record.schema = 'holoscript.fake.v0')],
      ['kernel identity', (record) => (record.engine = 'other-kernel')],
      [
        'unknown top-level field',
        (record) => (record.shadowProvenance = 'not-committed-by-old-verifiers'),
      ],
      ['parser identity', (record) => (nested(record, 'parser').implementation = '@other/parser')],
      ['parser AST', (record) => (nested(record, 'parser').astHash = '0'.repeat(64))],
      [
        'compiler identity',
        (record) => (nested(record, 'compiler').implementation = '@other/compiler'),
      ],
      ['compiler version', (record) => (nested(record, 'compiler').crateVersion = '999.0.0')],
      ['unknown compiler field', (record) => (nested(record, 'compiler').shadowVersion = '3.0.0')],
      ['source hash', (record) => (record.sourceHash = '1'.repeat(64))],
      [
        'bytecode hash algorithm',
        (record) => (nested(record, 'bytecode').hashAlgorithm = 'sha256-wrong-v1'),
      ],
      ['bytecode hash', (record) => (nested(record, 'bytecode').sha256 = '2'.repeat(64))],
      ['VM implementation', (record) => (nested(record, 'vm').implementation = 'other-vm')],
      [
        'VM profile schema',
        (record) => (nested(nested(record, 'vm'), 'profile').schema = 'holoscript.uaal-vm.fake.v0'),
      ],
      [
        'VM implementation profile',
        (record) => (nested(nested(record, 'vm'), 'profile').implementation = 'other-vm'),
      ],
      [
        'unknown VM profile field',
        (record) => (nested(nested(record, 'vm'), 'profile').shadowHandlerCount = 0),
      ],
      [
        'VM stack limit',
        (record) => (nested(nested(nested(record, 'vm'), 'profile'), 'limits').maxStackSize = 5),
      ],
      [
        'VM instruction limit',
        (record) =>
          (nested(nested(nested(record, 'vm'), 'profile'), 'limits').maxInstructions = 17),
      ],
      [
        'VM call-depth limit',
        (record) => (nested(nested(nested(record, 'vm'), 'profile'), 'limits').maxCallDepth = 3),
      ],
      [
        'registered handler',
        (record) =>
          (nested(nested(record, 'vm'), 'profile').registeredHandlerOpcodes = [UAALOpCode.EXECUTE]),
      ],
      [
        'trace program counter',
        (record) => (nested(nested(record, 'vm'), 'trace').programCounters = [0, 2, 4, 1]),
      ],
      [
        'trace hash',
        (record) => (nested(nested(record, 'vm'), 'trace').traceHash = '3'.repeat(64)),
      ],
      [
        'returned-plan hash',
        (record) => (nested(record, 'result').returnedPlanHash = '4'.repeat(64)),
      ],
      ['record count', (record) => (nested(record, 'result').recordCount = 99)],
    ];

    for (const [label, mutate] of cases) {
      const verification = await verifyHsPlanKernelExecutionProvenance(
        resealedForgery(original, mutate),
        {
          expectedSource: source,
          expectedRecords: records,
        }
      );
      expect(verification.valid, label).toBe(false);
    }
  });

  it('requires external source anchors and rejects a different valid plan', async () => {
    const records = [{ kind: 'manifest', runId: 'source-a' }];
    const source = sourceForPlan(records);
    const provenance = (await executeHsPlanKernel(source)).provenance;
    const untypedVerifier = verifyHsPlanKernelExecutionProvenance as unknown as (
      input: unknown,
      options?: unknown
    ) => ReturnType<typeof verifyHsPlanKernelExecutionProvenance>;

    await expect(untypedVerifier(provenance)).resolves.toMatchObject({
      valid: false,
      errors: [expect.stringMatching(/requires the expected \.hs source/i)],
    });
    await expect(
      verifyHsPlanKernelExecutionProvenance(provenance, {
        expectedSource: sourceForPlan([{ kind: 'manifest', runId: 'source-b' }]),
        expectedRecords: records,
      })
    ).resolves.toMatchObject({
      valid: false,
      errors: [expect.stringMatching(/differs from the sealed provenance/i)],
    });
  });

  it('fails closed if the VM handler profile changes during execution', async () => {
    const original = UAALVirtualMachine.prototype.getExecutionProfile;
    let profileReads = 0;
    const spy = vi
      .spyOn(UAALVirtualMachine.prototype, 'getExecutionProfile')
      .mockImplementation(function (this: UAALVirtualMachine) {
        const profile = original.call(this);
        profileReads += 1;
        return profileReads === 2
          ? {
              ...profile,
              registeredHandlerOpcodes: [UAALOpCode.EXECUTE],
            }
          : profile;
      });

    try {
      await expect(executeHsPlanKernel(sourceForLiteral('[]'))).rejects.toThrow(
        /handler-free bounded kernel profile|profile changed/i
      );
    } finally {
      spy.mockRestore();
    }
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

  it('keeps provenance compact for a near-limit returned plan', async () => {
    const marker = 'large-plan-marker-';
    const source = sourceForPlan([{ kind: 'payload', text: `${marker}${'x'.repeat(200_000)}` }]);
    const result = await executeHsPlanKernel(source);
    const serialized = canonicalizeHeadlessValue(result.provenance);

    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThan(16 * 1024);
    expect(serialized).not.toContain(marker);
  });

  it('rejects source beyond the kernel resource bound', async () => {
    const oversized = `${' '.repeat(256 * 1024)}${sourceForLiteral('[]')}`;
    await expect(executeHsPlanKernel(oversized)).rejects.toThrow(/source exceeds 262144 bytes/i);
  });
});
