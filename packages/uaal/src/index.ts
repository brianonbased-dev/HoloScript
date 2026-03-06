/**
 * @holoscript/uaal
 *
 * uAAL — Universal Autonomous Agent Language Virtual Machine.
 * Stack-based bytecode execution engine for the uAA2++ 7-Phase Protocol.
 *
 * @example
 * ```ts
 * import { UAALVirtualMachine, UAALCompiler, UAALOpCode } from '@holoscript/uaal';
 *
 * const vm = new UAALVirtualMachine();
 * const compiler = new UAALCompiler();
 *
 * // Register custom handlers for your service integrations
 * vm.registerHandler(UAALOpCode.OP_INVOKE_LLM, async (proxy, operands) => {
 *   const result = await myLLMService.call(operands[0] as string);
 *   proxy.push(result);
 * });
 *
 * // Compile and execute a full 7-phase cycle
 * const bytecode = compiler.buildFullCycle('Analyze the market data');
 * const result = await vm.execute(bytecode);
 * console.log(result.taskStatus); // 'HALTED'
 * ```
 */

export {
  UAALOpCode,
  getUAALOpcodeName,
  isCognitiveOp,
  isControlFlowOp,
} from './opcodes';
export type {
  UAALOperand,
  UAALInstruction,
  UAALBytecode,
} from './opcodes';

export {
  UAALVirtualMachine,
} from './vm';
export type {
  VMState,
  VMResult,
  VMProxy,
  OpcodeHandler,
  UAALVMOptions,
} from './vm';

export {
  UAALCompiler,
} from './compiler';
