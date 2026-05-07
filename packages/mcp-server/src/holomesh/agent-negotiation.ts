/**
 * Agent Negotiation Primitives — task_1778114573371_xsp6.
 *
 * Multi-turn negotiation protocol for agent-to-agent commerce on HoloMesh.
 * Today's MCP is one-shot RPC; the agentic internet needs negotiation:
 * agent A asks B for a tool execution, B quotes cost+SLA, A accepts, B
 * executes, both sign a settlement receipt.
 *
 * State machine:
 *
 *   (A) request_quote ──> [QUOTED] ──> (A) accept ──> [ACCEPTED]
 *                            │                              │
 *                       (A) reject                       (B) execute
 *                            │                              │
 *                            ▼                              ▼
 *                       [REJECTED]                    [EXECUTED]
 *                                                          │
 *                                                  (A or B) settle
 *                                                          │
 *                                                          ▼
 *                                                     [SETTLED]
 *                                                          │
 *                                                  (A or B) dispute
 *                                                          │
 *                                                          ▼
 *                                                     [DISPUTED]
 *
 * Legal transitions and required signers (the "authorized actor" for a
 * transition is the only party whose signature can move the negotiation
 * to that next state):
 *
 *   open       -> quoted     by responder
 *   quoted     -> accepted   by initiator
 *   quoted     -> rejected   by initiator
 *   accepted   -> executed   by responder
 *   executed   -> settled    by either (co-signed once both sign)
 *   settled    -> disputed   by either
 *   executed   -> disputed   by either (skip-settle dispute path)
 *
 * Each transition produces a signed message with `messageType: 'negotiation'`
 * on the team /message route. The signature uses the existing HoloMesh
 * signing envelope (request-signing.ts) — caller signs canonicalized
 * `{ body, nonce, timestamp }` and the server verifies + records the
 * signer address on the negotiation event.
 *
 * Stacks on:
 * - F.041 / W.GOLD.514 chain-anchor pattern for terminal attestation
 *   (the `settled` event optionally carries a `settlementTxHash` so the
 *   on-chain receipt is the dispute-resistant ground truth).
 * - signed board webhooks (12a900a0b) — same envelope shape, same
 *   verifier path.
 *
 * Scope guardrail (per task description): one negotiation cycle, two
 * agents, one signed receipt. This module ships the schema + state machine
 * + reference flow; transport-layer (HTTP route handler) lives in
 * routes/team-routes.ts as a dispatch on messageType.
 *
 * @module holomesh/agent-negotiation
 */

import { randomUUID, createHash } from 'crypto';

// ── Protocol identifier ────────────────────────────────────────────────

export const NEGOTIATION_PROTOCOL = 'holomesh.negotiation.v1';

// ── State machine ──────────────────────────────────────────────────────

export type NegotiationState =
  | 'open'
  | 'quoted'
  | 'accepted'
  | 'rejected'
  | 'executed'
  | 'settled'
  | 'disputed';

export type NegotiationAction =
  | 'request_quote'
  | 'quote'
  | 'accept'
  | 'reject'
  | 'execute'
  | 'settle'
  | 'dispute';

/** Which side of the negotiation an actor is on. */
export type NegotiationRole = 'initiator' | 'responder';

/**
 * Static transition table. Maps (currentState, action) -> nextState plus
 * who is allowed to author that transition. `null` means the transition
 * is not legal from the given state.
 */
const TRANSITIONS: Record<
  string,
  { next: NegotiationState; actor: NegotiationRole | 'either'; coSigned?: boolean } | null
> = {
  // From open
  'open|request_quote': { next: 'open', actor: 'initiator' },
  // request_quote is what creates the negotiation in 'open' before it's quoted.
  // The first /message POST against a new negotiationId fires action=request_quote.
  // From open the responder quotes:
  'open|quote': { next: 'quoted', actor: 'responder' },
  // From quoted
  'quoted|accept': { next: 'accepted', actor: 'initiator' },
  'quoted|reject': { next: 'rejected', actor: 'initiator' },
  // From accepted
  'accepted|execute': { next: 'executed', actor: 'responder' },
  // From executed (co-signed receipt - either side can post the completed receipt)
  'executed|settle': { next: 'settled', actor: 'either', coSigned: true },
  'executed|dispute': { next: 'disputed', actor: 'either' },
  // From settled
  'settled|dispute': { next: 'disputed', actor: 'either' },
};

