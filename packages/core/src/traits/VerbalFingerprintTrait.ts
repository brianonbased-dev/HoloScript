/**
 * VerbalFingerprintTrait
 *
 * Post-generation constraint that verifies an agent's output carries a
 * stable stylistic signature regardless of underlying LLM swaps.
 *
 * Design principles:
 * - Fingerprint is computed OVER the generated text, not injected INTO the prompt.
 *   This guarantees the constraint survives model swaps (the same prompt to a
 *   different model may produce different text; the fingerprint catches drift).
 * - Fingerprint key is a hashed summary of style constraints (tone, vocabulary
 *   density, sentence-length distribution, forbidden phrases).
 * - On mismatch, the trait emits a diagnostic event; downstream handlers can
 *   retry, flag, or route to a different model.
 *
 * CI gate: attribution test >= 80% accuracy across at least 3 model backends.
 *
 * @version 0.1.0-skeleton
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';
import type { Pillar, PillarContext, PillarSlice } from './pillar/PillarRegistry';

// =============================================================================
// TYPES
// =============================================================================

export interface StyleConstraint {
  /** Human-readable label, e.g. "brittney-formal" */
  label: string;
  /** Minimum average sentence length (words). */
  minSentenceLength: number;
  /** Maximum average sentence length (words). */
  maxSentenceLength: number;
  /** Phrases that must NOT appear. */
  forbiddenPhrases: string[];
  /** Phrases that SHOULD appear at least once per response. */
  requiredPhrases: string[];
  /** Target tone: formal, casual, archaic, etc. */
  tone: string;
}

export interface VerbalFingerprintConfig {
  /** Stable identifier for the style constraint set. */
  fingerprint_key: string;
  /** The style constraints hashed by fingerprint_key. */
  style: StyleConstraint;
  /** If true, reject output on mismatch. If false, emit warning only. */
  enforce: boolean;
  /** Number of recent generations kept for rolling accuracy stats. */
  rolling_window: number;
}

export interface VerbalFingerprintRecord {
  generationId: string;
  textHash: string;
  matched: boolean;
  mismatches: string[];
  modelBackend: string;
  timestamp: number;
}

export interface VerbalFingerprintState {
  records: VerbalFingerprintRecord[];
  rollingAccuracy: number | null;
  lastGenerationId: string | null;
}

// =============================================================================
// FINGERPRINT ENGINE (stub — full impl in Paper-29 or follow-up sprint)
// =============================================================================

function computeTextHash(text: string): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < text.length; i++) {
    const codeUnit = text.charCodeAt(i);
    hash ^= codeUnit & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= codeUnit >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${text.length}`;
}

function verifyStyle(
  text: string,
  style: StyleConstraint
): { matched: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgLen =
    sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) /
    Math.max(1, sentences.length);

  if (avgLen < style.minSentenceLength) mismatches.push(`avg_len_too_short:${avgLen.toFixed(1)}`);
  if (avgLen > style.maxSentenceLength) mismatches.push(`avg_len_too_long:${avgLen.toFixed(1)}`);

  for (const phrase of style.forbiddenPhrases) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      mismatches.push(`forbidden_phrase:${phrase}`);
    }
  }

  for (const phrase of style.requiredPhrases) {
    if (!text.toLowerCase().includes(phrase.toLowerCase())) {
      mismatches.push(`missing_required:${phrase}`);
    }
  }

  return { matched: mismatches.length === 0, mismatches };
}

function updateRollingAccuracy(records: VerbalFingerprintRecord[]): number | null {
  if (records.length === 0) return null;
  const matched = records.filter((r) => r.matched).length;
  return matched / records.length;
}

function getState(node: HSPlusNode): VerbalFingerprintState | undefined {
  return node.__verbalFingerprintState as VerbalFingerprintState | undefined;
}

// =============================================================================
// HANDLER
// =============================================================================

export const verbalFingerprintHandler: TraitHandler<VerbalFingerprintConfig> = {
  name: 'verbal_fingerprint',

  defaultConfig: {
    fingerprint_key: 'default',
    style: {
      label: 'default',
      minSentenceLength: 5,
      maxSentenceLength: 40,
      forbiddenPhrases: [],
      requiredPhrases: [],
      tone: 'neutral',
    },
    enforce: false,
    rolling_window: 50,
  },

  onAttach(node, config, context) {
    const state: VerbalFingerprintState = {
      records: [],
      rollingAccuracy: null,
      lastGenerationId: null,
    };
    node.__verbalFingerprintState = state;

    context.emit?.('verbal_fingerprint_ready', {
      node,
      fingerprintKey: config.fingerprint_key,
      enforce: config.enforce,
      rollingWindow: config.rolling_window,
    });

    // PSF-3 WIRE (D.040): register VerbalFingerprint as Pillar axis (behavioral + structural)
    // Dual-value: stylistic constraint now also generates coordinate slices for training corpus.
    const verbalFingerprintPillar: Pillar = {
      id: 'verbal_fingerprint',
      domain: 'language',
      axis_vocabulary: ['style_consistency', 'fingerprint_stability'] as const,
      generate(ctx: PillarContext): PillarSlice {
        const meta = (ctx.metadata || {}) as Record<string, number>;
        // Default high consistency for skeleton; production reads rollingAccuracy / last verify match
        return {
          axis_1_id: 'style_consistency',
          axis_2_id: 'fingerprint_stability',
          pos_1: meta.style_consistency ?? 0.82,
          pos_2: meta.fingerprint_stability ?? 0.91,
          pillar_id: this.id,
          pillar_domain: this.domain,
        };
      },
    };
    context.emit?.('pillar:register', { pillar: verbalFingerprintPillar });
  },

  onDetach(node) {
    delete node.__verbalFingerprintState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'verbal_fingerprint_verify') {
      const payload = extractPayload(event);
      const text = String(payload.text ?? '');
      const generationId = String(payload.generationId ?? `gen_${Date.now()}`);
      const modelBackend = String(payload.modelBackend ?? 'unknown');

      const { matched, mismatches } = verifyStyle(text, config.style);
      const record: VerbalFingerprintRecord = {
        generationId,
        textHash: computeTextHash(text),
        matched,
        mismatches,
        modelBackend,
        timestamp: Date.now(),
      };

      state.records.push(record);
      if (state.records.length > config.rolling_window) {
        state.records.shift();
      }
      state.rollingAccuracy = updateRollingAccuracy(state.records);
      state.lastGenerationId = generationId;

      if (!matched && config.enforce) {
        context.emit?.('verbal_fingerprint_rejected', {
          node,
          generationId,
          mismatches,
          textHash: record.textHash,
          rollingAccuracy: state.rollingAccuracy,
        });
      } else {
        context.emit?.('verbal_fingerprint_verified', {
          node,
          generationId,
          matched,
          mismatches,
          textHash: record.textHash,
          rollingAccuracy: state.rollingAccuracy,
        });
      }
      return;
    }

    if (event.type === 'verbal_fingerprint_query') {
      context.emit?.('verbal_fingerprint_state', {
        queryId: extractPayload(event).queryId,
        node,
        fingerprintKey: config.fingerprint_key,
        rollingAccuracy: state.rollingAccuracy,
        lastGenerationId: state.lastGenerationId,
        totalRecords: state.records.length,
      });
      return;
    }
  },
};

export default verbalFingerprintHandler;
