/**
 * Self-Improve Harvester
 * Hooks into runImprovementCycle() to capture (instruction, output, test_result, quality_score)
 * tuples as JSONL for training data generation.
 * @version 1.0.0
 */
import * as fs from 'fs';
import * as path from 'path';

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
}

const DEFAULT_CONFIG: HarvesterConfig = {
  outputDir: './training-data',
  maxFileSize: 50 * 1024 * 1024, // 50MB
  minQualityScore: 0.5,
  enableAutoRotation: true,
};

export class SelfImproveHarvester {
  private config: HarvesterConfig;
  private currentFile: string;
  private entryCount: number = 0;
  private fileIndex: number = 0;

  constructor(config: Partial<HarvesterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentFile = this.getFilePath();
  }

  private getFilePath(): string {
    const date = new Date().toISOString().slice(0, 10);
    return path.join(this.config.outputDir, `harvest_${date}_${this.fileIndex}.jsonl`);
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.config.outputDir)) {
      fs.mkdirSync(this.config.outputDir, { recursive: true });
    }
  }

  harvest(entry: Omit<HarvestEntry, 'timestamp'>): void {
    if (entry.qualityScore < this.config.minQualityScore) return;

    const fullEntry: HarvestEntry = { ...entry, timestamp: new Date().toISOString() };
    const line = JSON.stringify(fullEntry) + '\n';

    this.ensureDir();

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

    fs.appendFileSync(this.currentFile, line, 'utf-8');
    this.entryCount++;
  }

  harvestFromCycle(instruction: string, output: string, testResult: HarvestEntry['testResult'], qualityScore: number, meta?: Record<string, unknown>): void {
    this.harvest({ instruction, output, testResult, qualityScore, metadata: meta ?? {} });
  }

  getStats(): { entryCount: number; currentFile: string; fileIndex: number } {
    return { entryCount: this.entryCount, currentFile: this.currentFile, fileIndex: this.fileIndex };
  }

  readEntries(filePath?: string): HarvestEntry[] {
    const fp = filePath ?? this.currentFile;
    if (!fs.existsSync(fp)) return [];
    return fs.readFileSync(fp, 'utf-8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  }
}
