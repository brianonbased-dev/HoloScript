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

export const pluginMeta = { name: '@holoscript/plugin-fitness-wellness', version: '1.0.0', traits: ['workout', 'rep_counter', 'exercise_library', 'progress_tracker', 'one_rep_max', 'vo2max', 'hr_zones', 'calorie_burn', 'body_composition', 'training_load_acwr'] };
export const traitHandlers = [createWorkoutHandler(), createRepCounterHandler(), createExerciseLibraryHandler(), createProgressTrackerHandler()];
