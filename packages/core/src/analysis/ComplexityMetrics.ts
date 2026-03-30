/**
 * Complexity Metrics
 *
 * Sprint 5 Priority 4: Complexity Metrics
 *
 * Analyzes HoloScript code complexity through various metrics:
 * - Cyclomatic complexity (decision points)
 * - Nesting depth (max and average)
 * - Lines of code (total, code, comments, blank)
 * - Object/orb density
 * - Trait complexity
 * - Overall complexity score
 *
 * @version 1.0.0
 */

/**
 * Complexity metric thresholds
 */
export interface ComplexityThresholds {
  /** Max acceptable cyclomatic complexity per function */
  maxCyclomatic: number;
  /** Max acceptable nesting depth */
  maxNesting: number;
  /** Max acceptable lines per file */
  maxLinesPerFile: number;
  /** Max acceptable lines per function */
  maxLinesPerFunction: number;
  /** Max acceptable objects per spatial group */
  maxObjectsPerGroup: number;
  /** Max acceptable traits per object */
  maxTraitsPerObject: number;
}

/**
 * Default complexity thresholds
 */
export const DEFAULT_THRESHOLDS: ComplexityThresholds = {
  maxCyclomatic: 10,
  maxNesting: 4,
  maxLinesPerFile: 500,
  maxLinesPerFunction: 50,
  maxObjectsPerGroup: 50,
  maxTraitsPerObject: 10,
};

/**
 * Line count metrics
 */
export interface LineMetrics {
  /** Total number of lines */
  total: number;
  /** Lines with code */
  code: number;
  /** Comment lines */
  comments: number;
  /** Blank lines */
  blank: number;
  /** Comment to code ratio */
  commentRatio: number;
}

/**
 * Nesting metrics
 */
export interface NestingMetrics {
  /** Maximum nesting depth found */
  maxDepth: number;
  /** Average nesting depth */
  averageDepth: number;
  /** Locations exceeding threshold */
  deepLocations: Array<{ line: number; depth: number }>;
}

/**
 * Function complexity
 */
export interface FunctionComplexity {
  /** Function name */
  name: string;
  /** Line number */
  line: number;
  /** Cyclomatic complexity */
  cyclomatic: number;
  /** Lines of code */
  lines: number;
  /** Number of parameters */
  parameters: number;
  /** Nesting depth */
  maxNesting: number;
}

/**
 * Object/orb metrics
 */
export interface ObjectMetrics {
  /** Total number of objects */
  totalObjects: number;
  /** Total number of templates */
  totalTemplates: number;
  /** Objects per spatial group */
  objectsPerGroup: Map<string, number>;
  /** Traits per object */
  traitsPerObject: Map<string, number>;
  /** Most complex objects */
  complexObjects: Array<{
    name: string;
    line: number;
    traitCount: number;
    propertyCount: number;
  }>;
}

/**
 * Trait usage metrics
 */
export interface TraitMetrics {
  /** Total trait usages */
  totalUsages: number;
  /** Usage count by trait name */
  usagesByTrait: Map<string, number>;
  /** Most used traits (top 5) */
  topTraits: Array<{ trait: string; count: number }>;
  /** Unique traits used */
  uniqueTraits: number;
}

/**
 * Complete complexity analysis result
 */
export interface ComplexityResult {
  /** File path analyzed */
  filePath: string;
  /** Line metrics */
  lines: LineMetrics;
  /** Nesting metrics */
  nesting: NestingMetrics;
  /** Function complexity list */
  functions: FunctionComplexity[];
  /** Object metrics */
  objects: ObjectMetrics;
  /** Trait metrics */
  traits: TraitMetrics;
  /** Overall complexity score (0-100) */
  overallScore: number;
  /** Complexity grade (A-F) */
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  /** Issues found */
  issues: ComplexityIssue[];
  /** Summary statistics */
  summary: {
    avgCyclomatic: number;
    avgFunctionLength: number;
    avgTraitsPerObject: number;
    maintainabilityIndex: number;
  };
}

/**
 * Complexity issue
 */
export interface ComplexityIssue {
  /** Issue type */
  type: 'cyclomatic' | 'nesting' | 'length' | 'object-density' | 'trait-density';
  /** Severity */
  severity: 'warning' | 'error';
  /** Line number */
  line: number;
  /** Message */
  message: string;
  /** Metric value */
  value: number;
  /** Threshold exceeded */
  threshold: number;
}

