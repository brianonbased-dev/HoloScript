/**
 * HOLO VM - HoloScript native bytecode execution engine
 *
 * Merged from @holoscript/holo-vm into @holoscript/engine (A.011.01k).
 *
 * @packageDocumentation
 */

// Opcodes
export {
  HoloOpCode,
  ComponentType,
  GeometryType,
  BodyType,
  ColliderShape,
  LightType,
  SyncTier,
  ValueType,
  getOpcodeFamily,
  getOpcodeName,
  isControlFlow,
} from './opcodes';
export type { OpCodeMeta } from './opcodes';

// Bytecode format
export {
  HOLOB_MAGIC,
  HOLOB_VERSION,
  HolobFlags,
  AssetType,
  HoloBytecodeBuilder,
  HoloFunctionBuilder,
} from './bytecode';
export type {
  HoloOperand,
  HoloInstruction,
  HoloFunction,
  HoloEntityDef,
  HoloComponentData,
  HoloTraitDef,
  HoloAssetRef,
  HoloEventBinding,
  HoloBytecode,
  HoloSourceMap,
  HoloSourceMapping,
} from './bytecode';

// VM Executor
export { HoloVM, ECSWorld, VMStatus } from './executor';
export type {
  Entity,
  Vec3,
  Quat,
  TransformComponent,
  GeometryComponent,
  MaterialComponent,
  RigidBodyComponent,
  VMResult,
} from './executor';
