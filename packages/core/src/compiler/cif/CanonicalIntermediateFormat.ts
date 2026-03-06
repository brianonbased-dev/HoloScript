/**
 * Canonical Intermediate Format (CIF)
 *
 * A model-agnostic intermediate representation for agent prompts that
 * decouples HoloScript's internal agent definition from any specific LLM
 * provider's prompt format.  The CIF captures the *semantic intent* of an
 * agent's instructions so that model-specific renderers can produce
 * optimally-structured prompts for Claude, GPT, Gemini, or any future model.
 *
 * Design principles:
 *  - Pure data: no runtime/DOM/network dependencies.
 *  - Serializable to JSON (can travel over the wire or persist to disk).
 *  - Extensible via `metadata` bags on every node.
 *  - Cultural-profile-aware: each CIF document carries the agent's
 *    cultural dimensions so renderers can adjust dialect, tone, and
 *    cooperative framing automatically.
 *
 * Architecture:
 *  1. **CIFDocument** — top-level container produced by the compiler
 *  2. **CIFSection**  — ordered list of semantic sections (system, persona,
 *     context, instructions, constraints, examples, output_format)
 *  3. **CIFRenderer** — abstract interface implemented per model dialect
 *
 * @module CIF
 * @version 1.0.0
 */

import type { CulturalFamily, PromptDialect } from '../../traits/CultureTraits';
import type { CulturalProfileMetadata } from '../identity/AgentIdentity';

// =============================================================================
// CIF SECTION TYPES
// =============================================================================

/**
 * Semantic section kinds that a CIF document can contain.
 *
 * Each kind maps to a well-known prompt engineering concept so that
 * renderers know *where* to place the content in the final prompt.
 */
export type CIFSectionKind =
  | 'system'          // Top-level system instructions / preamble
  | 'persona'         // Agent identity, personality, cultural profile
  | 'context'         // Background knowledge, world state, memory
  | 'instructions'    // Task-specific directives
  | 'constraints'     // Guardrails, restrictions, safety rules
  | 'examples'        // Few-shot examples / demonstrations
  | 'output_format'   // Expected response structure (JSON schema, markdown, etc.)
  | 'tools'           // Tool/function definitions available to the agent
  | 'delegation'      // Multi-agent delegation / handoff instructions
  | 'cultural';       // Explicit cultural norms and cooperation parameters

/**
 * Priority level for a section.
 * Renderers MAY use this to decide ordering or emphasis.
 */
export type CIFPriority = 'critical' | 'high' | 'normal' | 'low' | 'optional';

/**
 * A single semantic section within a CIF document.
 */
export interface CIFSection {
  /** Section kind (determines placement in rendered prompt) */
  kind: CIFSectionKind;

  /** Human-readable label for debugging / inspection */
  label: string;

  /**
   * Section content.  Renderers interpret this based on `kind`:
   * - string: plain text / markdown
   * - object: structured data (e.g., JSON schema for output_format)
   * - array:  list of examples, tools, or sub-instructions
   */
  content: string | Record<string, unknown> | unknown[];

  /** Priority (affects ordering and emphasis in rendered prompt) */
  priority: CIFPriority;

  /** Optional metadata (renderer-specific hints, provenance, etc.) */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// CIF DOCUMENT
// =============================================================================

/**
 * Target model family for rendering.
 */
export type CIFTargetModel = 'claude' | 'gpt' | 'gemini' | 'generic';

/**
 * The top-level Canonical Intermediate Format document.
 *
 * Produced by the HoloScript compiler from a parsed composition and
 * consumed by a model-specific `CIFRenderer` to generate the final prompt.
 */
export interface CIFDocument {
  /** CIF format version (semver) */
  version: '1.0.0';

  /** Agent identifier (matches AgentConfig.name) */
  agentId: string;

  /** Agent role in the compilation pipeline */
  agentRole: string;

  /**
   * Cultural profile metadata.
   * Renderers use this to adjust dialect, cooperative framing, and
   * communication style automatically.
   */
  culturalProfile?: CulturalProfileMetadata;