/**
 * Complexity Analyzer class
 */
export class ComplexityAnalyzer {
  private thresholds: ComplexityThresholds;

  constructor(thresholds: Partial<ComplexityThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Analyze source code complexity
   */
  analyze(source: string, filePath = 'input.holo'): ComplexityResult {
    const lines = source.split('\n');

    // Gather all metrics
    const lineMetrics = this.analyzeLines(lines);
    const nestingMetrics = this.analyzeNesting(lines);
    const functionMetrics = this.analyzeFunctions(lines);
    const objectMetrics = this.analyzeObjects(lines);
    const traitMetrics = this.analyzeTraits(lines);

    // Find issues
    const issues = this.findIssues(
      nestingMetrics,
      functionMetrics,
      objectMetrics,
      traitMetrics,
      lineMetrics
    );

    // Calculate summary stats
    const avgCyclomatic =
      functionMetrics.length > 0
        ? functionMetrics.reduce((sum, f) => sum + f.cyclomatic, 0) / functionMetrics.length
        : 0;

    const avgFunctionLength =
      functionMetrics.length > 0
        ? functionMetrics.reduce((sum, f) => sum + f.lines, 0) / functionMetrics.length
        : 0;

    const avgTraitsPerObject =
      objectMetrics.totalObjects > 0 ? traitMetrics.totalUsages / objectMetrics.totalObjects : 0;

    // Calculate maintainability index
    // Based on Microsoft's formula: 171 - 5.2*ln(V) - 0.23*G - 16.2*ln(L)
    // We use a simplified version
    const maintainabilityIndex = this.calculateMaintainabilityIndex(
      lineMetrics,
      avgCyclomatic,
      functionMetrics.length
    );

    // Calculate overall score and grade
    const overallScore = this.calculateOverallScore(
      lineMetrics,
      nestingMetrics,
      avgCyclomatic,
      avgTraitsPerObject,
      issues.length
    );

    const grade = this.getGrade(overallScore);

    return {
      filePath,
      lines: lineMetrics,
      nesting: nestingMetrics,
      functions: functionMetrics,
      objects: objectMetrics,
      traits: traitMetrics,
      overallScore,
      grade,
      issues,
      summary: {
        avgCyclomatic,
        avgFunctionLength,
        avgTraitsPerObject,
        maintainabilityIndex,
      },
    };
  }

  /**
   * Analyze line metrics
   */
  private analyzeLines(lines: string[]): LineMetrics {
    let code = 0;
    let comments = 0;
    let blank = 0;
    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Track block comments
      if (trimmed.startsWith('/*')) {
        inBlockComment = true;
        comments++;
        if (trimmed.endsWith('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (inBlockComment) {
        comments++;
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed === '') {
        blank++;
      } else if (trimmed.startsWith('//')) {
        comments++;
      } else {
        code++;
      }
    }

    return {
      total: lines.length,
      code,
      comments,
      blank,
      commentRatio: code > 0 ? comments / code : 0,
    };
  }

  /**
   * Analyze nesting depth
   */
  private analyzeNesting(lines: string[]): NestingMetrics {
    let currentDepth = 0;
    let maxDepth = 0;
    let totalDepth = 0;
    let depthCount = 0;
    const deepLocations: Array<{ line: number; depth: number }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const opens = (line.match(/{/g) || []).length;
      const closes = (line.match(/}/g) || []).length;

      currentDepth += opens;

      if (currentDepth > maxDepth) {
        maxDepth = currentDepth;
      }

      if (currentDepth > this.thresholds.maxNesting) {
        deepLocations.push({ line: i + 1, depth: currentDepth });
      }

      if (opens > 0 || closes > 0) {
        totalDepth += currentDepth;
        depthCount++;
      }

      currentDepth -= closes;
      if (currentDepth < 0) currentDepth = 0;
    }

    return {
      maxDepth,
      averageDepth: depthCount > 0 ? totalDepth / depthCount : 0,
      deepLocations,
    };
  }

  /**
   * Analyze function complexity
   */
  private analyzeFunctions(lines: string[]): FunctionComplexity[] {
    const functions: FunctionComplexity[] = [];
    const funcRegex = /\bfunction\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)/g;

    let inFunction = false;
    let currentFunc: FunctionComplexity | null = null;
    let braceDepth = 0;
    let funcStartLine = 0;
    let funcNesting = 0;
    let maxFuncNesting = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for function start
      const funcMatch = this.tryStartFunction(line, funcRegex);
      if (funcMatch && !inFunction) {
        currentFunc = this.createFunctionMetrics(funcMatch, i);
        inFunction = true;
        funcStartLine = i;
        braceDepth = 0;
        funcNesting = 0;
        maxFuncNesting = 0;
      }

      if (inFunction && currentFunc) {
        // Count decision points
        currentFunc.cyclomatic += this.countDecisionPoints(line);

        // Track nesting
        const nestingData = this.updateNesting(line, funcNesting, maxFuncNesting);
        funcNesting = nestingData.current;
        maxFuncNesting = nestingData.max;
        braceDepth += nestingData.braceChange;

        // Function end
        if (braceDepth <= 0 && i > funcStartLine) {
          this.finalizeFunctionMetrics(currentFunc, i, funcStartLine, maxFuncNesting);
          functions.push(currentFunc);
          inFunction = false;
          currentFunc = null;
        }
      }
    }

