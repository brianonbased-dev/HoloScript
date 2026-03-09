/**
 * Trait Recommendation Provider for HoloScript LSP
 *
 * Provides context-aware trait completion suggestions based on the
 * composition's metadata.category and metadata.tags. When a user types
 * `@` inside an object block, this provider consults the trait-vertical
 * mappings to recommend traits that are most relevant to the current
 * industry vertical.
 *
 * Recommendations are ranked by relevance to the detected vertical and
 * include documentation snippets showing trait config properties.
 */

import { CompletionItem, CompletionItemKind, MarkupKind } from 'vscode-languageserver/node.js';

import type { TextDocument } from 'vscode-languageserver-textdocument';

import {
  getVerticalById,
  findVerticalsByTags,
  type VerticalMapping,
  type TraitRecommendation,
} from '../data/trait-vertical-mappings.js';

import { getTraitDoc, formatTraitDocCompact } from '../traitDocs.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CompositionContext {
  /** The detected category from metadata.category (e.g., "healthcare") */
  category: string | null;
  /** Tags from metadata.tags (e.g., ["medical", "training"]) */
  tags: string[];
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class TraitRecommendationProvider {
  /**
   * Get trait recommendation completions based on document context.
   *
   * @param document - The current text document
   * @param linePrefix - The text from the start of the line up to the cursor
   * @returns Completion items ranked by vertical relevance
   */
  public getRecommendations(document: TextDocument, linePrefix: string): CompletionItem[] {
    // Only trigger on @ inside an indented context (object block)
    if (!this.shouldProvideRecommendations(linePrefix)) {
      return [];
    }

    const text = document.getText();
    const context = this.extractCompositionContext(text);

    // If we cannot determine a vertical, return empty (let other providers handle it)
    if (!context.category && context.tags.length === 0) {
      return [];
    }

    // Resolve vertical mappings
    const verticals = this.resolveVerticals(context);
    if (verticals.length === 0) {
      return [];
    }

    // Extract the partial trait name the user has typed after @
    const partialMatch = linePrefix.match(/@(\w*)$/);
    const partial = partialMatch ? partialMatch[1].toLowerCase() : '';

    // Build completion items from the best-matching vertical(s)
    return this.buildCompletionItems(verticals, partial);
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  /**
   * Determine whether the cursor position is eligible for trait recommendations.
   * We trigger when the user types @ inside an indented block (not at top level).
   */
  private shouldProvideRecommendations(linePrefix: string): boolean {
    // Must be inside an indented block and typing a trait (@)
    return /^\s+.*@\w*$/.test(linePrefix);
  }

  /**
   * Extract metadata.category and metadata.tags from the document text.
   *
   * Parses the composition source for patterns like:
   *   metadata {
   *     category: "healthcare"
   *     tags: ["medical", "training"]
   *   }
   *
   * Also handles inline forms:
   *   metadata: { category: "gaming", tags: ["rpg", "multiplayer"] }
   *
   * And composition-level annotations:
   *   composition "MyScene" {
   *     category: "education"
   *   }
   */
  public extractCompositionContext(text: string): CompositionContext {
    const context: CompositionContext = {
      category: null,
      tags: [],
    };

    // Strategy 1: Look for metadata block with category
    const categoryPatterns = [
      // metadata { category: "healthcare" }
      /(?:metadata|composition)\s*(?:"[^"]*"\s*)?\{[^}]*?category\s*:\s*"([^"]+)"/s,
      // category: "healthcare" at any nesting level
      /\bcategory\s*:\s*"([^"]+)"/,
    ];

    for (const pattern of categoryPatterns) {
      const match = text.match(pattern);
      if (match) {
        context.category = match[1].toLowerCase().trim();
        break;
      }
    }

    // Strategy 2: Look for tags array
    const tagsPatterns = [
      // tags: ["medical", "training"]
      /\btags\s*:\s*\[([^\]]*)\]/,
    ];

    for (const pattern of tagsPatterns) {
      const match = text.match(pattern);
      if (match) {
        const rawTags = match[1];
        // Parse individual tag strings
        const tagMatches = rawTags.matchAll(/"([^"]+)"/g);
        for (const tagMatch of tagMatches) {
          context.tags.push(tagMatch[1].toLowerCase().trim());
        }
        break;
      }
    }

    // Strategy 3: Infer from world_metadata block
    if (!context.category) {
      const worldMetaMatch = text.match(/@world_metadata\s*\{[^}]*?category\s*:\s*"([^"]+)"/s);
      if (worldMetaMatch) {
        context.category = worldMetaMatch[1].toLowerCase().trim();
      }
    }

    // Strategy 4: Infer from composition name if it contains vertical keywords
    if (!context.category && context.tags.length === 0) {
      const compositionNameMatch = text.match(/composition\s+"([^"]+)"/);
      if (compositionNameMatch) {
        const name = compositionNameMatch[1].toLowerCase();
        // Check if the composition name contains any vertical-related keywords
        const verticalKeywords: Record<string, string> = {
          medical: 'healthcare',
          hospital: 'healthcare',
          clinic: 'healthcare',
          school: 'education',
          classroom: 'education',
          lesson: 'education',
          store: 'retail',
          shop: 'retail',
          product: 'retail',
          game: 'gaming',
          arena: 'gaming',
          battle: 'gaming',
          building: 'architecture',
          house: 'architecture',
          room: 'architecture',
          factory: 'manufacturing',
          assembly: 'manufacturing',
          concert: 'entertainment',
          show: 'entertainment',
          theater: 'entertainment',
          tour: 'tourism',
          museum: 'art',
          gallery: 'art',
          car: 'automotive',
          vehicle: 'automotive',
          flight: 'aerospace',
          cockpit: 'aerospace',
          property: 'real-estate',
          apartment: 'real-estate',
          gym: 'fitness',
          workout: 'fitness',
          social: 'social',
          lounge: 'social',
          meetup: 'social',
          robot: 'robotics',
          sensor: 'robotics',
          drone: 'robotics',
        };

        for (const [keyword, vertical] of Object.entries(verticalKeywords)) {
          if (name.includes(keyword)) {
            context.category = vertical;
            break;
          }
        }
      }
    }

    return context;
  }

  /**
   * Resolve which verticals match the extracted context.
   * Category match takes priority, then tags are used as fallback.
   */
  private resolveVerticals(context: CompositionContext): VerticalMapping[] {
    const verticals: VerticalMapping[] = [];

    // Primary: exact category match
    if (context.category) {
      const byCategory = getVerticalById(context.category);
      if (byCategory) {
        verticals.push(byCategory);
      }
    }

    // Secondary: tag-based matching (may add additional verticals)
    if (context.tags.length > 0) {
      const byTags = findVerticalsByTags(context.tags);
      for (const v of byTags) {
        if (!verticals.some((existing) => existing.id === v.id)) {
          verticals.push(v);
        }
      }
    }

    // If category didn't match by ID, try matching via tags
    if (verticals.length === 0 && context.category) {
      const byTags = findVerticalsByTags([context.category]);
      verticals.push(...byTags);
    }

    return verticals;
  }

  /**
   * Build ranked CompletionItem[] from resolved verticals.
   *
   * Traits from the primary vertical get the highest sort priority.
   * If a partial match is provided, items are filtered to match.
   */
  private buildCompletionItems(verticals: VerticalMapping[], partial: string): CompletionItem[] {
    const items: CompletionItem[] = [];
    const seenTraits = new Set<string>();

    for (let vIdx = 0; vIdx < verticals.length; vIdx++) {
      const vertical = verticals[vIdx];

      for (let tIdx = 0; tIdx < vertical.traits.length; tIdx++) {
        const rec = vertical.traits[tIdx];
        const traitName = rec.trait.replace(/^@/, '');

        // Skip duplicates across verticals
        if (seenTraits.has(traitName)) continue;

        // Filter by partial match
        if (partial && !traitName.startsWith(partial)) continue;

        seenTraits.add(traitName);

        const item = this.createCompletionItem(rec, vertical, vIdx, tIdx);
        items.push(item);
      }
    }

    return items;
  }

  /**
   * Create a single CompletionItem for a trait recommendation.
   */
  private createCompletionItem(
    rec: TraitRecommendation,
    vertical: VerticalMapping,
    verticalIndex: number,
    traitIndex: number
  ): CompletionItem {
    const traitName = rec.trait.replace(/^@/, '');
    const relevancePercent = Math.round(rec.relevance * 100);

    // Build documentation markdown
    const docParts: string[] = [];

    // Header with relevance badge
    docParts.push(`**${rec.trait}** -- ${relevancePercent}% relevant for ${vertical.displayName}`);
    docParts.push('');

    // Rationale
    docParts.push(rec.rationale);
    docParts.push('');

    // Config hint
    docParts.push('**Suggested config:**');
    docParts.push('```holoscript');
    docParts.push(`${rec.trait}({ ${rec.configHint} })`);
    docParts.push('```');

    // Append full trait docs if available
    const traitDoc = getTraitDoc(traitName);
    if (traitDoc) {
      docParts.push('');
      docParts.push('---');
      docParts.push('');
      docParts.push(formatTraitDocCompact(traitDoc));
    }

    // Sort text ensures:
    //   - Primary vertical traits sort before secondary
    //   - Within a vertical, higher relevance sorts first
    //   - Pad indices to maintain stable ordering
    const sortKey = `01_rec_${String(verticalIndex).padStart(2, '0')}_${String(traitIndex).padStart(2, '0')}`;

    return {
      label: rec.trait,
      kind: CompletionItemKind.Interface,
      detail: `${vertical.displayName} (${relevancePercent}% match)`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: docParts.join('\n'),
      },
      insertText: traitName,
      sortText: sortKey,
      data: {
        isRecommendation: true,
        vertical: vertical.id,
        relevance: rec.relevance,
      },
    };
  }
}