/** Terminal states — no further transitions accepted. */
export const TERMINAL_STATES: ReadonlySet<NegotiationState> = new Set([
  'rejected',
  'settled',
  'disputed',
]);

/** Result of attempting a state transition. */
export interface TransitionResult {
  ok: boolean;
  nextState?: NegotiationState;
  error?: string;
  reason?:
    | 'illegal-transition'
    | 'wrong-actor'
    | 'terminal-state'
    | 'unknown-action'
    | 'missing-counter-signature';
}

/**
 * Determine whether an actor in `actorRole` may apply `action` to a
 * negotiation currently in `currentState`. Returns the next state on
 * success or a structured error otherwise. This is pure logic — no I/O
 * and no side effects — so the route handler and tests can both call it.
 */
export function checkTransition(
  currentState: NegotiationState,
  action: NegotiationAction,
  actorRole: NegotiationRole,
): TransitionResult {
  if (TERMINAL_STATES.has(currentState) && action !== 'dispute') {
    return {
      ok: false,
      reason: 'terminal-state',
      error: `negotiation in terminal state ${currentState}, only 'dispute' is legal`,
    };
  }
  // dispute is legal from settled or executed (handled below by table)
  const key = `${currentState}|${action}` as const;
  const rule = TRANSITIONS[key];
  if (rule === null || rule === undefined) {
    return {
      ok: false,
      reason: 'illegal-transition',
      error: `cannot apply '${action}' to negotiation in state '${currentState}'`,
    };
  }
  if (rule.actor !== 'either' && rule.actor !== actorRole) {
    return {
      ok: false,
      reason: 'wrong-actor',
      error: `action '${action}' must be authored by '${rule.actor}', not '${actorRole}'`,
    };
  }
  return { ok: true, nextState: rule.next };
}

// ── Quote, settlement, and event records ──────────────────────────────

/**
 * The economic terms a responder offers in response to a request_quote.
 * `currency` is intentionally a string (not enum) so deployments can use
 * USD, USDC, sat, credits, etc. without core changes.
 */
export interface NegotiationQuote {
  /** Agreed work product — usually a tool name + capability_query echo. */
  toolName: string;
  /** What the responder commits to deliver. */
  description: string;
  /** Numeric price in the named currency unit. 0 = free / favor. */
  price: number;
  /** Currency code or token symbol. */
  currency: string;
  /** SLA target in seconds (responder's wallclock budget). 0 = best-effort. */
  slaSeconds: number;
  /** ISO-8601 expiration; quote is invalid after this timestamp. */
  expiresAt: string;
}

/**
 * Settlement receipt produced once both parties have signed the executed
 * outcome. The receipt is the durable artifact of a successful cycle —
 * same role as a signed invoice in conventional commerce.
 */
export interface SettlementReceipt {
  protocol: typeof NEGOTIATION_PROTOCOL;
  negotiationId: string;
  initiatorSignature: string;
  initiatorAddress: string;
  responderSignature: string;
  responderAddress: string;
  finalQuote: NegotiationQuote;
  /** Hash of the executed result body — proves *what* was delivered. */
  resultHash: string;
  /**
   * Optional on-chain anchor tx hash (Base / EIP-712 calldata pattern,
   * F.041 / W.GOLD.514). When present, the chain itself is the
   * dispute-resistant ground truth.
   */
  settlementTxHash?: string;
  settledAt: string;
}

/**
 * One event in the negotiation log. The route handler appends one of
 * these per /message POST that carries `messageType: 'negotiation'`.
 */
export interface NegotiationEvent {
  /** Monotonic event ordinal within this negotiation, starting at 0. */
  seq: number;
  action: NegotiationAction;
  /** State that resulted from this event. */
  state: NegotiationState;
  authorAgentId: string;
  authorRole: NegotiationRole;
  /** The signer address that the request-signing verifier recovered. */
  signerAddress?: string;
  /** Free-form payload — e.g. NegotiationQuote, dispute reason, exec result hash. */
  payload?: Record<string, unknown>;
  createdAt: string;
}

