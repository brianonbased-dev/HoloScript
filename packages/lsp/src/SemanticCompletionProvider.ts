import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node.js';
import { SemanticSearchService, type AIAdapter } from '@holoscript/framework/ai';
import { TRAIT_DOCS } from './traitDocs';

interface TraitSearchItem {
  name: string;
  description: string;
  doc: { annotation: string; description: string };
}

export class SemanticCompletionProvider {
  private searchService: SemanticSearchService<TraitSearchItem> | null = null;
  private isInitialized = false;

  constructor(adapter?: AIAdapter) {
    if (adapter) {
      const traits = Object.values(TRAIT_DOCS).map((doc) => ({
        name: doc.annotation,
        description: doc.description,
        doc,
      }));
      this.searchService = new SemanticSearchService(adapter, traits);
    }
  }

  public async initialize(): Promise<void> {
    if (this.searchService && !this.isInitialized) {
      await this.searchService.initialize();
      this.isInitialized = true;
    }
  }

  /**
   * Get semantic completions based on a query string
   */
  public async getCompletions(query: string, limit: number = 3): Promise<CompletionItem[]> {
    if (!this.searchService || !this.isInitialized || !query.trim()) {
      return [];
    }

    try {
      const results = await this.searchService.search(query, limit);

      return results.map((result: { item: TraitSearchItem; score: number }, index: number) => {
        const { item, score } = result;
        const doc = item.doc;

        return {
          label: doc.annotation,
          kind: CompletionItemKind.Interface,
          detail: `AI Suggestion (${Math.round(score * 100)}% match)`,
          documentation: {
            kind: 'markdown',
            value: `${doc.description}\n\n*Suggested based on: "${query}"*`,
          },
          insertText: doc.annotation.substring(1),
          sortText: `00_ai_${index}`, // Boost AI suggestions to the top
          data: { isAI: true, score },
        };
      });
    } catch (error) {
      console.error('[LSP] Semantic search failed:', error);
      return [];
    }
  }
}
