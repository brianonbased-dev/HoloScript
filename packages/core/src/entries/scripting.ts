/**
 * @holoscript/core/scripting
 *
 * Sub-barrel for scripting-layer modules:
 * - Headless runtime
 * - @script_test trait
 * - @absorb trait
 * - @hot_reload trait
 * - Error recovery
 */

// ── Headless Runtime (TYPES ONLY) ────────────────────────────────────────────
// The headless-runtime VALUES (createHeadlessRuntime / getProfile /
// HEADLESS_PROFILE) are backed by the OPTIONAL peer @holoscript/engine. A
// STATIC `export <value> … from '@holoscript/engine/runtime/HeadlessRuntime'`
// here was code-split into a chunk shared with the engine-free scripting traits
// (ScriptTestRunner / AbsorbProcessor / HotReloadWatcher) that the cold
// `@holoscript/core` barrel re-exports — so the engine import bled onto the
// cold-consume path and crashed a bare `import '@holoscript/core'` with
// ERR_MODULE_NOT_FOUND when engine is not installed. The runtime VALUES are
// already available from the engine-gated surfaces (`@holoscript/engine/runtime`
// and `@holoscript/core/runtime`), so this sub-barrel keeps only the TYPES
// (erased at build time) and the engine-free scripting traits below.
export type {
  HeadlessRuntime,
  HeadlessRuntimeOptions,
  RuntimeProfile,
  // @ts-expect-error
  RuntimeStats,
} from '@holoscript/engine/runtime/HeadlessRuntime';

// ── Error Recovery ──────────────────────────────────────────────────────────
export {
  ErrorRecovery,
  HOLOSCHEMA_KEYWORDS,
  HOLOSCHEMA_GEOMETRIES,
  HOLOSCHEMA_PROPERTIES,
} from '../parser/ErrorRecovery';

// ── @script_test Trait ──────────────────────────────────────────────────────
export {
  ScriptTestRunner,
  SCRIPT_TEST_TRAIT,
  type ScriptTestResult,
  type ScriptTestBlock,
  type ScriptTestRunnerOptions,
} from '../traits/ScriptTestTrait';

// ── @absorb Trait ───────────────────────────────────────────────────────────
export {
  AbsorbProcessor,
  ABSORB_TRAIT,
  type AbsorbSource,
  type AbsorbResult,
  type AbsorbedFunction,
  type AbsorbedClass,
  type AbsorbedImport,
} from '../traits/AbsorbTrait';

// ── @hot_reload Trait ───────────────────────────────────────────────────────
export {
  HotReloadWatcher,
  HOT_RELOAD_TRAIT,
  type HotReloadConfig,
  type HotReloadEvent,
  type HotReloadCallback,
} from '../traits/HotReloadTrait';
