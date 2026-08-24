/**
 * AffectStateTrait — daimon embodiment (companionship category)
 *
 * Persistent emotional state machine driving visible expression channels.
 * Valence/arousal move under stimuli, decay toward baseline over time, and
 * resolve to a named expression; expression changes mutate the node's
 * render-facing properties and are receipted. State is owner-scoped and
 * honors unconditional forget.
 *
 * This is a pragmatic floor, not an emotion-modeling claim — the RFC's §8
 * honesty note applies. Iteration is expected once the face is visible.
 *
 * Events in:
 *  affect_stimulus { valence?: number, arousal?: number, cause?: string }
 *  affect_forget   { }
 *
 * Events out:
 *  affect_ready              { node, expression }
 *  affect_expression_changed { node, from, to, cause }
 *  affect_state_receipt      { node, receipt }
 *
 * RFC: proposals/daimon-embodiment-trait-family.md §2 (@affect_state).
 */

import type { HSPlusNode, TraitContext, TraitEvent, TraitHandler } from './TraitTypes';

export interface AffectExpressionZone {
  name: string;
  /** Inclusive valence range [-1, 1] */
  valence: readonly [number, number];
  /** Inclusive arousal range [-1, 1] */
  arousal: readonly [number, number];
  /** Emissive color the renderer maps this expression to */
  color: string;
}

export interface AffectStateConfig {
  /** Per-second pull of valence and arousal back toward 0 */
  decay_rate: number;
  /** Ordered zones; first match wins, fallback is the first zone */
  expression_map: readonly AffectExpressionZone[];
  /** Emit a receipt on every expression change */
  receipt_on_expression_change: boolean;
}

export interface AffectStateReceipt {
  kind: 'affect.state.receipt.v1';
  event: string;
  from: string;
  to: string;
  valence: number;
  arousal: number;
  cause: string | null;
  transitions: number;
  issuedAt: string;
  receiptHash: string;
}

export interface AffectState {
  valence: number;
  arousal: number;
  expression: string;
  transitions: number;
  receipts: AffectStateReceipt[];
}

export const DEFAULT_AFFECT_EXPRESSIONS: readonly AffectExpressionZone[] = [
  { name: 'neutral', valence: [-0.25, 0.25], arousal: [-0.35, 0.35], color: '#8fb7c9' },
  { name: 'warm', valence: [0.25, 0.7], arousal: [-0.35, 0.45], color: '#ffb37f' },
  { name: 'delight', valence: [0.7, 1], arousal: [0.2, 1], color: '#ffd166' },
  { name: 'concern', valence: [-1, -0.25], arousal: [0.1, 1], color: '#7f9cf5' },
  { name: 'quiet', valence: [-1, 0.1], arousal: [-1, -0.35], color: '#9a8fc9' },
];

const DEFAULT_CONFIG: AffectStateConfig = {
  decay_rate: 0.1,
  expression_map: DEFAULT_AFFECT_EXPRESSIONS,
  receipt_on_expression_change: true,
};

type AffectNode = HSPlusNode & { __affectState?: AffectState };

