/**
 * @holoscript/holo-vm
 *
 * HOLO VM — HoloScript's native bytecode execution engine for spatial computing.
 *
 * Compile .holo/.hsplus/.hs → .holob bytecode → run anywhere via WASM.
 *
 * @example
 * ```ts
 * import { HoloBytecodeBuilder, HoloVM, GeometryType, ComponentType } from '@holoscript/holo-vm';
 *
 * // Build a simple scene
 * const builder = new HoloBytecodeBuilder();
 * const main = builder.addFunction('main');
 * main.spawn(0, 'MyCube')
 *     .setGeometry(1, GeometryType.Cube)
 *     .transform(1, 0, 1, -5)
 *     .halt();
 * builder.addEntity('MyCube', 0);
 *
 * // Execute
 * const vm = new HoloVM();
 * vm.load(builder.build());
 * const result = vm.tick(16.67); // 60fps tick
 * ```
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
