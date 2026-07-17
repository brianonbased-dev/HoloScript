/**
 * tool-call-checks.ts — the REAL pre-dispatch check wired at both CallTool
 * fold points (dependency-sovereignty-ladder follow-up, 2026-07-16: "wire a
 * real FounderGate/x402 ToolCallCheck at the two gate call sites").
 *
 * The seam (`ToolCallCheck` in tool-call-gate.ts) was built for exactly this:
 * FounderGate / x402 verification running BEFORE dispatch, in one place
 * instead of two transport handlers. This module composes the two real,
 * already-canonical verifications:
 *
 *   1. FOUNDER GATE (exact-four authority routing) — the shared
 *      `deriveFounderReversibility` classifier from @holoscript/framework
 *      (the same pure module the HoloMesh founder-decision route and the
 *      Studio authority projection consume). It classifies the DECLARED
 *      operation — the tool NAME, normalized (underscores/hyphens → spaces) —
 *      and denies when the route is `joseph-exact-four` (spend/custody,
 *      physical-presence, public-identity, governance) or `prohibited-replan`
 *      (force-push / hard-reset are never approvable). The tool name is the
 *      only classified text ON PURPOSE: tool args are caller DATA, and data
 *      must never steer authority routing (prompt-injection separation — a
 *      board message that merely mentions "trezor seed" must not deny the
 *      posting call). No tool name registered today classifies as either
 *      denied route (regression-tested in tool-call-checks.test.ts), so this
 *      branch is behavior-neutral for the current surface and a live forcing
 *      function for any future custody-class tool name.
 *
 *   2. X402 SEAT / SCOPE AUTHORIZATION — the same pure Gate-2 authorizer
 *      (`authorizeToolCall`, security/tool-scopes.ts) that x402-seat OAuth
 *      introspection feeds downstream. Running it at the fold point makes two
 *      things true pre-dispatch, on BOTH transports:
 *        • fail-closed on unregistered tool names (a spoofed name is denied
 *          before any dispatch, even with admin:*), and
 *        • scope insufficiency for identified HTTP callers denies before the
 *          handler runs (previously only inside securedToolExecution).
 *      The stdio transport with `callerId: null` is the trusted local process
 *      (no identity envelope — see the AUTH MODEL comment in index.ts); it is
 *      authorized as `admin:*`, which still fail-closes on unregistered names
 *      once the live registry is known. `authorizeToolCall` is pure, so the
 *      downstream triple gate re-running it on HTTP stays behavior-identical
 *      on the happy path.
 *
 * A denial surfaces as `ToolCallGateDeniedError` from `gateToolCall` (receipt
 * written first, with `deniedBy` naming the check that fired).
 */

import { deriveFounderReversibility } from '@holoscript/framework';
import { authorizeToolCall } from './security/tool-scopes';
import type { ToolCallCheck, ToolCallCheckDecision } from './tool-call-gate';

/** Check id recorded when the FounderGate branch denies. */
export const FOUNDER_GATE_CHECK_ID = 'founder-gate-exact-four';

/** Check id recorded when the x402 scope-authorization branch denies. */
export const X402_SCOPE_CHECK_ID = 'x402-scope-authorization';

/** Check id recorded on an allowed call (both branches passed). */
export const FOUNDER_GATE_X402_CHECK_ID = `${FOUNDER_GATE_CHECK_ID}+${X402_SCOPE_CHECK_ID}`;

/**
 * Trusted local stdio process (no identity envelope): authorized as admin.
 * `authorizeToolCall` still denies unregistered tool names for admin:* once
 * the live registry is known — the fail-closed-on-unregistered invariant.
 */
const TRUSTED_LOCAL_SCOPES: readonly string[] = ['admin:*'];

/**
 * Tool names are snake_case; the founder classifier speaks prose. Normalize
 * separators to spaces so e.g. a future `transfer_custody_authority` tool
 * name hits the custody-authority classifier.
 */
export function normalizeToolNameForAuthorityRouting(name: string): string {
  return name.replace(/[_-]+/g, ' ');
}

/**
 * FounderGate branch: classify the declared operation (tool name only).
 * Returns a denial decision, or undefined when the route is not denied.
 */
function founderGateDenial(toolName: string): ToolCallCheckDecision | undefined {
  const routing = deriveFounderReversibility(normalizeToolNameForAuthorityRouting(toolName));
  if (
    routing.authorityRoute === 'joseph-exact-four' ||
    routing.authorityRoute === 'prohibited-replan'
  ) {
    return {
      allowed: false,
      check: FOUNDER_GATE_CHECK_ID,
      reason: routing.reason,
    };
  }
  return undefined;
}

/**
 * The real FounderGate/x402 pre-dispatch check — wired as the `check` option
 * at both `gateToolCall` fold points (index.ts stdio, http-server.ts HTTP).
 */
export const founderGateX402ToolCallCheck: ToolCallCheck = (envelope, ctx) => {
  // 1) FounderGate — exact-four / prohibited-operation authority routing.
  const founderDenial = founderGateDenial(envelope.name);
  if (founderDenial) {
    return founderDenial;
  }

  // 2) x402 seat/scope authorization (Gate-2 authorizer at the fold point).
  const scopes =
    ctx.transport === 'stdio' && (ctx.callerId === null || ctx.callerId === undefined)
      ? TRUSTED_LOCAL_SCOPES
      : (ctx.scopes ?? []);
  const authz = authorizeToolCall(envelope.name, [...scopes]);
  if (!authz.authorized) {
    return {
      allowed: false,
      check: X402_SCOPE_CHECK_ID,
      reason: authz.reason,
    };
  }

  return { allowed: true, check: FOUNDER_GATE_X402_CHECK_ID };
};
