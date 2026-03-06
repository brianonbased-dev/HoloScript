/**
 * @holoscript/compiler — Multi-Target Compiler
 *
 * Re-exports compiler pipeline from @holoscript/core.
 * 212 files, 99K LOC, 25 compile targets.
 *
 * Usage:
 *   import { compile, UnityCompiler, WebGPUCompiler } from '@holoscript/compiler';
 */

// Re-export compiler subsystem from core
// Phase 2: compiler source files will be moved here
export * from '@holoscript/core';
