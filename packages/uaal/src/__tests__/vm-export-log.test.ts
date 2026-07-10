/**
 * Replayable derivation log — export → replay → verify.
 *
 * A derivation is VALID iff deterministic replay reproduces the claimed
 * steps and final result (falsifiable-replay pattern). These tests cover:
 *   - recordLog off by default (no recording state, unchanged behavior)
 *   - simple + control-flow round-trips (export → replay → valid:true)
 *   - hermetic replay of nondeterministic built-ins (OP_TIMESTAMP)
 *   - proxy injection: recorded VMProxy handler effects are injected on
 *     replay, the handler is never re-called
 *   - tamper cases: step operand, injected effect, final result, bytecode
 *     sha, step truncation, log version
 */
import { describe, it, expect } from 'vitest';
import { UAALVirtualMachine, replayUAALLog, computeUAALBytecodeSha256 } from '../vm';
import type { VMProxy } from '../vm';
import { UAALOpCode } from '../opcodes';
import type { UAALBytecode, UAALInstruction, UAALOperand } from '../opcodes';

const instr = (opCode: UAALOpCode, ...operands: UAALOperand[]): UAALInstruction => ({
  opCode,
  operands,
});

const program = (...instructions: UAALInstruction[]): UAALBytecode => ({
  version: 2,
  instructions,
});

const simpleProgram = (): UAALBytecode =>
  program(
    instr(UAALOpCode.PUSH, 5),
    instr(UAALOpCode.PUSH, 3),
    instr(UAALOpCode.POP),
    instr(UAALOpCode.HALT)
  );

/**
 * Exercises JUMP_IF (taken), CALL, and RET so replay verification covers
 * real control flow, not just straight-line execution.
 *
 *   0 PUSH true
 *   1 JUMP_IF 3     (taken — skips pc 2)
 *   2 PUSH 'not-taken'
 *   3 CALL 6
 *   4 PUSH 'after'
 *   5 HALT
 *   6 PUSH 'sub'
 *   7 RET
 */
const controlFlowProgram = (): UAALBytecode =>
  program(
    instr(UAALOpCode.PUSH, true),
    instr(UAALOpCode.JUMP_IF, 3),
    instr(UAALOpCode.PUSH, 'not-taken'),
    instr(UAALOpCode.CALL, 6),
    instr(UAALOpCode.PUSH, 'after'),
    instr(UAALOpCode.HALT),
    instr(UAALOpCode.PUSH, 'sub'),
    instr(UAALOpCode.RET)
  );

describe('recordLog off by default', () => {
  it('exportLog throws when recordLog was not enabled', async () => {
    const vm = new UAALVirtualMachine();
    const result = await vm.execute(simpleProgram());
    expect(result.taskStatus).toBe('HALTED');
    expect(() => vm.exportLog()).toThrow(/recordLog: true/);
  });

  it('recording does not change execution results (parity with default VM)', async () => {
    const plain = await new UAALVirtualMachine().execute(controlFlowProgram());
    const recorded = await new UAALVirtualMachine({ recordLog: true }).execute(
      controlFlowProgram()
    );
    expect(recorded.taskStatus).toBe(plain.taskStatus);
    expect(recorded.stackTop).toEqual(plain.stackTop);
    expect(recorded.state.stack).toEqual(plain.state.stack);
    expect(recorded.state.pc).toBe(plain.state.pc);
  });

  it('exportLog throws before any execute() completes', () => {
    const vm = new UAALVirtualMachine({ recordLog: true });
    expect(() => vm.exportLog()).toThrow(/before execute/);
  });
});

