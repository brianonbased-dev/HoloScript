/**
 * HoloScript Knowledge Client
 *
 * Client for querying the AI Workspace Knowledge Hub.
 * Provides access to patterns, gotchas, wisdom, and session context.
 *
 * The AI Workspace Knowledge Hub is the central repository for all
 * accumulated knowledge across the ecosystem.
 */

// ============================================================================
// Types
// ============================================================================

export type KnowledgeCategory = 'pattern' | 'gotcha' | 'wisdom' | 'research' | 'session';

export interface SearchResult {
  id: string;
  content: string;
  metadata: {
    source: string;
    category: KnowledgeCategory;
    domain: string;
    timestamp: string;
    confidence: number;
    tags: string[];
  };
  score: number;
}

export interface Pattern {
  id: string;
  name: string;
  problem: string;
  solution: string;
  example?: string;
  domain: string;
  tags: string[];
}

export interface Gotcha {
  id: string;
  mistake: string;
  consequence?: string;
  fix: string;
  prevention?: string;
  domain: string;
  tags: string[];
}

export interface Wisdom {
  id: string;
  insight: string;
  context?: string;
  source?: string;
  domain: string;
  tags: string[];
}

export interface SearchOptions {
  category?: KnowledgeCategory;
  domain?: string;
  tags?: string[];
  limit?: number;
  minScore?: number;
}

export interface NewGotcha {
  mistake: string;
  fix: string;
  consequence?: string;
  prevention?: string;
  tags?: string[];
}

export interface NewPattern {
  name: string;
  problem: string;
  solution: string;
  example?: string;
  tags?: string[];
}

export interface NewWisdom {
  insight: string;
  context?: string;
  source?: string;
  tags?: string[];
}

export interface KnowledgeStats {
  totalEntries: number;
  byCategory: Record<KnowledgeCategory, number>;
  lastUpdated: string;
}

// ============================================================================
// Knowledge Client
// ============================================================================

export class KnowledgeClient {
  private baseUrl: string;
  private timeout: number;
  private domain: string = 'holoscript';

  constructor(
    options: {
      baseUrl?: string;
      timeout?: number;
      domain?: string;
    } = {}
  ) {
    this.baseUrl = options.baseUrl || process.env.KNOWLEDGE_HUB_URL || 'http://localhost:3001';
    this.timeout = options.timeout || 10000;
    this.domain = options.domain || 'holoscript';
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const response = await this.request('/api/search', {
      method: 'POST',
      body: JSON.stringify({
        query,
        category: options.category,
        domain: options.domain || this.domain,
        tags: options.tags,
        limit: options.limit || 5,
        minScore: options.minScore || 0.7,
      }),
    });

    return response.results || [];
  }

  async searchPatterns(query: string, limit = 5): Promise<SearchResult[]> {
    return this.search(query, { category: 'pattern', limit });
  }

  async searchGotchas(query: string, limit = 5): Promise<SearchResult[]> {
    return this.search(query, { category: 'gotcha', limit });
  }

  async searchWisdom(query: string, limit = 5): Promise<SearchResult[]> {
    return this.search(query, { category: 'wisdom', limit });
  }

  // --------------------------------------------------------------------------
  // Get by Context
  // --------------------------------------------------------------------------

  async getRelevantPatterns(context: string): Promise<Pattern[]> {
    const results = await this.searchPatterns(context);
    return results.map((r) => this.parsePattern(r));
  }

  async getRelevantGotchas(context: string): Promise<Gotcha[]> {
    const results = await this.searchGotchas(context);
    return results.map((r) => this.parseGotcha(r));
  }

  async getRelevantWisdom(context: string): Promise<Wisdom[]> {
    const results = await this.searchWisdom(context);
    return results.map((r) => this.parseWisdom(r));
  }

  // --------------------------------------------------------------------------
  // Add Knowledge
  // --------------------------------------------------------------------------

  async reportGotcha(gotcha: NewGotcha): Promise<string> {
    const response = await this.request('/api/gotchas', {
      method: 'POST',
      body: JSON.stringify({
        ...gotcha,
        domain: this.domain,
      }),
    });
    return response.id;
  }

  async addPattern(pattern: NewPattern): Promise<string> {
    const response = await this.request('/api/patterns', {
      method: 'POST',
      body: JSON.stringify({
        ...pattern,
        domain: this.domain,
      }),
    });
    return response.id;
  }

