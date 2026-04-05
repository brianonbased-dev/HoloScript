/**
 * Self-Improvement Module — The framework evolves itself.
 *
 * FW-1.0: absorb integration, self-evolution, auto-test generation,
 * prompt optimization via A/B testing.
 */

export {
  type AbsorbScanConfig,
  type ScanResult,
  type ImprovementTask,
  type ExtractedKnowledge,
  scanFramework,
  scanTodos,
} from './absorb-scanner';

export {
  type EvolutionConfig,
  type EvolutionResult,
  evolve,
} from './evolution-engine';

// FW-1.0: Class-based absorb integration
export {
  FrameworkAbsorber,
  type AbsorberConfig,
  type CodebaseGraph,
  type Improvement,
} from './framework-absorber';

// FW-1.0: Auto-test generation via LLM
export {
  TestGenerator,
  type TestGeneratorConfig,
  type GeneratedTest,
} from './test-generator';

// FW-1.0: Prompt optimization via A/B testing
export {
  PromptOptimizer,
  type ABTestConfig,
  type ABTestResult,
  type PromptVariantResult,
  type EvaluationCriteria,
} from './prompt-optimizer';