function canonicalize(input: unknown): string {
  if (input === null || typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(canonicalize).join(',')}]`;
  const keys = Object.keys(input as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize((input as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

export function stableAffectHash(input: unknown): string {
  const canonical = canonicalize(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const clamp = (n: number): number => Math.max(-1, Math.min(1, n));
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export function resolveExpression(
  valence: number,
  arousal: number,
  zones: readonly AffectExpressionZone[]
): AffectExpressionZone {
  for (const zone of zones) {
    if (
      valence >= zone.valence[0] &&
      valence <= zone.valence[1] &&
      arousal >= zone.arousal[0] &&
      arousal <= zone.arousal[1]
    ) {
      return zone;
    }
  }
  return zones[0];
}

function applyAffectChannels(
  node: AffectNode,
  state: AffectState,
  zone: AffectExpressionZone
): void {
  const props = (node.properties ??= {} as Record<string, unknown>);
  (props as Record<string, unknown>).expression = state.expression;
  (props as Record<string, unknown>).emissiveColor = zone.color;
  // Arousal drives glow strength; a calm companion glows softly, never off.
  (props as Record<string, unknown>).emissiveIntensity = round3(0.25 + 0.55 * Math.abs(state.arousal));
}

function issueReceipt(
  state: AffectState,
  node: AffectNode,
  context: TraitContext,
  event: string,
  from: string,
  cause: string | null
): AffectStateReceipt {
  const base = {
    kind: 'affect.state.receipt.v1' as const,
    event,
    from,
    to: state.expression,
    valence: round3(state.valence),
    arousal: round3(state.arousal),
    cause,
    transitions: state.transitions,
    issuedAt: new Date().toISOString(),
  };
  const receipt: AffectStateReceipt = { ...base, receiptHash: stableAffectHash(base) };
  state.receipts.push(receipt);
  context.emit('affect_state_receipt', { node, receipt });
  return receipt;
}

function shiftAffect(
  node: AffectNode,
  state: AffectState,
  config: AffectStateConfig,
  context: TraitContext,
  event: string,
  cause: string | null
): void {
  const zone = resolveExpression(state.valence, state.arousal, config.expression_map);
  if (zone.name !== state.expression) {
    const from = state.expression;
    state.expression = zone.name;
    state.transitions += 1;
    applyAffectChannels(node, state, zone);
    context.emit('affect_expression_changed', { node, from, to: zone.name, cause });
    if (config.receipt_on_expression_change) {
      issueReceipt(state, node, context, event, from, cause);
    }
  } else {
    // Same zone: keep the channels current (arousal still moves intensity).
    applyAffectChannels(node, state, zone);
  }
}

export const affectStateHandler = {
  name: 'affect_state',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: AffectNode, config: AffectStateConfig, context: TraitContext): void {
    const merged: AffectStateConfig = { ...DEFAULT_CONFIG, ...(config || {}) };
    const zones = merged.expression_map.length ? merged.expression_map : DEFAULT_AFFECT_EXPRESSIONS;
    const zone = resolveExpression(0, 0, zones);
    const state: AffectState = {
      valence: 0,
      arousal: 0,
      expression: zone.name,
      transitions: 0,
      receipts: [],
    };
    node.__affectState = state;
    applyAffectChannels(node, state, zone);
    context.emit('affect_ready', { node, expression: state.expression });
    issueReceipt(state, node, context, 'attach', state.expression, null);
  },

  onDetach(node: AffectNode, _config: AffectStateConfig, context: TraitContext): void {
    const state = node.__affectState;
    if (!state) return;
    issueReceipt(state, node, context, 'detach', state.expression, null);
    delete node.__affectState;
  },

  onUpdate(node: AffectNode, config: AffectStateConfig, context: TraitContext, delta: number): void {
    const state = node.__affectState;
    if (!state) return;
    const merged: AffectStateConfig = { ...DEFAULT_CONFIG, ...(config || {}) };
    const pull = Math.max(0, merged.decay_rate) * Math.max(0, delta);
    if (pull === 0) return;
    const ease = (v: number): number => {
      const next = v - Math.sign(v) * Math.min(Math.abs(v), pull);
      return round3(next);
    };
    state.valence = ease(state.valence);
    state.arousal = ease(state.arousal);
    shiftAffect(node, state, merged, context, 'decay', null);
  },

  onEvent(
    node: AffectNode,
    config: AffectStateConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__affectState;
    if (!state) return;
    const merged: AffectStateConfig = { ...DEFAULT_CONFIG, ...(config || {}) };

    switch (event.type) {
      case 'affect_stimulus': {
        const payload = (event.payload ?? {}) as {
          valence?: number;
          arousal?: number;
          cause?: string;
        };
        state.valence = round3(clamp(state.valence + (Number(payload.valence) || 0)));
        state.arousal = round3(clamp(state.arousal + (Number(payload.arousal) || 0)));
        shiftAffect(node, state, merged, context, 'affect_stimulus', payload.cause ?? null);
        break;
      }
      case 'affect_forget': {
        // Unconditional forget: affect history and accrued state reset. The
        // forget cascade also erases derived traces (relational_memory
        // contract); receipts record that the forget happened, not what was.
        const from = state.expression;
        state.valence = 0;
        state.arousal = 0;
        state.transitions = 0;
        state.receipts = [];
        const zone = resolveExpression(0, 0, merged.expression_map);
        state.expression = zone.name;
        applyAffectChannels(node, state, zone);
        issueReceipt(state, node, context, 'affect_forget', from, null);
        break;
      }
      default:
        break;
    }
  },
} satisfies TraitHandler<AffectStateConfig>;
