/**
 * TalkingHeadBenchmark.ts
 *
 * Benchmark suite for Brittney avatar lip-sync using TalkingHead API.
 * Measures phoneme accuracy, latency, visual quality metrics, and
 * generates comparison reports across different configurations.
 *
 * Staging area file for Hololand integration (TODO-035).
 *
 * @version 1.0.0
 * @package hololand/avatar/benchmark
 */

// =============================================================================
// TYPES
// =============================================================================

/** Standard phoneme set used by TalkingHead API */
export type Phoneme =
  | 'sil'   // silence
  | 'PP'    // p, b, m
  | 'FF'    // f, v
  | 'TH'    // th
  | 'DD'    // t, d, n, l
  | 'kk'    // k, g, ng
  | 'CH'    // ch, j, sh, zh
  | 'SS'    // s, z
  | 'nn'    // n
  | 'RR'    // r
  | 'aa'    // a (open)
  | 'E'     // e (half-open)
  | 'I'     // i (close front)
  | 'O'     // o (half-close back)
  | 'U';    // u (close back)

/** Viseme (visual phoneme) target values */
export interface VisemeState {
  /** Jaw open (0-1) */
  jawOpen: number;
  /** Lip funnel (0-1) */
  lipFunnel: number;
  /** Lip pucker (0-1) */
  lipPucker: number;
  /** Mouth wide (smile/stretch) (0-1) */
  mouthWide: number;
  /** Mouth round (0-1) */
  mouthRound: number;
  /** Tongue out (0-1) */
  tongueOut: number;
}

/** VRM expression weights mapped from TalkingHead */
export interface VRMVisemeMapping {
  phoneme: Phoneme;
  expressionWeights: {
    aa: number;
    ih: number;
    ou: number;
    ee: number;
    oh: number;
  };
}

/** Single benchmark sample point */
export interface BenchmarkSample {
  /** Timestamp in milliseconds since benchmark start */
  timestampMs: number;
  /** The expected (ground truth) phoneme */
  expectedPhoneme: Phoneme;
  /** The detected/produced phoneme */
  actualPhoneme: Phoneme;
  /** Whether the phoneme matched */
  isCorrect: boolean;
  /** Latency from audio onset to viseme application (ms) */
  latencyMs: number;
  /** Expected viseme state (ground truth) */
  expectedViseme: VisemeState;
  /** Actual viseme state produced by TalkingHead */
  actualViseme: VisemeState;
  /** Per-viseme-channel absolute error */
  visemeError: VisemeState;
  /** Root mean square error across all viseme channels */
  rmse: number;
}

/** Benchmark configuration */
export interface BenchmarkConfig {
  /** Unique name for this benchmark run */
  name: string;
  /** Number of test utterances to process */
  utteranceCount: number;
  /** TalkingHead API endpoint */
  apiEndpoint: string;
  /** Audio sample rate (Hz) */
  sampleRate: number;
  /** Frame rate for viseme sampling */
  visemeSampleFps: number;
  /** Whether to include warmup phase (first N samples discarded) */
  warmupSamples: number;
  /** Maximum acceptable latency (ms) */
  maxAcceptableLatencyMs: number;
  /** Minimum acceptable phoneme accuracy (0-1) */
  minAcceptableAccuracy: number;
  /** TalkingHead model variant */
  modelVariant: string;
  /** Language for test corpus */
  language: string;
  /** Enable visual quality measurement (pixel-level) */
  measureVisualQuality: boolean;
}

/** Visual quality metrics for rendered output */
export interface VisualQualityMetrics {
  /** Mean opinion score (1-5 scale, estimated) */
  estimatedMOS: number;
  /** Lip sync accuracy score (0-1) */
  lipSyncScore: number;
  /** Smoothness score — measures temporal consistency (0-1) */
  smoothnessScore: number;
  /** Naturalness score — penalizes unnatural transitions (0-1) */
  naturalnessScore: number;
  /** Frame drop rate (0-1) */
  frameDropRate: number;
  /** Jaw movement amplitude consistency (std dev) */
  jawAmplitudeStd: number;
}

/** Latency percentile breakdown */
export interface LatencyDistribution {
  min: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  mean: number;
  stdDev: number;
}

/** Confusion matrix entry for phoneme classification */
export interface PhonemeConfusionEntry {
  expected: Phoneme;
  actual: Phoneme;
  count: number;
}

