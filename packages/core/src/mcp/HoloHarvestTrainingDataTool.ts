/**
 * holo_harvest_training_data MCP Tool
 * Exposes training data harvesting via MCP server protocol.
 * @version 1.0.0
 */

export interface HarvestToolInput {
  instruction: string;
  output: string;
  testResult: 'pass' | 'fail' | 'skip' | 'error';
  qualityScore: number;
  metadata?: Record<string, unknown>;
}

export interface HarvestToolOutput {
  success: boolean;
  entryCount: number;
  filePath: string;
  message: string;
}

export const TOOL_DEFINITION = {
  name: 'holo_harvest_training_data',
  description:
    'Harvest training data from HoloScript improvement cycles. Captures (instruction, output, test_result, quality_score) tuples as JSONL.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      instruction: { type: 'string', description: 'The instruction/prompt that was given' },
      output: { type: 'string', description: 'The generated output' },
      testResult: {
        type: 'string',
        enum: ['pass', 'fail', 'skip', 'error'],
        description: 'Test result status',
      },
      qualityScore: { type: 'number', minimum: 0, maximum: 1, description: 'Quality score (0-1)' },
      metadata: { type: 'object', description: 'Optional metadata' },
    },
    required: ['instruction', 'output', 'testResult', 'qualityScore'],
  },
};

export class HoloHarvestTrainingDataHandler {
  private harvester: unknown; // Lazy import to avoid circular deps

  async handle(input: HarvestToolInput): Promise<HarvestToolOutput> {
    if (!this.harvester) {
      // @ts-ignore - SelfImproveHarvester is available in tests
      const { SelfImproveHarvester } = await import('../self-improvement/SelfImproveHarvester');
      this.harvester = new SelfImproveHarvester();
    }

    try {
      // @ts-expect-error
      this.harvester.harvestFromCycle(
        input.instruction,
        input.output,
        input.testResult,
        input.qualityScore,
        input.metadata
      );
      // @ts-expect-error
      const stats = this.harvester.getStats();
      return {
        success: true,
        entryCount: stats.entryCount,
        filePath: stats.currentFile,
        message: `Harvested entry #${stats.entryCount}`,
      };
    } catch (error) {
      return {
        success: false,
        entryCount: 0,
        filePath: '',
        message: `Harvest failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
