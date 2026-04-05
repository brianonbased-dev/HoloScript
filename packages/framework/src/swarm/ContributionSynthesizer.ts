/**
 * Contribution Synthesizer
 *
 * Synthesizes multiple contributions into unified insights.
 */

import type { IHiveContribution, IHiveSession } from '@holoscript/core';

export interface SynthesisResult {
  synthesizedContent: string;
  sourceContributions: string[];
  synthesisMethod: 'merge' | 'consensus' | 'weighted' | 'hierarchical';
  confidence: number;
  metadata: {
    totalContributions: number;
    ideaCount: number;
    critiqueCount: number;
    consensusCount: number;
    solutionCount: number;
    averageConfidence: number;
    keyThemes: string[];
  };
}

export interface SynthesizerConfig {
  minConfidenceThreshold: number;
  preferSolutions: boolean;
  includeCritiques: boolean;
  maxSourcesPerSynthesis: number;
}

const DEFAULT_CONFIG: SynthesizerConfig = {
  minConfidenceThreshold: 0.3,
  preferSolutions: true,
  includeCritiques: true,
  maxSourcesPerSynthesis: 10,
};

/**
 * Synthesizes contributions from a collective intelligence session
 */
export class ContributionSynthesizer {
  private config: SynthesizerConfig;

