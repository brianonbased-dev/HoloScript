/**
 * @holoscript/plugin-therapy — public surface.
 *
 * Re-exports the clinical-psychology solvers (PHQ-9, GAD-7, treatment outcome,
 * risk stratification, stage of change, receipt builder) and the runtime
 * integration that wires the deterministic PHQ-9 solver into HoloScriptRuntime's
 * dispatch behind the `phq9_screen` trait.
 */
export * from './therapysolver';

// Runtime integration — behavioral trait handler + registrar that wire the
// deterministic PHQ-9 depression-screening solver into HoloScriptRuntime's
// dispatch. Closes the built-but-dead-wired gap for `phq9_screen`, mirroring
// government-civic's `civic_decision` reference integration.
export {
  THERAPY_PLUGIN_ID,
  phq9ScreenHandler,
  registerTherapyTraitHandlers,
  type Phq9ScreenTraitConfig,
  type Phq9ScreenSolvedEvent,
  type RuntimeTraitHandler,
  type TraitRegistrar,
} from './runtime';

export const pluginMeta = {
  name: '@holoscript/plugin-therapy',
  version: '2.0.1',
  traits: ['phq9_screen'],
};
