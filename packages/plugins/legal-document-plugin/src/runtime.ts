/**
 * Runtime integration for @holoscript/plugin-legal-document.
 *
 * Bridges the previously dead-wired legal-document analytics solver into a
 * behavioral TraitHandler that the HoloScript runtime actually dispatches
 * (HoloScriptRuntime.registerTrait -> applyDirectives / updateTraits).
 *
 * Before this module the plugin exported real solvers (analyzeLegalDocument,
 * fleschKincaid, clauseRiskScorer, ...) but nothing invoked them THROUGH the
 * runtime — the whole domain-plugin tier was built-but-dead-wired (deep-ratchet
 * 2026-06-07). This mirrors the energy-grid `power_flow` reference integration:
 * the new `legal_analysis` trait is the legal-document analog of `power_flow`
 * (a config-driven solver with no prior behavioral handler — the existing
 * pluginMeta.traits all already have create*Handler handlers). After this call
 * the runtime's directive dispatch runs the contract analyzer for
 * `@legal_analysis` orbs.
 */
import { registerPluginTraits } from '@holoscript/core/runtime';
import {
  analyzeLegalDocument,
  type LegalAnalysisInput,
  type LegalAnalysisResult,
} from './legalsolver';

/** Plugin identity stamped onto each handler by the shared registrar. */
export const LEGAL_DOCUMENT_PLUGIN_ID = 'legal-document' as const;

/** Config carried by an orb's `@legal_analysis` trait directive. */
export interface LegalAnalysisTraitConfig {
  /** The document/contract text to analyze. Required; absence emits `legal_analysis_error`. */
  text?: string;
  /** Optional second document to compare against (token-set Jaccard similarity). */
  compareWithText?: { id: string; text: string };
}

/** Summary payload emitted on `legal_analysis_solved`. */
export interface LegalAnalysisSolvedEvent {
  nodeId: string;
  converged: boolean;
  readingGradeLevel: number;
  readingEase: number;
  difficulty: LegalAnalysisResult['readability']['difficulty'];
  riskScore: number;
  riskCategory: LegalAnalysisResult['risk']['riskCategory'];
  flaggedTerms: string[];
  obligationCount: number;
  deadlineCount: number;
  maxPenaltyExposureUSD: number;
  combinedSimilarity: number | null;
}

/**
 * Structural view of the runtime trait-handler contract. Matches
 * `@holoscript/core` TraitTypes.TraitHandler at the call sites the runtime
 * actually uses (onAttach / onUpdate receive the node, the directive config,
 * and a context exposing `emit`). Declared locally so the plugin stays
 * decoupled from core's full trait surface.
 */
export interface TraitDispatchContext {
  emit: (event: string, payload?: unknown) => void;
  setState?: (updates: Record<string, unknown>) => void;
}

export interface RuntimeTraitHandler {
  name: string;
  onAttach?: (
    node: unknown,
    config: LegalAnalysisTraitConfig,
    context: TraitDispatchContext
  ) => void;
  onUpdate?: (
    node: unknown,
    config: LegalAnalysisTraitConfig,
    context: TraitDispatchContext,
    delta: number
  ) => void;
}

interface LegalAnalysisNode {
  id?: string;
  name?: string;
  properties?: Record<string, unknown>;
  __legalAnalysisResult?: LegalAnalysisResult;
}

/** Analyze the document in `config.text`, write the result onto the node, and emit. */
function analyzeOntoNode(
  node: unknown,
  config: LegalAnalysisTraitConfig | undefined,
  context: TraitDispatchContext
): void {
  const carrier = node as LegalAnalysisNode;
  const nodeId = carrier.id ?? carrier.name ?? 'unknown';
  const text = config?.text;

  if (!text || text.trim().length === 0) {
    context.emit('legal_analysis_error', {
      nodeId,
      error: 'legal_analysis trait requires non-empty config.text (document string)',
    });
    return;
  }

  try {
    const input: LegalAnalysisInput = { text, compareWithText: config?.compareWithText };
    const result = analyzeLegalDocument(input);
    carrier.__legalAnalysisResult = result;
    carrier.properties = {
      ...(carrier.properties ?? {}),
      readingGradeLevel: result.readability.gradeLevel,
      riskScore: result.risk.riskScore,
      riskCategory: result.risk.riskCategory,
      obligationCount: result.obligations.length,
    };
    const summary: LegalAnalysisSolvedEvent = {
      nodeId,
      converged: result.converged,
      readingGradeLevel: result.readability.gradeLevel,
      readingEase: result.readability.readingEase,
      difficulty: result.readability.difficulty,
      riskScore: result.risk.riskScore,
      riskCategory: result.risk.riskCategory,
      flaggedTerms: result.risk.flaggedTerms.map((t) => t.term),
      obligationCount: result.obligations.length,
      deadlineCount: result.deadlines.length,
      maxPenaltyExposureUSD: result.penaltyExposure.maxExposureUSD,
      combinedSimilarity: result.similarity ? result.similarity.combinedSimilarity : null,
    };
    context.setState?.({ [`legal_analysis:${nodeId}`]: summary });
    context.emit('legal_analysis_solved', summary);
  } catch (error) {
    context.emit('legal_analysis_error', {
      nodeId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Behavioral handler for the legal-document `legal_analysis` trait. Runs the
 * deterministic contract analytics solver (Flesch-Kincaid readability +
 * keyword-weighted clause risk + obligation/deadline extraction + penalty
 * exposure + optional Jaccard similarity) whenever an orb carrying the trait is
 * attached (and on each per-frame update), writing the result onto the node and
 * emitting `legal_analysis_solved` / `legal_analysis_error`.
 */
export const legalAnalysisHandler: RuntimeTraitHandler = {
  name: 'legal_analysis',
  onAttach: (node, config, context) => analyzeOntoNode(node, config, context),
  onUpdate: (node, config, context) => analyzeOntoNode(node, config, context),
};

/** A runtime that can register behavioral trait handlers. */
export interface TraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

/**
 * Register legal-document behavioral trait handlers into a runtime that exposes
 * `registerTrait(name, handler)` — e.g. `@holoscript/core` HoloScriptRuntime.
 * This is the consumption path the dead-wired tier was missing: after this
 * call the runtime's directive dispatch (applyDirectives / updateTraits) will
 * invoke the legal-document analyzer for `@legal_analysis` orbs.
 */
export function registerLegalDocumentTraitHandlers(registrar: TraitRegistrar): void {
  registerPluginTraits(registrar, LEGAL_DOCUMENT_PLUGIN_ID, [legalAnalysisHandler]);
}
