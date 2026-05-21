// Module declarations for @holoscript/absorb-service sub-path exports
// The library is built with dts: false (tsup), so we declare the modules here

declare module '@holoscript/absorb-service/engine' {
  export const CodebaseScanner: unknown;
  export const CodebaseGraph: unknown;
  export const CommunityDetector: unknown;
  export const EmbeddingIndex: unknown;
  export const HoloEmitter: unknown;
  export const AdapterManager: unknown;
  export const WorkerPool: unknown;
  export const GitChangeDetector: unknown;
  export const forceDirectedLayout: unknown;
  export const layeredLayout: unknown;
  export const CodebaseSceneCompiler: unknown;
  export const CodebaseTheme: unknown;
  export const EdgeRenderer: unknown;
  export const InteractiveSceneEnricher: unknown;
  export const GraphSelectionManager: unknown;
  export const GraphRAGVisualizer: unknown;
  export const GraphTooltipGenerator: unknown;
  export const GraphRAGEngine: unknown;
  export const BM25EmbeddingProvider: unknown;
  export const XenovaEmbeddingProvider: unknown;
  export const OllamaEmbeddingProvider: unknown;
  export const OpenAIEmbeddingProvider: unknown;
  export const TypeScriptAdapter: unknown;
  export const PythonAdapter: unknown;
  export const RustAdapter: unknown;
  export const GoAdapter: unknown;
  export const registerAdapter: unknown;
  export const getAdapterForFile: unknown;
  export const getAdapterForLanguage: unknown;
  export const getSupportedLanguages: unknown;
  export const getSupportedExtensions: unknown;
  export const detectLanguage: unknown;
}

declare module '@holoscript/absorb-service/pipeline' {
  export const PipelineOrchestrator: unknown;
  export const executeLayer0: unknown;
  export const executeLayer1: unknown;
  export const executeLayer2: unknown;
  export const generateFeedbackSignals: unknown;
  export const aggregateFeedback: unknown;
  export const createPipelineLLMProvider: unknown;
  export const adaptToChatProvider: unknown;
  export const detectLLMProviderName: unknown;
  export const AnthropicAdapter: unknown;
  export const OpenAIAdapter: unknown;
  export const XAIAdapter: unknown;
  export const OpenRouterAdapter: unknown;
  export const LocalLLMAdapter: unknown;
  export const LLMProviderManager: unknown;
  export const HOLOSCRIPT_SELF_DNA: unknown;
  export const SELF_TARGET_DENYLIST: unknown;
  export const isSelfTargetSafe: unknown;
  export const getHoloScriptProjectPath: unknown;
}

declare module '@holoscript/absorb-service/daemon' {
  export const categorizeError: unknown;
  export const extractSymbol: unknown;
  export const parseTscErrorLine: unknown;
  export const parseTscOutput: unknown;
  export const aggregatePatterns: unknown;
  export const buildDaemonPromptContext: unknown;
  export const getDaemonSystemPrompt: unknown;
  export const createDaemonActions: unknown;
  export const getDaemonFileState: unknown;
  export type DaemonJob = unknown;
  export type DaemonJobLimits = unknown;
  export type DaemonLogEntry = unknown;
  export type DaemonProfile = unknown;
  export type DaemonProjectDNA = unknown;
  export type DaemonProjectKind = unknown;
  export type DaemonTelemetryEvent = unknown;
  export type DaemonTelemetrySummary = unknown;
  export type PatchProposal = unknown;
  export type CreateDaemonJobInput = unknown;
  export type DaemonAbsorbSnapshot = unknown;
  export type DaemonPass = unknown;
  export type DaemonPlan = unknown;
  export type DaemonPlanProfile = unknown;
  export type ProjectDNA = unknown;
  export type ManifestData = unknown;
  export type DaemonConfig = unknown;
  export type DaemonExecResult = unknown;
  export type DaemonHost = unknown;
  export type LLMProvider = unknown;
  export type DaemonProvider = unknown;
  export type DaemonPromptContext = unknown;
  export type DaemonPromptAction = unknown;
  export type ErrorCategory = unknown;
  export type SemanticError = unknown;
  export type FailurePattern = unknown;
}

declare module '@holoscript/absorb-service/self-improvement' {
  export const SelfImprovementPipeline: unknown;
  export const calculateQualityScore: unknown;
  export const QUALITY_WEIGHTS: unknown;
  export const ConvergenceDetector: unknown;
  export const SelfImproveCommand: unknown;
  export const SelfImproveHarvester: unknown;
  export const FocusedDPOSplitter: unknown;
  export const GRPORewardOrchestrator: unknown;
  export const createGRPORewardFunctions: unknown;
  export const GRPO_REWARD_WEIGHTS: unknown;
  export const RECOMMENDED_GRPO_CONFIG: unknown;
  export const buildGRPOConfig: unknown;
  export const exportGRPOConfigAsPython: unknown;
  export const GRPOPromptExtractor: unknown;
  export const DEFAULT_OPLORA_CONFIG: unknown;
  export const validateOPLoRAConfig: unknown;
  export const buildOPLoRAConfig: unknown;
  export const exportOPLoRAConfigAsPython: unknown;
  export const OPLoRAMonitor: unknown;
  export const ForgettingDetector: unknown;
}

declare module '@holoscript/absorb-service/mcp' {
  export const absorbServiceTools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  export const absorbServiceToolHandler: (toolName: string, params: unknown) => Promise<unknown>;
  export const absorbTypescriptTools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  export const absorbTypescriptToolHandler: (toolName: string, params: unknown) => Promise<unknown>;
  export const codebaseTools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  export const codebaseToolHandler: (toolName: string, params: unknown) => Promise<unknown>;
  export const graphRagTools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  export const graphRagToolHandler: (toolName: string, params: unknown) => Promise<unknown>;
  export const setGraphRAGState: unknown;
  export const isGraphRAGReady: unknown;
}

declare module '@holoscript/absorb-service/credits' {
  export const setDbProvider: (db: unknown) => void;
  export const getOrCreateAccount: (userId: string) => Promise<unknown>;
  export const checkBalance: (userId: string) => Promise<unknown>;
  export const deductCredits: (userId: string, amountCents: number, description: string, metadata?: unknown) => Promise<unknown>;
  export const addCredits: (userId: string, amountCents: number, description: string, metadata?: unknown) => Promise<unknown>;
  export const getUsageHistory: (userId: string, limit?: number) => Promise<unknown[]>;
  export const MeteredLLMProvider: unknown;
  export const requireCredits: unknown;
  export const isCreditError: unknown;
  export type CreditAccount = unknown;
  export type CreditTransaction = unknown;
  export type BalanceCheck = unknown;
  export type CreditGateResult = unknown;
}

declare module '@holoscript/absorb-service/schema' {
  export const creditAccounts: unknown;
  export const creditTransactions: unknown;
  export const absorbProjects: unknown;
}

declare module '@holoscript/absorb-service/bridge' {
  export const onAbsorbComplete: unknown;
  export const recommendPipelineConfig: unknown;
  export const saveBridgeConfig: unknown;
  export const getBridgeConfig: unknown;
  export const generatePipelineSummary: unknown;
  export const DEFAULT_PIPELINE_CONFIG: unknown;
}

declare module 'stripe' {
  const Stripe: unknown;
  export default Stripe;
}

declare module '@holoscript/core/codebase' {
  const _default: unknown;
  export = _default;
}

declare module '@holoscript/core/parser' {
  export const HoloScriptPlusParser: unknown;
  export const HoloScriptParser: unknown;
  export const parse: unknown;
  export const parsePlus: unknown;
}
