/**
 * @holoscript/holo-vm
 *
 * @deprecated This package has been merged into @holoscript/engine (A.011.01k).
 * Use `import { VM } from '@holoscript/engine'` or `import { HoloVM, ... } from '@holoscript/engine/vm'` instead.
 *
 * HOLO VM — HoloScript's native bytecode execution engine for spatial computing.
 *
 * Compile .holo/.hsplus/.hs → .holob bytecode → run anywhere via WASM.
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
export { HoloVM, ECSWorld, VMStatus, UnsupportedHostOpcodeError, isHostOpcode } from './executor';
export type {
  Entity,
  Vec3,
  Quat,
  TransformComponent,
  GeometryComponent,
  MaterialComponent,
  RigidBodyComponent,
  VMResult,
  HoloVMHostCallback,
  HoloVMHostCallbacks,
  HoloVMHostContext,
  HoloVMHostOpcode,
  HoloVMHostOpcodeGroup,
} from './executor';

// Native renderer — VM world state → RGBA pixels with zero foreign engine
// (no three.js / react / cannon on the pixel path).
export {
  NativeFramebuffer,
  SoftwareRasterBackend,
  NativeHoloRenderer,
  unpackColor,
} from './render/native-renderer';
export type {
  RGBA,
  RenderBackend,
  OrthoCamera,
  RenderStats,
} from './render/native-renderer';

// renderHolo — single native entry: `.holo` source text → native pixels.
export { renderHolo } from './render/render-holo';
export type { RenderHoloOptions, RenderHoloResult } from './render/render-holo';