/** Complete benchmark results */
export interface BenchmarkResult {
  config: BenchmarkConfig;
  startTime: number;
  endTime: number;
  durationMs: number;
  totalSamples: number;
  validSamples: number; // after warmup exclusion

  /** Overall phoneme accuracy (0-1) */
  phonemeAccuracy: number;
  /** Per-phoneme accuracy breakdown */
  perPhonemeAccuracy: Record<Phoneme, { correct: number; total: number; accuracy: number }>;
  /** Phoneme confusion matrix */
  confusionMatrix: PhonemeConfusionEntry[];

  /** Latency statistics */
  latency: LatencyDistribution;

  /** Viseme accuracy (average RMSE across all samples) */
  averageVisemeRMSE: number;
  /** Per-channel viseme error */
  perChannelError: {
    jawOpen: number;
    lipFunnel: number;
    lipPucker: number;
    mouthWide: number;
    mouthRound: number;
    tongueOut: number;
  };

  /** Visual quality metrics (if measured) */
  visualQuality?: VisualQualityMetrics;

  /** Pass/fail against configured thresholds */
  passed: boolean;
  failReasons: string[];

  /** Raw samples (for detailed analysis) */
  samples: BenchmarkSample[];
}

/** Test utterance with ground truth phoneme timing */
export interface TestUtterance {
  id: string;
  text: string;
  language: string;
  /** Audio buffer (PCM float32) */
  audioData?: Float32Array;
  /** Audio URL for streaming test */
  audioUrl?: string;
  /** Ground truth phoneme timeline */
  phonemeTimeline: PhonemeTimelineEntry[];
}

export interface PhonemeTimelineEntry {
  phoneme: Phoneme;
  startMs: number;
  endMs: number;
}

// =============================================================================
// Default VRM Viseme Mapping
// =============================================================================

/** Default phoneme-to-VRM-expression mapping */
export const DEFAULT_VISEME_MAPPINGS: VRMVisemeMapping[] = [
  { phoneme: 'sil', expressionWeights: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 } },
  { phoneme: 'PP', expressionWeights: { aa: 0, ih: 0, ou: 0.4, ee: 0, oh: 0 } },
  { phoneme: 'FF', expressionWeights: { aa: 0, ih: 0.3, ou: 0, ee: 0.2, oh: 0 } },
  { phoneme: 'TH', expressionWeights: { aa: 0.1, ih: 0.2, ou: 0, ee: 0.1, oh: 0 } },
  { phoneme: 'DD', expressionWeights: { aa: 0.2, ih: 0.2, ou: 0, ee: 0, oh: 0 } },
  { phoneme: 'kk', expressionWeights: { aa: 0.3, ih: 0, ou: 0, ee: 0, oh: 0.1 } },
  { phoneme: 'CH', expressionWeights: { aa: 0, ih: 0.1, ou: 0, ee: 0.5, oh: 0 } },
  { phoneme: 'SS', expressionWeights: { aa: 0, ih: 0, ou: 0, ee: 0.6, oh: 0 } },
  { phoneme: 'nn', expressionWeights: { aa: 0.1, ih: 0.1, ou: 0, ee: 0, oh: 0 } },
  { phoneme: 'RR', expressionWeights: { aa: 0.2, ih: 0, ou: 0.3, ee: 0, oh: 0.2 } },
  { phoneme: 'aa', expressionWeights: { aa: 1.0, ih: 0, ou: 0, ee: 0, oh: 0 } },
  { phoneme: 'E', expressionWeights: { aa: 0.3, ih: 0, ou: 0, ee: 0.6, oh: 0 } },
  { phoneme: 'I', expressionWeights: { aa: 0, ih: 0.9, ou: 0, ee: 0.3, oh: 0 } },
  { phoneme: 'O', expressionWeights: { aa: 0, ih: 0, ou: 0, ee: 0, oh: 1.0 } },
  { phoneme: 'U', expressionWeights: { aa: 0, ih: 0, ou: 1.0, ee: 0, oh: 0 } },
];

// =============================================================================
// Test Corpus
// =============================================================================

/**
 * Built-in test utterances for English benchmarking.
 * Each covers different phoneme distributions for balanced testing.
 */