/**
 * The full negotiation aggregate. Stored keyed by negotiationId in an
 * in-memory Map (same eviction discipline as messaging.ts — out of
 * scope for the MVP scope guardrail; receipts of interest are persisted
 * on-chain via settlementTxHash when long-term durability matters).
 */
export interface Negotiation {
  id: string;
  protocol: typeof NEGOTIATION_PROTOCOL;
  teamId: string;
  initiatorAgentId: string;
  initiatorAgentName: string;
  responderAgentId: string;
  responderAgentName: string;
  state: NegotiationState;
  /** Latest live quote from the responder, replaced on each new quote. */
  quote?: NegotiationQuote;
  /** Set once the cycle reaches 'settled' — the durable artifact. */
  receipt?: SettlementReceipt;
  events: NegotiationEvent[];
  createdAt: string;
  updatedAt: string;
}

// ── In-memory store ────────────────────────────────────────────────────

/**
 * Module-private store. Production deployments that need durability
 * across restart should replace with a persisted backend, but per the
 * task scope guardrail the MVP only needs to cover one cycle in-process
 * and rely on chain anchoring for terminal proof.
 */
const negotiations = new Map<string, Negotiation>();

/** Test-only reset. */
export function _resetNegotiations(): void {
  negotiations.clear();
}

/** Read-only accessor — returns the negotiation by id or undefined. */
export function getNegotiation(id: string): Negotiation | undefined {
  return negotiations.get(id);
}

/** Read-only listing — returns all negotiations for a team, newest first. */
export function listNegotiationsForTeam(teamId: string): Negotiation[] {
  const out: Negotiation[] = [];
  for (const n of negotiations.values()) {
    if (n.teamId === teamId) out.push(n);
  }
  out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out;
}

// ── Lifecycle: create, advance, settle ─────────────────────────────────

export interface CreateNegotiationInput {
  teamId: string;
  initiatorAgentId: string;
  initiatorAgentName: string;
  responderAgentId: string;
  responderAgentName: string;
  /**
   * The first event in the cycle — what tool / capability the initiator
   * is requesting a quote for.
   */
  request: {
    toolName: string;
    capabilityQuery: string;
    args?: Record<string, unknown>;
  };
  /** Optional pre-supplied id for deterministic test fixtures. */
  id?: string;
  signerAddress?: string;
}

/**
 * Create a new negotiation in the 'open' state. The initiator's
 * `request_quote` event is recorded as event seq=0.
 */
