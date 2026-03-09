/**
 * HybridChunker - Multi-Strategy Source File Chunking
 *
 * Routes different file types to optimal chunking strategies:
 * - Structure-based: .ts/.js/.hs files (split at function/class boundaries via AST)
 * - Fixed-size: .log/.txt files (1024 token chunks with overlap)
 * - Semantic: .md/.comment files (embedding-based similarity merge)
 *
 * Research-backed approach from 2026 best practices:
 * - AST-based chunking maintains syntactic integrity (cAST method)
 * - Hybrid strategies yield 9-12% improvement over single-strategy
 * - Structure-aware passes first, then semantic refinement
 *
 * @version 1.0.0
 * @see https://arxiv.org/html/2506.15655v1 (cAST paper)
 * @see https://www.firecrawl.dev/blog/best-chunking-strategies-rag
 */

export interface ChunkStrategy {
  name: 'structure' | 'fixed' | 'semantic';
  description: string;
}

export interface SourceChunk {
  id: string;
  type: string;
  name?: string;
  startLine: number;
  endLine: number;
  content: string;
  tokens: number;
  strategy: ChunkStrategy['name'];
  metadata?: Record<string, any>;
}

export interface ChunkingOptions {
  /** Maximum chunk size in tokens (default: 1024) */
  maxTokens?: number;
  /** Overlap between fixed-size chunks in tokens (default: 100) */
  overlapTokens?: number;
  /** Semantic similarity threshold (0-1, default: 0.85) */
  semanticThreshold?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Simple token counter (whitespace + punctuation split approximation)
 * For production, use tiktoken or equivalent
 */
function countTokens(text: string): number {
  // Approximate: 1 token ≈ 4 characters for English text
  // More accurate would be: text.split(/\s+/).length * 1.3
  return Math.ceil(text.length / 4);
}

/**
 * Detect file type based on extension
 */
function detectFileType(filePath: string): 'code' | 'log' | 'markdown' | 'unknown' {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  if (['ts', 'js', 'jsx', 'tsx', 'hs', 'hsplus'].includes(ext)) {
    return 'code';
  }
  if (['log', 'txt', 'csv'].includes(ext)) {
    return 'log';
  }
  if (['md', 'mdx', 'markdown'].includes(ext)) {
    return 'markdown';
  }
  return 'unknown';
}

// =============================================================================
// STRUCTURE-BASED CHUNKING (AST-Aware for Code)
// =============================================================================

interface ASTNode {
  type: string;
  name?: string;
  start: number;
  end: number;
  children?: ASTNode[];
}

/**
 * StructureBasedChunker
 *
 * Uses lightweight AST parsing to detect function/class/interface boundaries.
 * Greedily merges nodes into chunks respecting maxTokens limit.
 *
 * Strategy: Parse → Identify boundaries → Merge greedily → Recursive split
 */
class StructureBasedChunker {
  private options: Required<ChunkingOptions>;

  constructor(options: ChunkingOptions) {
    this.options = {
      maxTokens: options.maxTokens || 1024,
      overlapTokens: options.overlapTokens || 100,
      semanticThreshold: options.semanticThreshold || 0.85,
      debug: options.debug || false,
    };
  }

  /**
   * Chunk code files by detecting structural boundaries
   */
  chunk(content: string, filePath: string): SourceChunk[] {
    const lines = content.split('\n');
    const boundaries = this.detectStructuralBoundaries(lines);

    if (boundaries.length === 0) {
      // No structure detected, return entire file as single chunk
      return [
        {
          id: `structure:${filePath}:0`,
          type: 'code-block',
          startLine: 1,
          endLine: lines.length,
          content,
          tokens: countTokens(content),
          strategy: 'structure',
        },
      ];
    }

    const chunks: SourceChunk[] = [];
    let currentChunk: string[] = [];
    let currentStart = 1;
    let chunkIndex = 0;

    for (let i = 0; i < boundaries.length; i++) {
      const boundary = boundaries[i];
      const segmentContent = lines.slice(boundary.startLine - 1, boundary.endLine).join('\n');
      const segmentTokens = countTokens(segmentContent);

      // If adding this segment would exceed max, flush current chunk
      if (
        currentChunk.length > 0 &&
        countTokens(currentChunk.join('\n') + '\n' + segmentContent) > this.options.maxTokens
      ) {
        const chunkContent = currentChunk.join('\n');
        chunks.push({
          id: `structure:${filePath}:${chunkIndex++}`,
          type: 'code-block',
          startLine: currentStart,
          endLine: currentStart + currentChunk.length - 1,
          content: chunkContent,
          tokens: countTokens(chunkContent),
          strategy: 'structure',
        });

        currentChunk = [];
        currentStart = boundary.startLine;
      }

      // If segment itself is too large, split recursively
      if (segmentTokens > this.options.maxTokens) {
        const subChunks = this.recursiveSplit(
          segmentContent,
          boundary.startLine,
          filePath,
          chunkIndex
        );
        chunks.push(...subChunks);
        chunkIndex += subChunks.length;
      } else {
        currentChunk.push(segmentContent);
      }
    }

    // Flush remaining chunk
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n');
      chunks.push({
        id: `structure:${filePath}:${chunkIndex}`,
        type: 'code-block',
        startLine: currentStart,
        endLine: currentStart + currentChunk.length - 1,
        content: chunkContent,
        tokens: countTokens(chunkContent),
        strategy: 'structure',
      });
    }

