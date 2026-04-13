/**
 * CIF Renderers — Model-Specific Prompt Generation
 *
 * Transforms a model-agnostic CIFDocument into prompt strings optimized
 * for specific LLM families: Claude (Anthropic), GPT (OpenAI), and
 * Gemini (Google).
 *
 * Each renderer respects the agent's `culturalProfile` to adjust:
 * - Dialect/tone (directive, socratic, narrative, etc.)
 * - Cooperative framing (cooperation_index)
 * - Cultural family conventions
 *
 * Design:
 *  - Pure functions over data (no side effects, no I/O).
 *  - Each renderer returns a `RenderedPrompt` containing the prompt
 *    text and model-specific metadata.
 *  - The `CIFRendererRegistry` dispatches to the correct renderer
 *    based on `CIFDocument.targetModel`.
 *
 * @module CIF/Renderer
 * @version 1.0.0
 */

import type {
  CIFDocument,
  CIFSection,
  CIFSectionKind,
  CIFTargetModel,
  CIFPriority,
} from './CanonicalIntermediateFormat';
import type { CulturalProfileMetadata } from '@holoscript/platform';

// =============================================================================
// RENDERED PROMPT
// =============================================================================

/**
 * A rendered prompt ready to send to an LLM.
 */
export interface RenderedPrompt {
  /** The final prompt text (system message or full prompt) */
  systemPrompt: string;

  /** Optional user/human message (for chat-style APIs) */
  userPrompt?: string;

  /** Target model family */
  targetModel: CIFTargetModel;

  /** Model-specific metadata (e.g., stop sequences, temperature hints) */
  modelHints?: Record<string, unknown>;

  /** Sections that were rendered (for debugging / audit) */
  renderedSections: CIFSectionKind[];
}

// =============================================================================
// RENDERER INTERFACE
// =============================================================================

/**
 * Abstract renderer interface.
 * Each model dialect implements this to produce optimally-structured prompts.
 */
export interface ICIFRenderer {
  /** Model family this renderer targets */
  readonly targetModel: CIFTargetModel;

  /**
   * Render a CIF document into a model-specific prompt.
   *
   * @param document - The CIF document to render
   * @returns A rendered prompt ready for the target model
   */
  render(document: CIFDocument): RenderedPrompt;
}

// =============================================================================
// SHARED UTILITIES
// =============================================================================

/**
 * Sort sections by priority order: critical > high > normal > low > optional.
 */
const PRIORITY_ORDER: Record<CIFPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
  optional: 4,
};

