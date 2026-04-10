/**
 * Export AI completion features
 */

export {
  AICompletionProvider,
  type AICompletionConfig,
  type AICompletionResult,
} from './AICompletionProvider';
export {
  ContextGatherer,
  type CompletionContext as AICompletionContext,
  type CompletionContextType,
  type ErrorContext,
} from './ContextGatherer';
export { PromptBuilder } from './PromptBuilder';
