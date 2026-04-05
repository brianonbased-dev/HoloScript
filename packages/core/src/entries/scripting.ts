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

// ── Headless Runtime ────────────────────────────────────────────────────────
export {
  createHeadlessRuntime,
  getProfile,
  HEADLESS_PROFILE,
  type HeadlessRuntime,
  type HeadlessRuntimeOptions,
  type RuntimeProfile,
  type RuntimeStats,
// @ts-expect-error During migration
} from '../runtime/HeadlessRuntime';

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