function sortByPriority(sections: CIFSection[]): CIFSection[] {
  return [...sections].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

/**
 * Filter sections by kind.
 */
function sectionsOfKind(sections: CIFSection[], kind: CIFSectionKind): CIFSection[] {
  return sections.filter((s) => s.kind === kind);
}

/**
 * Stringify section content for rendering.
 */
function contentToString(content: string | Record<string, unknown> | unknown[]): string {
  if (typeof content === 'string') return content;
  return JSON.stringify(content, null, 2);
}

/**
 * Generate a cultural framing preamble based on the cultural profile.
 * This is inserted into the persona section to guide the agent's
 * communication style.
 */
function culturalPreamble(profile: CulturalProfileMetadata): string {
  const lines: string[] = [];

  // Cooperation framing
  if (profile.cooperation_index >= 0.8) {
    lines.push(
      'You are a highly cooperative agent. Always seek consensus, share information freely, and prioritize team goals over individual achievement.'
    );
  } else if (profile.cooperation_index >= 0.5) {
    lines.push(
      'You balance cooperation with independent judgment. Collaborate when beneficial, but maintain your own perspective and priorities.'
    );
  } else if (profile.cooperation_index >= 0.2) {
    lines.push(
      'You operate independently and prioritize your own objectives. Cooperate selectively when it serves your goals.'
    );
  } else {
    lines.push(
      'You are a competitive agent. Pursue your objectives assertively and independently.'
    );
  }

  // Cultural family framing
  const familyDescriptions: Record<string, string> = {
    cooperative:
      'You follow cooperative protocols: mutual aid, shared goals, and consensus-seeking.',
    competitive:
      'You follow competitive protocols: individual achievement, performance ranking, and resource optimization.',
    hierarchical:
      'You follow hierarchical protocols: respect chain of command, delegate tasks, and report upward.',
    egalitarian:
      'You follow egalitarian protocols: equal voice for all, collective decision-making, and flat authority.',
    isolationist:
      'You follow isolationist protocols: self-sufficiency, minimal external interaction, and independent operation.',
    mercantile:
      'You follow mercantile protocols: value-based exchange, explicit contracts, and fair trade.',
    exploratory:
      'You follow exploratory protocols: discovery-driven, knowledge-seeking, and adaptive problem-solving.',
    ritualistic:
      'You follow ritualistic protocols: tradition-preserving, ceremony-driven, and pattern-following.',
  };
  if (familyDescriptions[profile.cultural_family]) {
    lines.push(familyDescriptions[profile.cultural_family]);
  }

  // Prompt dialect framing
  const dialectHints: Record<string, string> = {
    directive: 'Communicate using clear, imperative directives. Be concise and action-oriented.',
    socratic:
      'Communicate using questions and guided reasoning. Encourage exploration through inquiry.',
    narrative:
      'Communicate using narrative framing. Contextualize tasks within a story or scenario.',
    structured:
      'Communicate using structured data formats. Prefer schemas, lists, and explicit key-value pairs.',
    consensus:
      'Communicate using proposal-based dialogue. Suggest actions and seek agreement before proceeding.',
    reactive:
      'Communicate using event-response patterns. Define triggers and corresponding actions.',
  };
  if (dialectHints[profile.prompt_dialect]) {
    lines.push(dialectHints[profile.prompt_dialect]);
  }

  return lines.join('\n');
}

// =============================================================================
// CLAUDE RENDERER
// =============================================================================

/**
 * Renderer optimized for Anthropic Claude models.
 *
 * Claude prompt conventions:
 * - System prompt is a dedicated parameter (not embedded in conversation)
 * - Uses XML-style tags for structured sections
 * - Supports tool use via dedicated tool definitions
 * - Prefers explicit, well-structured instructions
 * - Cultural profile maps to persona/system framing
 */
export class ClaudeRenderer implements ICIFRenderer {
  readonly targetModel: CIFTargetModel = 'claude';

  render(document: CIFDocument): RenderedPrompt {
    const sorted = sortByPriority(document.sections);
    const parts: string[] = [];
    const rendered: CIFSectionKind[] = [];

    // System sections first (Claude uses a dedicated system prompt)
    for (const section of sectionsOfKind(sorted, 'system')) {
      parts.push(contentToString(section.content));
      rendered.push('system');
    }

    // Persona with cultural framing
    const personaSections = sectionsOfKind(sorted, 'persona');
    if (personaSections.length > 0 || document.culturalProfile) {
      parts.push('');
      if (document.culturalProfile) {
        parts.push('<cultural-identity>');
        parts.push(culturalPreamble(document.culturalProfile));
        parts.push('</cultural-identity>');
        parts.push('');
        rendered.push('cultural');
      }
      for (const section of personaSections) {
        parts.push('<persona>');
        parts.push(contentToString(section.content));
        parts.push('</persona>');
        rendered.push('persona');
      }
    }

    // Context
    for (const section of sectionsOfKind(sorted, 'context')) {
      parts.push('');
      parts.push('<context>');
      parts.push(contentToString(section.content));
      parts.push('</context>');
      rendered.push('context');
    }

    // Instructions
    for (const section of sectionsOfKind(sorted, 'instructions')) {
      parts.push('');
      parts.push('<instructions>');
      parts.push(contentToString(section.content));
      parts.push('</instructions>');
      rendered.push('instructions');
    }

    // Constraints
    for (const section of sectionsOfKind(sorted, 'constraints')) {
      parts.push('');
      parts.push('<constraints>');
      parts.push(contentToString(section.content));
      parts.push('</constraints>');
      rendered.push('constraints');
    }

    // Examples
    for (const section of sectionsOfKind(sorted, 'examples')) {
      parts.push('');
      parts.push('<examples>');
      parts.push(contentToString(section.content));
      parts.push('</examples>');
      rendered.push('examples');
    }

    // Tools (Claude uses structured tool definitions)
    for (const section of sectionsOfKind(sorted, 'tools')) {
      parts.push('');
      parts.push('<available-tools>');
      parts.push(contentToString(section.content));
      parts.push('</available-tools>');
      rendered.push('tools');
    }

    // Delegation
    for (const section of sectionsOfKind(sorted, 'delegation')) {
      parts.push('');
      parts.push('<delegation-protocol>');
      parts.push(contentToString(section.content));
      parts.push('</delegation-protocol>');
      rendered.push('delegation');
    }

    // Cultural norms
    for (const section of sectionsOfKind(sorted, 'cultural')) {
      parts.push('');
      parts.push('<cultural-norms>');
      parts.push(contentToString(section.content));
      parts.push('</cultural-norms>');
      rendered.push('cultural');
    }

    // Output format
    for (const section of sectionsOfKind(sorted, 'output_format')) {
      parts.push('');
      parts.push('<output-format>');
      parts.push(contentToString(section.content));
      parts.push('</output-format>');
      rendered.push('output_format');
    }

    return {
      systemPrompt: parts.join('\n'),
      targetModel: 'claude',
      renderedSections: rendered,
      modelHints: {
        supportsXMLTags: true,
        supportsToolUse: true,
        preferredMaxTokens: 4096,
      },
    };
  }
}

// =============================================================================
// GPT RENDERER
// =============================================================================

/**
 * Renderer optimized for OpenAI GPT models.
 *
 * GPT prompt conventions:
 * - System message is a separate role in the chat array
 * - Uses markdown headers for section separation
 * - Function calling via `functions` / `tools` parameter
 * - Prefers natural language with clear markdown structure
 * - Cultural profile maps to "personality" framing
 */
export class GPTRenderer implements ICIFRenderer {
  readonly targetModel: CIFTargetModel = 'gpt';

  render(document: CIFDocument): RenderedPrompt {
    const sorted = sortByPriority(document.sections);
    const parts: string[] = [];
    const rendered: CIFSectionKind[] = [];

    // System sections
    for (const section of sectionsOfKind(sorted, 'system')) {
      parts.push(contentToString(section.content));
      rendered.push('system');
    }

    // Persona with cultural framing (GPT uses markdown headers)
    if (document.culturalProfile) {
      parts.push('');
      parts.push('## Cultural Identity');
      parts.push(culturalPreamble(document.culturalProfile));
      rendered.push('cultural');
    }

    for (const section of sectionsOfKind(sorted, 'persona')) {
      parts.push('');
      parts.push('## Persona');
      parts.push(contentToString(section.content));
      rendered.push('persona');
    }

    // Context
    for (const section of sectionsOfKind(sorted, 'context')) {
      parts.push('');
      parts.push('## Context');
      parts.push(contentToString(section.content));
      rendered.push('context');
    }

    // Instructions
    for (const section of sectionsOfKind(sorted, 'instructions')) {
      parts.push('');
      parts.push('## Instructions');
      parts.push(contentToString(section.content));
      rendered.push('instructions');
    }

    // Constraints
    for (const section of sectionsOfKind(sorted, 'constraints')) {
      parts.push('');
      parts.push('## Constraints');
      parts.push(contentToString(section.content));
      rendered.push('constraints');
    }

    // Examples
    for (const section of sectionsOfKind(sorted, 'examples')) {
      parts.push('');
      parts.push('## Examples');
      parts.push(contentToString(section.content));
      rendered.push('examples');
    }

    // Tools (GPT uses function calling — tools are extracted as metadata)
    const toolSections = sectionsOfKind(sorted, 'tools');
    const toolDefinitions: unknown[] = [];
    for (const section of toolSections) {
      if (Array.isArray(section.content)) {
        toolDefinitions.push(...section.content);
      } else {
        toolDefinitions.push(section.content);
      }
      rendered.push('tools');
    }

    // Delegation
    for (const section of sectionsOfKind(sorted, 'delegation')) {
      parts.push('');
      parts.push('## Delegation Protocol');
      parts.push(contentToString(section.content));
      rendered.push('delegation');
    }

    // Cultural norms
    for (const section of sectionsOfKind(sorted, 'cultural')) {
      parts.push('');
      parts.push('## Cultural Norms');
      parts.push(contentToString(section.content));
      rendered.push('cultural');
    }

    // Output format
    for (const section of sectionsOfKind(sorted, 'output_format')) {
      parts.push('');
      parts.push('## Output Format');
      parts.push(contentToString(section.content));
      rendered.push('output_format');
    }

    return {
      systemPrompt: parts.join('\n'),
      targetModel: 'gpt',
      renderedSections: rendered,
      modelHints: {
        supportsMarkdown: true,
        supportsFunctionCalling: true,
        toolDefinitions: toolDefinitions.length > 0 ? toolDefinitions : undefined,
        preferredMaxTokens: 4096,
      },
    };
  }
}

// =============================================================================
// GEMINI RENDERER
// =============================================================================

/**
 * Renderer optimized for Google Gemini models.
 *
 * Gemini prompt conventions:
 * - System instruction is a top-level parameter
 * - Uses structured, labeled blocks with clear delimiters
 * - Supports function declarations via tools parameter
 * - Prefers role-based framing with explicit capability declarations
 * - Cultural profile maps to "behavioral guidelines"
 */
export class GeminiRenderer implements ICIFRenderer {
  readonly targetModel: CIFTargetModel = 'gemini';

  render(document: CIFDocument): RenderedPrompt {
    const sorted = sortByPriority(document.sections);
    const parts: string[] = [];
    const rendered: CIFSectionKind[] = [];

    // System sections
    for (const section of sectionsOfKind(sorted, 'system')) {
      parts.push(contentToString(section.content));
      rendered.push('system');
    }

    // Persona with cultural framing (Gemini uses labeled blocks)
    if (document.culturalProfile) {
      parts.push('');
      parts.push('[BEHAVIORAL GUIDELINES]');
      parts.push(culturalPreamble(document.culturalProfile));
      parts.push('[END BEHAVIORAL GUIDELINES]');
      rendered.push('cultural');
    }

    for (const section of sectionsOfKind(sorted, 'persona')) {
      parts.push('');
      parts.push('[ROLE]');
      parts.push(contentToString(section.content));
      parts.push('[END ROLE]');
      rendered.push('persona');
    }

    // Context
    for (const section of sectionsOfKind(sorted, 'context')) {
      parts.push('');
      parts.push('[CONTEXT]');
      parts.push(contentToString(section.content));
      parts.push('[END CONTEXT]');
      rendered.push('context');
    }

    // Instructions
    for (const section of sectionsOfKind(sorted, 'instructions')) {
      parts.push('');
      parts.push('[TASK]');
      parts.push(contentToString(section.content));
      parts.push('[END TASK]');
      rendered.push('instructions');
    }

    // Constraints
    for (const section of sectionsOfKind(sorted, 'constraints')) {
      parts.push('');
      parts.push('[CONSTRAINTS]');
      parts.push(contentToString(section.content));
      parts.push('[END CONSTRAINTS]');
      rendered.push('constraints');
    }

    // Examples
    for (const section of sectionsOfKind(sorted, 'examples')) {
      parts.push('');
      parts.push('[EXAMPLES]');
      parts.push(contentToString(section.content));
      parts.push('[END EXAMPLES]');
      rendered.push('examples');
    }

    // Tools (Gemini uses function declarations)
    const toolSections = sectionsOfKind(sorted, 'tools');
    const functionDeclarations: unknown[] = [];
    for (const section of toolSections) {
      if (Array.isArray(section.content)) {
        functionDeclarations.push(...section.content);
      } else {
        functionDeclarations.push(section.content);
      }
      rendered.push('tools');
    }

    // Delegation
    for (const section of sectionsOfKind(sorted, 'delegation')) {
      parts.push('');
      parts.push('[DELEGATION]');
      parts.push(contentToString(section.content));
      parts.push('[END DELEGATION]');
      rendered.push('delegation');
    }

    // Cultural norms
    for (const section of sectionsOfKind(sorted, 'cultural')) {
      parts.push('');
      parts.push('[CULTURAL NORMS]');
      parts.push(contentToString(section.content));
      parts.push('[END CULTURAL NORMS]');
      rendered.push('cultural');
    }

    // Output format
    for (const section of sectionsOfKind(sorted, 'output_format')) {
      parts.push('');
      parts.push('[OUTPUT FORMAT]');
      parts.push(contentToString(section.content));
      parts.push('[END OUTPUT FORMAT]');
      rendered.push('output_format');
    }

    return {
      systemPrompt: parts.join('\n'),
      targetModel: 'gemini',
      renderedSections: rendered,
      modelHints: {
        supportsLabeledBlocks: true,
        supportsFunctionDeclarations: true,
        functionDeclarations: functionDeclarations.length > 0 ? functionDeclarations : undefined,
        preferredMaxTokens: 4096,
      },
    };
  }
}

// =============================================================================
// GENERIC RENDERER (fallback)
// =============================================================================

/**
 * Generic renderer that produces a model-agnostic prompt.
 * Uses simple section headers with horizontal rules as delimiters.
 */
export class GenericRenderer implements ICIFRenderer {
  readonly targetModel: CIFTargetModel = 'generic';

  render(document: CIFDocument): RenderedPrompt {
    const sorted = sortByPriority(document.sections);
    const parts: string[] = [];
    const rendered: CIFSectionKind[] = [];

    // Cultural preamble
    if (document.culturalProfile) {
      parts.push('--- Cultural Identity ---');
      parts.push(culturalPreamble(document.culturalProfile));
      parts.push('');
      rendered.push('cultural');
    }

    // Render all sections in priority order
    for (const section of sorted) {
      parts.push(`--- ${section.label} ---`);
      parts.push(contentToString(section.content));
      parts.push('');
      rendered.push(section.kind);
    }

    return {
      systemPrompt: parts.join('\n'),
      targetModel: 'generic',
      renderedSections: rendered,
    };
  }
}

// =============================================================================
// RENDERER REGISTRY
// =============================================================================

/**
 * Registry of CIF renderers, indexed by target model.
 *
 * Use `getRenderer()` to retrieve a renderer for a given model family,
 * or `renderDocument()` as a convenience to render in one call.
 */
export class CIFRendererRegistry {
  private renderers = new Map<CIFTargetModel, ICIFRenderer>();

  constructor() {
    // Register built-in renderers
    this.register(new ClaudeRenderer());
    this.register(new GPTRenderer());
    this.register(new GeminiRenderer());
    this.register(new GenericRenderer());
  }

  /**
   * Register a custom renderer (or override a built-in one).
   */
  register(renderer: ICIFRenderer): void {
    this.renderers.set(renderer.targetModel, renderer);
  }

  /**
   * Get a renderer for a specific model family.
   * Falls back to the generic renderer if no match is found.
   */
  getRenderer(model: CIFTargetModel): ICIFRenderer {
    return this.renderers.get(model) || this.renderers.get('generic')!;
  }

  /**
   * Render a CIF document using the appropriate renderer.
   *
   * Uses the document's `targetModel` field to select the renderer.
   * Falls back to 'generic' if no targetModel is specified.
   */
  renderDocument(document: CIFDocument): RenderedPrompt {
    const model = document.targetModel || 'generic';
    const renderer = this.getRenderer(model);
    return renderer.render(document);
  }

  /**
   * Get all registered model targets.
   */
  getRegisteredModels(): CIFTargetModel[] {
    return Array.from(this.renderers.keys());
  }
}

/**
 * Global renderer registry singleton.
 */
let globalRegistry: CIFRendererRegistry | null = null;

/**
 * Get or create the global CIF renderer registry.
 */
export function getCIFRendererRegistry(): CIFRendererRegistry {
  if (!globalRegistry) {
    globalRegistry = new CIFRendererRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global renderer registry (for testing).
 */
export function resetCIFRendererRegistry(): void {
  globalRegistry = null;
}