export const ENGLISH_TEST_CORPUS: TestUtterance[] = [
  {
    id: 'en_pangram_01',
    text: 'The quick brown fox jumps over the lazy dog.',
    language: 'en',
    phonemeTimeline: [
      { phoneme: 'DD', startMs: 0, endMs: 80 },
      { phoneme: 'E', startMs: 80, endMs: 180 },
      { phoneme: 'sil', startMs: 180, endMs: 220 },
      { phoneme: 'kk', startMs: 220, endMs: 300 },
      { phoneme: 'I', startMs: 300, endMs: 400 },
      { phoneme: 'kk', startMs: 400, endMs: 460 },
      { phoneme: 'sil', startMs: 460, endMs: 500 },
      { phoneme: 'PP', startMs: 500, endMs: 560 },
      { phoneme: 'RR', startMs: 560, endMs: 620 },
      { phoneme: 'aa', startMs: 620, endMs: 720 },
      { phoneme: 'nn', startMs: 720, endMs: 800 },
      { phoneme: 'sil', startMs: 800, endMs: 840 },
      { phoneme: 'FF', startMs: 840, endMs: 920 },
      { phoneme: 'aa', startMs: 920, endMs: 1020 },
      { phoneme: 'kk', startMs: 1020, endMs: 1100 },
      { phoneme: 'SS', startMs: 1100, endMs: 1200 },
    ],
  },
  {
    id: 'en_lipsync_stress_01',
    text: 'She sells seashells by the seashore.',
    language: 'en',
    phonemeTimeline: [
      { phoneme: 'CH', startMs: 0, endMs: 100 },
      { phoneme: 'I', startMs: 100, endMs: 200 },
      { phoneme: 'sil', startMs: 200, endMs: 240 },
      { phoneme: 'SS', startMs: 240, endMs: 320 },
      { phoneme: 'E', startMs: 320, endMs: 420 },
      { phoneme: 'DD', startMs: 420, endMs: 480 },
      { phoneme: 'SS', startMs: 480, endMs: 560 },
      { phoneme: 'sil', startMs: 560, endMs: 600 },
      { phoneme: 'SS', startMs: 600, endMs: 680 },
      { phoneme: 'I', startMs: 680, endMs: 760 },
      { phoneme: 'CH', startMs: 760, endMs: 840 },
      { phoneme: 'E', startMs: 840, endMs: 940 },
      { phoneme: 'DD', startMs: 940, endMs: 1000 },
      { phoneme: 'SS', startMs: 1000, endMs: 1080 },
    ],
  },
];

// =============================================================================
// Benchmark Runner
// =============================================================================

/**
 * TalkingHead Benchmark Runner
 *
 * Runs a benchmark suite against the TalkingHead API and produces
 * detailed accuracy, latency, and visual quality reports.
 */
export class TalkingHeadBenchmark {
  private config: BenchmarkConfig;
  private samples: BenchmarkSample[] = [];
  private startTime: number = 0;
  private isRunning: boolean = false;

  /** Progress callback */
  public onProgress: ((completed: number, total: number) => void) | null = null;

  constructor(config?: Partial<BenchmarkConfig>) {
    this.config = {
      name: config?.name ?? `benchmark_${Date.now()}`,
      utteranceCount: config?.utteranceCount ?? 10,
      apiEndpoint: config?.apiEndpoint ?? 'http://localhost:8080/api/talkinghead',
      sampleRate: config?.sampleRate ?? 16000,
      visemeSampleFps: config?.visemeSampleFps ?? 60,
      warmupSamples: config?.warmupSamples ?? 5,
      maxAcceptableLatencyMs: config?.maxAcceptableLatencyMs ?? 100,
      minAcceptableAccuracy: config?.minAcceptableAccuracy ?? 0.85,
      modelVariant: config?.modelVariant ?? 'default',
      language: config?.language ?? 'en',
      measureVisualQuality: config?.measureVisualQuality ?? false,
    };
  }

  /** Get the current benchmark configuration */
  getConfig(): BenchmarkConfig {
    return { ...this.config };
  }

  /** Whether a benchmark is currently running */
  get running(): boolean {
    return this.isRunning;
  }

  /**
   * Run the full benchmark suite.
   *
   * This method processes test utterances, collects timing data,
   * and computes accuracy metrics.
   */
  async run(testCorpus?: TestUtterance[]): Promise<BenchmarkResult> {
    if (this.isRunning) throw new Error('Benchmark already running');
    this.isRunning = true;
    this.samples = [];
    this.startTime = Date.now();

    const corpus = testCorpus ?? ENGLISH_TEST_CORPUS;
    const utterances = corpus.slice(0, this.config.utteranceCount);

    try {
      for (let i = 0; i < utterances.length; i++) {
        const utterance = utterances[i];
        const utteranceSamples = await this.processUtterance(utterance);
        this.samples.push(...utteranceSamples);
        this.onProgress?.(i + 1, utterances.length);
      }
    } finally {
      this.isRunning = false;
    }

    return this.computeResults();
  }

