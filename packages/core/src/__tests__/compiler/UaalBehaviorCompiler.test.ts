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
    const withOnError = comp([
      { type: 'OnErrorStatement', body: [call('log', 'x')] } as unknown as HoloStatement,
    ]);
    const { stats } = new UaalBehaviorCompiler().compile(withOnError);
    expect(stats.unhandled.OnErrorStatement).toBe(1);
  });

  // ── Loop lowering (idea-seeds/2026-06-22_uaal-loop-control-flow-lowering.md) ──
  // Proves the back-edge JUMP shape genuinely terminates after N iterations —
  // not vacuous (an infinite-loop lowering that just happened to hit
  // maxInstructions would also "halt", so the test asserts the EXACT trace
  // length, which only a correctly-terminating loop produces).

  it('WhileStatement: loops exactly N times then exits (real termination, not maxInstructions)', async () => {
    const whileStmt = {
      type: 'WhileStatement',
      condition: { type: 'Identifier', name: 'hasNext' },
      body: [call('log', 'tick')],
    } as unknown as HoloStatement;
    const { bytecode } = new UaalBehaviorCompiler().compile(comp([whileStmt]));

    const vm = new UAALVirtualMachine();
    const trace: UAALOperand[][] = [];
    let remaining = 3;
    vm.registerHandler(UAALOpCode.EXECUTE, (proxy, operands) => {
      trace.push(operands);
      if (operands[0] === 'cond') {
        proxy.push(remaining > 0);
        remaining--;
      }
    });
    const result = await vm.execute(bytecode as unknown as UAALBytecode);

    expect(result.taskStatus).toBe('HALTED');
    const ticks = trace.filter((t) => t[0] === 'log' && t[1] === 'tick');
    expect(ticks).toHaveLength(3);
    // 4 cond checks: 3 truthy (enter body) + 1 falsy (exit) — proves the
    // condition is re-examined every iteration, not baked in once.
    expect(trace.filter((t) => t[0] === 'cond')).toHaveLength(4);
  });

  it('ForStatement: for-of delegates iteration state to the host and terminates correctly', async () => {
    const forStmt = {
      type: 'ForStatement',
      variable: 'item',
      iterable: { type: 'Identifier', name: 'items' },
      body: [call('log', 'iter')],
    } as unknown as HoloStatement;
    const { bytecode } = new UaalBehaviorCompiler().compile(comp([forStmt]));

    const vm = new UAALVirtualMachine();
    const trace: UAALOperand[][] = [];
    const items = ['a', 'b', 'c', 'd'];
    let index = 0;
    vm.registerHandler(UAALOpCode.EXECUTE, (proxy, operands) => {
      trace.push(operands);
      const tag = operands[0] as string;
      if (tag === 'forHasNext:item') proxy.push(index < items.length);
      if (tag === 'forNext:item') index++;
    });
    const result = await vm.execute(bytecode as unknown as UAALBytecode);

    expect(result.taskStatus).toBe('HALTED');
    expect(trace.filter((t) => t[0] === 'log' && t[1] === 'iter')).toHaveLength(items.length);
    expect(trace.filter((t) => t[0] === 'forInit:item')).toHaveLength(1); // iterable bound once
  });

  it('ClassicForStatement: init/test/update all lower and the loop terminates at the right count', async () => {
    const classicFor = {
      type: 'ClassicForStatement',
      init: { type: 'VariableDeclaration', kind: 'let', name: 'i', value: lit(0) },
      test: { type: 'Identifier', name: 'iLessThanN' },
      update: { type: 'Assignment', target: 'i', operator: '+=', value: lit(1) },
      body: [call('log', 'x')],
    } as unknown as HoloStatement;
    const { bytecode } = new UaalBehaviorCompiler().compile(comp([classicFor]));

    const vm = new UAALVirtualMachine();
    const trace: UAALOperand[][] = [];
    let i = 0;
    const n = 5;
    vm.registerHandler(UAALOpCode.EXECUTE, (proxy, operands) => {
      trace.push(operands);
      if (operands[0] === 'cond') proxy.push(i < n);
      if (operands[0] === 'assign:i') i++;
    });
    const result = await vm.execute(bytecode as unknown as UAALBytecode);

    expect(result.taskStatus).toBe('HALTED');
    expect(trace.filter((t) => t[0] === 'log' && t[1] === 'x')).toHaveLength(n);
    expect(trace.filter((t) => t[0] === 'declare:i')).toHaveLength(1); // init ran exactly once
  });

  it('an unbounded while (condition never falsy) is caught by the VM maxInstructions guard, not left to hang', async () => {
    const infiniteWhile = {
      type: 'WhileStatement',
      condition: { type: 'Identifier', name: 'alwaysTrue' },
      body: [call('log', 'spin')],
    } as unknown as HoloStatement;
    const { bytecode } = new UaalBehaviorCompiler().compile(comp([infiniteWhile]));

    const vm = new UAALVirtualMachine({ maxInstructions: 50 });
    vm.registerHandler(UAALOpCode.EXECUTE, (proxy, operands) => {
      if (operands[0] === 'cond') proxy.push(true); // never exits
    });
    const result = await vm.execute(bytecode as unknown as UAALBytecode);

    expect(result.taskStatus).toBe('ERROR'); // the existing safety net catches it, not a wedge
  });
});
