/** @exercise_library Trait — Exercise database. @trait exercise_library */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type MuscleGroup = 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'quadriceps' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'full_body';
export interface Exercise { id: string; name: string; primaryMuscle: MuscleGroup; secondaryMuscles: MuscleGroup[]; equipment: string[]; instructions: string; videoUrl?: string; }
export interface ExerciseLibraryConfig { exercises: Exercise[]; categories: string[]; }

const defaultConfig: ExerciseLibraryConfig = { exercises: [], categories: [] };

export function createExerciseLibraryHandler(): TraitHandler<ExerciseLibraryConfig> {
  return { name: 'exercise_library', defaultConfig,
    onAttach(n: HSPlusNode, c: ExerciseLibraryConfig, ctx: TraitContext) { n.__libState = { loaded: c.exercises.length }; ctx.emit?.('library:loaded', { exercises: c.exercises.length }); },
    onDetach(n: HSPlusNode, _c: ExerciseLibraryConfig, ctx: TraitContext) { delete n.__libState; ctx.emit?.('library:unloaded'); },
    onUpdate() {},
    onEvent(_n: HSPlusNode, c: ExerciseLibraryConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'library:search') { const muscle = e.payload?.muscle as MuscleGroup; const results = c.exercises.filter(ex => ex.primaryMuscle === muscle || ex.secondaryMuscles.includes(muscle)); ctx.emit?.('library:results', { count: results.length, exercises: results.map(r => r.name) }); }
      if (e.type === 'library:random') { const ex = c.exercises[Math.floor(Math.random() * c.exercises.length)]; if (ex) ctx.emit?.('library:suggestion', { exercise: ex.name, muscle: ex.primaryMuscle }); }
    },
  };
}
