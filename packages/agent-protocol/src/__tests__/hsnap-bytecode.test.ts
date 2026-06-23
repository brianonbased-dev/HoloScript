import { describe, it, expect } from 'vitest';

import { UAALOpCode } from '@holoscript/uaal';

import { compileHSNAPToUAAL, compileHSNAPToUAALDetailed } from '../hsnap-bytecode';

describe('hsnap-bytecode (unimplemented stubs)', () => {
  it('compileHSNAPToUAALDetailed throws — not implemented in agent-protocol, not consumed', () => {
    expect(() => compileHSNAPToUAALDetailed('composition X {}')).toThrow(
      'not implemented in @holoscript/agent-protocol'
    );
  });

  it('compileHSNAPToUAAL throws — not implemented in agent-protocol, not consumed', () => {
    expect(() =>
      compileHSNAPToUAAL(
        `composition Lightweight {
      @task { id: "task-lite", intent: "review" }
      emit("task.accept", { eta: 5 })
    }`,
        { includeFullCycle: false }
      )
    ).toThrow('not implemented in @holoscript/agent-protocol');
  });

  it('keeps UAAL opcode enum reachable for protocol consumers that align with VM', () => {
    expect(UAALOpCode.HALT).toBeDefined();
    expect(typeof UAALOpCode.OP_INVOKE_LLM).toBe('number');
  });
});
