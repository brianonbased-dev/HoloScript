import { describe, it, expect } from 'vitest';

import { UAALOpCode } from '@holoscript/uaal';

import { compileHSNAPToUAAL, compileHSNAPToUAALDetailed } from '../hsnap-bytecode';

describe('hsnap-bytecode (deprecated stubs)', () => {
  it('compileHSNAPToUAALDetailed throws with migration hint to @holoscript/hsnap-compiler', () => {
    expect(() => compileHSNAPToUAALDetailed('composition X {}')).toThrow('@holoscript/hsnap-compiler');
  });

  it('compileHSNAPToUAAL throws with migration hint to @holoscript/hsnap-compiler', () => {
    expect(() =>
      compileHSNAPToUAAL(
        `composition Lightweight {
      @task { id: "task-lite", intent: "review" }
      emit("task.accept", { eta: 5 })
    }`,
        { includeFullCycle: false }
      )
    ).toThrow('@holoscript/hsnap-compiler');
  });

  it('keeps UAAL opcode enum reachable for protocol consumers that align with VM', () => {
    expect(UAALOpCode.HALT).toBeDefined();
    expect(typeof UAALOpCode.OP_INVOKE_LLM).toBe('number');
  });
});
