/** @holoscript/core/world-model — adversarial trajectory curriculum schema */
export type TrajectoryId = string & { readonly __brand: 'TrajectoryId' };
export type SceneHash = string & { readonly __brand: 'SceneHash' };
export type CaelReceiptHash = string & { readonly __brand: 'CaelReceiptHash' };
export type TrustTier = 'replayable' | 'adapter-bound' | 'unsigned';
export type SimulationContractHashMode = 'fnv1a' | 'sha256';
export type ReplayDigestMode =
  | 'strict-same-adapter'
  | 'epsilon-cross-adapter'
  | 'unsigned-observed';
export interface SimulationFieldQuantum {
  readonly fieldPattern: string;
  readonly quantum: number;
  readonly units?: string;
}
export interface SimulationContractReference {
  readonly contractId: string;
  readonly hashMode: SimulationContractHashMode;
  readonly adapterFingerprint: string | null;
  readonly replayDigestMode: ReplayDigestMode;
  readonly fieldQuantization: readonly SimulationFieldQuantum[];
}
export interface ActionStep {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface ObservationStep {
  readonly stepIndex: number;
  readonly timestampMs: number;
  readonly type: string;
  readonly payload: Readonly<Record<string, unknown>>;
}
export interface SemanticPredicateScore {
  readonly violation: number;
  readonly novelty: number;
  readonly learnability: number;
  readonly regression: number;
  readonly invalidity: number;
}
export interface CurriculumPriority {
  readonly priority: number;
  readonly tieBreaker: number;
  readonly rationale: string;
}
export interface ValidityAnchor {
  readonly id: string;
  readonly description: string;
  evaluate(trajectory: AdversarialTrajectory): boolean;
}
export interface ReplayHandle {
  readonly trajectoryId: TrajectoryId;
  readonly sceneHash: SceneHash;
  readonly simulationContractId: string;
  readonly seed: number;
  readonly replayCommand: string;
}
export type TrajectoryStatus = 'open' | 'solved' | 'unresolved' | 'invalid' | 'archived';
export interface AdversarialTrajectory {
  readonly id: TrajectoryId;
  readonly sceneHash: SceneHash;
  readonly seed: number;
  readonly trustTier: TrustTier;
  readonly caelReceiptHash: CaelReceiptHash | null;
  readonly simulationContract: SimulationContractReference;
  readonly actionTrace: readonly ActionStep[];
  readonly observationTrace: readonly ObservationStep[];
  readonly predicateScore: SemanticPredicateScore;
  readonly priority: CurriculumPriority;
  readonly replayHandle: ReplayHandle;
  readonly status: TrajectoryStatus;
  readonly discoveredAtMs: number;
  readonly lastReplayedAtMs: number | null;
}
export interface AdversarialTrajectoryReport {
  readonly generatedAtMs: number;
  readonly sceneHash: SceneHash;
  readonly trajectories: readonly AdversarialTrajectory[];
  readonly counts: {
    readonly open: number;
    readonly solved: number;
    readonly unresolved: number;
    readonly invalid: number;
    readonly archived: number;
  };
  readonly topPriority: readonly TrajectoryId[];
}
export declare function isCurriculumEligible(trajectory: AdversarialTrajectory): boolean;
export declare function hasReplayEvidence(trajectory: AdversarialTrajectory): boolean;
export declare function asTrajectoryId(s: string): TrajectoryId;
export declare function asSceneHash(s: string): SceneHash;
export declare function asCaelReceiptHash(s: string): CaelReceiptHash;
export interface SoftAnchor {
  readonly id: string;
  readonly description: string;
  evaluate(trajectory: AdversarialTrajectory): number;
}
export interface ScorerInputs {
  readonly trajectory: AdversarialTrajectory;
  readonly hardAnchors: readonly ValidityAnchor[];
  readonly softAnchors: readonly SoftAnchor[];
  readonly historyActionTypes: ReadonlySet<string>;
  readonly learnabilityEstimate?: number;
  readonly previousStatus?: AdversarialTrajectory['status'];
}
export interface ScorerOutput {
  readonly predicateScore: SemanticPredicateScore;
  readonly priority: CurriculumPriority;
}
export declare function scoreTrajectory(inputs: ScorerInputs): ScorerOutput;
export declare function buildAdversarialTrajectoryReport(
  trajectories: readonly AdversarialTrajectory[],
  sceneHash: SceneHash,
  generatedAtMs: number,
  topPriorityLimit?: number
): AdversarialTrajectoryReport;
export declare function serializeReport(report: AdversarialTrajectoryReport): string;
export declare function isReportCountsConsistent(report: AdversarialTrajectoryReport): boolean;
// --- Builder result types ---
export interface DeterministicFailureTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
export interface HumanoidRockThrowTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
export interface TwoAgentHandoffCatchTrajectoryBuild { readonly result: any; readonly trajectory: AdversarialTrajectory; }
// --- Builder functions ---
export function buildDeterministicFailureTrajectory(actions?: readonly any[], options?: any): DeterministicFailureTrajectoryBuild;
export function buildHumanoidRockThrowTrajectory(options?: any): HumanoidRockThrowTrajectoryBuild;
export function buildTwoAgentHandoffCatchTrajectory(options?: any): TwoAgentHandoffCatchTrajectoryBuild;
