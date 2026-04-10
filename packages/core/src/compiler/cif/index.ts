/**
 * Canonical Intermediate Format (CIF) — Module Barrel
 *
 * Model-agnostic intermediate representation for agent prompts with
 * model-specific renderers for Claude, GPT, and Gemini.
 *
 * @module @holoscript/core/compiler/cif
 * @version 1.0.0
 */

// Core CIF types and builder
export {
  // Types
  type CIFSectionKind,
  type CIFPriority,
  type CIFSection,
  type CIFTargetModel,
  type CIFDocument,

  // Builder
  CIFBuilder,
} from './CanonicalIntermediateFormat';

// Renderers
export {
  // Types
  type RenderedPrompt,
  type ICIFRenderer,

  // Model-specific renderers
  ClaudeRenderer,
  GPTRenderer,
  GeminiRenderer,
  GenericRenderer,

  // Registry
  CIFRendererRegistry,
  getCIFRendererRegistry,
  resetCIFRendererRegistry,
} from './CIFRenderer';