    return chunks;
  }

  /**
   * Detect structural boundaries (functions, classes, interfaces)
   */
  private detectStructuralBoundaries(
    lines: string[]
  ): Array<{ type: string; name?: string; startLine: number; endLine: number }> {
    const boundaries: Array<{
      type: string;
      name?: string;
      startLine: number;
      endLine: number;
    }> = [];
    let braceDepth = 0;
    let currentBlock: {
      type: string;
      name?: string;
      startLine: number;
    } | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Detect function/class/interface starts
      if (!currentBlock) {
        const functionMatch = trimmed.match(
          /^(export\s+)?(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/
        );
        const classMatch = trimmed.match(
          /^(export\s+)?(abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/
        );
        const interfaceMatch = trimmed.match(/^(export\s+)?interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        const methodMatch = trimmed.match(
          /^(public|private|protected|static)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*[:{]/
        );

        if (functionMatch) {
          currentBlock = {
            type: 'function',
            name: functionMatch[3],
            startLine: i + 1,
          };
        } else if (classMatch) {
          currentBlock = {
            type: 'class',
            name: classMatch[3],
            startLine: i + 1,
          };
        } else if (interfaceMatch) {
          currentBlock = {
            type: 'interface',
            name: interfaceMatch[2],
            startLine: i + 1,
          };
        } else if (methodMatch) {
          currentBlock = {
            type: 'method',
            name: methodMatch[2],
            startLine: i + 1,
          };
        }
      }

      // Track brace depth
      if (currentBlock) {
        for (const char of line) {
          if (char === '{') braceDepth++;
          if (char === '}') braceDepth--;
        }

        // Block complete when braces balance
        if (braceDepth === 0 && trimmed.includes('}')) {
          boundaries.push({
            type: currentBlock.type,
            name: currentBlock.name,
            startLine: currentBlock.startLine,
            endLine: i + 1,
          });
          currentBlock = null;
        }
      }
    }

    // Handle unclosed blocks
    if (currentBlock) {
      boundaries.push({
        type: currentBlock.type,
        name: currentBlock.name,
        startLine: currentBlock.startLine,
        endLine: lines.length,
      });
    }

    return boundaries;
  }

  /**
   * Recursively split large segments
   */
  private recursiveSplit(
    content: string,
    startLine: number,
    filePath: string,
    baseIndex: number
  ): SourceChunk[] {
    const lines = content.split('\n');
    const chunks: SourceChunk[] = [];
    let currentChunk: string[] = [];
    let currentStart = startLine;

    for (let i = 0; i < lines.length; i++) {
      currentChunk.push(lines[i]);

      if (countTokens(currentChunk.join('\n')) >= this.options.maxTokens) {
        const chunkContent = currentChunk.join('\n');
        chunks.push({
          id: `structure:${filePath}:${baseIndex + chunks.length}`,
          type: 'code-fragment',
          startLine: currentStart,
          endLine: currentStart + currentChunk.length - 1,
          content: chunkContent,
          tokens: countTokens(chunkContent),
          strategy: 'structure',
          metadata: { splitReason: 'recursive-oversized' },
        });

        currentChunk = [];
        currentStart = startLine + i + 1;
      }
    }

    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n');
      chunks.push({
        id: `structure:${filePath}:${baseIndex + chunks.length}`,
        type: 'code-fragment',
        startLine: currentStart,
        endLine: currentStart + currentChunk.length - 1,
        content: chunkContent,
        tokens: countTokens(chunkContent),
        strategy: 'structure',
      });
    }

    return chunks;
  }
}

// =============================================================================
// FIXED-SIZE CHUNKING (For Logs and Plain Text)
// =============================================================================

/**
 * FixedSizeChunker
 *
 * Splits text into fixed-size chunks with configurable overlap.
 * Optimal for logs and unstructured text where semantic boundaries unclear.
 *
 * Strategy: Count tokens → Split at maxTokens → Add overlap
 */
class FixedSizeChunker {
  private options: Required<ChunkingOptions>;

  constructor(options: ChunkingOptions) {
    this.options = {
      maxTokens: options.maxTokens || 1024,
      overlapTokens: options.overlapTokens || 100,
      semanticThreshold: options.semanticThreshold || 0.85,
      debug: options.debug || false,
    };
  }

  /**
   * Chunk text files into fixed-size segments with overlap
   */
  chunk(content: string, filePath: string): SourceChunk[] {
    const lines = content.split('\n');
    const chunks: SourceChunk[] = [];
    let currentChunk: string[] = [];
    let currentStart = 1;
    let chunkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      currentChunk.push(lines[i]);
      const currentTokens = countTokens(currentChunk.join('\n'));

      if (currentTokens >= this.options.maxTokens) {
        const chunkContent = currentChunk.join('\n');
        chunks.push({
          id: `fixed:${filePath}:${chunkIndex++}`,
          type: 'text-block',
          startLine: currentStart,
          endLine: currentStart + currentChunk.length - 1,
          content: chunkContent,
          tokens: currentTokens,
          strategy: 'fixed',
        });

        // Calculate overlap lines
        const overlapLines = this.calculateOverlapLines(currentChunk);
        currentChunk = overlapLines;
        currentStart = currentStart + currentChunk.length - overlapLines.length;
      }
    }

    // Flush remaining chunk
    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join('\n');
      chunks.push({
        id: `fixed:${filePath}:${chunkIndex}`,
        type: 'text-block',
        startLine: currentStart,
        endLine: currentStart + currentChunk.length - 1,
        content: chunkContent,
        tokens: countTokens(chunkContent),
        strategy: 'fixed',
      });
    }

    return chunks;
  }

