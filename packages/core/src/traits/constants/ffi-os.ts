/**
 * FFI / OS Bindings Traits
 * @version 1.0.0
 */
export const FFI_OS_TRAITS = [
  'ffi', // Foreign function interface
  'native_call', // Native platform call
  'wasm_bridge', // WebAssembly bridge
  'sys_io', // System I/O operations
] as const;

export type FfiOsTraitName = (typeof FFI_OS_TRAITS)[number];