  async addWisdom(wisdom: NewWisdom): Promise<string> {
    const response = await this.request('/api/wisdom', {
      method: 'POST',
      body: JSON.stringify({
        ...wisdom,
        domain: this.domain,
      }),
    });
    return response.id;
  }

  // --------------------------------------------------------------------------
  // Session Context
  // --------------------------------------------------------------------------

  async getSessionContext(): Promise<SearchResult[]> {
    return this.search('current session context priorities', {
      category: 'session',
      limit: 3,
    });
  }

  async saveSessionContext(context: {
    summary: string;
    achievements?: string;
    blockers?: string;
    nextSteps?: string;
  }): Promise<string> {
    const response = await this.request('/api/session', {
      method: 'POST',
      body: JSON.stringify({
        ...context,
        domain: this.domain,
      }),
    });
    return response.id;
  }

  // --------------------------------------------------------------------------
  // Stats
  // --------------------------------------------------------------------------

  async getStats(): Promise<KnowledgeStats> {
    const response = await this.request('/api/stats', {
      method: 'GET',
    });
    return response;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await this.request('/health', {
        method: 'GET',
      });
      return response.status === 'ok';
    } catch {
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async request(path: string, options: RequestInit): Promise<any> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Knowledge Hub error: ${response.status} ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        throw new Error('Knowledge Hub request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parsePattern(result: SearchResult): Pattern {
    const content = result.content;
    const idMatch = content.match(/^#\s+(P\.\d+\.\d+):\s+(.+)$/m);
    const problemMatch = content.match(/##\s+Problem\n([\s\S]*?)(?=##|$)/);
    const solutionMatch = content.match(/##\s+Solution\n([\s\S]*?)(?=##|$)/);
    const exampleMatch = content.match(/##\s+Example\n([\s\S]*?)(?=##|$)/);

    return {
      id: idMatch?.[1] || result.id,
      name: idMatch?.[2] || 'Unknown',
      problem: problemMatch?.[1]?.trim() || content,
      solution: solutionMatch?.[1]?.trim() || '',
      example: exampleMatch?.[1]?.trim(),
      domain: result.metadata.domain,
      tags: result.metadata.tags,
    };
  }

  private parseGotcha(result: SearchResult): Gotcha {
    const content = result.content;
    const idMatch = content.match(/^#\s+(G\.\d+\.\d+)/m);
    const mistakeMatch = content.match(/##\s+Mistake\n([\s\S]*?)(?=##|$)/);
    const consequenceMatch = content.match(/##\s+Consequence\n([\s\S]*?)(?=##|$)/);
    const fixMatch = content.match(/##\s+Fix\n([\s\S]*?)(?=##|$)/);
    const preventionMatch = content.match(/##\s+Prevention\n([\s\S]*?)(?=##|$)/);

    return {
      id: idMatch?.[1] || result.id,
      mistake: mistakeMatch?.[1]?.trim() || content,
      consequence: consequenceMatch?.[1]?.trim(),
      fix: fixMatch?.[1]?.trim() || '',
      prevention: preventionMatch?.[1]?.trim(),
      domain: result.metadata.domain,
      tags: result.metadata.tags,
    };
  }

  private parseWisdom(result: SearchResult): Wisdom {
    const content = result.content;
    const idMatch = content.match(/^#\s+(W\.\d+)/m);
    const contextMatch = content.match(/##\s+Context\n([\s\S]*?)(?=##|$)/);
    const sourceMatch = content.match(/##\s+Source\n([\s\S]*?)(?=##|$)/);

    // Extract main insight (content after title, before first ##)
    const insightMatch = content.match(/^#\s+W\.\d+:.*?\n\n([\s\S]*?)(?=##|$)/m);

    return {
      id: idMatch?.[1] || result.id,
      insight: insightMatch?.[1]?.trim() || content,
      context: contextMatch?.[1]?.trim(),
      source: sourceMatch?.[1]?.trim(),
      domain: result.metadata.domain,
      tags: result.metadata.tags,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let instance: KnowledgeClient | null = null;

export function getKnowledgeClient(options?: {
  baseUrl?: string;
  timeout?: number;
  domain?: string;
}): KnowledgeClient {
  if (!instance) {
    instance = new KnowledgeClient(options);
  }
  return instance;
}

export function resetKnowledgeClient(): void {
  instance = null;
}
