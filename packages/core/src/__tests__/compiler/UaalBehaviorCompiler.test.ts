/**
 * G3 e2e: HoloComposition behavior -> UaalBehaviorCompiler -> UAAL bytecode ->
 * real @holoscript/uaal VM. Proves the cognitive front-end bridge is non-vacuous:
 * distinct behavior inputs produce distinct, observable execution traces, and
 * control flow (JUMP_IF) actually gates execution. See docs/spec/spec-vs-reality-gap.md G3.
 */
import { describe, it, expect } from 'vitest';
import { UAALVirtualMachine, UAALOpCode } from '@holoscript/uaal';
import type { UAALBytecode, UAALOperand } from '@holoscript/uaal';
import { UaalBehaviorCompiler } from '../../compiler/UaalBehaviorCompiler';
import type { HoloComposition, HoloStatement } from '../../parser/HoloCompositionTypes';

// Minimal behavioral-AST factories — only the fields the compiler reads.
const lit = (value: string | number | boolean | null) => ({ type: 'Literal' as const, value });
const call = (method: string, ...args: (string | number | boolean | null)[]): HoloStatement =>
  ({ type: 'MethodCall', method, arguments: args.map(lit) } as unknown as HoloStatement);
const emit = (event: string): HoloStatement =>
  ({ type: 'EmitStatement', event } as unknown as HoloStatement);
const iff = (cond: boolean, consequent: HoloStatement[], alternate?: HoloStatement[]): HoloStatement =>
  ({ type: 'IfStatement', condition: lit(cond), consequent, alternate } as unknown as HoloStatement);

const comp = (body: HoloStatement[]): HoloComposition =>
  ({ type: 'Composition', name: 'test', actions: [{ type: 'Action', name: 'main', parameters: [], body }] } as unknown as HoloComposition);

async function run(c: HoloComposition): Promise<{ trace: UAALOperand[][]; status: string }> {
  const { bytecode } = new UaalBehaviorCompiler().compile(c);
  const vm = new UAALVirtualMachine();
  const trace: UAALOperand[][] = [];
  // EXECUTE handler overrides the no-op default (vm checks handlers first), so the
  // lowered behavior becomes observable — the anti-vacuity hook the premortem required.
  vm.registerHandler(UAALOpCode.EXECUTE, (_proxy, operands) => {
    trace.push(operands);
  });
  const result = await vm.execute(bytecode as unknown as UAALBytecode);
  return { trace, status: result.taskStatus };
}

describe('UaalBehaviorCompiler — G3 cognitive front-end bridge', () => {
  it('drift-guard: local opcode constants match the @holoscript/uaal ISA', () => {
    expect(UAALOpCode.PUSH).toBe(0x01);
    expect(UAALOpCode.EXECUTE).toBe(0x14);
    expect(UAALOpCode.JUMP).toBe(0x30);
    expect(UAALOpCode.JUMP_IF).toBe(0x31);
    expect(UAALOpCode.HALT).toBe(0xff);
  });

  it('lowers a linear behavior to an observable EXECUTE trace and HALTs', async () => {
    const { trace, status } = await run(comp([call('log', 'alpha'), emit('ready')]));
    expect(status).toBe('HALTED');
    expect(trace).toEqual([
      ['log', 'alpha'],
      ['emit:ready', null],
    ]);
  });

  it('control flow is real: a false condition skips the consequent (JUMP_IF works)', async () => {
    const { trace } = await run(
      comp([
        iff(false, [call('log', 'then-NO')], [call('log', 'else-YES')]),
        call('log', 'after'),
      ]),
    );
    const flat = trace.map((t) => t.join(':'));
    expect(flat).toContain('log:else-YES'); // alternate ran
    expect(flat).toContain('log:after'); // execution continued past the branch
    expect(flat).not.toContain('log:then-NO'); // consequent skipped — not a constant lowering
  });

  it('control flow: a true condition runs the consequent', async () => {
    const { trace } = await run(comp([iff(true, [call('log', 'then-YES')], [call('log', 'else-NO')])]));
    const flat = trace.map((t) => t.join(':'));
    expect(flat).toContain('log:then-YES');
    expect(flat).not.toContain('log:else-NO');
  });

  it('is non-vacuous: distinct behavior inputs yield distinct traces', async () => {
    const a = await run(comp([call('log', 'alpha')]));
    const b = await run(comp([call('log', 'beta'), call('log', 'gamma')]));
    expect(a.trace).not.toEqual(b.trace);
  });

  it('records deferred statement kinds honestly rather than faking them', () => {
    const withLoop = comp([
      { type: 'WhileStatement', condition: lit(true), body: [call('log', 'x')] } as unknown as HoloStatement,
    ]);
    const { stats } = new UaalBehaviorCompiler().compile(withLoop);
    expect(stats.unhandled.WhileStatement).toBe(1);
  });
});
