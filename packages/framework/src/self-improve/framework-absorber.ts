// STATUS: Scaffold — requires absorb service connection and LLM provider for production use
/**
 * FrameworkAbsorber — Class-based absorb integration for framework self-scanning.
 *
 * @experimental
 *
 * Wraps the absorb service (https://absorb.holoscript.net) to scan the
 * framework codebase, query for code health, and surface improvements.
 * Falls back to the MCP Orchestrator knowledge store when the absorb
 * service is unreachable.
 */

import type { AbsorbScanConfig, ScanResult, ImprovementTask, ExtractedKnowledge } from './absorb-scanner';
import { scanFramework, scanTodos } from './absorb-scanner';

export interface CodebaseGraph {
  /** Number of files in the graph */
  fileCount: number;
  /** Number of edges (dependencies) between files */
  edgeCount: number;
  /** Top-level modules detected */
  modules: string[];
  /** Raw graph data from absorb (opaque — shape depends on service version) */
  raw?: unknown;
}

export interface Improvement {
  id: string;
  title: string;
  description: string;
  priority: number;
  category: ImprovementTask['category'];
  file?: string;
  line?: number;
  /** Confidence score from absorb analysis (0-1) */
  confidence: number;
}

export interface AbsorberConfig extends AbsorbScanConfig {
  /** Absorb service URL (default: production) */
  absorbUrl?: string;
  /** Absorb API key (default: ABSORB_API_KEY env var) */
  absorbApiKey?: string;
  /** Path to scan for local TODOs */
  codebasePath?: string;
}

const DEFAULT_ABSORB_URL = 'https://absorb.holoscript.net';

/**
 * FrameworkAbsorber — scans the framework codebase for improvements.
 *
 * @experimental
 *
 * Usage:
 * ```ts
 * const absorber = new FrameworkAbsorber({ codebasePath: 'packages/framework' });
 * const graph = await absorber.scanSelf();
 * const improvements = await absorber.findImprovements();
 * ```
 */
export class FrameworkAbsorber {
  private readonly config: AbsorberConfig;
  private lastScan: ScanResult | null = null;

  constructor(config: AbsorberConfig = {}) {
    this.config = {
      absorbUrl: config.absorbUrl || DEFAULT_ABSORB_URL,
      absorbApiKey: config.absorbApiKey || process.env.ABSORB_API_KEY || '',
      ...config,
    };
  }

  /**
   * Scan the framework codebase via the absorb service.
   * Returns a CodebaseGraph with module/dependency info.
   *
   * TODO: Call absorb_run_absorb MCP tool for full graph analysis
   * Currently uses knowledge store scan as a proxy.
   */
  async scanSelf(): Promise<CodebaseGraph> {
    const absorbUrl = this.config.absorbUrl || DEFAULT_ABSORB_URL;
    const apiKey = this.config.absorbApiKey || '';

    // Try absorb service first
    if (apiKey) {
      try {
        const res = await fetch(`${absorbUrl}/health`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (res.ok) {
          const health = (await res.json()) as Record<string, unknown>;
          // TODO: POST to /mcp with absorb_run_absorb tool call
          // For now, return health-derived graph stub
          return {
            fileCount: typeof health.files === 'number' ? health.files : 0,
            edgeCount: typeof health.edges === 'number' ? health.edges : 0,
            modules: Array.isArray(health.modules) ? health.modules as string[] : [],
            raw: health,
          };
        }
      } catch {
        // Absorb service unreachable — fall through to knowledge store
      }
    }

    // Fallback: scan via knowledge store
    const scan = await scanFramework(this.config);
    this.lastScan = scan;

    return {
      fileCount: scan.filesAnalyzed,
      edgeCount: 0,
      modules: [],
    };
  }

  /**
   * Find improvements by scanning knowledge store + local TODOs.
   * Returns ranked improvement list with confidence scores.
   */
  async findImprovements(): Promise<Improvement[]> {
    const scan = this.lastScan || await this.runFullScan();
    return scan.improvements.map((imp, i) => ({
      id: `fw-imp-${i}-${Date.now()}`,
      title: imp.title,
      description: imp.description,
      priority: imp.priority,
      category: imp.category,
      file: imp.file,
      line: imp.line,
      confidence: 0.5 + (imp.priority <= 2 ? 0.3 : 0),
    }));
  }

  /**
   * Get extracted knowledge from the last scan.
   */
  getKnowledge(): ExtractedKnowledge[] {
    return this.lastScan?.knowledge || [];
  }

  /**
   * Run a full scan (knowledge store + local TODOs).
   */
  private async runFullScan(): Promise<ScanResult> {
    const knowledgeScan = await scanFramework(this.config);
    let todoScan: ScanResult | undefined;

    if (this.config.codebasePath) {
      todoScan = await scanTodos(this.config.codebasePath);
    }

    const merged: ScanResult = todoScan
      ? {
          scanned: knowledgeScan.scanned || todoScan.scanned,
          filesAnalyzed: knowledgeScan.filesAnalyzed + todoScan.filesAnalyzed,
          issuesFound: knowledgeScan.issuesFound + todoScan.issuesFound,
          improvements: [...knowledgeScan.improvements, ...todoScan.improvements],
          knowledge: [...knowledgeScan.knowledge, ...todoScan.knowledge],
        }
      : knowledgeScan;

    this.lastScan = merged;
    return merged;
  }
}
