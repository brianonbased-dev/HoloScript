/** @workout Trait — Workout session definition. @trait workout */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type WorkoutType = 'strength' | 'cardio' | 'hiit' | 'yoga' | 'pilates' | 'crossfit' | 'swimming' | 'cycling' | 'running';
export interface ExerciseSet { exerciseId: string; reps: number; weightKg?: number; durationS?: number; restS: number; }
export interface WorkoutConfig { name: string; type: WorkoutType; exercises: ExerciseSet[]; estimatedDurationMin: number; difficulty: 'beginner' | 'intermediate' | 'advanced'; calorieTarget?: number; }
export interface WorkoutState { isActive: boolean; currentExercise: number; elapsedS: number; caloriesBurned: number; completedSets: number; }

const defaultConfig: WorkoutConfig = { name: '', type: 'strength', exercises: [], estimatedDurationMin: 30, difficulty: 'intermediate' };

export function createWorkoutHandler(): TraitHandler<WorkoutConfig> {
  return { name: 'workout', defaultConfig,
    onAttach(n: HSPlusNode, _c: WorkoutConfig, ctx: TraitContext) { n.__workoutState = { isActive: false, currentExercise: 0, elapsedS: 0, caloriesBurned: 0, completedSets: 0 }; ctx.emit?.('workout:ready'); },
    onDetach(n: HSPlusNode, _c: WorkoutConfig, ctx: TraitContext) { delete n.__workoutState; ctx.emit?.('workout:ended'); },
    onUpdate(n: HSPlusNode, _c: WorkoutConfig, _ctx: TraitContext, delta: number) { const s = n.__workoutState as WorkoutState | undefined; if (s?.isActive) { s.elapsedS += delta / 1000; s.caloriesBurned += (delta / 1000) * 0.15; } },
    onEvent(n: HSPlusNode, c: WorkoutConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__workoutState as WorkoutState | undefined; if (!s) return;
      if (e.type === 'workout:start') { s.isActive = true; ctx.emit?.('workout:started', { type: c.type }); }
      if (e.type === 'workout:complete_set') { s.completedSets++; if (s.completedSets >= c.exercises.length) { s.isActive = false; ctx.emit?.('workout:completed', { calories: Math.round(s.caloriesBurned), duration: Math.round(s.elapsedS) }); } else { s.currentExercise++; ctx.emit?.('workout:next_exercise', { index: s.currentExercise }); } }
      if (e.type === 'workout:pause') { s.isActive = false; ctx.emit?.('workout:paused'); }
    },
  };
}