  constructor(config: Partial<SynthesizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Synthesize all contributions in a session
   */
  synthesize(session: IHiveSession): SynthesisResult {
    const contributions = session.contributions;

    if (contributions.length === 0) {
      return this.createEmptyResult();
    }

    // Filter by confidence threshold
    const qualified = contributions.filter(
      (c: any) => c.confidence >= this.config.minConfidenceThreshold
    );

    // Group by type
    const grouped = this.groupByType(qualified);

    // Determine synthesis method based on contribution distribution
    const method = this.determineSynthesisMethod(grouped);

    // Perform synthesis
    const synthesized = this.performSynthesis(grouped, method);

    // Extract key themes
    const keyThemes = this.extractKeyThemes(qualified);

    // Calculate average confidence
    const avgConfidence = this.calculateAverageConfidence(qualified);

    return {
      synthesizedContent: synthesized.content,
      sourceContributions: synthesized.sources.slice(0, this.config.maxSourcesPerSynthesis),
      synthesisMethod: method,
      confidence: synthesized.confidence,
      metadata: {
        totalContributions: contributions.length,
        ideaCount: grouped.ideas.length,
        critiqueCount: grouped.critiques.length,
        consensusCount: grouped.consensuses.length,
        solutionCount: grouped.solutions.length,
        averageConfidence: avgConfidence,
        keyThemes,
      },
    };
  }

  /**
   * Synthesize a subset of contributions
   */
  synthesizeSubset(contributions: IHiveContribution[]): SynthesisResult {
    const mockSession: IHiveSession = {
      id: 'temp-synthesis',
      topic: 'subset',
      goal: 'synthesis',
      initiator: 'synthesizer',
      status: 'active',
      participants: [],
      contributions,
    };
    return this.synthesize(mockSession);
  }

  /**
   * Merge two contributions into one
   */
  merge(a: IHiveContribution, b: IHiveContribution): IHiveContribution {
    // Determine merged type: solutions > consensus > ideas > critiques
    const typeHierarchy: IHiveContribution['type'][] = [
      'critique',
      'idea',
      'consensus',
      'solution',
    ];
    const aRank = typeHierarchy.indexOf(a.type);
    const bRank = typeHierarchy.indexOf(b.type);
    const mergedType = aRank >= bRank ? a.type : b.type;

    // Merge content
    const mergedContent = `[Merged]\n${a.content}\n---\n${b.content}`;

    // Average confidence with slight boost for synthesis
    const mergedConfidence = Math.min(1, (a.confidence + b.confidence) / 2 + 0.05);

    return {
      id: `merged-${a.id}-${b.id}`,
      agentId: 'synthesizer',
      timestamp: Date.now(),
      type: mergedType,
      content: mergedContent,
      confidence: mergedConfidence,
    };
  }

  /**
   * Find similar contributions
   */
  findSimilar(
    target: IHiveContribution,
    candidates: IHiveContribution[],
    threshold = 0.5
  ): IHiveContribution[] {
    return candidates.filter((c: any) => {
      if (c.id === target.id) return false;
      const similarity = this.calculateSimilarity(target.content, c.content);
      return similarity >= threshold;
    });
  }

  private createEmptyResult(): SynthesisResult {
    return {
      synthesizedContent: '',
      sourceContributions: [],
      synthesisMethod: 'merge',
      confidence: 0,
      metadata: {
        totalContributions: 0,
        ideaCount: 0,
        critiqueCount: 0,
        consensusCount: 0,
        solutionCount: 0,
        averageConfidence: 0,
        keyThemes: [],
      },
    };
  }

  private groupByType(contributions: IHiveContribution[]): {
    ideas: IHiveContribution[];
    critiques: IHiveContribution[];
    consensuses: IHiveContribution[];
    solutions: IHiveContribution[];
  } {
    const groups = {
      ideas: [] as IHiveContribution[],
      critiques: [] as IHiveContribution[],
      consensuses: [] as IHiveContribution[],
      solutions: [] as IHiveContribution[],
    };

    for (const c of contributions) {
      switch (c.type) {
        case 'idea':
          groups.ideas.push(c);
          break;
        case 'critique':
          groups.critiques.push(c);
          break;
        case 'consensus':
          groups.consensuses.push(c);
          break;
        case 'solution':
          groups.solutions.push(c);
          break;
      }
    }

    return groups;
  }

  private determineSynthesisMethod(
    grouped: ReturnType<typeof this.groupByType>
  ): SynthesisResult['synthesisMethod'] {
    // If we have solutions and prefer them, use hierarchical
    if (this.config.preferSolutions && grouped.solutions.length > 0) {
      return 'hierarchical';
    }

    // If we have consensus items, use consensus method
    if (grouped.consensuses.length > 0) {
      return 'consensus';
    }

    // If we have many ideas, use weighted by confidence
    if (grouped.ideas.length >= 3) {
      return 'weighted';
    }

    // Default to simple merge
    return 'merge';
  }

  private performSynthesis(
    grouped: ReturnType<typeof this.groupByType>,
    method: SynthesisResult['synthesisMethod']
  ): { content: string; sources: string[]; confidence: number } {
    switch (method) {
      case 'hierarchical':
        return this.synthesizeHierarchical(grouped);
      case 'consensus':
        return this.synthesizeConsensus(grouped);
      case 'weighted':
        return this.synthesizeWeighted(grouped);
      default:
        return this.synthesizeMerge(grouped);
    }
  }

  private synthesizeHierarchical(grouped: ReturnType<typeof this.groupByType>): {
    content: string;
    sources: string[];
    confidence: number;
  } {
    const parts: string[] = [];
    const sources: string[] = [];
    let totalConfidence = 0;
    let count = 0;

    // Solutions first (highest priority)
    if (grouped.solutions.length > 0) {
      parts.push('## Solutions');
      for (const s of grouped.solutions.sort((a, b) => b.confidence - a.confidence)) {
        parts.push(`- ${s.content} (${(s.confidence * 100).toFixed(0)}%)`);
        sources.push(s.id);
        totalConfidence += s.confidence;
        count++;
      }
    }

    // Consensus next
    if (grouped.consensuses.length > 0) {
      parts.push('\n## Consensus Points');
      for (const c of grouped.consensuses.sort((a, b) => b.confidence - a.confidence)) {
        parts.push(`- ${c.content}`);
        sources.push(c.id);
        totalConfidence += c.confidence;
        count++;
      }
    }

    // Ideas
    if (grouped.ideas.length > 0) {
      parts.push('\n## Ideas');
      for (const i of grouped.ideas.sort((a, b) => b.confidence - a.confidence).slice(0, 5)) {
        parts.push(`- ${i.content}`);
        sources.push(i.id);
        totalConfidence += i.confidence;
        count++;
      }
    }

    // Critiques (if enabled)
    if (this.config.includeCritiques && grouped.critiques.length > 0) {
      parts.push('\n## Considerations');
      for (const c of grouped.critiques.slice(0, 3)) {
        parts.push(`- ${c.content}`);
        sources.push(c.id);
        totalConfidence += c.confidence;
        count++;
      }
    }

    return {
      content: parts.join('\n'),
      sources,
      confidence: count > 0 ? totalConfidence / count : 0,
    };
  }

  private synthesizeConsensus(grouped: ReturnType<typeof this.groupByType>): {
    content: string;
    sources: string[];
    confidence: number;
  } {
    const all = [...grouped.consensuses, ...grouped.solutions, ...grouped.ideas];
    all.sort((a, b) => b.confidence - a.confidence);

    const parts: string[] = ['## Collective Consensus'];
    const sources: string[] = [];
    let totalConfidence = 0;

    for (const c of all.slice(0, 5)) {
      parts.push(`- ${c.content}`);
      sources.push(c.id);
      totalConfidence += c.confidence;
    }

    return {
      content: parts.join('\n'),
      sources,
      confidence: sources.length > 0 ? totalConfidence / sources.length : 0,
    };
  }

  private synthesizeWeighted(grouped: ReturnType<typeof this.groupByType>): {
    content: string;
    sources: string[];
    confidence: number;
  } {
    const all = [...grouped.ideas, ...grouped.solutions, ...grouped.consensuses];

    // Weight by confidence
    all.sort((a, b) => b.confidence - a.confidence);

    const parts: string[] = ['## Weighted Synthesis'];
    const sources: string[] = [];
    let weightedSum = 0;
    let weightSum = 0;

    for (const c of all.slice(0, this.config.maxSourcesPerSynthesis)) {
      const weight = c.confidence;
      parts.push(`- [${(weight * 100).toFixed(0)}%] ${c.content}`);
      sources.push(c.id);
      weightedSum += c.confidence * weight;
      weightSum += weight;
    }

    return {
      content: parts.join('\n'),
      sources,
      confidence: weightSum > 0 ? weightedSum / weightSum : 0,
    };
  }

  private synthesizeMerge(grouped: ReturnType<typeof this.groupByType>): {
    content: string;
    sources: string[];
    confidence: number;
  } {
    const all = [
      ...grouped.solutions,
      ...grouped.ideas,
      ...grouped.consensuses,
      ...grouped.critiques,
    ];

    if (all.length === 0) {
      return { content: '', sources: [], confidence: 0 };
    }

    const parts: string[] = ['## Merged Contributions'];
    const sources: string[] = [];
    let totalConfidence = 0;

    for (const c of all.slice(0, this.config.maxSourcesPerSynthesis)) {
      parts.push(`- [${c.type}] ${c.content}`);
      sources.push(c.id);
      totalConfidence += c.confidence;
    }

    return {
      content: parts.join('\n'),
      sources,
      confidence: sources.length > 0 ? totalConfidence / sources.length : 0,
    };
  }

  private extractKeyThemes(contributions: IHiveContribution[]): string[] {
    // Simple word frequency analysis
    const wordCounts = new Map<string, number>();
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'it',
      'this',
      'that',
      'which',
      'who',
      'what',
      'where',
      'when',
      'why',
      'how',
    ]);

    for (const c of contributions) {
      const words = c.content
        .toLowerCase()
        .split(/\W+/)
        .filter((w: any) => w.length > 3 && !stopWords.has(w));
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
      }
    }

    // Get top themes
    const sorted = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, 5).map(([word]) => word);
  }

  private calculateAverageConfidence(contributions: IHiveContribution[]): number {
    if (contributions.length === 0) return 0;
    const sum = contributions.reduce((acc, c) => acc + c.confidence, 0);
    return sum / contributions.length;
  }

  private calculateSimilarity(a: string, b: string): number {
    // Simple Jaccard similarity on word sets
    const wordsA = new Set(
      a
        .toLowerCase()
        .split(/\W+/)
        .filter((w: any) => w.length > 2)
    );
    const wordsB = new Set(
      b
        .toLowerCase()
        .split(/\W+/)
        .filter((w: any) => w.length > 2)
    );

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const word of wordsA) {
      if (wordsB.has(word)) intersection++;
    }

    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}
