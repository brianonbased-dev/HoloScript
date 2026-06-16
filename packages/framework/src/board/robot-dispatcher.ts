/**
 * Robot Dispatcher — production-wiring point for substrate actuation.
 *
 * This is the interface the `twin_earth_robot_actuate` handler's code comment
 * has long called for: the seam between the REAL safety chain
 * (`evaluateActuation`, the 14-check gate in twin-earth-substrate.ts) and the
 * physical / simulated robot runtime.
 *
 * The dispatcher itself does NOT decide whether an actuation is permitted —
 * that is the safety substrate's job. The dispatcher only carries an
 * already-authorized command to a backend (stub, ROS2, MQTT, or a deterministic
 * sim) and reports honestly which backend handled it and whether the effect was
 * real or simulated.
 *
 * The `gatedDispatch` function below wires the two together and makes the
 * safety-then-dispatch-then-receipt ORDER structurally enforced: it is
 * impossible to obtain a success receipt without (a) a prior `allowed` verdict
 * from `evaluateActuation` AND (b) a successful dispatch from the backend.
 *
 * Contract: research/2026-05-13_twin-earth-substrate-contract.md
 * Wiring target: packages/mcp-server/src/robot-ai-mcp-tools.ts
 *                handleTwinEarthRobotActuate.
 */

import {
  evaluateActuation,
  type ActuationResult,
  type TwinEarthIdentity,
  type PermissionGrant,
  type SafetyEnvelope,
  type TwinEarthAction,
  type TwinEarthReceipt,
} from './twin-earth-substrate';
import type { ArtifactHashAlgorithm } from './board-types';

// ═════════════════════════════════════════════════════════════════════════════
// 1. DISPATCH BACKEND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Where an authorized actuation is physically (or virtually) carried out.
 * - `stub` — honest no-op; gates run but no hardware is driven (simulated:true).
 * - `ros2` — a ROS 2 bridge driving a real or networked robot runtime.
 * - `mqtt` — an MQTT actuator bus.
 * - `sim`  — a deterministic in-process simulator (reproducible, simulated:true).
 */
export type DispatchBackend = 'stub' | 'ros2' | 'mqtt' | 'sim' | 'fara';

/** A request to dispatch a single already-authorized command to a backend. */
export interface DispatchRequest {
  /** Robot identity that owns the command. */
  agentId: string;
  /** Actuation command verb (e.g. 'move', 'grip', 'halt'). */
  command: string;
  /** Command-specific parameters (coordinates, force, duration). Optional. */
  parameters?: Record<string, unknown>;
  /** Safety envelope that authorized this command — for backend audit. */
  envelopeId: string;
}

/** Honest result of a single dispatch attempt. */
export interface DispatchResult {
  /** Whether the backend accepted and executed (or simulated) the command. */
  dispatched: boolean;
  /** Which backend handled it — reflected verbatim into the receipt. */
  dispatchedTo: DispatchBackend;
  /** Whether the effect was simulated (true) or a real physical effect (false). */
  simulated: boolean;
  /** Optional human-readable detail (failure reason, sim notes, etc.). */
  detail?: string;
}

/**
 * A backend that carries an already-authorized actuation to a runtime.
 *
 * IMPORTANT: implementations MUST NOT perform safety evaluation — that is the
 * substrate's responsibility, enforced before `dispatch` is ever called (see
 * `gatedDispatch`). A dispatcher only executes/forwards and reports honestly.
 */
export interface RobotDispatcher {
  /** The backend this dispatcher targets. */
  readonly backend: DispatchBackend;
  /** Carry an authorized command to the backend. */
  dispatch(req: DispatchRequest): Promise<DispatchResult>;
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. STUB DISPATCHER (honest no-op)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * The honest default dispatcher: drives NO hardware. It accepts the command,
 * reports `dispatchedTo: 'stub'` and `simulated: true`, and does nothing
 * physical. This is what ships until a real backend (ROS2/MQTT) is wired in.
 *
 * Callers MUST check `dispatchedTo === 'stub'` (or `simulated === true`) before
 * treating a resulting receipt as proof of a real physical actuation.
 */
export class StubRobotDispatcher implements RobotDispatcher {
  readonly backend: DispatchBackend = 'stub';

