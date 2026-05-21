/**
 * VocabularyRegisterTrait
 *
 * LLM context middleware that injects a domain-specific vocabulary register
 * into prompts or context windows. Registers are composable and hot-swappable
 * at runtime.
 *
 * Default registers (shipped with the trait):
 * 1. medieval-fantasy
 * 2. sci-fi-remnant
 * 3. modern-corporate
 * 4. ancient-formal
 * 5. criminal-underworld
 * 6. scholarly-archaic
 *
 * Custom registers can be appended at runtime via the `vocabulary_register_load`
 * event.
 *
 * @version 0.1.0-skeleton
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';
import type { Pillar, PillarContext, PillarSlice } from './pillar/PillarRegistry';

// =============================================================================
// TYPES
// =============================================================================

export interface VocabularyEntry {
  term: string;
  definition: string;
  partOfSpeech?: string;
  synonyms?: string[];
  antonyms?: string[];
  usageExample?: string;
}

export interface VocabularyRegister {
  name: string;
  description: string;
  entries: VocabularyEntry[];
  toneHint: string;
}

export interface VocabularyRegisterConfig {
  /** Active register name at attach time. */
  active_register: string;
  /** Maximum entries to inject into a single prompt context. */
  max_injected_entries: number;
  /** If true, prepend a tone-hint line before the vocabulary list. */
  prepend_tone_hint: boolean;
}

export interface VocabularyRegisterState {
  registers: Map<string, VocabularyRegister>;
  activeName: string;
  injectedCount: number;
}

// =============================================================================
// DEFAULT REGISTERS
// =============================================================================

export const DEFAULT_REGISTERS: VocabularyRegister[] = [
  {
    name: 'medieval-fantasy',
    description: 'High-fantasy register with feudal, arcane, and heraldic terminology.',
    toneHint: 'Speak as a chronicler of the Age of Kings.',
    entries: [
      { term: 'liege', definition: 'A lord to whom a vassal owes allegiance.', usageExample: 'My liege commands the muster at dawn.' },
      { term: 'grimoire', definition: 'A book of magic spells and invocations.', usageExample: 'The grimoire was bound in dragon hide.' },
    ],
  },
  {
    name: 'sci-fi-remnant',
    description: 'Post-collapse science-fiction register with tech-archaeology flavor.',
    toneHint: 'Speak as a salvager of the Old Networks.',
    entries: [
      { term: 'void-sig', definition: 'A faint electromagnetic trace left by faster-than-light transit.', usageExample: 'The void-sig decayed before we could triangulate.' },
      { term: 'synth-bay', definition: 'An automated fabrication chamber.', usageExample: 'The synth-bay churned out filters until it seized.' },
    ],
  },
  {
    name: 'modern-corporate',
    description: 'Contemporary business register with metrics and stakeholder vocabulary.',
    toneHint: 'Speak as a senior operations strategist.',
    entries: [
      { term: 'synergy', definition: 'The interaction of elements that when combined produce a total effect greater than the sum of individual elements.', usageExample: 'We need synergy between marketing and engineering.' },
      { term: 'stakeholder alignment', definition: 'Ensuring all parties with interest in an outcome share the same goals.', usageExample: 'Stakeholder alignment is the first milestone.' },
    ],
  },
  {
    name: 'ancient-formal',
    description: 'Classical register with solemn, ceremonial diction.',
    toneHint: 'Speak as a priest of the First Temple.',
    entries: [
      { term: 'vestal', definition: 'A consecrated priestess bound to chastity and service.', usageExample: 'The vestal tended the eternal flame.' },
      { term: 'oblation', definition: 'A offering made to a deity.', usageExample: 'The oblation of grain pleased the harvest god.' },
    ],
  },
  {
    name: 'criminal-underworld',
    description: 'Register of heist, smuggling, and street-hierarchy slang.',
    toneHint: 'Speak as a fixer who knows every backroom in the sprawl.',
    entries: [
      { term: 'cutter', definition: 'A freelance assassin or enforcer.', usageExample: 'The cutter only works for verified clients.' },
      { term: 'drop-bag', definition: 'A secure container left at a blind exchange point.', usageExample: 'Check the drop-bag under the north pier.' },
    ],
  },
  {
    name: 'scholarly-archaic',
    description: 'Academic register with Latinate and Hellenic terminology.',
    toneHint: 'Speak as a philologian of the Third Academy.',
    entries: [
      { term: 'aporia', definition: 'An irresolvable internal contradiction in a text or argument.', usageExample: 'The aporia in Parmenides haunts metaphysics still.' },
      { term: 'palimpsest', definition: 'A manuscript on which later writing has been superimposed on earlier writing.', usageExample: 'The palimpsest revealed a lost comedy underneath.' },
    ],
  },
];

// =============================================================================
// HELPERS
// =============================================================================

function getState(node: HSPlusNode): VocabularyRegisterState | undefined {
  return node.__vocabularyRegisterState as VocabularyRegisterState | undefined;
}