  /**
   * Process a single test utterance and return benchmark samples.
   */
  async processUtterance(utterance: TestUtterance): Promise<BenchmarkSample[]> {
    const samples: BenchmarkSample[] = [];
    const sampleIntervalMs = 1000 / this.config.visemeSampleFps;

    // Simulate TalkingHead API call with timing
    const apiCallStart = performance.now();

    // In a real implementation, this would call the TalkingHead API
    // and capture the returned viseme stream. Here we simulate the
    // response for benchmarking infrastructure validation.
    const simulatedVisemes = this.simulateAPIResponse(utterance);

    const apiLatency = performance.now() - apiCallStart;

    // Sample the phoneme timeline and compare with API output
    for (const timeline of utterance.phonemeTimeline) {
      const midpointMs = (timeline.startMs + timeline.endMs) / 2;
      const expectedPhoneme = timeline.phoneme;

      // Find the closest simulated viseme
      const closestViseme = this.findClosestViseme(simulatedVisemes, midpointMs);

      const expectedViseme = this.phonemeToViseme(expectedPhoneme);
      const actualViseme = closestViseme?.viseme ?? this.zeroViseme();

      const visemeError = this.computeVisemeError(expectedViseme, actualViseme);
      const rmse = this.computeRMSE(visemeError);

      samples.push({
        timestampMs: midpointMs,
        expectedPhoneme,
        actualPhoneme: closestViseme?.phoneme ?? 'sil',
        isCorrect: expectedPhoneme === (closestViseme?.phoneme ?? 'sil'),
        latencyMs: apiLatency + (closestViseme?.latencyMs ?? 0),
        expectedViseme,
        actualViseme,
        visemeError,
        rmse,
      });
    }

    return samples;
  }

  /**
   * Compute results from collected samples.
   */
  computeResults(): BenchmarkResult {
    const endTime = Date.now();
    const validSamples = this.samples.slice(this.config.warmupSamples);
    const totalSamples = this.samples.length;

    // Phoneme accuracy
    const correctCount = validSamples.filter((s) => s.isCorrect).length;
    const phonemeAccuracy = validSamples.length > 0 ? correctCount / validSamples.length : 0;

    // Per-phoneme accuracy
    const perPhonemeAccuracy = this.computePerPhonemeAccuracy(validSamples);

    // Confusion matrix
    const confusionMatrix = this.computeConfusionMatrix(validSamples);

    // Latency distribution
    const latencies = validSamples.map((s) => s.latencyMs).sort((a, b) => a - b);
    const latency = this.computeLatencyDistribution(latencies);

    // Viseme error
    const averageVisemeRMSE =
      validSamples.length > 0
        ? validSamples.reduce((sum, s) => sum + s.rmse, 0) / validSamples.length
        : 0;

    const perChannelError = this.computePerChannelError(validSamples);

    // Visual quality (if enabled)
    let visualQuality: VisualQualityMetrics | undefined;
    if (this.config.measureVisualQuality) {
      visualQuality = this.computeVisualQuality(validSamples);
    }

    // Pass/fail determination
    const failReasons: string[] = [];
    if (phonemeAccuracy < this.config.minAcceptableAccuracy) {
      failReasons.push(
        `Phoneme accuracy ${(phonemeAccuracy * 100).toFixed(1)}% below threshold ${(this.config.minAcceptableAccuracy * 100).toFixed(1)}%`
      );
    }
    if (latency.p95 > this.config.maxAcceptableLatencyMs) {
      failReasons.push(
        `P95 latency ${latency.p95.toFixed(1)}ms exceeds threshold ${this.config.maxAcceptableLatencyMs}ms`
      );
    }

    return {
      config: { ...this.config },
      startTime: this.startTime,
      endTime,
      durationMs: endTime - this.startTime,
      totalSamples,
      validSamples: validSamples.length,
      phonemeAccuracy,
      perPhonemeAccuracy,
      confusionMatrix,
      latency,
      averageVisemeRMSE,
      perChannelError,
      visualQuality,
      passed: failReasons.length === 0,
      failReasons,
      samples: this.samples,
    };
  }