export function createNegotiation(input: CreateNegotiationInput): Negotiation {
  if (input.initiatorAgentId === input.responderAgentId) {
    throw new Error('initiator and responder must be distinct agents');
  }
  const id = input.id ?? `nego_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const event: NegotiationEvent = {
    seq: 0,
    action: 'request_quote',
    state: 'open',
    authorAgentId: input.initiatorAgentId,
    authorRole: 'initiator',
    signerAddress: input.signerAddress,
    payload: { request: input.request },
    createdAt: now,
  };
  const negotiation: Negotiation = {
    id,
    protocol: NEGOTIATION_PROTOCOL,
    teamId: input.teamId,
    initiatorAgentId: input.initiatorAgentId,
    initiatorAgentName: input.initiatorAgentName,
    responderAgentId: input.responderAgentId,
    responderAgentName: input.responderAgentName,
    state: 'open',
    events: [event],
    createdAt: now,
    updatedAt: now,
  };
  negotiations.set(id, negotiation);
  return negotiation;
}

export interface AdvanceNegotiationInput {
  negotiationId: string;
  action: NegotiationAction;
  authorAgentId: string;
  signerAddress?: string;
  payload?: Record<string, unknown>;
}

export interface AdvanceNegotiationResult {
  ok: boolean;
  negotiation?: Negotiation;
  event?: NegotiationEvent;
  error?: string;
  reason?: TransitionResult['reason'] | 'not-found' | 'not-a-party';
}

/**
 * Apply an action to an existing negotiation. Validates the actor's
 * role, runs the state-machine check, appends the event, mutates the
 * aggregate, and returns the new state.
 *
 * The route handler is responsible for verifying the signature *before*
 * calling this function (signing-middleware does that and provides
 * `signerAddress`). This function is pure state-machine bookkeeping.
 */
export function advanceNegotiation(input: AdvanceNegotiationInput): AdvanceNegotiationResult {
  const n = negotiations.get(input.negotiationId);
  if (!n) {
    return { ok: false, reason: 'not-found', error: `negotiation ${input.negotiationId} not found` };
  }
  const role = roleForAgent(n, input.authorAgentId);
  if (!role) {
    return {
      ok: false,
      reason: 'not-a-party',
      error: `agent ${input.authorAgentId} is not a party to negotiation ${n.id}`,
    };
  }
  const check = checkTransition(n.state, input.action, role);
  if (!check.ok) {
    return { ok: false, reason: check.reason, error: check.error };
  }
  // Validate quote payload when responder is quoting
  if (input.action === 'quote') {
    const q = (input.payload?.quote as NegotiationQuote | undefined);
    const v = validateQuote(q);
    if (!v.ok) return { ok: false, reason: 'illegal-transition', error: v.error };
    n.quote = q;
  }
  // Settlement requires both signatures — handled separately below.
  if (input.action === 'settle') {
    const settleRes = applySettlement(n, input);
    if (!settleRes.ok) return settleRes;
  }
  const event: NegotiationEvent = {
    seq: n.events.length,
    action: input.action,
    state: check.nextState!,
    authorAgentId: input.authorAgentId,
    authorRole: role,
    signerAddress: input.signerAddress,
    payload: input.payload,
    createdAt: new Date().toISOString(),
  };
  n.events.push(event);
  n.state = check.nextState!;
  n.updatedAt = event.createdAt;
  return { ok: true, negotiation: n, event };
}

// ── Quote validation ──────────────────────────────────────────────────

function validateQuote(q: NegotiationQuote | undefined): { ok: true } | { ok: false; error: string } {
  if (!q || typeof q !== 'object') {
    return { ok: false, error: 'quote payload required: { toolName, description, price, currency, slaSeconds, expiresAt }' };
  }
  if (typeof q.toolName !== 'string' || !q.toolName) return { ok: false, error: 'quote.toolName required' };
  if (typeof q.description !== 'string') return { ok: false, error: 'quote.description required' };
  if (typeof q.price !== 'number' || q.price < 0 || !Number.isFinite(q.price)) {
    return { ok: false, error: 'quote.price must be a non-negative finite number' };
  }
  if (typeof q.currency !== 'string' || !q.currency) return { ok: false, error: 'quote.currency required' };
  if (typeof q.slaSeconds !== 'number' || q.slaSeconds < 0) {
    return { ok: false, error: 'quote.slaSeconds must be a non-negative number' };
  }
  if (typeof q.expiresAt !== 'string' || Number.isNaN(Date.parse(q.expiresAt))) {
    return { ok: false, error: 'quote.expiresAt must be a valid ISO-8601 timestamp' };
  }
  return { ok: true };
}

// ── Settlement (co-signed receipt) ────────────────────────────────────

/**
 * The `settle` action requires one completed receipt containing both
 * parties' signatures. We intentionally reject half-signed receipts
 * instead of storing partial state, so a failed settlement attempt cannot
 * mutate the aggregate or leave a misleading receipt behind.
 *
 * Pattern: scope guardrail says "one signed receipt" — we still take both
 * signatures (initiator + responder) so the receipt is dispute-resistant
 * by construction. The chain anchor (settlementTxHash) is optional here
 * because in-band signatures already give us cryptographic non-repudiation
 * for one cycle; chain anchor is the durability layer for cross-restart
 * verification, which production deployments should add.
 */
function applySettlement(
  n: Negotiation,
  input: AdvanceNegotiationInput,
): AdvanceNegotiationResult {
  const partial = input.payload?.partialReceipt as Partial<SettlementReceipt> | undefined;
  if (!partial || typeof partial !== 'object') {
    return {
      ok: false,
      reason: 'missing-counter-signature',
      error: 'settle payload requires partialReceipt with both party signatures',
    };
  }
  // Did the previous executed event have an output we can hash?
  const lastExec = [...n.events].reverse().find((e) => e.action === 'execute');
  if (!lastExec) {
    return {
      ok: false,
      reason: 'illegal-transition',
      error: 'cannot settle without a prior execute event',
    };
  }
  if (!n.quote) {
    return {
      ok: false,
      reason: 'illegal-transition',
      error: 'cannot settle without a finalQuote — quote was never set',
    };
  }
  const resultHash = (partial.resultHash as string) ?? hashResult(lastExec.payload?.result);

  const initiatorSignature = partial.initiatorSignature as string | undefined;
  const initiatorAddress = partial.initiatorAddress as string | undefined;
  const responderSignature = partial.responderSignature as string | undefined;
  const responderAddress = partial.responderAddress as string | undefined;

  if (!initiatorSignature || !initiatorAddress || !responderSignature || !responderAddress) {
    return {
      ok: false,
      reason: 'missing-counter-signature',
      error: 'settle requires both initiator and responder signatures in partialReceipt',
    };
  }

  n.receipt = {
    protocol: NEGOTIATION_PROTOCOL,
    negotiationId: n.id,
    initiatorSignature,
    initiatorAddress,
    responderSignature,
    responderAddress,
    finalQuote: n.quote,
    resultHash,
    settlementTxHash: partial.settlementTxHash as string | undefined,
    settledAt: new Date().toISOString(),
  };
  return { ok: true };
}

/**
 * Input for the co-signed settlement helper. Pulled out of the function
 * signature so the chain-anchor variant can extend it without duplicating
 * the field list.
 */
export interface SettleNegotiationInput {
  negotiationId: string;
  authorAgentId: string;
  signerAddress?: string;
  initiatorSignature: string;
  initiatorAddress: string;
  responderSignature: string;
  responderAddress: string;
  resultHash?: string;
  /**
   * Caller-supplied tx hash. Use the chain-anchor variant
   * (`settleNegotiationWithAnchor`) instead when you have a Signer and want
   * the runtime to mint a real tx hash via `eth_sendTransaction` (F.041 /
   * W.GOLD.514 chain-anchor pattern).
   */
  settlementTxHash?: string;
}

/**
 * Co-signed settlement helper — supplies BOTH legs in one call. Cleaner
 * reference flow for tests and the canonical "one signed receipt" path.
 */
export function settleNegotiation(input: SettleNegotiationInput): AdvanceNegotiationResult {
  const n = negotiations.get(input.negotiationId);
  if (!n) return { ok: false, reason: 'not-found', error: `negotiation ${input.negotiationId} not found` };
  if (!n.quote) {
    return {
      ok: false,
      reason: 'illegal-transition',
      error: 'cannot settle without a quote',
    };
  }
  const lastExec = [...n.events].reverse().find((e) => e.action === 'execute');
  if (!lastExec) {
    return {
      ok: false,
      reason: 'illegal-transition',
      error: 'cannot settle without a prior execute event',
    };
  }
  const resultHash = input.resultHash ?? hashResult(lastExec.payload?.result);
  const receipt: SettlementReceipt = {
    protocol: NEGOTIATION_PROTOCOL,
    negotiationId: n.id,
    initiatorSignature: input.initiatorSignature,
    initiatorAddress: input.initiatorAddress,
    responderSignature: input.responderSignature,
    responderAddress: input.responderAddress,
    finalQuote: n.quote,
    resultHash,
    settlementTxHash: input.settlementTxHash,
    settledAt: new Date().toISOString(),
  };
  return advanceNegotiation({
    negotiationId: input.negotiationId,
    action: 'settle',
    authorAgentId: input.authorAgentId,
    signerAddress: input.signerAddress,
    payload: { partialReceipt: receipt },
  });
}

function roleForAgent(n: Negotiation, agentId: string): NegotiationRole | null {
  if (agentId === n.initiatorAgentId) return 'initiator';
  if (agentId === n.responderAgentId) return 'responder';
  return null;
}

/**
 * Chain-anchored settlement — takes a Signer (dev-keyed for tests, Trezor
 * for the founder swap) and produces a real `settlementTxHash` populated
 * from `eth_sendTransaction`. The EIP-712 hash of the receipt becomes the
 * tx calldata (F.041 / W.GOLD.514 pattern).
 *
 * This is the canonical Phase 2 path. The non-anchor `settleNegotiation`
 * stays for backwards compat and for callers that already have a tx hash
 * from somewhere else (e.g. forwarded by an agent that anchored on a
 * different RPC).
 *
 * Returns the same AdvanceNegotiationResult shape as the sync helper, plus
 * an `anchor` field on success carrying the EIP-712 hash + signer address +
 * block info for the route handler to surface.
 *
 * Throws ONLY for signer / RPC failures — state-machine rejections still
 * come back as `{ ok: false, reason }` results.
 */
export async function settleNegotiationWithAnchor(input: {
  negotiationId: string;
  authorAgentId: string;
  signerAddress?: string;
  initiatorSignature: string;
  initiatorAddress: string;
  responderSignature: string;
  responderAddress: string;
  resultHash?: string;
  signer: import('./signing/signer').Signer;
  domain?: import('./signing/chain-anchor').SettlementDomain;
}): Promise<
  AdvanceNegotiationResult & { anchor?: import('./signing/chain-anchor').AnchorResult }
> {
  // Build the receipt FIRST (without txHash) so we can hash it deterministically.
  const n = negotiations.get(input.negotiationId);
  if (!n) {
    return {
      ok: false,
      reason: 'not-found',
      error: `negotiation ${input.negotiationId} not found`,
    };
  }
  const role = roleForAgent(n, input.authorAgentId);
  if (!role) {
    return {
      ok: false,
      reason: 'not-a-party',
      error: `agent ${input.authorAgentId} is not a party to negotiation ${n.id}`,
    };
  }
  const transition = checkTransition(n.state, 'settle', role);
  if (!transition.ok) {
    return { ok: false, reason: transition.reason, error: transition.error };
  }
  if (!n.quote) {
    return {
      ok: false,
      reason: 'illegal-transition',
      error: 'cannot settle without a quote',
    };
  }
  const lastExec = [...n.events].reverse().find((e) => e.action === 'execute');
  if (!lastExec) {
    return {
      ok: false,
      reason: 'illegal-transition',
      error: 'cannot settle without a prior execute event',
    };
  }
  const resultHash = input.resultHash ?? hashResult(lastExec.payload?.result);
  const settledAt = new Date().toISOString();
  const hashable: import('./signing/chain-anchor').HashableReceipt = {
    protocol: NEGOTIATION_PROTOCOL,
    negotiationId: n.id,
    initiatorAddress: input.initiatorAddress,
    responderAddress: input.responderAddress,
    initiatorSignature: input.initiatorSignature,
    responderSignature: input.responderSignature,
    resultHash,
    finalQuote: n.quote,
    settledAt,
  };

  // Anchor on chain (or mocked broadcast) — produces the txHash we feed back
  // into the receipt before we let the state machine flip to 'settled'.
  const { anchorSettlement } = await import('./signing/chain-anchor');
  const anchor = await anchorSettlement(input.signer, hashable, input.domain);

  // Build the final receipt with the anchored txHash + the SAME settledAt we
  // hashed (so receipt -> hash round-trips against the chain). Bypass
  // `applySettlement`'s clock-fresh settledAt to keep the pin tight.
  const receipt: SettlementReceipt = {
    protocol: NEGOTIATION_PROTOCOL,
    negotiationId: n.id,
    initiatorSignature: input.initiatorSignature,
    initiatorAddress: input.initiatorAddress,
    responderSignature: input.responderSignature,
    responderAddress: input.responderAddress,
    finalQuote: n.quote,
    resultHash,
    settlementTxHash: anchor.txHash,
    settledAt,
  };
  // Apply via advanceNegotiation so the state machine + event log update.
  // applySettlement reads the partialReceipt fields back out, so re-emitting
  // the same shape here keeps a single code path for state validation.
  const advanced = advanceNegotiation({
    negotiationId: input.negotiationId,
    action: 'settle',
    authorAgentId: input.authorAgentId,
    signerAddress: input.signerAddress,
    payload: { partialReceipt: receipt },
  });
  if (!advanced.ok) return advanced;
  // Overwrite the receipt with our deterministic version (applySettlement
  // wrote one with a fresh settledAt; we want the one whose hash matches the
  // anchor). This is safe — same negotiation, same fields, just a pinned
  // settledAt.
  if (advanced.negotiation) {
    advanced.negotiation.receipt = receipt;
  }
  return { ...advanced, anchor };
}

// ── Hashing helper ────────────────────────────────────────────────────

function hashResult(result: unknown): string {
  const json = canonicalize(result);
  return '0x' + createHash('sha256').update(json).digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`).join(',')}}`;
}
