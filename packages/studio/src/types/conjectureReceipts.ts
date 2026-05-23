export type ConjectureGateState = 'survived' | 'falsified' | 'undecided';

export type StudioConjectureRunnerSuite =
  | 'proof-carrying-geometry-smoke'
  | 'generated-geometry-family';

export interface StudioConjectureCandidateSummary {
  candidateId: string;
  family: string;
  status: string;
  parameters: Record<string, string | number | boolean | null>;
  geometryHash: string | null;
  failedProbeIds: string[];
}

export interface StudioConjecturePoint {
  id: string;
  runId: string;
  suite: StudioConjectureRunnerSuite;
  scenarioId: string;
  role: string;
  status: string;
  gateState: ConjectureGateState;
  receiptKey: string;
  claimId: string;
  claimStatement: string;
  candidateCount: number;
  counterexampleCount: number;
  candidateSummaries: StudioConjectureCandidateSummary[];
  primaryCounterexample: StudioConjectureCandidateSummary | null;
  receipt: unknown;
  replayable: boolean;
  x: number;
  y: number;
}

export interface StudioConjectureRun {
  runId: string;
  suite: StudioConjectureRunnerSuite;
  sourcePath: string;
  receiptKey: string;
  gatePassed: boolean;
  points: StudioConjecturePoint[];
}

export interface StudioConjectureReceiptsResponse {
  ok: true;
  generatedAt: string;
  receiptDir: string;
  runCount: number;
  pointCount: number;
  runs: StudioConjectureRun[];
  points: StudioConjecturePoint[];
}

export interface StudioConjectureReplayResponse {
  ok: true;
  replayedAt: string;
  suite: StudioConjectureRunnerSuite;
  sourcePath: string;
  targetReceiptKey: string;
  matched: boolean;
  counterexampleMatched: boolean;
  replayReceiptKey: string | null;
  point: StudioConjecturePoint | null;
}
