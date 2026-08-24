/**
 * CompanionPresenceTrait — daimon embodiment (companionship category)
 *
 * Binds a rendered presence to ONE owner's ConversationDaemon identity via
 * ownerScopeKey. The presence is of a specific known companion, never a
 * generic NPC: before the emergence threshold it presents in accumulating
 * posture (no claimed name, no claimed intimacy); after `presence_manifest`
 * it presents as the owner's manifested daimon.
 *
 * Privacy: the raw ownerScopeKey never leaves the node state. Receipts carry
 * only a stable hash of it, per the fold ruling's owner-scoped privacy
 * default (research/2026-08-24_companion-daimon-embodiment-fold.md §3).
 *
 * Events in:
 *  owner_near        { }                — owner attention enters range
 *  owner_away        { }                — owner attention leaves
 *  presence_manifest { }                — emergence threshold crossed (S2→S3)
 *  owner_forget      { }                — unconditional forget: reset accrual
 *
 * Events out:
 *  companion_presence_ready    { node, phase, bound }
 *  companion_greeting          { node, phase }
 *  companion_presence_receipt  { node, receipt }
 *
 * RFC: proposals/daimon-embodiment-trait-family.md §2 (@companion_presence).
 */

import type { HSPlusNode, TraitContext, TraitEvent, TraitHandler } from './TraitTypes';

export type CompanionPresencePhase = 'accumulating' | 'manifested';
export type CompanionAttention = 'idle' | 'attentive' | 'greeting';

export interface CompanionPresenceConfig {
  /** Write-once owner binding; null renders an unbound preview presence */
  owner_scope_key: string | null;
  /** Present in accumulating posture until presence_manifest arrives */
  emergence_phase_aware: boolean;
  /** Minimum ms between greetings so re-entering range does not spam */
  greeting_cooldown_ms: number;
}

export interface CompanionPresenceReceipt {
  kind: 'companion.presence.receipt.v1';
  event: string;
  phase: CompanionPresencePhase;
  attention: CompanionAttention;
  /** FNV-1a over the raw key — the raw key is never emitted */
  ownerScopeKeyHash: string | null;
  issuedAt: string;
  receiptHash: string;
}

export interface CompanionPresenceState {
  ownerScopeKey: string | null;
  bound: boolean;
  phase: CompanionPresencePhase;
  attention: CompanionAttention;
  lastGreetingAt: number;
  receipts: CompanionPresenceReceipt[];
}

const DEFAULT_CONFIG: CompanionPresenceConfig = {
  owner_scope_key: null,
  emergence_phase_aware: true,
  greeting_cooldown_ms: 60_000,
};

type PresenceNode = HSPlusNode & { __companionPresenceState?: CompanionPresenceState };

function canonicalize(input: unknown): string {
  if (input === null || typeof input !== 'object') return JSON.stringify(input);
  if (Array.isArray(input)) return `[${input.map(canonicalize).join(',')}]`;
  const keys = Object.keys(input as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize((input as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

export function stableCompanionPresenceHash(input: unknown): string {
  const canonical = canonicalize(input);
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function issueReceipt(
  state: CompanionPresenceState,
  node: PresenceNode,
  context: TraitContext,
  event: string
): CompanionPresenceReceipt {
  const base = {
    kind: 'companion.presence.receipt.v1' as const,
    event,
    phase: state.phase,
    attention: state.attention,
    ownerScopeKeyHash:
      state.ownerScopeKey === null ? null : stableCompanionPresenceHash(state.ownerScopeKey),
    issuedAt: new Date().toISOString(),
  };
  const receipt: CompanionPresenceReceipt = {
    ...base,
    receiptHash: stableCompanionPresenceHash(base),
  };
  state.receipts.push(receipt);
  context.emit('companion_presence_receipt', { node, receipt });
  return receipt;
}

function applyPresenceChannels(node: PresenceNode, state: CompanionPresenceState): void {
  const props = (node.properties ??= {} as Record<string, unknown>);
  (props as Record<string, unknown>).presencePhase = state.phase;
  (props as Record<string, unknown>).presenceAttention = state.attention;
  // Accumulating posture never claims a name; the renderer labels it softly.
  (props as Record<string, unknown>).presenceNamed = state.phase === 'manifested';
}

export const companionPresenceHandler = {
  name: 'companion_presence',
  defaultConfig: DEFAULT_CONFIG,

  onAttach(node: PresenceNode, config: CompanionPresenceConfig, context: TraitContext): void {
    const merged = { ...DEFAULT_CONFIG, ...(config || {}) };
    const state: CompanionPresenceState = {
      ownerScopeKey: merged.owner_scope_key,
      bound: merged.owner_scope_key !== null,
      phase: merged.emergence_phase_aware ? 'accumulating' : 'manifested',
      attention: 'idle',
      lastGreetingAt: 0,
      receipts: [],
    };
    node.__companionPresenceState = state;
    applyPresenceChannels(node, state);
    context.emit('companion_presence_ready', { node, phase: state.phase, bound: state.bound });
    issueReceipt(state, node, context, 'attach');
  },

  onDetach(node: PresenceNode, _config: CompanionPresenceConfig, context: TraitContext): void {
    const state = node.__companionPresenceState;
    if (!state) return;
    issueReceipt(state, node, context, 'detach');
    delete node.__companionPresenceState;
  },

  onEvent(
    node: PresenceNode,
    config: CompanionPresenceConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__companionPresenceState;
    if (!state) return;
    const merged = { ...DEFAULT_CONFIG, ...(config || {}) };

    switch (event.type) {
      case 'owner_near': {
        state.attention = 'attentive';
        const now = Date.now();
        if (now - state.lastGreetingAt >= merged.greeting_cooldown_ms) {
          state.attention = 'greeting';
          state.lastGreetingAt = now;
          context.emit('companion_greeting', { node, phase: state.phase });
        }
        applyPresenceChannels(node, state);
        break;
      }
      case 'owner_away': {
        state.attention = 'idle';
        applyPresenceChannels(node, state);
        break;
      }
      case 'presence_manifest': {
        if (state.phase !== 'manifested') {
          state.phase = 'manifested';
          applyPresenceChannels(node, state);
          issueReceipt(state, node, context, 'presence_manifest');
        }
        break;
      }
      case 'owner_forget': {
        // Unconditional forget: accrued presence context resets. The binding
        // itself is custody-level and stays; what was learned is gone.
        state.attention = 'idle';
        state.lastGreetingAt = 0;
        if (merged.emergence_phase_aware) state.phase = 'accumulating';
        applyPresenceChannels(node, state);
        issueReceipt(state, node, context, 'owner_forget');
        break;
      }
      default:
        break;
    }
  },
} satisfies TraitHandler<CompanionPresenceConfig>;
