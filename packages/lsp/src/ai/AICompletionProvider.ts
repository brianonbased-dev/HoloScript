/**
 * HoloScript LSP - AI Completion Provider
 *
 * Provides AI-powered code completions for HoloScript.
 *
 * Features:
 * - Smart trait suggestions based on context
 * - Code generation from comments
 * - Error fix suggestions
 * - Context-aware recommendations
 */

import {
  CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { AIAdapter } from '@holoscript/core';
import { ContextGatherer, type CompletionContext } from './ContextGatherer';
import { PromptBuilder } from './PromptBuilder';

/**
 * AI completion result
 */
export interface AICompletionResult {
  completions: CompletionItem[];
  isFromCache: boolean;
  latency: number;
}

/**
 * Completion cache entry
 */
interface CacheEntry {
  completions: CompletionItem[];
  timestamp: number;
  contextHash: string;
}

/**
 * AI Completion Provider Configuration
 */
export interface AICompletionConfig {
  /** Enable/disable AI completions */
  enabled: boolean;
  /** Use local model (Ollama) if available */
  preferLocal: boolean;
  /** Cache TTL in milliseconds */
  cacheTTL: number;
  /** Maximum completions to return */
  maxCompletions: number;
  /** Minimum confidence threshold */
  confidenceThreshold: number;
}

const DEFAULT_CONFIG: AICompletionConfig = {
  enabled: true,
  preferLocal: true,
  cacheTTL: 30000, // 30 seconds
  maxCompletions: 5,
  confidenceThreshold: 0.3,
};

/**
 * AI-powered completion provider
 */
export class AICompletionProvider {
  private adapter: AIAdapter | null = null;
  private contextGatherer: ContextGatherer;
  private promptBuilder: PromptBuilder;
  private cache: Map<string, CacheEntry> = new Map();
  private config: AICompletionConfig;

  constructor(adapter?: AIAdapter, config: Partial<AICompletionConfig> = {}) {
    this.adapter = adapter ?? null;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.contextGatherer = new ContextGatherer();
    this.promptBuilder = new PromptBuilder();
  }

  /**
   * Set the AI adapter
   */
  public setAdapter(adapter: AIAdapter): void {
    this.adapter = adapter;
  }

  /**
   * Update configuration
   */
  public setConfig(config: Partial<AICompletionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get smart completions based on context
   */
  public async getCompletions(
    document: TextDocument,
    position: { line: number; character: number },
    triggerCharacter?: string
  ): Promise<AICompletionResult> {
    const startTime = Date.now();

    if (!this.config.enabled || !this.adapter) {
      return { completions: [], isFromCache: false, latency: 0 };
    }

    // Gather context
    const context = this.contextGatherer.gather(document, position, triggerCharacter);
    const contextHash = this.hashContext(context);

    // Check cache
    const cached = this.getFromCache(contextHash);
    if (cached) {
      return {
        completions: cached,
        isFromCache: true,
        latency: Date.now() - startTime,
      };
    }

    try {
      // Get completions based on context type
      let completions: CompletionItem[];

      switch (context.type) {
        case 'trait':
          completions = await this.getTraitCompletions(context);
          break;
        case 'comment':
          completions = await this.getCommentCompletions(context);
          break;
        case 'property':
          completions = await this.getPropertyCompletions(context);
          break;
        case 'event':
          completions = await this.getEventCompletions(context);
          break;
        default:
          completions = await this.getGeneralCompletions(context);
      }

      // Cache results
      this.setCache(contextHash, completions);

      return {
        completions,
        isFromCache: false,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      console.error('[AICompletion] Error getting completions:', error);
      return { completions: [], isFromCache: false, latency: Date.now() - startTime };
    }
  }

  /**
   * Get trait suggestions based on object context
   */
  private async getTraitCompletions(context: CompletionContext): Promise<CompletionItem[]> {
    const prompt = this.promptBuilder.buildTraitPrompt(context);
    const response = await this.queryAI(prompt);

    return this.parseTraitSuggestions(response, context);
  }

  /**
   * Generate code from comment
   */
  private async getCommentCompletions(context: CompletionContext): Promise<CompletionItem[]> {
    if (!context.comment) {
      return [];
    }

    const prompt = this.promptBuilder.buildCodeGenPrompt(context);
    const response = await this.queryAI(prompt);

    return this.parseCodeGenSuggestion(response, context);
  }

  /**
   * Get property completions
   */
  private async getPropertyCompletions(context: CompletionContext): Promise<CompletionItem[]> {
    const prompt = this.promptBuilder.buildPropertyPrompt(context);
    const response = await this.queryAI(prompt);

    return this.parsePropertySuggestions(response);
  }

  /**
   * Get event handler completions
   */
  private async getEventCompletions(context: CompletionContext): Promise<CompletionItem[]> {
    const prompt = this.promptBuilder.buildEventPrompt(context);
    const response = await this.queryAI(prompt);

    return this.parseEventSuggestions(response);
  }

  /**
   * Get general completions
   */
  private async getGeneralCompletions(context: CompletionContext): Promise<CompletionItem[]> {
    const prompt = this.promptBuilder.buildGeneralPrompt(context);
    const response = await this.queryAI(prompt);

    return this.parseGeneralSuggestions(response);
  }

  /**
   * Get error fix suggestions
   */
  public async getErrorFixes(
    document: TextDocument,
    error: { message: string; line: number; column: number }
  ): Promise<CompletionItem[]> {
    if (!this.adapter) {
      return [];
    }

    const context = this.contextGatherer.gatherErrorContext(document, error);
    const prompt = this.promptBuilder.buildErrorFixPrompt(context, error);

    try {
      const response = await this.queryAI(prompt);
      return this.parseErrorFixSuggestions(response, context);
    } catch (err) {
      console.error('[AICompletion] Error getting fixes:', err);
      return [];
    }
  }

  /**
   * Query the AI model
   */
  private async queryAI(prompt: string): Promise<string> {
    if (!this.adapter) {
      throw new Error('No AI adapter configured');
    }

    try {
      const response = await this.adapter.complete(prompt, {
        maxTokens: 500,
        temperature: 0.3, // Lower temperature for more focused completions
      });

      return response.text ?? '';
    } catch (error) {
      console.error('[AICompletion] AI query failed:', error);
      throw error;
    }
  }

  /**
   * Parse trait suggestions from AI response
   */
  private parseTraitSuggestions(response: string, _context: CompletionContext): CompletionItem[] {
    const suggestions: CompletionItem[] = [];

    // Look for trait patterns in response: @traitname or just traitname
    const traitPattern = /@?(\w+)/g;
    const matches = response.matchAll(traitPattern);
    const seen = new Set<string>();

    for (const match of matches) {
      const trait = match[1].toLowerCase();
      if (seen.has(trait)) continue;
      seen.add(trait);

      // Only include known HoloScript traits
      if (this.isKnownTrait(trait)) {
        suggestions.push({
          label: `@${trait}`,
          kind: CompletionItemKind.Interface,
          detail: 'AI Suggested Trait',
          insertText: trait,
          documentation: {
            kind: MarkupKind.Markdown,
            value: this.getTraitDescription(trait),
          },
          sortText: `00_ai_${suggestions.length}`,
        });
      }
    }

    return suggestions.slice(0, this.config.maxCompletions);
  }

  /**
   * Parse code generation suggestion
   */
  private parseCodeGenSuggestion(response: string, context: CompletionContext): CompletionItem[] {
    // Extract code blocks from response
    const codeBlockPattern = /```(?:hsplus|hs|holo)?\s*([\s\S]*?)```/g;
    const matches = [...response.matchAll(codeBlockPattern)];

    if (matches.length === 0) {
      // Try to use the whole response as code
      const code = response.trim();
      if (code.length > 0 && code.length < 2000) {
        return [
          {
            label: '✨ Generated Code',
            kind: CompletionItemKind.Snippet,
            detail: 'AI Generated from comment',
            insertText: code,
            insertTextFormat: InsertTextFormat.Snippet,
            documentation: {
              kind: MarkupKind.Markdown,
              value: `Generated from: "${context.comment}"\n\n\`\`\`hsplus\n${code}\n\`\`\``,
            },
            sortText: '00_ai_codegen',
          },
        ];
      }
      return [];
    }

    return matches
      .map((match, index) => ({
        label: `✨ Generated Code ${index + 1}`,
        kind: CompletionItemKind.Snippet,
        detail: 'AI Generated from comment',
        insertText: match[1].trim(),
        insertTextFormat: InsertTextFormat.Snippet,
        documentation: {
          kind: MarkupKind.Markdown,
          value: `Generated from: "${context.comment}"`,
        },
        sortText: `00_ai_codegen_${index}`,
      }))
      .slice(0, this.config.maxCompletions);
  }

  /**
   * Parse property suggestions
   */
  private parsePropertySuggestions(response: string): CompletionItem[] {
    const suggestions: CompletionItem[] = [];

    // Look for property: value patterns
    const propPattern = /(\w+):\s*(.+)/g;
    const matches = response.matchAll(propPattern);

    for (const match of matches) {
      const [, name, value] = match;
      suggestions.push({
        label: name,
        kind: CompletionItemKind.Property,
        detail: `AI Suggestion: ${value.trim()}`,
        insertText: `${name}: ${value.trim()}`,
        sortText: `00_ai_${suggestions.length}`,
      });
    }

    return suggestions.slice(0, this.config.maxCompletions);
  }

  /**
   * Parse event suggestions
   */
  private parseEventSuggestions(response: string): CompletionItem[] {
    const suggestions: CompletionItem[] = [];

    // Look for event handler patterns
    const eventPattern = /(on\w+|on_\w+)/gi;
    const matches = response.matchAll(eventPattern);
    const seen = new Set<string>();

    for (const match of matches) {
      const event = match[1];
      if (seen.has(event.toLowerCase())) continue;
      seen.add(event.toLowerCase());

      suggestions.push({
        label: event,
        kind: CompletionItemKind.Event,
        detail: 'AI Suggested Event',
        insertText: `${event}: {\n  $0\n}`,
        insertTextFormat: InsertTextFormat.Snippet,
        sortText: `00_ai_${suggestions.length}`,
      });
    }

    return suggestions.slice(0, this.config.maxCompletions);
  }

  /**
   * Parse general suggestions
   */
  private parseGeneralSuggestions(response: string): CompletionItem[] {
    // For general suggestions, just extract any reasonable code snippets
    const suggestions: CompletionItem[] = [];

    const lines = response.split('\n').filter((l) => l.trim().length > 0);

    for (const line of lines.slice(0, this.config.maxCompletions)) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        continue; // Skip markdown list items
      }

      suggestions.push({
        label: trimmed.slice(0, 40) + (trimmed.length > 40 ? '...' : ''),
        kind: CompletionItemKind.Text,
        detail: 'AI Suggestion',
        insertText: trimmed,
        sortText: `00_ai_${suggestions.length}`,
      });
    }

    return suggestions;
  }

  /**
   * Parse error fix suggestions
   */
  private parseErrorFixSuggestions(
    response: string,
    _context: CompletionContext
  ): CompletionItem[] {
    const codePattern = /```(?:hsplus|hs|holo)?\s*([\s\S]*?)```/g;
    const matches = [...response.matchAll(codePattern)];

    if (matches.length > 0) {
      return matches
        .map((match, index) => ({
          label: `🔧 Fix ${index + 1}`,
          kind: CompletionItemKind.Snippet,
          detail: 'AI Suggested Fix',
          insertText: match[1].trim(),
          insertTextFormat: InsertTextFormat.Snippet,
          sortText: `00_fix_${index}`,
        }))
        .slice(0, 3);
    }

    return [];
  }

  /**
   * Check if a trait name is known
   */
  private isKnownTrait(name: string): boolean {
    const knownTraits = [
      'grabbable',
      'throwable',
      'holdable',
      'clickable',
      'hoverable',
      'draggable',
      'pointable',
      'scalable',
      'collidable',
      'physics',
      'rigid',
      'kinematic',
      'trigger',
      'gravity',
      'glowing',
      'emissive',
      'transparent',
      'reflective',
      'animated',
      'billboard',
      'networked',
      'synced',
      'persistent',
      'owned',
      'host_only',
      'stackable',
      'attachable',
      'equippable',
      'consumable',
      'destructible',
      'anchor',
      'tracked',
      'world_locked',
      'hand_tracked',
      'eye_tracked',
      'spatial_audio',
      'ambient',
      'voice_activated',
      'state',
      'reactive',
      'observable',
      'computed',
    ];

    return knownTraits.includes(name);
  }

  /**
   * Get trait description
   */
  private getTraitDescription(trait: string): string {
    const descriptions: Record<string, string> = {
      grabbable: 'Allows the object to be grabbed in VR',
      throwable: 'Object can be thrown when released',
      collidable: 'Enables physics collisions',
      physics: 'Adds physics simulation',
      networked: 'Syncs object across network',
      animated: 'Supports animations',
      pointable: 'Can be pointed at with controllers',
    };

    return descriptions[trait] ?? `The @${trait} trait`;
  }

  /**
   * Hash context for caching
   */
  private hashContext(context: CompletionContext): string {
    const key = `${context.type}:${context.linePrefix}:${context.objectType ?? ''}:${context.existingTraits?.join(',')}`;
    return key;
  }

  /**
   * Get from cache
   */
  private getFromCache(hash: string): CompletionItem[] | null {
    const entry = this.cache.get(hash);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.config.cacheTTL) {
      this.cache.delete(hash);
      return null;
    }

    return entry.completions;
  }

  /**
   * Set cache
   */
  private setCache(hash: string, completions: CompletionItem[]): void {
    this.cache.set(hash, {
      completions,
      timestamp: Date.now(),
      contextHash: hash,
    });

    // Limit cache size
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache.clear();
  }
}