describe('round-trip: export → replay → valid', () => {
  it('records a control-flow program and replays it as valid', async () => {
    const bytecode = controlFlowProgram();
    const vm = new UAALVirtualMachine({ recordLog: true });
    const result = await vm.execute(bytecode);
    expect(result.taskStatus).toBe('HALTED');
    expect(result.stackTop).toBe('after');

    const log = vm.exportLog();
    expect(log.version).toBe('uaal.execution-log.v0');
    expect(log.bytecodeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(log.bytecodeSha256).toBe(computeUAALBytecodeSha256(bytecode));
    // Executed pc sequence proves JUMP_IF/CALL/RET were followed.
    expect(log.steps.map((s) => s.pc)).toEqual([0, 1, 3, 6, 7, 4, 5]);
    expect(log.steps[0].stackBefore).toEqual({ depth: 0, top: [] });
    expect(log.steps.map((s) => s.step)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(log.result).toEqual({ taskStatus: 'HALTED', stackTop: 'after' });
    expect(log.finishedAt).toBeGreaterThanOrEqual(log.startedAt);

    const verdict = await replayUAALLog(bytecode, log);
    expect(verdict).toEqual({
      valid: true,
      reason: expect.stringContaining('replay reproduced'),
    });
  });

  it('static UAALVirtualMachine.replayLog is the same verifier', async () => {
    const bytecode = simpleProgram();
    const vm = new UAALVirtualMachine({ recordLog: true });
    await vm.execute(bytecode);
    const verdict = await UAALVirtualMachine.replayLog(bytecode, vm.exportLog());
    expect(verdict.valid).toBe(true);
  });

  it('captures initialContext so replay is hermetic w.r.t. context reads', async () => {
    const bytecode = program(instr(UAALOpCode.OP_STATE_GET, 'greeting'), instr(UAALOpCode.HALT));
    const vm = new UAALVirtualMachine({ recordLog: true });
    const result = await vm.execute(bytecode, { greeting: 'hello' });
    expect(result.stackTop).toBe('hello');

    const log = vm.exportLog();
    expect(log.initialContext).toEqual({ greeting: 'hello' });
    // replay gets the context FROM THE LOG — nothing passed here.
    const verdict = await replayUAALLog(bytecode, log);
    expect(verdict.valid).toBe(true);
  });

  it('replays an ERROR run (deterministic throw) as valid', async () => {
    const bytecode = program(
      instr(UAALOpCode.PUSH, false),
      instr(UAALOpCode.OP_ASSERT),
      instr(UAALOpCode.HALT)
    );
    const vm = new UAALVirtualMachine({ recordLog: true });
    const result = await vm.execute(bytecode);
    expect(result.taskStatus).toBe('ERROR');

    const log = vm.exportLog();
    expect(log.result.taskStatus).toBe('ERROR');
    expect(log.steps).toHaveLength(2);
    expect(log.steps[1].threw).toBe(true);

    const verdict = await replayUAALLog(bytecode, log);
    expect(verdict.valid).toBe(true);
  });
});

describe('hermetic replay of nondeterministic built-ins', () => {
  it('OP_TIMESTAMP replays by injecting the recorded clock value', async () => {
    const bytecode = program(instr(UAALOpCode.OP_TIMESTAMP), instr(UAALOpCode.HALT));
    const vm = new UAALVirtualMachine({ recordLog: true });
    const result = await vm.execute(bytecode);
    const recordedTimestamp = result.stackTop;
    expect(typeof recordedTimestamp).toBe('number');

    const log = vm.exportLog();
    expect(log.steps[0].injected).toBe(true);
    expect(log.steps[0].source).toBe('builtin-nondeterministic');
    expect(log.steps[0].effects).toEqual([{ op: 'push', value: recordedTimestamp }]);

    // Let the wall clock move — replay must still match because it injects
    // the recorded value instead of calling Date.now() again.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const verdict = await replayUAALLog(bytecode, log);
    expect(verdict.valid).toBe(true);
  });
});

describe('proxy injection (VMProxy custom handlers)', () => {
  const llmProgram = (): UAALBytecode =>
    program(
      instr(UAALOpCode.PUSH, 'question'),
      instr(UAALOpCode.OP_INVOKE_LLM),
      instr(UAALOpCode.HALT)
    );

  const recordLlmRun = async () => {
    let handlerCalls = 0;
    const vm = new UAALVirtualMachine({ recordLog: true });
    vm.registerHandler(UAALOpCode.OP_INVOKE_LLM, (proxy: VMProxy) => {
      handlerCalls++;
      const prompt = proxy.pop();
      proxy.push({ response: `answer-to:${String(prompt)}`, nonce: Math.random() });
    });
    const result = await vm.execute(llmProgram());
    return { log: vm.exportLog(), result, getCalls: () => handlerCalls };
  };

  it('records handler effects and replays WITHOUT re-calling the handler', async () => {
    const { log, result, getCalls } = await recordLlmRun();
    expect(getCalls()).toBe(1);
    expect(result.taskStatus).toBe('HALTED');

    const handlerStep = log.steps[1];
    expect(handlerStep.injected).toBe(true);
    expect(handlerStep.source).toBe('handler');
    expect(handlerStep.effects?.map((e) => e.op)).toEqual(['pop', 'push']);
    expect(handlerStep.effects?.[0].value).toBe('question');

    // Replay on plain bytecode: the verifier has NO handler registered —
    // the recorded response is injected instead.
    const verdict = await replayUAALLog(llmProgram(), log);
    expect(verdict.valid).toBe(true);
    expect(getCalls()).toBe(1); // handler was never re-called
  });

  it('tampering with a recorded handler response is caught at that step', async () => {
    const { log } = await recordLlmRun();
    const tampered = structuredClone(log);
    const pushEffect = tampered.steps[1].effects?.find((e) => e.op === 'push');
    expect(pushEffect).toBeDefined();
    (pushEffect!.value as Record<string, unknown>).nonce = 'forged';

    // The tampered value is injected, so the replayed stackAfter no longer
    // matches the claimed stackAfter snapshot.
    const verdict = await replayUAALLog(llmProgram(), tampered);
    expect(verdict.valid).toBe(false);
    expect(verdict.divergenceStep).toBe(1);
  });
});

describe('tamper detection', () => {
  const recordSimpleRun = async () => {
    const bytecode = simpleProgram();
    const vm = new UAALVirtualMachine({ recordLog: true });
    await vm.execute(bytecode);
    return { bytecode, log: vm.exportLog() };
  };

  it("mutating a step's operand → valid:false with correct divergenceStep", async () => {
    const { bytecode, log } = await recordSimpleRun();
    const tampered = structuredClone(log);
    tampered.steps[1].operands[0] = 999;

    const verdict = await replayUAALLog(bytecode, tampered);
    expect(verdict.valid).toBe(false);
    expect(verdict.divergenceStep).toBe(1);
    expect(verdict.reason).toMatch(/divergence at step 1/);
  });

  it('mutating the final result → valid:false', async () => {
    const { bytecode, log } = await recordSimpleRun();
    const tampered = structuredClone(log);
    tampered.result.stackTop = 'forged';

    const verdict = await replayUAALLog(bytecode, tampered);
    expect(verdict.valid).toBe(false);
    expect(verdict.divergenceStep).toBeUndefined();
    expect(verdict.reason).toMatch(/final result mismatch/);
  });

  it('mutating the bytecode → valid:false via sha mismatch (no execution)', async () => {
    const { log } = await recordSimpleRun();
    const tamperedBytecode = simpleProgram();
    tamperedBytecode.instructions[0] = instr(UAALOpCode.PUSH, 6);

    const verdict = await replayUAALLog(tamperedBytecode, log);
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toMatch(/bytecodeSha256 mismatch/);
  });

  it('truncating the step list → valid:false with step-count reason', async () => {
    const { bytecode, log } = await recordSimpleRun();
    const tampered = structuredClone(log);
    tampered.steps.pop();

    const verdict = await replayUAALLog(bytecode, tampered);
    expect(verdict.valid).toBe(false);
    expect(verdict.divergenceStep).toBe(log.steps.length - 1);
    expect(verdict.reason).toMatch(/step count mismatch/);
  });

  it('unknown log version → valid:false without executing', async () => {
    const { bytecode, log } = await recordSimpleRun();
    const tampered = structuredClone(log) as unknown as Record<string, unknown>;
    tampered.version = 'uaal.execution-log.v999';

    const verdict = await replayUAALLog(
      bytecode,
      tampered as unknown as Parameters<typeof replayUAALLog>[1]
    );
    expect(verdict.valid).toBe(false);
    expect(verdict.reason).toMatch(/unsupported log version/);
  });
});