  /**
   * Generate a human-readable text report from benchmark results.
   */
  static generateReport(result: BenchmarkResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(70));
    lines.push(`TalkingHead Benchmark Report: ${result.config.name}`);
    lines.push('='.repeat(70));
    lines.push('');
    lines.push(`Status: ${result.passed ? 'PASSED' : 'FAILED'}`);
    if (result.failReasons.length > 0) {
      lines.push(`Fail reasons:`);
      for (const reason of result.failReasons) {
        lines.push(`  - ${reason}`);
      }
    }
    lines.push('');

    lines.push('--- Summary ---');
    lines.push(`Duration:         ${result.durationMs}ms`);
    lines.push(`Total samples:    ${result.totalSamples}`);
    lines.push(`Valid samples:    ${result.validSamples} (after ${result.config.warmupSamples} warmup)`);
    lines.push(`Phoneme accuracy: ${(result.phonemeAccuracy * 100).toFixed(2)}%`);
    lines.push(`Avg viseme RMSE:  ${result.averageVisemeRMSE.toFixed(4)}`);
    lines.push('');

    lines.push('--- Latency Distribution (ms) ---');
    lines.push(`  Min:  ${result.latency.min.toFixed(1)}`);
    lines.push(`  P25:  ${result.latency.p25.toFixed(1)}`);
    lines.push(`  P50:  ${result.latency.p50.toFixed(1)}`);
    lines.push(`  P75:  ${result.latency.p75.toFixed(1)}`);
    lines.push(`  P90:  ${result.latency.p90.toFixed(1)}`);
    lines.push(`  P95:  ${result.latency.p95.toFixed(1)}`);
    lines.push(`  P99:  ${result.latency.p99.toFixed(1)}`);
    lines.push(`  Max:  ${result.latency.max.toFixed(1)}`);
    lines.push(`  Mean: ${result.latency.mean.toFixed(1)} (std: ${result.latency.stdDev.toFixed(1)})`);
    lines.push('');

    lines.push('--- Per-Phoneme Accuracy ---');
    for (const [phoneme, stats] of Object.entries(result.perPhonemeAccuracy)) {
      const s = stats as { correct: number; total: number; accuracy: number };
      if (s.total > 0) {
        lines.push(`  ${phoneme.padEnd(4)}: ${(s.accuracy * 100).toFixed(1)}% (${s.correct}/${s.total})`);
      }
    }
    lines.push('');

    lines.push('--- Per-Channel Viseme Error (MAE) ---');
    lines.push(`  jawOpen:    ${result.perChannelError.jawOpen.toFixed(4)}`);
    lines.push(`  lipFunnel:  ${result.perChannelError.lipFunnel.toFixed(4)}`);
    lines.push(`  lipPucker:  ${result.perChannelError.lipPucker.toFixed(4)}`);
    lines.push(`  mouthWide:  ${result.perChannelError.mouthWide.toFixed(4)}`);
    lines.push(`  mouthRound: ${result.perChannelError.mouthRound.toFixed(4)}`);
    lines.push(`  tongueOut:  ${result.perChannelError.tongueOut.toFixed(4)}`);
    lines.push('');

    if (result.visualQuality) {
      lines.push('--- Visual Quality ---');
      lines.push(`  Lip sync score:    ${(result.visualQuality.lipSyncScore * 100).toFixed(1)}%`);
      lines.push(`  Smoothness score:  ${(result.visualQuality.smoothnessScore * 100).toFixed(1)}%`);
      lines.push(`  Naturalness score: ${(result.visualQuality.naturalnessScore * 100).toFixed(1)}%`);
      lines.push(`  Estimated MOS:     ${result.visualQuality.estimatedMOS.toFixed(2)}/5.0`);
      lines.push(`  Frame drop rate:   ${(result.visualQuality.frameDropRate * 100).toFixed(2)}%`);
      lines.push('');
    }

