/**
 * Self-Improve Harvester
 * Hooks into runImprovementCycle() to capture (instruction, output, test_result, quality_score)
 * tuples as JSONL for training data generation.
 * @version 1.1.0
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SelfImproveIO } from './SelfImproveCommand';

// =============================================================================
// TYPES
// =============================================================================

export interface HarvestEntry {
  timestamp: string;
  instruction: string;
  output: string;
  testResult: 'pass' | 'fail' | 'skip' | 'error';
  qualityScore: number;
  metadata: Record<string, unknown>;
}

export interface HarvesterConfig {
  outputDir: string;
  maxFileSize: number; // bytes before rotation
  minQualityScore: number;
  enableAutoRotation: boolean;
  /** Whether harvesting is enabled */
  enabled?: boolean;
  /** Whether to validate syntax of harvested code */
  validateSyntax?: boolean;
  /** Number of entries before auto-flush */
  flushInterval?: number;
}

/** Abstraction for file I/O so the harvester is testable without real FS */
export interface FileWriter {
  append(filePath: string, content: string): Promise<void>;
  appendSync(filePath: string, content: string): void;
  ensureDir(dirPath: string): void;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: HarvesterConfig = {
  outputDir: './training-data',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  minQualityScore: 0.5,
  enableAutoRotation: true,
  enabled: true,
  validateSyntax: true,
  flushInterval: 1000,
};

function createDefaultFileWriter(): FileWriter {
  return {
    append: async (filePath: string, content: string) => {
      fs.appendFileSync(filePath, content, 'utf-8');
    },
    appendSync: (filePath: string, content: string) => {
      fs.appendFileSync(filePath, content, 'utf-8');
    },
    ensureDir: (dirPath: string) => {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
    },
  };
}

// =============================================================================
// HARVESTER
// =============================================================================

export class SelfImproveHarvester {
  private config: HarvesterConfig;
  private currentFile: string;
  private entryCount: number = 0;
  private fileIndex: number = 0;
  private fileWriter: FileWriter;
  private entries: HarvestEntry[] = [];

  constructor(
    config: Partial<HarvesterConfig> = {},
    options?: { fileWriter?: FileWriter },
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentFile = this.getFilePath();
    this.fileWriter = options?.fileWriter ?? createDefaultFileWriter();
  }

  private getFilePath(): string {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.config.outputDir, `harvest_${date}_${this.fileIndex}.jsonl`);
  }

  harvest(entry: Omit<HarvestEntry, 'timestamp'>): void {
    if (this.config.enabled === false) return;
    if (entry.qualityScore < this.config.minQualityScore) return;

    const fullEntry: HarvestEntry = { ...entry, timestamp: new Date().toISOString() };
    const line = JSON.stringify(fullEntry) + '\n';

    this.fileWriter.ensureDir(this.config.outputDir);

    // Check rotation
    if (this.config.enableAutoRotation) {
      try {
        const stats = fs.statSync(this.currentFile);
        if (stats.size + line.length > this.config.maxFileSize) {
          this.fileIndex++;
          this.currentFile = this.getFilePath();
        }
      } catch { /* file doesn't exist yet */ }
    }

    this.fileWriter.appendSync(this.currentFile, line);
    this.entries.push(fullEntry);
    this.entryCount++;
  }

  harvestFromCycle(
    instruction: string,
    output: string,
    testResult: HarvestEntry['testResult'],
    qualityScore: number,
    meta?: Record<string, unknown>,
  ): void {
    this.harvest({ instruction, output, testResult, qualityScore, metadata: meta ?? {} });
  }

  /**
   * Wrap a SelfImproveIO interface to intercept and record calls for training data.
   * The wrapped IO proxies all methods but captures test results as harvest entries.
   */
  wrapIO(io: SelfImproveIO): SelfImproveIO {
    const self = this;
    return {
      absorb: io.absorb.bind(io),
      queryUntested: io.queryUntested.bind(io),
      generateTest: io.generateTest.bind(io),
      writeFile: io.writeFile.bind(io),
      async runVitest(testFilePath: string) {
        const result = await io.runVitest(testFilePath);
        self.harvest({
          instruction: `Run test: ${testFilePath}`,
          output: JSON.stringify(result),
          testResult: result.passed ? 'pass' : 'fail',
          qualityScore: result.passed
            ? result.testsPassed / Math.max(result.testsTotal, 1)
            : 0,
          metadata: { testFilePath, ...result },
        });
        return result;
      },
      runFullVitest: io.runFullVitest.bind(io),
      runTypeCheck: io.runTypeCheck.bind(io),
      runLint: io.runLint.bind(io),
      getCircuitBreakerHealth: io.getCircuitBreakerHealth.bind(io),
      gitAdd: io.gitAdd.bind(io),
      gitCommit: io.gitCommit.bind(io),
      log: io.log.bind(io),
    };
  }

  getStats(): { entryCount: number; currentFile: string; fileIndex: number } {
    return { entryCount: this.entryCount, currentFile: this.currentFile, fileIndex: this.fileIndex };
  }

  getEntries(): HarvestEntry[] {
    return [...this.entries];
  }

  readEntries(filePath?: string): HarvestEntry[] {
    const fp = filePath ?? this.currentFile;
    if (!fs.existsSync(fp)) return [];
    return fs.readFileSync(fp, 'utf-8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  }
}
