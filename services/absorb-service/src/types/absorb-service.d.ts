// Module declarations for @holoscript/absorb-service sub-path exports
// The library is built with dts: false (tsup), so we declare the modules here

declare module '@holoscript/absorb-service/engine' {
  export const CodebaseScanner: any;
  export const CodebaseGraph: any;
  export const CommunityDetector: any;
  export const EmbeddingIndex: any;
  export const HoloEmitter: any;
  export const AdapterManager: any;
  export const WorkerPool: any;
  export const GitChangeDetector: any;
  export const forceDirectedLayout: any;
  export const layeredLayout: any;
  export const CodebaseSceneCompiler: any;
  export const CodebaseTheme: any;
  export const EdgeRenderer: any;
  export const InteractiveSceneEnricher: any;
  export const GraphSelectionManager: any;
  export const GraphRAGVisualizer: any;
  export const GraphTooltipGenerator: any;
  export const GraphRAGEngine: any;
  export const BM25EmbeddingProvider: any;
  export const XenovaEmbeddingProvider: any;
  export const OllamaEmbeddingProvider: any;
  export const OpenAIEmbeddingProvider: any;
  export const TypeScriptAdapter: any;
  export const PythonAdapter: any;
  export const RustAdapter: any;
  export const GoAdapter: any;
  export const registerAdapter: any;
  export const getAdapterForFile: any;
  export const getAdapterForLanguage: any;
  export const getSupportedLanguages: any;
  export const getSupportedExtensions: any;
  export const detectLanguage: any;
}

declare module '@holoscript/absorb-service/pipeline' {
  export const PipelineOrchestrator: any;
  export const executeLayer0: any;
  export const executeLayer1: any;
  export const executeLayer2: any;
  export const generateFeedbackSignals: any;
  export const aggregateFeedback: any;
  export const createLLMProvider: any;
  export const detectLLMProviderName: any;
  export const AnthropicLLMProvider: any;
  export const XAILLMProvider: any;
  export const OpenAILLMProvider: any;
  export const OllamaLLMProvider: any;
  export const HOLOSCRIPT_SELF_DNA: any;
  export const SELF_TARGET_DENYLIST: any;
  export const isSelfTargetSafe: any;
  export const getHoloScriptProjectPath: any;
}

declare module '@holoscript/absorb-service/daemon' {
  export const categorizeError: any;
  export const extractSymbol: any;
  export const parseTscErrorLine: any;
  export const parseTscOutput: any;
  export const aggregatePatterns: any;
  export const buildDaemonPromptContext: any;
  export const getDaemonSystemPrompt: any;
  export const createDaemonActions: any;
  export const getDaemonFileState: any;
  export type DaemonJob = any;
  export type DaemonJobLimits = any;
  export type DaemonLogEntry = any;
  export type DaemonProfile = any;
  export type DaemonProjectDNA = any;
  export type DaemonProjectKind = any;
  export type DaemonTelemetryEvent = any;
  export type DaemonTelemetrySummary = any;
  export type PatchProposal = any;
  export type CreateDaemonJobInput = any;
  export type DaemonAbsorbSnapshot = any;
  export type DaemonPass = any;
  export type DaemonPlan = any;
  export type DaemonPlanProfile = any;
  export type ProjectDNA = any;
  export type ManifestData = any;
  export type DaemonConfig = any;
  export type DaemonExecResult = any;
  export type DaemonHost = any;
  export type LLMProvider = any;
  export type DaemonProvider = any;
  export type DaemonPromptContext = any;
  export type DaemonPromptAction = any;
  export type ErrorCategory = any;
  export type SemanticError = any;
  export type FailurePattern = any;
}

declare module '@holoscript/absorb-service/self-improvement' {
  export const SelfImprovementPipeline: any;
  export const calculateQualityScore: any;
  export const QUALITY_WEIGHTS: any;
  export const ConvergenceDetector: any;
  export const SelfImproveCommand: any;
  export const SelfImproveHarvester: any;
  export const FocusedDPOSplitter: any;
  export const GRPORewardOrchestrator: any;
  export const createGRPORewardFunctions: any;
  export const GRPO_REWARD_WEIGHTS: any;
  export const RECOMMENDED_GRPO_CONFIG: any;
  export const buildGRPOConfig: any;
  export const exportGRPOConfigAsPython: any;
  export const GRPOPromptExtractor: any;
  export const DEFAULT_OPLORA_CONFIG: any;
  export const validateOPLoRAConfig: any;
  export const buildOPLoRAConfig: any;
  export const exportOPLoRAConfigAsPython: any;
  export const OPLoRAMonitor: any;
  export const ForgettingDetector: any;
}

declare module '@holoscript/absorb-service/mcp' {
  export const absorbServiceTools: Array<{ name: string; description?: string; inputSchema?: any }>;
  export const absorbServiceToolHandler: (toolName: string, params: any) => Promise<any>;
  export const absorbTypescriptTools: Array<{ name: string; description?: string; inputSchema?: any }>;
  export const absorbTypescriptToolHandler: (toolName: string, params: any) => Promise<any>;
  export const codebaseTools: Array<{ name: string; description?: string; inputSchema?: any }>;
  export const codebaseToolHandler: (toolName: string, params: any) => Promise<any>;
  export const graphRagTools: Array<{ name: string; description?: string; inputSchema?: any }>;
  export const graphRagToolHandler: (toolName: string, params: any) => Promise<any>;
  export const setGraphRAGState: any;
  export const isGraphRAGReady: any;
}

declare module '@holoscript/absorb-service/credits' {
  export const setDbProvider: (db: any) => void;
  export const getOrCreateAccount: (userId: string) => Promise<any>;
  export const checkBalance: (userId: string) => Promise<any>;
  export const deductCredits: (userId: string, amountCents: number, description: string, metadata?: any) => Promise<any>;
  export const addCredits: (userId: string, amountCents: number, description: string, metadata?: any) => Promise<any>;
  export const getUsageHistory: (userId: string, limit?: number) => Promise<any[]>;
  export const MeteredLLMProvider: any;
  export const requireCredits: any;
  export const isCreditError: any;
  export type CreditAccount = any;
  export type CreditTransaction = any;
  export type BalanceCheck = any;
  export type CreditGateResult = any;
}

declare module '@holoscript/absorb-service/schema' {
  export const creditAccounts: any;
  export const creditTransactions: any;
  export const absorbProjects: any;
}

declare module '@holoscript/absorb-service/bridge' {
  export const onAbsorbComplete: any;
  export const recommendPipelineConfig: any;
  export const saveBridgeConfig: any;
  export const getBridgeConfig: any;
  export const generatePipelineSummary: any;
  export const DEFAULT_PIPELINE_CONFIG: any;
}

declare module 'stripe' {
  const Stripe: any;
  export default Stripe;
}

declare module '@holoscript/core/codebase' {
  const _default: any;
  export = _default;
}

declare module '@holoscript/core/parser' {
  export const HoloScriptPlusParser: any;
  export const HoloScriptParser: any;
  export const parse: any;
  export const parsePlus: any;
}