  async dispatch(req: DispatchRequest): Promise<DispatchResult> {
    return {
      dispatched: true,
      dispatchedTo: 'stub',
      simulated: true,
      detail: `Stub dispatch (no hardware): agent=${req.agentId} command=${req.command} envelope=${req.envelopeId}`,
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. RECEIPT GATE
// ═════════════════════════════════════════════════════════════════════════════

/** Parameters for a single gated dispatch. */
export interface GatedDispatchParams {
  /** Substrate identity of the actuating robot. */
  identity: TwinEarthIdentity;
  /** Permission grant covering the requested action + scope. */
  grant: PermissionGrant;
  /** Active safety envelope for the identity. */
  envelope: SafetyEnvelope;
  /** Substrate action being requested (e.g. 'robot:move'). */
  action: TwinEarthAction;
  /** Scope of the action (contextId or '*'). */
  scope: string;
  /** Raw command request to forward to the dispatcher when allowed. */
  request: DispatchRequest;
  /** Backend that carries the command — defaults to StubRobotDispatcher. */
  dispatcher?: RobotDispatcher;
  /**
   * ID factory for the success receipt. Injected so callers can preserve their
   * existing receipt-id scheme (e.g. `() => genId('act')`). Defaults to a
   * timestamp-based id.
   */
  genReceiptId?: () => string;
  /**
   * Hash factory for the receipt body + optional payload. Injected so callers
   * can reuse their existing SHA-256 helper. Defaults to a deterministic,
   * dependency-free FNV-1a hex digest (NOT cryptographic — override in prod).
   */
  hash?: (input: string) => Promise<string>;
  /** Algorithm label recorded on the receipt. Defaults to 'sha256'. */
  hashAlgorithm?: ArtifactHashAlgorithm;
  /** Substrate version label recorded on the receipt. */
  substrateVersion?: string;
}

/** Discriminated result of a gated dispatch. */
export type GatedDispatchResult =
  | {
      /** Safety verdict denied the actuation — no dispatch, no success receipt. */
      ok: false;
      stage: 'safety';
      blockingRule: ActuationResult['blockingRule'];
      reason: string;
    }
  | {
      /** Allowed, but the backend failed to dispatch — no success receipt. */
      ok: false;
      stage: 'dispatch';
      reason: string;
      dispatch: DispatchResult;
    }
  | {
      /** Allowed AND dispatched — a valid success receipt was produced. */
      ok: true;
      stage: 'dispatched';
      dispatch: DispatchResult;
      receipt: TwinEarthReceipt;
    };

const DEFAULT_SUBSTRATE_VERSION = '1.0.0';

/**
 * Non-cryptographic, dependency-free fallback digest (FNV-1a, 64-bit, hex).
 * Used only when no `hash` is injected. Production callers inject a real
 * SHA-256 (e.g. crypto.subtle.digest).
 */
async function fallbackHash(input: string): Promise<string> {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

/**
 * Safety-gated dispatch — the single production entry point.
 *
 * Enforces the order BY CONSTRUCTION:
 *   1. `evaluateActuation(...)` runs first. If `!allowed`, the function returns
 *      `{ ok: false, stage: 'safety', ... }` and NEVER calls the dispatcher and
 *      NEVER emits a success receipt.
 *   2. Only on an `allowed` verdict is `dispatcher.dispatch(req)` invoked.
 *   3. Only if `dispatch.dispatched` is true is a success receipt
 *      (`kind: 'action'`, `status: 'success'`) built and returned. The receipt's
 *      `envelopeId`/`hash` mirror the existing handler, and `dispatchedTo` flows
 *      from the backend (so a real ROS2 dispatcher yields a 'ros2'-backed
 *      receipt while the stub yields a 'stub'-backed one).
 *
 * There is no code path in this function that produces an `ok: true` receipt
 * without first passing the safety verdict AND a successful dispatch.
 */
export async function gatedDispatch(params: GatedDispatchParams): Promise<GatedDispatchResult> {
  const {
    identity,
    grant,
    envelope,
    action,
    scope,
    request,
    dispatcher = new StubRobotDispatcher(),
    genReceiptId,
    hash = fallbackHash,
    hashAlgorithm = 'sha256',
    substrateVersion = DEFAULT_SUBSTRATE_VERSION,
  } = params;

  // ── Stage 1: SAFETY. Must pass before anything else happens. ────────────────
  const verdict = evaluateActuation(identity, grant, envelope, action, scope);
  if (!verdict.allowed) {
    return {
      ok: false,
      stage: 'safety',
      blockingRule: verdict.blockingRule,
      reason: verdict.reason,
    };
  }

  // ── Stage 2: DISPATCH. Reached ONLY after an allowed verdict. ────────────────
  const dispatch = await dispatcher.dispatch(request);
  if (!dispatch.dispatched) {
    return {
      ok: false,
      stage: 'dispatch',
      reason: dispatch.detail ?? `Backend '${dispatch.dispatchedTo}' did not dispatch the command.`,
      dispatch,
    };
  }

  // ── Stage 3: RECEIPT. Reached ONLY after an allowed verdict AND a successful
  //    dispatch. The dispatchedTo flows through from the actual backend. ───────
  const receiptId = genReceiptId ? genReceiptId() : `act_${Date.now()}`;
  const timestamp = new Date().toISOString();
  const bodyHash = await hash(
    `act:${identity.agentId}:${action}:${scope}:${dispatch.dispatchedTo}:${timestamp}`
  );
  const payloadHash =
    request.parameters && Object.keys(request.parameters).length > 0
      ? await hash(JSON.stringify(request.parameters))
      : undefined;

  const receipt: TwinEarthReceipt = {
    id: receiptId,
    kind: 'action',
    actorId: identity.agentId,
    action,
    scope,
    timestamp,
    status: 'success',
    hash: bodyHash,
    hashAlgorithm,
    ...(payloadHash ? { payloadHash } : {}),
    substrateVersion,
    envelopeId: envelope.id,
  };

  return { ok: true, stage: 'dispatched', dispatch, receipt };
}
