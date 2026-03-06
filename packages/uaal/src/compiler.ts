/**
 * uAAL Compiler — Intent to Bytecode
 *
 * Translates high-level intent strings into executable UAALBytecode.
 * This is the standalone compiler — no service dependencies.
 */

import { UAALOpCode, UAALBytecode, UAALInstruction } from './opcodes';

export class UAALCompiler {
  /**
   * Compile an intent string into bytecode.
   * Maps keywords to cognitive opcodes.
   */
  compileIntent(intent: string): UAALBytecode {
    const instructions: UAALInstruction[] = [];
    const upper = intent.toUpperCase();

    if (upper.includes('LEARN') || upper.includes('INTAKE')) {
      instructions.push({ opCode: UAALOpCode.INTAKE });
    }
    if (upper.includes('THINK') || upper.includes('REFLECT')) {
      instructions.push({ opCode: UAALOpCode.REFLECT });
    }
    if (upper.includes('DO') || upper.includes('EXECUTE')) {
      instructions.push({ opCode: UAALOpCode.EXECUTE });
    }
    if (upper.includes('STORE') || upper.includes('COMPRESS')) {
      instructions.push({ opCode: UAALOpCode.COMPRESS });
    }
    if (upper.includes('REVIEW') || upper.includes('REINTAKE')) {
      instructions.push({ opCode: UAALOpCode.REINTAKE });
    }
    if (upper.includes('GROW') || upper.includes('LEARN_PATTERNS')) {
      instructions.push({ opCode: UAALOpCode.GROW });
    }
    if (upper.includes('EVOLVE') || upper.includes('ADAPT')) {
      instructions.push({ opCode: UAALOpCode.EVOLVE });
    }
    if (upper.includes('SNAPSHOT') || upper.includes('ANCHOR')) {
      instructions.push({ opCode: UAALOpCode.CLOCK_ANCHOR });
    }
    if (upper.includes('AUDIT')) {
      instructions.push({ opCode: UAALOpCode.CLOCK_AUDIT });
    }

    // Default: always add HALT
    instructions.push({ opCode: UAALOpCode.HALT });

    return { version: 1, instructions };
  }

  /**
   * Build bytecode from raw instructions
   */
  buildBytecode(instructions: UAALInstruction[], version: number = 1): UAALBytecode {
    return { version, instructions };
  }

  /**
   * Build a complete 7-phase cycle as bytecode
   */
  buildFullCycle(task: string): UAALBytecode {
    return {
      version: 1,
      instructions: [
        { opCode: UAALOpCode.PUSH, operands: [task] },
        { opCode: UAALOpCode.INTAKE },
        { opCode: UAALOpCode.REFLECT },
        { opCode: UAALOpCode.EXECUTE },
        { opCode: UAALOpCode.COMPRESS },
        { opCode: UAALOpCode.REINTAKE },
        { opCode: UAALOpCode.GROW },
        { opCode: UAALOpCode.EVOLVE },
        { opCode: UAALOpCode.HALT },
      ],
    };
  }
}
