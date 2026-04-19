const logger = { info: console.info, error: console.error };

export interface EpisodicMemory {
  id: string;
  timestamp: number;
  action: string;
  outcome: string;
  entitiesInvolved: string[];
  semanticVector?: number[]; // Mock embedding
}

export interface SemanticFact {
  id: string;
  fact: string;
  confidence: number;
  sourceEpisodes: string[];
  lastAccessed?: number;
  accessCount?: number;
}

/**
 * MemoryConsolidator
 *
 * Compresses raw episodic events into structured semantic facts
 * via idle background cycles, mirroring human sleep consolidation.
 */
export class MemoryConsolidator {
  /**
   * Identifies conceptually similar episodic memories based on shared entities and actions.
   */
  private static clusterEpisodes(episodes: EpisodicMemory[]): EpisodicMemory[][] {
    const clusters: Record<string, EpisodicMemory[]> = {};

    // Basic heuristic: Cluster by primary action and first entity
    for (const ep of episodes) {
      const key = `${ep.action}_${ep.entitiesInvolved[0] || 'generic'}`;
      if (!clusters[key]) clusters[key] = [];
      clusters[key].push(ep);
    }

    return Object.values(clusters);
  }

  /**
   * Mocks an LLM-based summarization pass converting a cluster of raw events
   * into a single concrete semantic truth.
   */
  private static summarizeCluster(cluster: EpisodicMemory[]): SemanticFact | null {
    if (cluster.length < 3) return null; // Only consolidate recurring patterns

    const sample = cluster[0];
    const successCount = cluster.filter((ep) => ep.outcome.includes('success')).length;
    const successRate = successCount / cluster.length;

    let rule = '';
    if (successRate > 0.7) {
      rule = `${sample.action} applied to ${sample.entitiesInvolved[0]} is generally effective.`;
    } else {
      rule = `${sample.action} applied to ${sample.entitiesInvolved[0]} has high failure risk.`;
    }

    return {
      id: `fact_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      fact: rule,
      confidence: successRate,
      sourceEpisodes: cluster.map((c) => c.id),
      lastAccessed: Date.now(),
      accessCount: 1,
    };
  }

  /**
   * Executes the background consolidation pass.
   * Takes raw episodes, clusters them, extracts truths, and returns the facts
   * while reporting which raw episodes can be safely garbage collected.
   */
  static compressEpisodes(rawEpisodes: EpisodicMemory[]): {
    newFacts: SemanticFact[];
    prunedEpisodes: string[];
  } {
    if (rawEpisodes.length < 5) return { newFacts: [], prunedEpisodes: [] };

    logger.info(
      `[Consolidation] Running idle memory compression on ${rawEpisodes.length} episodes.`
    );

    const clusters = this.clusterEpisodes(rawEpisodes);
    const newFacts: SemanticFact[] = [];
    const prunedEpisodes: string[] = [];

    for (const cluster of clusters) {
      const fact = this.summarizeCluster(cluster);
      if (fact) {
        newFacts.push(fact);
        // Mark these source episodes for pruning since we extracted the semantic truth
        prunedEpisodes.push(...fact.sourceEpisodes);
      }
    }

    logger.info(
      `[Consolidation] Distilled ${prunedEpisodes.length} raw episodes into ${newFacts.length} semantic facts.`
    );

    return { newFacts, prunedEpisodes };
  }

  /**
   * Resolves G.USER.002: Memory Degradation & "Agent Fatigue"
   * Prunes stale and low-confidence facts from the semantic store to prevent context bloat.
   */
  static pruneStaleFacts(facts: SemanticFact[], maxFacts: number = 100): SemanticFact[] {
    const now = Date.now();
    for (const fact of facts) {
      if (!fact.lastAccessed) fact.lastAccessed = now;
      if (!fact.accessCount) fact.accessCount = 0;
      
      const ageHours = (now - fact.lastAccessed) / (1000 * 60 * 60);
      // Decay confidence by 5% every hour it isn't used
      if (ageHours > 1) {
        fact.confidence *= Math.pow(0.95, ageHours);
      }
    }

    // Filter out facts whose confidence dropped below threshold
    const activeFacts = facts.filter(f => f.confidence >= 0.3);

    // Keep only the top 'maxFacts' based on confidence and utility
    activeFacts.sort((a, b) => {
      const scoreA = a.confidence * (1 + (a.accessCount || 0));
      const scoreB = b.confidence * (1 + (b.accessCount || 0));
      return scoreB - scoreA;
    });

    return activeFacts.slice(0, maxFacts);
  }
}
