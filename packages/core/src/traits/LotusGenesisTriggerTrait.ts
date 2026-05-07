/**
 * Lotus Genesis Trigger Trait
 *
 * Founder-gated trigger for the Lotus seedable artifact. This trait is
 * intentionally backed but locked: renderers may attach it and query its gate
 * state, but it refuses to emit `lotus_genesis_fired` unless a signed genesis
 * anchor is present, the derived seed is no longer the placeholder, and the
 * aggregate petal state says all papers are full.
 *
 * Determinism:
 *   - Seed derivation is a pure first-16-bytes transform over the anchor hash.
 *   - Gate evaluation is a pure function of (seed, anchor, allPetalsFull).
 *   - The fired transition is irreversible per node and emits exactly once.
 *
 * Trait name: lotus_genesis_trigger
 * Category: lotus / provenance
 *
 * @version 1.0.0
 * @cites I.007, W.137, project_lotus-genesis-trigger.md, task_1778105792227_txa5
 */

import type { TraitHandler } from './TraitTypes';

export interface LotusGenesisAnchorEvent {
  hash?: string;
  [key: string]: unknown;
}

export interface LotusGenesisAnchor {
  hash?: string;
  wallet?: string;
  signature?: string;
  signed?: boolean;
  events?: LotusGenesisAnchorEvent[];
  [key: string]: unknown;
}

export type LotusGenesisGatePhase =
  | 'placeholder'
  | 'anchor_missing'
  | 'anchor_invalid'
  | 'petals_pending'
  | 'armed'
  | 'fired';

export interface LotusGenesisTriggerConfig {
  /** State key for LOTUS_GENESIS_SEED. */
  seed_source: string;
  /** Pre-genesis placeholder seed. */
  placeholder_seed: string;
  /** Documentary source path for the founder-gated anchor. */
  required_anchor_path: string;
  /** Founder wallet expected on the signed anchor. Empty string disables wallet check. */
  required_wallet: string;
  /** Optional preloaded anchor payload. */
  anchor: LotusGenesisAnchor | null;
  /** Require signature/signed marker before firing. */
  require_signed_anchor: boolean;
  /** Aggregate state key that reports all petals are full. */
  all_petals_full_source: string;
  /** Whether to emit lotus_genesis_trigger_attached on attach. */
  emit_attach_event: boolean;
}

export interface LotusGenesisGateEvaluation {
  phase: LotusGenesisGatePhase;
  canFire: boolean;
  seed: string;
  anchorHash: string | null;
  wallet: string | null;
  signed: boolean;
  allPetalsFull: boolean;
  reasons: string[];
}

interface LotusGenesisTriggerState {
  seed: string;
  anchor: LotusGenesisAnchor | null;
  allPetalsFull: boolean;
  fired: boolean;
  lastEvaluation: LotusGenesisGateEvaluation;
}

const HEX_16_BYTES = 32;

export function normalizeLotusSeed(seed: unknown): string {
  const raw = String(seed ?? '').trim();
  if (!raw) return '';
  const withoutPrefix = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  return `0x${withoutPrefix.toLowerCase()}`;
}

export function extractLotusGenesisAnchorHash(
  anchor: LotusGenesisAnchor | null | undefined
): string | null {
  const direct = typeof anchor?.hash === 'string' ? anchor.hash : '';
  const eventHash =
    Array.isArray(anchor?.events) && typeof anchor.events[0]?.hash === 'string'
      ? anchor.events[0].hash
      : '';
  const raw = direct || eventHash;
  if (!raw) return null;
  const clean = raw.startsWith('0x') || raw.startsWith('0X') ? raw.slice(2) : raw;
  return /^[0-9a-fA-F]+$/.test(clean) ? `0x${clean.toLowerCase()}` : null;
}

export function deriveLotusGenesisSeed(
  anchor: LotusGenesisAnchor | null | undefined
): string | null {
  const hash = extractLotusGenesisAnchorHash(anchor);
  if (!hash) return null;
  const clean = hash.slice(2);
  if (clean.length < HEX_16_BYTES) return null;
  return `0x${clean.slice(0, HEX_16_BYTES)}`;
}

function normalizeWallet(wallet: unknown): string {
  return String(wallet ?? '')
    .trim()
    .toLowerCase();
}

export function deriveLotusGenesisGate(input: {
  seed: unknown;
  placeholderSeed: string;
  anchor: LotusGenesisAnchor | null | undefined;
  requireSignedAnchor: boolean;
  requiredWallet?: string;
  allPetalsFull: boolean;
  fired?: boolean;
}): LotusGenesisGateEvaluation {
  const anchor = input.anchor ?? null;
  const derivedSeed = deriveLotusGenesisSeed(anchor);
  const seed = normalizeLotusSeed(derivedSeed ?? input.seed);
  const placeholder = normalizeLotusSeed(input.placeholderSeed);
  const anchorHash = extractLotusGenesisAnchorHash(anchor);
  const wallet = typeof anchor?.wallet === 'string' ? anchor.wallet : null;
  const signed = Boolean(anchor?.signed || anchor?.signature);
  const requiredWallet = normalizeWallet(input.requiredWallet);
  const walletOk = !requiredWallet || normalizeWallet(wallet) === requiredWallet;
  const reasons: string[] = [];

  if (input.fired) {
    return {
      phase: 'fired',
      canFire: false,
      seed,
      anchorHash,
      wallet,
      signed,
      allPetalsFull: input.allPetalsFull,
      reasons: ['already_fired'],
    };
  }

  if (!anchor) reasons.push('anchor_missing');
  if (anchor && !anchorHash) reasons.push('anchor_hash_invalid');
  if (anchor && input.requireSignedAnchor && !signed) reasons.push('anchor_signature_missing');
  if (anchor && !walletOk) reasons.push('anchor_wallet_mismatch');
  if (!seed || seed === placeholder) reasons.push('placeholder_seed');
  if (!input.allPetalsFull) reasons.push('petals_not_full');

  const canFire = reasons.length === 0;
  let phase: LotusGenesisGatePhase = 'armed';
  if (!anchor) phase = 'anchor_missing';
  else if (!anchorHash || (input.requireSignedAnchor && !signed) || !walletOk)
    phase = 'anchor_invalid';
  else if (!seed || seed === placeholder) phase = 'placeholder';
  else if (!input.allPetalsFull) phase = 'petals_pending';

  return {
    phase,
    canFire,
    seed,
    anchorHash,
    wallet,
    signed,
    allPetalsFull: input.allPetalsFull,
    reasons,
  };
}

