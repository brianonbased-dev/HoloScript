// Compatibility module declarations for dynamic host imports.
// TODO: shrink these as the host consumes generated absorb-service declarations.

declare module '@holoscript/absorb-service/engine' {
  export const CodebaseScanner: unknown;
  export const CodebaseGraph: unknown;
  export const CommunityDetector: unknown;
  /**
   * Typed, not `unknown`, because `unknown` is not a weak type — it is no type,
   * and it made the compiler unable to contradict a wrong call. Measured
   * 2026-09-21: routes/absorb.ts constructed this with no argument and then
   * called a three-argument `add` that has never existed on the class, and tsc
   * reported nothing on either line, so /query answered 500 to every caller for
   * as long as it existed. Two runtime throws, zero compile errors.
   *
   * Only the members this service actually uses are declared. Adding a member
   * here is cheap; leaving one `unknown` costs a check that cannot fail.
   */
  export class EmbeddingIndex {
    constructor(options: { provider: unknown; batchSize?: number; useWorkers?: boolean });
    addSymbols(symbols: unknown[], graph?: unknown): Promise<void>;
    search(
      query: string,
      topK?: number
    ): Promise<Array<{ symbol: unknown; score: number; file: string; type: string }>>;
    dispose(): Promise<void>;
  }
  export const createEmbeddingProvider: (opts?: {
    provider?: string;
  }) => Promise<{ name: string }>;
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
  /**
   * Typed properly, not as `unknown`, because the purchase route reads these
   * numbers to decide what Stripe charges. Everything declared `unknown` in
   * this file is invisible to tsc: that is how `new EmbeddingIndex()` in
   * routes/absorb.ts type-checked for months while throwing "requires an
   * explicit provider" on every single call. A shim that says `unknown` is not
   * a weak type, it is no type — and it turns the compiler into one more check
   * that cannot fail.
   */
  export const CREDIT_PACKAGES: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly credits: number;
    readonly priceCents: number;
    readonly popular: boolean;
  }>;
  export const setDbProvider: (db: unknown) => void;
  // THESE RETURN TYPES ARE LOAD-BEARING, and `unknown` was not a safe default.
  //
  // TypeScript consults this declare-module block BEFORE the package's own
  // types, so `Promise<unknown>` here overrode the real signatures and any
  // caller reading a field off the result failed to compile. It did:
  // creditsWebhook.ts reads `granted.balanceCents` to log the new balance, and
  // `tsc -p services/absorb-service/tsconfig.json` reported
  // "TS2339: Property 'balanceCents' does not exist on type '{}'".
  // infrastructure/Dockerfile.absorb-service runs that same tsc, so the service
  // did not build. Typechecking packages/absorb-service does not cover this --
  // it is a different tsconfig and this file only shadows things here.
  export const getOrCreateAccount: (userId: string) => Promise<{
    userId: string;
    balanceCents: number;
    lifetimeSpentCents: number;
    lifetimePurchasedCents: number;
    tier: string;
    freeCreditsUsedCents: number;
  } | null>;
  export const checkBalance: (
    userId: string,
    requiredCents: number
  ) => Promise<{ sufficient: boolean; balanceCents: number; requiredCents: number }>;
  export const deductCredits: (
    userId: string,
    amountCents: number,
    description: string,
    metadata?: Record<string, unknown>
  ) => Promise<{ balanceCents: number } | null>;
  export const addCredits: (
    userId: string,
    amountCents: number,
    description: string,
    opts?: { type?: string; stripeSessionId?: string; metadata?: Record<string, unknown> }
  ) => Promise<{ balanceCents: number } | null>;
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

declare module '@holoscript/core/parser' {
  export const HoloScriptPlusParser: unknown;
  export const HoloScriptParser: unknown;
  export const parse: unknown;
  export const parsePlus: unknown;
}
