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

export { UAALOpCode, getUAALOpcodeName, isCognitiveOp, isControlFlowOp } from './opcodes';
export type { UAALOperand, UAALInstruction, UAALBytecode } from './opcodes';

export { UAALVirtualMachine, replayUAALLog, computeUAALBytecodeSha256 } from './vm';
export type {
  VMState,
  VMResult,
  VMProxy,
  OpcodeHandler,
  UAALVMOptions,
  UAALExecutionLog,
  UAALLogStep,
  UAALRecordedEffect,
  UAALBoundedStack,
  UAALReplayResult,
} from './vm';

export { UAALCompiler } from './compiler';

export { registerMeshHandlers, InMemoryMeshRouter } from './mesh-transport';
export type { MeshTransport, MeshRequestHandler } from './mesh-transport';

export * from './gate';
export * from './semantic';

// CAEL-pairing surface (2026-07-10, task_1783669630177_iwmp): provenance envelope +
// instance identity, non-destructive merge, and structural retrieval — the fields and
// operations that turn a uAAL document into an addressable, trust-weighted graph node.
export * from './provenance';
export * from './merge';
export * from './query';
