export { createCourseHandler, type CourseConfig, type CourseState, type Difficulty } from './traits/CourseTrait';
export { createLessonHandler, type LessonConfig, type ContentType } from './traits/LessonTrait';
export { createGradeHandler, type GradeConfig, type GradingScale } from './traits/GradeTrait';
export { createEnrollmentHandler, type EnrollmentConfig, type EnrollmentStatus } from './traits/EnrollmentTrait';
export { createQuizHandler, type QuizConfig, type QuizQuestion, type QuestionType } from './traits/QuizTrait';
export * from './traits/types';

import { createCourseHandler } from './traits/CourseTrait';
import { createLessonHandler } from './traits/LessonTrait';
import { createGradeHandler } from './traits/GradeTrait';
import { createEnrollmentHandler } from './traits/EnrollmentTrait';
import { createQuizHandler } from './traits/QuizTrait';

export const pluginMeta = { name: '@holoscript/plugin-education-lms', version: '1.0.0', traits: ['course', 'lesson', 'grade', 'enrollment', 'quiz'] };
export const traitHandlers = [createCourseHandler(), createLessonHandler(), createGradeHandler(), createEnrollmentHandler(), createQuizHandler()];