    // Handle unclosed function
    if (currentFunc) {
      this.finalizeFunctionMetrics(currentFunc, lines.length - 1, funcStartLine, maxFuncNesting);
      functions.push(currentFunc);
    }

    return functions;
  }

  /**
   * Try to match a function start pattern
   */
  private tryStartFunction(line: string, funcRegex: RegExp): RegExpExecArray | null {
    funcRegex.lastIndex = 0;
    return funcRegex.exec(line);
  }

  /**
   * Create initial function complexity metrics
   */
  private createFunctionMetrics(funcMatch: RegExpExecArray, lineIndex: number): FunctionComplexity {
    const params = funcMatch[2].split(',').filter((p) => p.trim()).length;
    return {
      name: funcMatch[1],
      line: lineIndex + 1,
      cyclomatic: 1, // Base complexity
      lines: 0,
      parameters: params,
      maxNesting: 0,
    };
  }

  /**
   * Count decision points in a line for cyclomatic complexity
   */
  private countDecisionPoints(line: string): number {
    const decisionPatterns = [
      /\bif\s*\(/g,
      /\belse\s+if\s*\(/g,
      /\bfor\s*\(/g,
      /\bwhile\s*\(/g,
      /\@for\b/g,
      /\@if\b/g,
      /\?\s*:/g, // ternary
      /&&/g,
      /\|\|/g,
      /catch\s*\(/g,
    ];

    let count = 0;
    for (const pattern of decisionPatterns) {
      pattern.lastIndex = 0;
      const matches = line.match(pattern);
      if (matches) {
        count += matches.length;
      }
    }
    return count;
  }

  /**
   * Update nesting levels and brace depth
   */
  private updateNesting(
    line: string,
    currentNesting: number,
    maxNesting: number
  ): {
    current: number;
    max: number;
    braceChange: number;
  } {
    const opens = (line.match(/{/g) || []).length;
    const closes = (line.match(/}/g) || []).length;

    // Function nesting increases with opens, then decreases with closes
    let newCurrent = currentNesting + opens;
    const newMax = Math.max(maxNesting, newCurrent);
    newCurrent -= closes;

    const braceChange = opens - closes;

    return {
      current: newCurrent,
      max: newMax,
      braceChange,
    };
  }

  /**
   * Finalize function metrics when function ends
   */
  private finalizeFunctionMetrics(
    func: FunctionComplexity,
    endLine: number,
    startLine: number,
    maxNesting: number
  ): void {
    func.lines = endLine - startLine + 1;
    func.maxNesting = maxNesting;
  }

  /**
   * Analyze object metrics
   */
  private analyzeObjects(lines: string[]): ObjectMetrics {
    const objectsPerGroup = new Map<string, number>();
    const traitsPerObject = new Map<string, number>();
    const complexObjects: ObjectMetrics['complexObjects'] = [];

    const orbRegex = /\borb\s+["']([^"']+)["']/g;
    const objectRegex = /\bobject\s+["']([^"']+)["']/g;
    const templateRegex = /\btemplate\s+["']([^"']+)["']/g;
    const groupRegex = /\bspatial_group\s+["']([^"']+)["']/g;
    const traitRegex = /@(\w+)/g;

    let totalObjects = 0;
    let totalTemplates = 0;
    let currentGroup = 'root';
    let currentObject: string | null = null;
    let currentObjectLine = 0;
    let currentTraitCount = 0;
    let currentPropertyCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check for spatial groups
      groupRegex.lastIndex = 0;
      const groupMatch = groupRegex.exec(line);
      if (groupMatch) {
        currentGroup = groupMatch[1];
        if (!objectsPerGroup.has(currentGroup)) {
          objectsPerGroup.set(currentGroup, 0);
        }
      }

      // Check for orbs/objects
      orbRegex.lastIndex = 0;
      objectRegex.lastIndex = 0;
      const orbMatch = orbRegex.exec(line);
      const objMatch = objectRegex.exec(line);

      if (orbMatch || objMatch) {
        // Save previous object
        if (currentObject) {
          traitsPerObject.set(currentObject, currentTraitCount);
          if (currentTraitCount >= 3 || currentPropertyCount >= 5) {
            complexObjects.push({
              name: currentObject,
              line: currentObjectLine,
              traitCount: currentTraitCount,
              propertyCount: currentPropertyCount,
            });
          }
        }

        currentObject = orbMatch ? orbMatch[1] : objMatch![1];
        currentObjectLine = i + 1;
        currentTraitCount = 0;
        currentPropertyCount = 0;
        totalObjects++;

        const count = objectsPerGroup.get(currentGroup) || 0;
        objectsPerGroup.set(currentGroup, count + 1);
      }

      // Check for templates
      templateRegex.lastIndex = 0;
      if (templateRegex.exec(line)) {
        totalTemplates++;
      }

      // Count traits in current object
      if (currentObject) {
        traitRegex.lastIndex = 0;
        const traitMatches = line.match(traitRegex);
        if (traitMatches) {
          currentTraitCount += traitMatches.length;
        }

        // Count properties (simple heuristic: lines with colon)
        if (line.includes(':') && !line.includes('@')) {
          currentPropertyCount++;
        }
      }
    }

    // Save last object
    if (currentObject) {
      traitsPerObject.set(currentObject, currentTraitCount);
      if (currentTraitCount >= 3 || currentPropertyCount >= 5) {
        complexObjects.push({
          name: currentObject,
          line: currentObjectLine,
          traitCount: currentTraitCount,
          propertyCount: currentPropertyCount,
        });
      }
    }

    // Sort complex objects by trait count
    complexObjects.sort((a, b) => b.traitCount - a.traitCount);

    return {
      totalObjects,
      totalTemplates,
      objectsPerGroup,
      traitsPerObject,
      complexObjects: complexObjects.slice(0, 10),
    };
  }

  /**
   * Analyze trait usage
   */
  private analyzeTraits(lines: string[]): TraitMetrics {
    const usagesByTrait = new Map<string, number>();
    let totalUsages = 0;

    const traitRegex = /@(\w+)/g;

    for (const line of lines) {
      traitRegex.lastIndex = 0;
      let match;
      while ((match = traitRegex.exec(line)) !== null) {
        const trait = match[1];
        const count = usagesByTrait.get(trait) || 0;
        usagesByTrait.set(trait, count + 1);
        totalUsages++;
      }
    }

    // Get top traits
    const topTraits = Array.from(usagesByTrait.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([trait, count]) => ({ trait, count }));

    return {
      totalUsages,
      usagesByTrait,
      topTraits,
      uniqueTraits: usagesByTrait.size,
    };
  }

  /**
   * Find complexity issues
   */
  private findIssues(
    nesting: NestingMetrics,
    functions: FunctionComplexity[],
    objects: ObjectMetrics,
    traits: TraitMetrics,
    lines: LineMetrics
  ): ComplexityIssue[] {
    const issues: ComplexityIssue[] = [];

    // Nesting issues
    for (const loc of nesting.deepLocations) {
      issues.push({
        type: 'nesting',
        severity: loc.depth > this.thresholds.maxNesting + 2 ? 'error' : 'warning',
        line: loc.line,
        message: `Nesting depth ${loc.depth} exceeds threshold of ${this.thresholds.maxNesting}`,
        value: loc.depth,
        threshold: this.thresholds.maxNesting,
      });
    }

    // Function complexity issues
    for (const func of functions) {
      if (func.cyclomatic > this.thresholds.maxCyclomatic) {
        issues.push({
          type: 'cyclomatic',
          severity: func.cyclomatic > this.thresholds.maxCyclomatic * 1.5 ? 'error' : 'warning',
          line: func.line,
          message: `Function "${func.name}" has cyclomatic complexity ${func.cyclomatic} (threshold: ${this.thresholds.maxCyclomatic})`,
          value: func.cyclomatic,
          threshold: this.thresholds.maxCyclomatic,
        });
      }

      if (func.lines > this.thresholds.maxLinesPerFunction) {
        issues.push({
          type: 'length',
          severity: func.lines > this.thresholds.maxLinesPerFunction * 2 ? 'error' : 'warning',
          line: func.line,
          message: `Function "${func.name}" has ${func.lines} lines (threshold: ${this.thresholds.maxLinesPerFunction})`,
          value: func.lines,
          threshold: this.thresholds.maxLinesPerFunction,
        });
      }
    }

    // File length issue
    if (lines.total > this.thresholds.maxLinesPerFile) {
      issues.push({
        type: 'length',
        severity: lines.total > this.thresholds.maxLinesPerFile * 2 ? 'error' : 'warning',
        line: 1,
        message: `File has ${lines.total} lines (threshold: ${this.thresholds.maxLinesPerFile})`,
        value: lines.total,
        threshold: this.thresholds.maxLinesPerFile,
      });
    }

    // Object density issues
    for (const [group, count] of objects.objectsPerGroup) {
      if (count > this.thresholds.maxObjectsPerGroup) {
        issues.push({
          type: 'object-density',
          severity: count > this.thresholds.maxObjectsPerGroup * 2 ? 'error' : 'warning',
          line: 1,
          message: `Spatial group "${group}" has ${count} objects (threshold: ${this.thresholds.maxObjectsPerGroup})`,
          value: count,
          threshold: this.thresholds.maxObjectsPerGroup,
        });
      }
    }

    // Trait density issues
    for (const [objName, traitCount] of objects.traitsPerObject) {
      if (traitCount > this.thresholds.maxTraitsPerObject) {
        issues.push({
          type: 'trait-density',
          severity: traitCount > this.thresholds.maxTraitsPerObject * 1.5 ? 'error' : 'warning',
          line: 1,
          message: `Object "${objName}" has ${traitCount} traits (threshold: ${this.thresholds.maxTraitsPerObject})`,
          value: traitCount,
          threshold: this.thresholds.maxTraitsPerObject,
        });
      }
    }

    return issues;
  }

  /**
   * Calculate maintainability index (0-100)
   */
  private calculateMaintainabilityIndex(
    lines: LineMetrics,
    avgCyclomatic: number,
    _functionCount: number
  ): number {
    // Simplified maintainability index
    // Higher is better (0-100 scale)
    const volume = Math.log(lines.code + 1) * 2;
    const complexity = avgCyclomatic;
    const loc = Math.log(lines.code + 1);

    const rawIndex = 171 - 5.2 * volume - 0.23 * complexity - 16.2 * loc;
    const normalized = Math.max(0, Math.min(100, rawIndex));

    return Math.round(normalized);
  }

  /**
   * Calculate overall complexity score (0-100, higher is better/simpler)
   */
  private calculateOverallScore(
    lines: LineMetrics,
    nesting: NestingMetrics,
    avgCyclomatic: number,
    avgTraitsPerObject: number,
    issueCount: number
  ): number {
    let score = 100;

    // Deduct for high nesting
    if (nesting.maxDepth > this.thresholds.maxNesting) {
      score -= Math.min(20, (nesting.maxDepth - this.thresholds.maxNesting) * 5);
    }

    // Deduct for high cyclomatic complexity
    if (avgCyclomatic > this.thresholds.maxCyclomatic) {
      score -= Math.min(20, (avgCyclomatic - this.thresholds.maxCyclomatic) * 2);
    }

    // Deduct for high trait density
    if (avgTraitsPerObject > 5) {
      score -= Math.min(15, (avgTraitsPerObject - 5) * 3);
    }

    // Deduct for too many lines
    if (lines.total > this.thresholds.maxLinesPerFile) {
      score -= Math.min(15, ((lines.total - this.thresholds.maxLinesPerFile) / 100) * 5);
    }

    // Deduct for issues
    score -= Math.min(30, issueCount * 3);

    // Bonus for good comment ratio
    if (lines.commentRatio >= 0.1 && lines.commentRatio <= 0.3) {
      score += 5;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Get letter grade from score
   */
  private getGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  /**
   * Generate a complexity report
   */
  generateReport(result: ComplexityResult): string {
    const lines: string[] = [];

    lines.push(`Complexity Report for ${result.filePath}`);
    lines.push('='.repeat(50));
    lines.push('');

    // Overall score
    lines.push(`## Overall Score: ${result.overallScore}/100 (Grade: ${result.grade})`);
    lines.push('');

    // Line metrics
    lines.push('## Line Metrics');
    lines.push(`  Total lines: ${result.lines.total}`);
    lines.push(`  Code lines: ${result.lines.code}`);
    lines.push(`  Comment lines: ${result.lines.comments}`);
    lines.push(`  Blank lines: ${result.lines.blank}`);
    lines.push(`  Comment ratio: ${(result.lines.commentRatio * 100).toFixed(1)}%`);
    lines.push('');

    // Nesting
    lines.push('## Nesting Metrics');
    lines.push(`  Max depth: ${result.nesting.maxDepth}`);
    lines.push(`  Average depth: ${result.nesting.averageDepth.toFixed(2)}`);
    lines.push('');

    // Functions
    if (result.functions.length > 0) {
      lines.push('## Function Complexity');
      for (const func of result.functions) {
        lines.push(
          `  ${func.name}: cyclomatic=${func.cyclomatic}, lines=${func.lines}, params=${func.parameters}`
        );
      }
      lines.push('');
    }

    // Objects
    lines.push('## Object Metrics');
    lines.push(`  Total objects: ${result.objects.totalObjects}`);
    lines.push(`  Total templates: ${result.objects.totalTemplates}`);
    if (result.objects.complexObjects.length > 0) {
      lines.push('  Most complex objects:');
      for (const obj of result.objects.complexObjects.slice(0, 5)) {
        lines.push(`    - ${obj.name}: ${obj.traitCount} traits, ${obj.propertyCount} properties`);
      }
    }
    lines.push('');

    // Traits
    lines.push('## Trait Usage');
    lines.push(`  Total usages: ${result.traits.totalUsages}`);
    lines.push(`  Unique traits: ${result.traits.uniqueTraits}`);
    if (result.traits.topTraits.length > 0) {
      lines.push('  Top traits:');
      for (const { trait, count } of result.traits.topTraits) {
        lines.push(`    - @${trait}: ${count}`);
      }
    }
    lines.push('');

    // Summary
    lines.push('## Summary');
    lines.push(`  Avg cyclomatic complexity: ${result.summary.avgCyclomatic.toFixed(2)}`);
    lines.push(`  Avg function length: ${result.summary.avgFunctionLength.toFixed(2)}`);
    lines.push(`  Avg traits per object: ${result.summary.avgTraitsPerObject.toFixed(2)}`);
    lines.push(`  Maintainability index: ${result.summary.maintainabilityIndex}`);
    lines.push('');

    // Issues
    if (result.issues.length > 0) {
      lines.push('## Issues');
      for (const issue of result.issues) {
        const icon = issue.severity === 'error' ? '[ERROR]' : '[WARN]';
        lines.push(`  ${icon} Line ${issue.line}: ${issue.message}`);
      }
      lines.push('');
    } else {
      lines.push('## Issues');
      lines.push('  No complexity issues found!');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<ComplexityThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Get current thresholds
   */
  getThresholds(): ComplexityThresholds {
    return { ...this.thresholds };
  }
}

/**
 * Create a complexity analyzer
 */
export function createComplexityAnalyzer(
  thresholds?: Partial<ComplexityThresholds>
): ComplexityAnalyzer {
  return new ComplexityAnalyzer(thresholds);
}

/**
 * Quick analyze helper
 */
export function analyzeComplexity(source: string, filePath = 'input.holo'): ComplexityResult {
  const analyzer = createComplexityAnalyzer();
  return analyzer.analyze(source, filePath);
}

export default ComplexityAnalyzer;