export const lotusGenesisTriggerHandler: TraitHandler<LotusGenesisTriggerConfig> = {
  name: 'lotus_genesis_trigger',

  defaultConfig: {
    seed_source: 'LOTUS_GENESIS_SEED',
    placeholder_seed: '0x0000DEAD',
    required_anchor_path: 'D:/GOLD/anchors/lotus-genesis.json',
    required_wallet: '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3',
    anchor: null,
    require_signed_anchor: true,
    all_petals_full_source: 'lotus.api.all_petals_full',
    emit_attach_event: true,
  },

  onAttach(node, config, context) {
    const ctxState = context.getState?.() ?? {};
    const seed = normalizeLotusSeed(ctxState[config.seed_source] ?? config.placeholder_seed);
    const allPetalsFull = Boolean(ctxState[config.all_petals_full_source]);
    const evaluation = deriveLotusGenesisGate({
      seed,
      placeholderSeed: config.placeholder_seed,
      anchor: config.anchor,
      requireSignedAnchor: config.require_signed_anchor,
      requiredWallet: config.required_wallet,
      allPetalsFull,
    });

    const state: LotusGenesisTriggerState = {
      seed,
      anchor: config.anchor,
      allPetalsFull,
      fired: false,
      lastEvaluation: evaluation,
    };
    (node as unknown as Record<string, unknown>).__lotusGenesisTriggerState = state;

    if (config.emit_attach_event) {
      context.emit?.('lotus_genesis_trigger_attached', {
        node,
        requiredAnchorPath: config.required_anchor_path,
        ...evaluation,
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('lotus_genesis_trigger_detached', { node });
    delete (node as unknown as Record<string, unknown>).__lotusGenesisTriggerState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Gate transitions are event-driven; no frame work.
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__lotusGenesisTriggerState as
      | LotusGenesisTriggerState
      | undefined;
    if (!state) return;

    if (event.type === 'lotus_genesis_anchor_loaded') {
      state.anchor = (event.anchor as LotusGenesisAnchor | undefined) ?? state.anchor;
      const derivedSeed = deriveLotusGenesisSeed(state.anchor);
      if (derivedSeed) state.seed = derivedSeed;
    } else if (event.type === 'lotus_bloom_state_changed') {
      state.allPetalsFull = event.bloomState === 'full';
    } else if (event.type === 'lotus_all_petals_full') {
      state.allPetalsFull = true;
    } else if (event.type === 'lotus_genesis_seed_set') {
      state.seed = normalizeLotusSeed(event.seed);
    } else if (event.type === 'lotus_genesis_query') {
      const evaluation = deriveLotusGenesisGate({
        seed: state.seed,
        placeholderSeed: config.placeholder_seed,
        anchor: state.anchor,
        requireSignedAnchor: config.require_signed_anchor,
        requiredWallet: config.required_wallet,
        allPetalsFull: state.allPetalsFull,
        fired: state.fired,
      });
      state.lastEvaluation = evaluation;
      context.emit?.('lotus_genesis_response', {
        queryId: event.queryId,
        node,
        requiredAnchorPath: config.required_anchor_path,
        ...evaluation,
      });
      return;
    } else if (event.type !== 'lotus_genesis_fire_requested') {
      return;
    }

    const evaluation = deriveLotusGenesisGate({
      seed: state.seed,
      placeholderSeed: config.placeholder_seed,
      anchor: state.anchor,
      requireSignedAnchor: config.require_signed_anchor,
      requiredWallet: config.required_wallet,
      allPetalsFull: state.allPetalsFull,
      fired: state.fired,
    });
    state.lastEvaluation = evaluation;

    if (event.type !== 'lotus_genesis_fire_requested') {
      context.emit?.('lotus_genesis_gate_changed', {
        node,
        requiredAnchorPath: config.required_anchor_path,
        ...evaluation,
      });
      return;
    }

    if (!evaluation.canFire) {
      context.emit?.('lotus_genesis_blocked', {
        node,
        requiredAnchorPath: config.required_anchor_path,
        ...evaluation,
      });
      return;
    }

    state.fired = true;
    const firedEvaluation = { ...evaluation, phase: 'fired' as const, canFire: false };
    state.lastEvaluation = firedEvaluation;
    context.setState?.({
      [config.seed_source]: evaluation.seed,
      'lotus.api.genesis_fired': true,
    });
    context.emit?.('lotus_genesis_fired', {
      node,
      seed: evaluation.seed,
      anchorHash: evaluation.anchorHash,
      wallet: evaluation.wallet,
      requiredAnchorPath: config.required_anchor_path,
      lightColumnActive: true,
    });
  },
};

export default lotusGenesisTriggerHandler;
