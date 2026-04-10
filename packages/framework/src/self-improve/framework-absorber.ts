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

import type {
  AbsorbScanConfig,
  ScanResult,
  ImprovementTask,
  ExtractedKnowledge,
} from './absorb-scanner';
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
   * Calls absorb_run_absorb MCP tool via JSON-RPC for full graph analysis.
   * Falls back to knowledge store scan if the absorb service is unreachable.
   */
  async scanSelf(): Promise<CodebaseGraph> {
    const absorbUrl = this.config.absorbUrl || DEFAULT_ABSORB_URL;
    const apiKey = this.config.absorbApiKey || '';

    // Try absorb service via MCP JSON-RPC
    if (apiKey) {
      try {
        const repoUrl = this.config.codebasePath || 'packages/framework';
        const rpcPayload = {
          jsonrpc: '2.0' as const,
          id: `absorb-scan-${Date.now()}`,
          method: 'tools/call',
          params: {
            name: 'absorb_run_absorb',
            arguments: { repo_url: repoUrl },
          },
        };

        const res = await fetch(`${absorbUrl}/mcp`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(rpcPayload),
          signal: AbortSignal.timeout(30_000),
        });

        if (res.ok) {
          const rpcResult = (await res.json()) as {
            result?: {
              content?: Array<{ text?: string }>;
            };
            error?: { message?: string };
          };

          if (rpcResult.result?.content) {
            // Parse the absorb graph from the MCP response
            const raw = rpcResult.result.content;
            const textContent = raw.find((c) => c.text)?.text;
            let parsed: Record<string, unknown> = {};
            if (textContent) {
              try {
                parsed = JSON.parse(textContent) as Record<string, unknown>;
              } catch {
                // Text response not JSON — use as-is
                parsed = { text: textContent };
              }
            }

            return {
              fileCount:
                typeof parsed.file_count === 'number'
                  ? parsed.file_count
                  : typeof parsed.files === 'number'
                    ? parsed.files
                    : 0,
              edgeCount:
                typeof parsed.edge_count === 'number'
                  ? parsed.edge_count
                  : typeof parsed.edges === 'number'
                    ? parsed.edges
                    : 0,
              modules: Array.isArray(parsed.modules) ? (parsed.modules as string[]) : [],
              raw: parsed,
            };
          }
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
    const scan = this.lastScan || (await this.runFullScan());
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