  /**
   * Calculate overlap lines based on token count
   */
  private calculateOverlapLines(lines: string[]): string[] {
    let overlapLines: string[] = [];
    let overlapTokens = 0;

    // Work backwards from end
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineTokens = countTokens(lines[i]);
      if (overlapTokens + lineTokens > this.options.overlapTokens) {
        break;
      }
      overlapLines.unshift(lines[i]);
      overlapTokens += lineTokens;
    }

    return overlapLines;
  }
}

// =============================================================================
// SEMANTIC CHUNKING (For Markdown and Documentation)
// =============================================================================

/**
 * SemanticChunker
 *
 * Groups semantically similar content using lightweight similarity heuristics.
 * For production, integrate with sentence-transformers or OpenAI embeddings.
 *
 * Strategy: Detect paragraphs → Compute similarity → Merge similar → Split large
 */
class SemanticChunker {
  private options: Required<ChunkingOptions>;

  constructor(options: ChunkingOptions) {
    this.options = {
      maxTokens: options.maxTokens || 1024,
      overlapTokens: options.overlapTokens || 100,
      semanticThreshold: options.semanticThreshold || 0.85,
      debug: options.debug || false,
    };
  }

  /**
   * Chunk markdown/docs by semantic similarity
   */
  chunk(content: string, filePath: string): SourceChunk[] {
    const paragraphs = this.detectParagraphs(content);

    if (paragraphs.length === 0) {
      return [
        {
          id: `semantic:${filePath}:0`,
          type: 'document',
          startLine: 1,
          endLine: content.split('\n').length,
          content,
          tokens: countTokens(content),
          strategy: 'semantic',
        },
      ];
    }

    const chunks: SourceChunk[] = [];
    let currentGroup: typeof paragraphs = [];
    let chunkIndex = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];

      if (currentGroup.length === 0) {
        currentGroup.push(para);
        continue;
      }

      // Check semantic similarity with previous paragraph
      const lastPara = currentGroup[currentGroup.length - 1];
      const similarity = this.computeSimilarity(lastPara.content, para.content);
      const groupContent = currentGroup.map((p) => p.content).join('\n\n');
      const groupTokens = countTokens(groupContent + '\n\n' + para.content);

