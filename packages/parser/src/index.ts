/**
 * @holoscript/parser — Parser & AST
 *
 * Re-exports parser subsystem from @holoscript/core.
 * 58 files, 25K LOC. Candidate for Rust/WASM port.
 *
 * Usage:
 *   import { parse, tokenize, HoloScriptAST } from '@holoscript/parser';
 */

// Re-export parser from core subpath
// Phase 2: parser source files will be moved here
export * from '@holoscript/core/parser';