function buildInjectionPayload(
  register: VocabularyRegister,
  config: VocabularyRegisterConfig
): string {
  const lines: string[] = [];
  if (config.prepend_tone_hint && register.toneHint) {
    lines.push(`[Tone] ${register.toneHint}`);
  }
  lines.push(`[Vocabulary: ${register.name}]`);
  const entries = register.entries.slice(0, config.max_injected_entries);
  for (const e of entries) {
    let line = `- ${e.term}: ${e.definition}`;
    if (e.usageExample) line += ` (e.g., "${e.usageExample}")`;
    lines.push(line);
  }
  return lines.join('\n');
}

// =============================================================================
// HANDLER
// =============================================================================

export const vocabularyRegisterHandler: TraitHandler<VocabularyRegisterConfig> = {
  name: 'vocabulary_register',

  defaultConfig: {
    active_register: 'modern-corporate',
    max_injected_entries: 20,
    prepend_tone_hint: true,
  },

  onAttach(node, config, context) {
    const state: VocabularyRegisterState = {
      registers: new Map(),
      activeName: config.active_register,
      injectedCount: 0,
    };

    for (const reg of DEFAULT_REGISTERS) {
      state.registers.set(reg.name, reg);
    }

    node.__vocabularyRegisterState = state;

    const active = state.registers.get(config.active_register);
    context.emit?.('vocabulary_register_ready', {
      node,
      activeRegister: config.active_register,
      available: Array.from(state.registers.keys()),
      activeEntryCount: active?.entries.length ?? 0,
    });

    // PSF-3 WIRE (D.040): register VocabularyRegister as Pillar axis (behavioral + structural)
    const vocabularyRegisterPillar: Pillar = {
      id: 'vocabulary_register',
      domain: 'language',
      axis_vocabulary: ['register_diversity', 'injection_rate'] as const,
      generate(ctx: PillarContext): PillarSlice {
        const meta = (ctx.metadata || {}) as Record<string, number>;
        return {
          axis_1_id: 'register_diversity',
          axis_2_id: 'injection_rate',
          pos_1: meta.register_diversity ?? 0.7,
          pos_2: meta.injection_rate ?? 0.4,
          pillar_id: this.id,
          pillar_domain: this.domain,
        };
      },
    };
    context.emit?.('pillar:register', { pillar: vocabularyRegisterPillar });
  },

  onDetach(node) {
    delete node.__vocabularyRegisterState;
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'vocabulary_switch') {
      const payload = extractPayload(event);
      const name = String(payload.register ?? '');
      if (state.registers.has(name)) {
        state.activeName = name;
        context.emit?.('vocabulary_switched', {
          node,
          register: name,
          entryCount: state.registers.get(name)!.entries.length,
        });
      } else {
        context.emit?.('vocabulary_switch_failed', {
          node,
          requested: name,
          available: Array.from(state.registers.keys()),
        });
      }
      return;
    }

    if (event.type === 'vocabulary_inject') {
      const active = state.registers.get(state.activeName);
      if (!active) {
        context.emit?.('vocabulary_inject_failed', {
          node,
          reason: 'no_active_register',
        });
        return;
      }
      const payload = buildInjectionPayload(active, config);
      state.injectedCount += 1;
      context.emit?.('vocabulary_injected', {
        node,
        register: state.activeName,
        payload,
        injectedCount: state.injectedCount,
      });

      // PSF-3 WIRE (D.040) — live Pillar-Slice from real vocabulary register state (replaces skeleton).
      // register_diversity scaled from active entry count; injection_rate from cumulative injectedCount.
      // Complements the static pillar:register in onAttach for the D.040 three-population stack.
      const activeReg = state.registers.get(state.activeName);
      const diversity = Math.min(1, (activeReg?.entries.length ?? 2) / 12);
      const rate = Math.min(1, state.injectedCount / 50);
      context.emit?.('pillar:slice', {
        slice: {
          axis_1_id: 'register_diversity',
          axis_2_id: 'injection_rate',
          pos_1: diversity,
          pos_2: rate,
          pillar_id: 'vocabulary_register',
          pillar_domain: 'language' as const,
        },
        agent_id: (context as any).agentId ?? 'local',
        sim_step: Date.now(),
      });
      return;
    }

    if (event.type === 'vocabulary_register_load') {
      const payload = extractPayload(event);
      const reg = payload.register as VocabularyRegister | undefined;
      if (reg && reg.name) {
        state.registers.set(reg.name, reg);
        context.emit?.('vocabulary_register_loaded', {
          node,
          name: reg.name,
          entryCount: reg.entries.length,
          totalRegisters: state.registers.size,
        });
      } else {
        context.emit?.('vocabulary_register_load_failed', {
          node,
          reason: 'invalid_register_shape',
        });
      }
      return;
    }

    if (event.type === 'vocabulary_query') {
      context.emit?.('vocabulary_state', {
        queryId: extractPayload(event).queryId,
        node,
        active: state.activeName,
        available: Array.from(state.registers.keys()),
        injectedCount: state.injectedCount,
      });
      return;
    }
  },
};

export default vocabularyRegisterHandler;
