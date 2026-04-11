/** @quiz Trait — Assessment with multiple question types. @trait quiz */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer' | 'matching' | 'fill_blank';
export interface QuizQuestion { id: string; type: QuestionType; text: string; options?: string[]; correctAnswer: string | string[]; points: number; }
export interface QuizConfig { questions: QuizQuestion[]; timeLimitMinutes: number | null; attemptsAllowed: number; passingScore: number; shuffle: boolean; showCorrectAnswers: boolean; }
export interface QuizState { currentQuestion: number; answers: Record<string, string>; score: number; attemptsUsed: number; isComplete: boolean; startedAt: number | null; }

const defaultConfig: QuizConfig = { questions: [], timeLimitMinutes: null, attemptsAllowed: 3, passingScore: 70, shuffle: false, showCorrectAnswers: true };

export function createQuizHandler(): TraitHandler<QuizConfig> {
  return {
    name: 'quiz', defaultConfig,
    onAttach(node: HSPlusNode, config: QuizConfig, ctx: TraitContext) { node.__quizState = { currentQuestion: 0, answers: {}, score: 0, attemptsUsed: 0, isComplete: false, startedAt: null }; ctx.emit?.('quiz:ready', { questionCount: config.questions.length }); },
    onDetach(node: HSPlusNode, _c: QuizConfig, ctx: TraitContext) { delete node.__quizState; ctx.emit?.('quiz:detached'); },
    onUpdate() {},
    onEvent(node: HSPlusNode, config: QuizConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__quizState as QuizState | undefined; if (!s) return;
      if (event.type === 'quiz:start') { s.startedAt = Date.now(); s.attemptsUsed++; ctx.emit?.('quiz:started', { attempt: s.attemptsUsed }); }
      if (event.type === 'quiz:answer') { const qId = event.payload?.questionId as string; const ans = event.payload?.answer as string; s.answers[qId] = ans; }
      if (event.type === 'quiz:submit') {
        let correct = 0;
        for (const q of config.questions) { if (s.answers[q.id] === q.correctAnswer) correct += q.points; }
        const total = config.questions.reduce((sum, q) => sum + q.points, 0);
        s.score = total > 0 ? (correct / total) * 100 : 0; s.isComplete = true;
        ctx.emit?.('quiz:submitted', { score: s.score, passed: s.score >= config.passingScore });
      }
    },
  };
}
