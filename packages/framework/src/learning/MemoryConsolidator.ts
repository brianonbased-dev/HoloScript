import { resolveSovereignProviderAsync } from '@holoscript/llm-provider';

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
   * Rule-based fallback: derives a SemanticFact from success-rate thresholding.
   * Used when the LLM is unreachable or fails, so consolidation never hard-fails.
   */
  private static ruleBasedSummary(cluster: EpisodicMemory[], successRate: number): SemanticFact {
    const sample = cluster[0];
    let rule: string;
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
   * Builds a MEMORY.md-style narrative (W/F/D entry arc: what happened → why →
   * what was learned) from a cluster of episodic memories by calling the
   * sovereign LLM (D.089 sovereign-first). Falls back to rule-based output if
   * the LLM is unreachable, so this method never hard-fails.
   *
   * Preserves the >=3-occurrence guard: clusters with fewer than 3 episodes are
   * not consolidated (they may be noise, not recurring patterns).
   */
  private static async summarizeCluster(cluster: EpisodicMemory[]): Promise<SemanticFact | null> {
    if (cluster.length < 3) return null; // Only consolidate recurring patterns

    const successCount = cluster.filter((ep) => ep.outcome.includes('success')).length;
    const successRate = successCount / cluster.length;

    // Build an arc prompt from the clustered episodes so the LLM sees the full
    // pattern: what happened across the cluster, why outcomes differed, what
    // the repeating pattern implies.
    const episodeSummaries = cluster
      .map(
        (ep, i) =>
          `Episode ${i + 1} (${new Date(ep.timestamp).toISOString()}): ` +
          `action="${ep.action}", entities=[${ep.entitiesInvolved.join(', ')}], ` +
          `outcome="${ep.outcome}"`
      )
      .join('\n');

    const successLabel =
      successRate > 0.7
        ? 'mostly successful'
        : successRate >= 0.3
          ? 'mixed results'
          : 'mostly failing';

    const prompt =
      `You are distilling agent episodic memory into a single durable semantic fact ` +
      `suitable for a MEMORY.md W (wisdom) or F (feedback rule) entry.\n\n` +
      `Cluster of ${cluster.length} related episodes (${successLabel}, ` +
      `${Math.round(successRate * 100)}% success rate):\n${episodeSummaries}\n\n` +
      `Write ONE concise sentence (max 25 words) that captures:\n` +
      `1. What happened (the pattern across the arc),\n` +
      `2. Why it matters (root cause or mechanism), and\n` +
      `3. What was learned (the durable rule or insight).\n\n` +
      `Respond with ONLY the single sentence. No preamble, no bullet points.`;

    try {
      const resolved = await resolveSovereignProviderAsync();
      const response = await resolved.provider.complete({
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 80,
        temperature: 0.3,
      });

      const narrative = response.content.trim().replace(/\n+/g, ' ');
      if (narrative.length > 0) {
        return {
          id: `fact_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          fact: narrative,
          confidence: successRate,
          sourceEpisodes: cluster.map((c) => c.id),
          lastAccessed: Date.now(),
          accessCount: 1,
        };
      }
      // Empty response: fall through to rule-based
    } catch (err) {
      logger.error(
        `[Consolidation] LLM summarization unavailable (${(err as Error).message}); ` +
          `falling back to rule-based summary.`
      );
    }

    return this.ruleBasedSummary(cluster, successRate);
  }

  /**
   * Executes the background consolidation pass.
   * Takes raw episodes, clusters them, extracts truths, and returns the facts
   * while reporting which raw episodes can be safely garbage collected.
   */
  static async compressEpisodes(rawEpisodes: EpisodicMemory[]): Promise<{
    newFacts: SemanticFact[];
    prunedEpisodes: string[];
  }> {
    if (rawEpisodes.length < 5) return { newFacts: [], prunedEpisodes: [] };

    logger.info(
      `[Consolidation] Running idle memory compression on ${rawEpisodes.length} episodes.`
    );

    const clusters = this.clusterEpisodes(rawEpisodes);
    const newFacts: SemanticFact[] = [];
    const prunedEpisodes: string[] = [];

    for (const cluster of clusters) {
      const fact = await this.summarizeCluster(cluster);
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
    const activeFacts = facts.filter((f) => f.confidence >= 0.3);

    // Keep only the top 'maxFacts' based on confidence and utility
    activeFacts.sort((a, b) => {
      const scoreA = a.confidence * (1 + (a.accessCount || 0));
      const scoreB = b.confidence * (1 + (b.accessCount || 0));
      return scoreB - scoreA;
    });

    return activeFacts.slice(0, maxFacts);
  }
}
