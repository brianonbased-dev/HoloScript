/**
 * @holoscript/core - SelfImproveHarvester compatibility shim
 *
 * Provides a minimal, dependency-free implementation required by
 * HoloHarvestTrainingDataTool dynamic imports.
 */

export type HarvestResult = 'pass' | 'fail' | 'skip' | 'error';

export interface HarvestEntry {
  instruction: string;
  output: string;
  testResult: HarvestResult;
  qualityScore: number;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface HarvesterStats {
  entryCount: number;
  currentFile: string;
}

export interface HarvesterConfig {
  outputFile?: string;
  outputDir?: string;
  minQualityScore?: number;
}

/**
 * Minimal in-memory harvester for backward compatibility.
 */
export class SelfImproveHarvester {
  private readonly entries: HarvestEntry[] = [];
  private readonly outputFile: string;
  private readonly minQualityScore: number;

  constructor(config: HarvesterConfig = {}) {
    this.outputFile = config.outputFile ?? config.outputDir ?? 'memory://self-improvement-harvest.jsonl';
    this.minQualityScore = config.minQualityScore ?? 0;
  }

  harvestFromCycle(
    instruction: string,
    output: string,
    testResult: HarvestResult,
    qualityScore: number,
    metadata?: Record<string, unknown>
  ): void {
    if (qualityScore < this.minQualityScore) {
      return;
    }
    this.entries.push({
      instruction,
      output,
      testResult,
      qualityScore,
      ...(metadata ? { metadata } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  getStats(): HarvesterStats {
    return {
      entryCount: this.entries.length,
      currentFile: this.outputFile,
    };
  }
}