  /**
   * Ordered list of semantic sections.
   * Renderers iterate this list and translate each section into the
   * target model's native format.
   */
  sections: CIFSection[];

  /**
   * Preferred target model (hint for renderer selection).
   * Defaults to 'generic' if not specified.
   */
  targetModel?: CIFTargetModel;

  /**
   * Top-level metadata (compilation context, timestamps, etc.)
   */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// CIF BUILDER
// =============================================================================

/**
 * Fluent builder for constructing CIF documents.
 *
 * Example:
 * ```typescript
 * const doc = new CIFBuilder('navigator', 'code_generator')
 *   .withCulturalProfile({ cooperation_index: 0.8, cultural_family: 'cooperative', prompt_dialect: 'directive' })
 *   .addSystem('You are a spatial computing agent.')
 *   .addPersona('Navigator — explores virtual worlds and maps terrain.')
 *   .addInstructions('Generate a navigation mesh for the given scene.')
 *   .addConstraints('Never modify existing geometry. Respect zone boundaries.')
 *   .addOutputFormat({ type: 'object', properties: { mesh: { type: 'string' } } })
 *   .build();
 * ```
 */
export class CIFBuilder {
  private sections: CIFSection[] = [];
  private culturalProfile?: CulturalProfileMetadata;
  private targetModel?: CIFTargetModel;
  private docMetadata?: Record<string, unknown>;

  constructor(
    private readonly agentId: string,
    private readonly agentRole: string,
  ) {}

  // ---- Cultural profile ----

  withCulturalProfile(profile: CulturalProfileMetadata): this {
    this.culturalProfile = profile;
    return this;
  }

  // ---- Target model ----

  forModel(model: CIFTargetModel): this {
    this.targetModel = model;
    return this;
  }

  // ---- Metadata ----

  withMetadata(metadata: Record<string, unknown>): this {
    this.docMetadata = metadata;
    return this;
  }

  // ---- Section helpers ----

  addSection(section: CIFSection): this {
    this.sections.push(section);
    return this;
  }

  addSystem(content: string, priority: CIFPriority = 'critical'): this {
    return this.addSection({ kind: 'system', label: 'System', content, priority });
  }

  addPersona(content: string, priority: CIFPriority = 'high'): this {
    return this.addSection({ kind: 'persona', label: 'Persona', content, priority });
  }

  addContext(content: string, priority: CIFPriority = 'normal'): this {
    return this.addSection({ kind: 'context', label: 'Context', content, priority });
  }

  addInstructions(content: string, priority: CIFPriority = 'high'): this {
    return this.addSection({ kind: 'instructions', label: 'Instructions', content, priority });
  }

  addConstraints(content: string, priority: CIFPriority = 'high'): this {
    return this.addSection({ kind: 'constraints', label: 'Constraints', content, priority });
  }

  addExamples(examples: unknown[], priority: CIFPriority = 'normal'): this {
    return this.addSection({ kind: 'examples', label: 'Examples', content: examples, priority });
  }

  addOutputFormat(schema: Record<string, unknown>, priority: CIFPriority = 'normal'): this {
    return this.addSection({ kind: 'output_format', label: 'Output Format', content: schema, priority });
  }

  addTools(tools: unknown[], priority: CIFPriority = 'normal'): this {
    return this.addSection({ kind: 'tools', label: 'Tools', content: tools, priority });
  }

  addDelegation(content: string, priority: CIFPriority = 'normal'): this {
    return this.addSection({ kind: 'delegation', label: 'Delegation', content, priority });
  }

  addCultural(content: string, priority: CIFPriority = 'normal'): this {
    return this.addSection({ kind: 'cultural', label: 'Cultural Norms', content, priority });
  }

  // ---- Build ----

  build(): CIFDocument {
    return {
      version: '1.0.0',
      agentId: this.agentId,
      agentRole: this.agentRole,
      culturalProfile: this.culturalProfile,
      sections: [...this.sections],
      targetModel: this.targetModel,
      metadata: this.docMetadata,
    };
  }
}