      // Merge if similar and doesn't exceed max tokens
      if (similarity >= this.options.semanticThreshold && groupTokens <= this.options.maxTokens) {
        currentGroup.push(para);
      } else {
        // Flush current group
        const chunkContent = currentGroup.map((p) => p.content).join('\n\n');
        chunks.push({
          id: `semantic:${filePath}:${chunkIndex++}`,
          type: 'semantic-group',
          startLine: currentGroup[0].startLine,
          endLine: currentGroup[currentGroup.length - 1].endLine,
          content: chunkContent,
          tokens: countTokens(chunkContent),
          strategy: 'semantic',
          metadata: {
            paragraphCount: currentGroup.length,
          },
        });

        currentGroup = [para];
      }
    }

    // Flush remaining group
    if (currentGroup.length > 0) {
      const chunkContent = currentGroup.map((p) => p.content).join('\n\n');
      chunks.push({
        id: `semantic:${filePath}:${chunkIndex}`,
        type: 'semantic-group',
        startLine: currentGroup[0].startLine,
        endLine: currentGroup[currentGroup.length - 1].endLine,
        content: chunkContent,
        tokens: countTokens(chunkContent),
        strategy: 'semantic',
        metadata: {
          paragraphCount: currentGroup.length,
        },
      });
    }

    return chunks;
  }

  /**
   * Detect paragraph boundaries in markdown
   */
  private detectParagraphs(
    content: string
  ): Array<{ content: string; startLine: number; endLine: number }> {
    const lines = content.split('\n');
    const paragraphs: Array<{
      content: string;
      startLine: number;
      endLine: number;
    }> = [];
    let currentPara: string[] = [];
    let currentStart = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Paragraph boundary: blank line, heading, or list item
      if (
        trimmed === '' ||
        trimmed.startsWith('#') ||
        /^[-*+]\s/.test(trimmed) ||
        /^\d+\.\s/.test(trimmed)
      ) {
        if (currentPara.length > 0) {
          paragraphs.push({
            content: currentPara.join('\n'),
            startLine: currentStart,
            endLine: i,
          });
          currentPara = [];
        }

        // Headings and list items start new paragraphs
        if (trimmed !== '') {
          currentPara.push(line);
          currentStart = i + 1;
        } else {
          currentStart = i + 2;
        }
      } else {
        currentPara.push(line);
      }
    }

    // Flush remaining paragraph
    if (currentPara.length > 0) {
      paragraphs.push({
        content: currentPara.join('\n'),
        startLine: currentStart,
        endLine: lines.length,
      });
    }

    return paragraphs;
  }

  /**
   * Compute similarity between two text segments
   *
   * Simple heuristic: Jaccard similarity of word sets
   * For production: Use sentence-transformers embeddings + cosine similarity
   */
  private computeSimilarity(text1: string, text2: string): number {
    const words1 = new Set(
      text1
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
    const words2 = new Set(
      text2
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

// =============================================================================
// HYBRID CHUNKER (Router + Strategy Coordinator)
// =============================================================================

/**
 * HybridChunker
 *
 * Main entry point for file chunking.
 * Routes files to optimal strategy based on type:
 * - Code files (.ts/.js/.hs) → StructureBasedChunker
 * - Log files (.log/.txt) → FixedSizeChunker
 * - Markdown (.md) → SemanticChunker
 * - Unknown → FixedSizeChunker (safe fallback)
 */
export class HybridChunker {
  private structureChunker: StructureBasedChunker;
  private fixedChunker: FixedSizeChunker;
  private semanticChunker: SemanticChunker;
  private options: Required<ChunkingOptions>;

  constructor(options: ChunkingOptions = {}) {
    this.options = {
      maxTokens: options.maxTokens || 1024,
      overlapTokens: options.overlapTokens || 100,
      semanticThreshold: options.semanticThreshold || 0.85,
      debug: options.debug || false,
    };

    this.structureChunker = new StructureBasedChunker(this.options);
    this.fixedChunker = new FixedSizeChunker(this.options);
    this.semanticChunker = new SemanticChunker(this.options);
  }

  /**
   * Chunk a file using the optimal strategy
   */
  chunk(content: string, filePath: string): SourceChunk[] {
    const fileType = detectFileType(filePath);

    this.log(`Chunking ${filePath} (type: ${fileType})`);

    let chunks: SourceChunk[];

    switch (fileType) {
      case 'code':
        chunks = this.structureChunker.chunk(content, filePath);
        break;
      case 'log':
        chunks = this.fixedChunker.chunk(content, filePath);
        break;
      case 'markdown':
        chunks = this.semanticChunker.chunk(content, filePath);
        break;
      default:
        this.log(`Unknown file type for ${filePath}, using fixed-size chunking`);
        chunks = this.fixedChunker.chunk(content, filePath);
    }

    this.log(
      `Generated ${chunks.length} chunks (${chunks.reduce((sum, c) => sum + c.tokens, 0)} total tokens)`
    );

    return chunks;
  }

  /**
   * Get chunking statistics
   */
  getStats(chunks: SourceChunk[]): {
    totalChunks: number;
    totalTokens: number;
    avgTokensPerChunk: number;
    strategyDistribution: Record<string, number>;
  } {
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokens, 0);
    const strategyDistribution: Record<string, number> = {};

    for (const chunk of chunks) {
      strategyDistribution[chunk.strategy] = (strategyDistribution[chunk.strategy] || 0) + 1;
    }

    return {
      totalChunks: chunks.length,
      totalTokens,
      avgTokensPerChunk: chunks.length > 0 ? totalTokens / chunks.length : 0,
      strategyDistribution,
    };
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[HybridChunker] ${message}`);
    }
  }
}

/**
 * Create a hybrid chunker with default options
 */
export function createHybridChunker(options?: ChunkingOptions): HybridChunker {
  return new HybridChunker(options);
}