    lines.push('='.repeat(70));
    return lines.join('\n');
  }

  /**
   * Compare two benchmark results and return a comparison summary.
   */
  static compare(
    baseline: BenchmarkResult,
    candidate: BenchmarkResult
  ): {
    accuracyDelta: number;
    latencyDelta: number;
    rmseDelta: number;
    improved: boolean;
    summary: string;
  } {
    const accuracyDelta = candidate.phonemeAccuracy - baseline.phonemeAccuracy;
    const latencyDelta = candidate.latency.p95 - baseline.latency.p95;
    const rmseDelta = candidate.averageVisemeRMSE - baseline.averageVisemeRMSE;

    const improved = accuracyDelta >= 0 && latencyDelta <= 0 && rmseDelta <= 0;

    const summary = [
      `Accuracy: ${(baseline.phonemeAccuracy * 100).toFixed(1)}% -> ${(candidate.phonemeAccuracy * 100).toFixed(1)}% (${accuracyDelta > 0 ? '+' : ''}${(accuracyDelta * 100).toFixed(1)}%)`,
      `P95 Latency: ${baseline.latency.p95.toFixed(1)}ms -> ${candidate.latency.p95.toFixed(1)}ms (${latencyDelta > 0 ? '+' : ''}${latencyDelta.toFixed(1)}ms)`,
      `Avg RMSE: ${baseline.averageVisemeRMSE.toFixed(4)} -> ${candidate.averageVisemeRMSE.toFixed(4)} (${rmseDelta > 0 ? '+' : ''}${rmseDelta.toFixed(4)})`,
      `Overall: ${improved ? 'IMPROVED' : 'REGRESSION'}`,
    ].join('\n');

    return { accuracyDelta, latencyDelta, rmseDelta, improved, summary };
  }

  // ---- Private helpers ----

  private simulateAPIResponse(
    utterance: TestUtterance
  ): { phoneme: Phoneme; timestampMs: number; viseme: VisemeState; latencyMs: number }[] {
    // Simulate API response with slight noise and latency jitter
    return utterance.phonemeTimeline.map((entry) => {
      const noise = () => Math.random() * 0.05;
      const baseViseme = this.phonemeToViseme(entry.phoneme);
      const noisyViseme: VisemeState = {
        jawOpen: Math.min(1, Math.max(0, baseViseme.jawOpen + noise())),
        lipFunnel: Math.min(1, Math.max(0, baseViseme.lipFunnel + noise())),
        lipPucker: Math.min(1, Math.max(0, baseViseme.lipPucker + noise())),
        mouthWide: Math.min(1, Math.max(0, baseViseme.mouthWide + noise())),
        mouthRound: Math.min(1, Math.max(0, baseViseme.mouthRound + noise())),
        tongueOut: Math.min(1, Math.max(0, baseViseme.tongueOut + noise())),
      };

      // Simulate occasional misclassification
      let detectedPhoneme = entry.phoneme;
      if (Math.random() < 0.1) {
        const phonemes: Phoneme[] = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];
        detectedPhoneme = phonemes[Math.floor(Math.random() * phonemes.length)];
      }

      return {
        phoneme: detectedPhoneme,
        timestampMs: (entry.startMs + entry.endMs) / 2,
        viseme: noisyViseme,
        latencyMs: 15 + Math.random() * 30, // 15-45ms simulated latency
      };
    });
  }

  private findClosestViseme(
    visemes: { phoneme: Phoneme; timestampMs: number; viseme: VisemeState; latencyMs: number }[],
    targetMs: number
  ): { phoneme: Phoneme; viseme: VisemeState; latencyMs: number } | null {
    if (visemes.length === 0) return null;
    let closest = visemes[0];
    let minDist = Math.abs(visemes[0].timestampMs - targetMs);
    for (const v of visemes) {
      const dist = Math.abs(v.timestampMs - targetMs);
      if (dist < minDist) {
        minDist = dist;
        closest = v;
      }
    }
    return closest;
  }

  private phonemeToViseme(phoneme: Phoneme): VisemeState {
    // Map phoneme to viseme shape targets
    const mapping: Record<Phoneme, VisemeState> = {
      sil:  { jawOpen: 0.0, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.0, mouthRound: 0.0, tongueOut: 0.0 },
      PP:   { jawOpen: 0.0, lipFunnel: 0.0, lipPucker: 0.4, mouthWide: 0.0, mouthRound: 0.0, tongueOut: 0.0 },
      FF:   { jawOpen: 0.1, lipFunnel: 0.3, lipPucker: 0.0, mouthWide: 0.2, mouthRound: 0.0, tongueOut: 0.0 },
      TH:   { jawOpen: 0.1, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.1, mouthRound: 0.0, tongueOut: 0.6 },
      DD:   { jawOpen: 0.2, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.1, mouthRound: 0.0, tongueOut: 0.0 },
      kk:   { jawOpen: 0.3, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.0, mouthRound: 0.0, tongueOut: 0.0 },
      CH:   { jawOpen: 0.1, lipFunnel: 0.1, lipPucker: 0.2, mouthWide: 0.3, mouthRound: 0.1, tongueOut: 0.0 },
      SS:   { jawOpen: 0.05, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.5, mouthRound: 0.0, tongueOut: 0.0 },
      nn:   { jawOpen: 0.1, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.0, mouthRound: 0.0, tongueOut: 0.0 },
      RR:   { jawOpen: 0.2, lipFunnel: 0.0, lipPucker: 0.3, mouthWide: 0.0, mouthRound: 0.2, tongueOut: 0.0 },
      aa:   { jawOpen: 0.8, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.3, mouthRound: 0.0, tongueOut: 0.0 },
      E:    { jawOpen: 0.5, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.4, mouthRound: 0.0, tongueOut: 0.0 },
      I:    { jawOpen: 0.2, lipFunnel: 0.0, lipPucker: 0.0, mouthWide: 0.6, mouthRound: 0.0, tongueOut: 0.0 },
      O:    { jawOpen: 0.5, lipFunnel: 0.2, lipPucker: 0.0, mouthWide: 0.0, mouthRound: 0.8, tongueOut: 0.0 },
      U:    { jawOpen: 0.2, lipFunnel: 0.3, lipPucker: 0.5, mouthWide: 0.0, mouthRound: 0.6, tongueOut: 0.0 },
    };
    return mapping[phoneme] ?? mapping.sil;
  }

  private zeroViseme(): VisemeState {
    return { jawOpen: 0, lipFunnel: 0, lipPucker: 0, mouthWide: 0, mouthRound: 0, tongueOut: 0 };
  }

  private computeVisemeError(expected: VisemeState, actual: VisemeState): VisemeState {
    return {
      jawOpen: Math.abs(expected.jawOpen - actual.jawOpen),
      lipFunnel: Math.abs(expected.lipFunnel - actual.lipFunnel),
      lipPucker: Math.abs(expected.lipPucker - actual.lipPucker),
      mouthWide: Math.abs(expected.mouthWide - actual.mouthWide),
      mouthRound: Math.abs(expected.mouthRound - actual.mouthRound),
      tongueOut: Math.abs(expected.tongueOut - actual.tongueOut),
    };
  }

  private computeRMSE(error: VisemeState): number {
    const values = [error.jawOpen, error.lipFunnel, error.lipPucker, error.mouthWide, error.mouthRound, error.tongueOut];
    const sumSq = values.reduce((sum, v) => sum + v * v, 0);
    return Math.sqrt(sumSq / values.length);
  }

  private computePerPhonemeAccuracy(
    samples: BenchmarkSample[]
  ): Record<Phoneme, { correct: number; total: number; accuracy: number }> {
    const result: Record<string, { correct: number; total: number; accuracy: number }> = {};
    const allPhonemes: Phoneme[] = ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR', 'aa', 'E', 'I', 'O', 'U'];

    for (const p of allPhonemes) {
      result[p] = { correct: 0, total: 0, accuracy: 0 };
    }

    for (const sample of samples) {
      if (!result[sample.expectedPhoneme]) {
        result[sample.expectedPhoneme] = { correct: 0, total: 0, accuracy: 0 };
      }
      result[sample.expectedPhoneme].total++;
      if (sample.isCorrect) result[sample.expectedPhoneme].correct++;
    }

    for (const key of Object.keys(result)) {
      const entry = result[key];
      entry.accuracy = entry.total > 0 ? entry.correct / entry.total : 0;
    }

    return result as Record<Phoneme, { correct: number; total: number; accuracy: number }>;
  }

  private computeConfusionMatrix(samples: BenchmarkSample[]): PhonemeConfusionEntry[] {
    const counts = new Map<string, number>();
    for (const sample of samples) {
      const key = `${sample.expectedPhoneme}|${sample.actualPhoneme}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const entries: PhonemeConfusionEntry[] = [];
    for (const [key, count] of counts) {
      const [expected, actual] = key.split('|') as [Phoneme, Phoneme];
      entries.push({ expected, actual, count });
    }
    return entries.sort((a, b) => b.count - a.count);
  }

  private computeLatencyDistribution(sorted: number[]): LatencyDistribution {
    if (sorted.length === 0) {
      return { min: 0, p25: 0, p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, max: 0, mean: 0, stdDev: 0 };
    }

    const percentile = (p: number): number => {
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
    };

    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const variance = sorted.reduce((sum, v) => sum + (v - mean) ** 2, 0) / sorted.length;
    const stdDev = Math.sqrt(variance);

    return {
      min: sorted[0],
      p25: percentile(25),
      p50: percentile(50),
      p75: percentile(75),
      p90: percentile(90),
      p95: percentile(95),
      p99: percentile(99),
      max: sorted[sorted.length - 1],
      mean,
      stdDev,
    };
  }

  private computePerChannelError(samples: BenchmarkSample[]): BenchmarkResult['perChannelError'] {
    if (samples.length === 0) {
      return { jawOpen: 0, lipFunnel: 0, lipPucker: 0, mouthWide: 0, mouthRound: 0, tongueOut: 0 };
    }

    const sum = { jawOpen: 0, lipFunnel: 0, lipPucker: 0, mouthWide: 0, mouthRound: 0, tongueOut: 0 };
    for (const s of samples) {
      sum.jawOpen += s.visemeError.jawOpen;
      sum.lipFunnel += s.visemeError.lipFunnel;
      sum.lipPucker += s.visemeError.lipPucker;
      sum.mouthWide += s.visemeError.mouthWide;
      sum.mouthRound += s.visemeError.mouthRound;
      sum.tongueOut += s.visemeError.tongueOut;
    }

    const n = samples.length;
    return {
      jawOpen: sum.jawOpen / n,
      lipFunnel: sum.lipFunnel / n,
      lipPucker: sum.lipPucker / n,
      mouthWide: sum.mouthWide / n,
      mouthRound: sum.mouthRound / n,
      tongueOut: sum.tongueOut / n,
    };
  }

  private computeVisualQuality(samples: BenchmarkSample[]): VisualQualityMetrics {
    if (samples.length < 2) {
      return {
        estimatedMOS: 3.0,
        lipSyncScore: 0,
        smoothnessScore: 0,
        naturalnessScore: 0,
        frameDropRate: 0,
        jawAmplitudeStd: 0,
      };
    }

    // Lip sync score = 1 - average RMSE (clamped 0-1)
    const avgRMSE = samples.reduce((s, v) => s + v.rmse, 0) / samples.length;
    const lipSyncScore = Math.max(0, 1 - avgRMSE * 2);

    // Smoothness: measure jitter as variance of consecutive jaw open deltas
    const jawValues = samples.map((s) => s.actualViseme.jawOpen);
    const deltas: number[] = [];
    for (let i = 1; i < jawValues.length; i++) {
      deltas.push(Math.abs(jawValues[i] - jawValues[i - 1]));
    }
    const avgDelta = deltas.reduce((a, b) => a + b, 0) / (deltas.length || 1);
    const deltaVariance = deltas.reduce((sum, d) => sum + (d - avgDelta) ** 2, 0) / (deltas.length || 1);
    const smoothnessScore = Math.max(0, 1 - Math.sqrt(deltaVariance) * 5);

    // Naturalness: penalize stuck-at-zero and stuck-at-max
    const stuckCount = samples.filter(
      (s) => s.actualViseme.jawOpen === 0 && s.expectedPhoneme !== 'sil'
    ).length;
    const naturalnessScore = Math.max(0, 1 - stuckCount / (samples.length || 1));

    // Estimated MOS
    const estimatedMOS = 1 + 4 * (lipSyncScore * 0.5 + smoothnessScore * 0.3 + naturalnessScore * 0.2);

    // Jaw amplitude standard deviation
    const jawMean = jawValues.reduce((a, b) => a + b, 0) / jawValues.length;
    const jawVariance = jawValues.reduce((sum, v) => sum + (v - jawMean) ** 2, 0) / jawValues.length;

    return {
      estimatedMOS: Math.min(5, Math.max(1, estimatedMOS)),
      lipSyncScore,
      smoothnessScore,
      naturalnessScore,
      frameDropRate: 0,
      jawAmplitudeStd: Math.sqrt(jawVariance),
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a TalkingHeadBenchmark instance with the given configuration.
 */
export function createTalkingHeadBenchmark(
  config?: Partial<BenchmarkConfig>
): TalkingHeadBenchmark {
  return new TalkingHeadBenchmark(config);
}
