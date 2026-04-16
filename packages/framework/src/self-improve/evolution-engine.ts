/**
 * Evolution Engine — The framework improves itself.
 *
 * The pipeline:
 * 1. SCAN: Query orchestrator knowledge store + scan local improvement markers
 * 2. PROPOSE: Convert findings to improvement suggestions
 * 3. VOTE: Team agents vote on which improvements matter
 * 4. EXECUTE: Winning suggestions become board tasks
 * 5. COMPOUND: Knowledge from execution feeds back into the store
 *
 * This is the v1.0 singularity point — the framework's own agents
 * can propose, vote on, and ship improvements to themselves.
 */

import type { Team } from '../team';
import type { KnowledgeInsight } from '../types';
import { scanFramework, scanImprovementMarkers } from './absorb-scanner';
import type { AbsorbScanConfig, ScanResult, ImprovementTask } from './absorb-scanner';

export interface EvolutionConfig {
  /** Absorb scan configuration */
  absorb?: AbsorbScanConfig;
  /** Path to scan for improvement markers (default: none — skip local marker scan) */
  codebasePath?: string;
  /** Auto-propose improvements as suggestions (default: true) */
  autoPropose?: boolean;
  /** Auto-add high-priority improvements to board (default: false) */
  autoBoard?: boolean;
  /** Minimum priority to auto-board (1=critical, default: 2) */
  autoBoardMinPriority?: number;
}

export interface EvolutionResult {
  scan: ScanResult;
  markerScan?: ScanResult;
  suggestionsCreated: number;
  tasksCreated: number;
  knowledgePublished: number;
}

/**
 * Merge two ScanResults by combining their improvements and knowledge.
 */
function mergeScanResults(a: ScanResult, b: ScanResult): ScanResult {
  return {
    scanned: a.scanned || b.scanned,
    filesAnalyzed: a.filesAnalyzed + b.filesAnalyzed,
    issuesFound: a.issuesFound + b.issuesFound,
    improvements: [...a.improvements, ...b.improvements],
    knowledge: [...a.knowledge, ...b.knowledge],
    error: a.error && b.error ? `${a.error}; ${b.error}` : a.error || b.error,
  };
}

/**
 * Run one evolution cycle on a team.
 *
 * Scans the orchestrator knowledge store and local improvement markers,
 * proposes improvements as suggestions, publishes extracted knowledge,
 * and optionally adds high-priority items directly to the board.
 */
export async function evolve(team: Team, config: EvolutionConfig = {}): Promise<EvolutionResult> {
  const autoPropose = config.autoPropose !== false;
  const autoBoard = config.autoBoard ?? false;
  const autoBoardMinPriority = config.autoBoardMinPriority ?? 2;

  // Step 1: Scan knowledge store
  const knowledgeScan = await scanFramework(config.absorb);

  // Step 1b: Scan local markers if codebasePath provided
  let markerScan: ScanResult | undefined;
  if (config.codebasePath) {
    markerScan = await scanImprovementMarkers(config.codebasePath);
  }

  // Merge results for unified processing
  const scan = markerScan ? mergeScanResults(knowledgeScan, markerScan) : knowledgeScan;

  if (!scan.scanned || (scan.improvements.length === 0 && scan.knowledge.length === 0)) {
    return { scan, markerScan, suggestionsCreated: 0, tasksCreated: 0, knowledgePublished: 0 };
  }

  let suggestionsCreated = 0;
  let tasksCreated = 0;
  let knowledgePublished = 0;

  // Step 2: Propose improvements as suggestions
  if (autoPropose && team.isRemote) {
    for (const imp of scan.improvements) {
      try {
        await team.suggest(imp.title, {
          description: imp.description,
          category: mapCategory(imp.category),
          evidence: imp.file
            ? `Detected in ${imp.file}${imp.line ? `:${imp.line}` : ''}`
            : undefined,
        });
        suggestionsCreated++;
      } catch {
        // Suggestion may already exist (dedup)
      }
    }
  }

  // Step 3: Auto-board critical items
  if (autoBoard) {
    const critical = scan.improvements.filter((imp) => imp.priority <= autoBoardMinPriority);
    if (critical.length > 0) {
      const tasks = critical.map((imp) => ({
        title: imp.title,
        description: `[Self-improvement] ${imp.description}`,
        priority: imp.priority,
        source: 'evolution:self-scan',
        role: 'coder' as const,
      }));
      const added = await team.addTasks(tasks);
      tasksCreated = added.length;
    }
  }

  // Step 4: Publish extracted knowledge
  for (const k of scan.knowledge) {
    team.knowledge.publish(
      {
        type: k.type,
        content: k.content,
        domain: k.domain,
        confidence: k.confidence,
        source: 'evolution:self-scan',
      },
      'evolution-engine'
    );
    knowledgePublished++;
  }

  // Step 5: Compound
  team.knowledge.compound(
    scan.knowledge.map((k) => ({
      type: k.type,
      content: k.content,
      domain: k.domain,
      confidence: k.confidence,
      source: 'evolution:self-scan',
    }))
  );

  return { scan, markerScan, suggestionsCreated, tasksCreated, knowledgePublished };
}

function mapCategory(
  cat: ImprovementTask['category']
): 'process' | 'tooling' | 'architecture' | 'testing' | 'docs' | 'performance' | 'other' {
  switch (cat) {
    case 'refactor':
      return 'architecture';
    case 'test':
      return 'testing';
    case 'docs':
      return 'docs';
    case 'performance':
      return 'performance';
    case 'type-safety':
      return 'tooling';
    default:
      return 'other';
  }
}
