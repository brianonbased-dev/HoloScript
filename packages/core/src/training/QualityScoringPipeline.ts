/**
 * Compiler-Based Quality Scoring Pipeline for Training Data
 * Metrics: syntax_validity, schema_compliance, semantic_correctness
 * @version 1.0.0
 */
export interface QualityScore {
  syntaxValidity: number; // 0-1
  schemaCompliance: number; // 0-1
  semanticCorrectness: number; // 0-1
  compositeScore: number; // weighted average 0-1
  details: QualityDetail[];
}
export interface QualityDetail {
  metric: string;
  score: number;
  message: string;
}

export interface QualityScoringConfig {
  syntaxWeight: number;
  schemaWeight: number;
  semanticWeight: number;
  minPassScore: number;
  knownTraits: Set<string>;
  knownTypes: Set<string>;
}

export const DEFAULT_SCORING_CONFIG: QualityScoringConfig = {
  syntaxWeight: 0.4,
  schemaWeight: 0.3,
  semanticWeight: 0.3,
  minPassScore: 0.7,
  knownTraits: new Set(['Grabbable', 'Physics', 'Animation', 'GaussianSplat', 'Tradeable', 'NPC']),
  knownTypes: new Set(['orb', 'world', 'composition', 'template']),
};

export class QualityScoringPipeline {
  private config: QualityScoringConfig;
  constructor(config: Partial<QualityScoringConfig> = {}) {
    this.config = { ...DEFAULT_SCORING_CONFIG, ...config };
  }
  score(source: string): QualityScore {
    const details: QualityDetail[] = [];
    const syntax = this.scoreSyntax(source, details);
    const schema = this.scoreSchema(source, details);
    const semantic = this.scoreSemantic(source, details);
    const composite =
      syntax * this.config.syntaxWeight +
      schema * this.config.schemaWeight +
      semantic * this.config.semanticWeight;
    return {
      syntaxValidity: syntax,
      schemaCompliance: schema,
      semanticCorrectness: semantic,
      compositeScore: composite,
      details,
    };
  }
  passes(score: QualityScore): boolean {
    return score.compositeScore >= this.config.minPassScore;
  }

  private scoreSyntax(source: string, details: QualityDetail[]): number {
    let score = 1.0;
    if (!source.trim()) {
      details.push({ metric: 'syntax', score: 0, message: 'Empty source' });
      return 0;
    }
    const open = (source.match(/{/g) || []).length;
    const close = (source.match(/}/g) || []).length;
    if (open !== close) {
      score -= 0.5;
      details.push({
        metric: 'syntax',
        score: 0.5,
        message: `Unbalanced braces: ${open} open, ${close} close`,
      });
    }
    if (
      /composition\s+\w+/.test(source) ||
      /orb\s+\w+/.test(source) ||
      /world\s+\w+/.test(source)
    ) {
      details.push({ metric: 'syntax', score: 1.0, message: 'Valid composition structure' });
    } else {
      score -= 0.3;
      details.push({
        metric: 'syntax',
        score: 0.7,
        message: 'No recognized top-level declaration',
      });
    }
    return Math.max(0, score);
  }

  private scoreSchema(source: string, details: QualityDetail[]): number {
    let score = 1.0;
    const traitPattern = /(\w+)\s*{/g;
    let match;
    while ((match = traitPattern.exec(source)) !== null) {
      const name = match[1];
      if (this.config.knownTraits.has(name) || this.config.knownTypes.has(name)) continue;
      if (/^[A-Z]/.test(name) && !this.config.knownTraits.has(name)) {
        score -= 0.1;
        details.push({ metric: 'schema', score: 0.9, message: `Unknown trait: ${name}` });
      }
    }
    return Math.max(0, score);
  }

  private scoreSemantic(source: string, details: QualityDetail[]): number {
    let score = 1.0;
    if (/physics\s*{/.test(source) && !/mass|gravity|friction/.test(source)) {
      score -= 0.2;
      details.push({
        metric: 'semantic',
        score: 0.8,
        message: 'Physics block without mass/gravity/friction',
      });
    }
    if (/animation\s*{/.test(source) && !/clip|duration|speed/.test(source)) {
      score -= 0.2;
      details.push({
        metric: 'semantic',
        score: 0.8,
        message: 'Animation block without clip/duration',
      });
    }
    if (source.length < 20) {
      score -= 0.3;
      details.push({
        metric: 'semantic',
        score: 0.7,
        message: 'Source too short for meaningful composition',
      });
    }
    return Math.max(0, score);
  }
}
