/**
 * Graph Grammar Rule System
 *
 * Exposes HoloScript composition rules as recursively expandable
 * grammar nodes for procedural world generation.
 *
 * @module grammar
 * @version 1.0.0
 */

export {
  // Core types
  NodeType,
  type GrammarNode,
  type NodeTransform,
  type ProductionRule,
  type ExpansionContext,
  type ExpansionOptions,
  type ExpansionResult,

  // Engine
  GraphGrammar,

  // Factory functions
  createNonTerminal,
  createTerminal,
  createAnchor,
  resetNodeIdCounter,

  // HoloScript mapping
  compositionToRule,
  templateToRule,

  // Built-in presets
  createVillageGrammar,
  createDungeonGrammar,
} from './GraphGrammar';
