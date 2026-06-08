export { createWorkoutHandler, type WorkoutConfig, type WorkoutType, type ExerciseSet } from './traits/WorkoutTrait';
export { createRepCounterHandler, type RepCounterConfig } from './traits/RepCounterTrait';
export { createExerciseLibraryHandler, type ExerciseLibraryConfig, type Exercise, type MuscleGroup } from './traits/ExerciseLibraryTrait';
export { createProgressTrackerHandler, type ProgressTrackerConfig, type ProgressEntry } from './traits/ProgressTrackerTrait';
export * from './traits/types';

import { createWorkoutHandler } from './traits/WorkoutTrait';
import { createRepCounterHandler } from './traits/RepCounterTrait';
import { createExerciseLibraryHandler } from './traits/ExerciseLibraryTrait';
import { createProgressTrackerHandler } from './traits/ProgressTrackerTrait';

export * from './fitnesssolver';

// Runtime integration — behavioral trait handler + registrar that wire the
// deterministic 1-rep-max prediction solver into HoloScriptRuntime's dispatch.
// Closes the built-but-dead-wired gap for `one_rep_max`, mirroring
// government-civic's `civic_decision` reference integration.
export {
  FITNESS_WELLNESS_PLUGIN_ID,
  oneRepMaxHandler,
  registerFitnessWellnessTraitHandlers,
  type OneRepMaxTraitConfig,
  type OneRepMaxSolvedEvent,
  type RuntimeTraitHandler,
  type TraitRegistrar,
} from './runtime';

export const pluginMeta = { name: '@holoscript/plugin-fitness-wellness', version: '1.0.0', traits: ['workout', 'rep_counter', 'exercise_library', 'progress_tracker', 'one_rep_max', 'vo2max', 'hr_zones', 'calorie_burn', 'body_composition', 'training_load_acwr'] };
export const traitHandlers = [createWorkoutHandler(), createRepCounterHandler(), createExerciseLibraryHandler(), createProgressTrackerHandler()];
