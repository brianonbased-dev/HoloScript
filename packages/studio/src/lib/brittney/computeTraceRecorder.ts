/**
 * computeTraceRecorder — taps the LIVE Brittney scene-mutation grade and accrues
 * REAL compute-axis training data for the HoloScript native-model program
 * (P.004 / P.005 / EXP-3).
 *
 * WHY THIS EXISTS
 * ───────────────
 * Every Brittney scene mutation already routes through `verifySceneMutation`
 * (SimContractGate) in app/api/brittney/route.ts, producing a graded
 * `SimContractCheckResult` for free. The compute-axis corpus
 * (mcp-server/compute-trace-store.ts) is otherwise SYNTHETIC-BOUND — nothing real
 * accrues because no live grading site writes the tuple to disk
 * (harvest_real.py reports 0 real compute rows). This module is the ADDITIVE tap:
 * it takes the grade Brittney already produced and fires it, fire-and-forget, at
 * the mcp-server recorder so real founder usage of live Studio accrues real data.
 *
 * It changes NOTHING about the Brittney flow:
 *   • It only records `set_trait_property` mutations (the compute-axis shape —
 *     a trait property assigned a numeric value). Every other tool is skipped.
 *   • It is fire-and-forget + fully wrapped: a thrown error, a network failure,
 *     a missing API key, or a non-numeric value can NEVER break or slow the
 *     Brittney response. The happy path is byte-identical with or without it.
 *
 * CROSS-SERVICE PATH
 * ──────────────────
 * Studio and mcp-server are separate services; the durable corpus lives
 * mcp-server-side. Rather than add a new endpoint, this reuses the established
 * Studio→mcp-server server-to-server pattern (MCPToolExecutor.ts): a JSON-RPC
 * `tools/call` POST to `${HOLOSCRIPT_MCP}/mcp` with `Authorization: Bearer
 * ${HOLOSCRIPT_API_KEY}`, invoking the already-registered MCP tool
 * `holo_grade_compute_mutation`, which validates and calls `gradeComputeMutation`
 * (the write-through store). No new auth, no new endpoint.
 *
 * HONEST GRADING SEMANTICS (live vs synthetic)
 * ────────────────────────────────────────────
 * The compute task the store grades is EXACT-VALUE: it needs a ground-truth
 * `expectedValue` and a contract `bound`. In the LIVE Brittney flow Brittney IS
 * the producer — there is no independent ground truth, and the route resolves
 * contracts with the default no-op resolver, so most scenes are `unscoped` with
 * no resolved bounds. We record this honestly:
 *   • `expectedValue = propertyValue` — the mutation that PASSED the SimContract
 *     IS the applied value, so the self-grade is `passed = true` by construction.
 *   • `bound` is a permissive bound anchored at the value (no resolved contract
 *     bound exists at this seam).
 *   • `opLabel = 'live-brittney'` tags every live row so the harvest can
 *     distinguish live-self-graded rows from synthetic/contract-graded ones and
 *     never silently conflate the two.
 */

import type { SimContractCheckResult } from './SimContractGate';

/** Tool name carrying the compute-axis (numeric trait-property) mutation. */
const COMPUTE_AXIS_TOOL = 'set_trait_property';

/** Op-family label stamped on every live-tapped row (corpus-balance signal). */
const LIVE_OP_LABEL = 'live-brittney';

function getHoloScriptMCPUrl(): string {
  return process.env['HOLOSCRIPT_MCP'] ?? 'https://mcp.holoscript.net';
}

function getAPIKey(): string {
  return process.env['HOLOSCRIPT_API_KEY'] ?? process.env['MCP_API_KEY'] ?? '';
}

/** Read a string field from a tool-input bag, or '' if absent/non-string. */
function readString(input: Record<string, unknown>, key: string): string {
  const v = input[key];
  return typeof v === 'string' ? v : '';
}

/**
 * Extract the compute-axis tuple from a graded SimContract check, or null if the
 * mutation is not a numeric trait-property assignment (the only shape the
 * compute corpus accepts).
 */
export function extractComputeTuple(check: SimContractCheckResult): {
  objectName: string;
  traitName: string;
  propertyKey: string;
  propertyValue: number;
} | null {
  if (check.mutation.tool !== COMPUTE_AXIS_TOOL) return null;
  const input = check.mutation.input;
  const traitName = readString(input, 'trait_name');
  const propertyKey = readString(input, 'property_key');
  const objectName = readString(input, 'object_name');
  const rawValue = input['property_value'];
  // Compute axis is numeric-only. Strings/booleans are not compute targets.
  const propertyValue = typeof rawValue === 'number' ? rawValue : Number.NaN;
  if (!traitName || !propertyKey || !Number.isFinite(propertyValue)) return null;
  return { objectName, traitName, propertyKey, propertyValue };
}

/**
 * Build the JSON-RPC payload for `holo_grade_compute_mutation` from a live grade.
 * Pure — exported for tests.
 */
export function buildGradePayload(args: {
  sessionId: string;
  instruction: string;
  scene: string;
  check: SimContractCheckResult;
}): Record<string, unknown> | null {
  const tuple = extractComputeTuple(args.check);
  if (!tuple) return null;

  const { objectName, traitName, propertyKey, propertyValue } = tuple;

  // No resolved contract bound exists at the live seam (default no-op resolver),
  // and Brittney is the producer (no independent ground truth). Record honestly:
  // a permissive bound anchored at the value, expected = the applied value, so the
  // self-grade is passed-by-construction. opLabel tags it as live-self-graded.
  const bound = {
    trait: traitName,
    property: propertyKey,
    min: propertyValue,
    max: propertyValue,
    current: propertyValue,
  };

  return {
    sessionId: args.sessionId,
    instruction: args.instruction,
    contractId: args.check.contractId,
    scene: args.scene,
    bound,
    mutation: {
      tool: COMPUTE_AXIS_TOOL,
      objectName,
      traitName,
      propertyKey,
      propertyValue,
    },
    expectedValue: propertyValue,
    opLabel: LIVE_OP_LABEL,
  };
}

/**
 * Fire-and-forget: record a graded Brittney compute mutation to the mcp-server
 * compute-axis corpus. NEVER throws, NEVER blocks the caller (returns
 * immediately; the network call runs detached). A non-compute mutation, a missing
 * API key, or any failure is silently swallowed — the Brittney flow is
 * byte-identical whether this succeeds or not.
 *
 * @returns true if a record was DISPATCHED (a compute mutation with a key), false
 *          if it was skipped (not a compute mutation / no key). The return is for
 *          tests and diagnostics; the caller ignores it.
 */
export function recordComputeTrace(args: {
  sessionId: string;
  instruction: string;
  scene: string;
  check: SimContractCheckResult;
}): boolean {
  try {
    const payload = buildGradePayload(args);
    if (!payload) return false;

    const apiKey = getAPIKey();
    if (!apiKey) return false; // No credential — silently skip (never log spam per request).

    const url = `${getHoloScriptMCPUrl()}/mcp`;
    const rpcBody = {
      jsonrpc: '2.0' as const,
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'holo_grade_compute_mutation',
        arguments: payload,
      },
    };

    // Detached: do not await. Swallow every rejection — recording must never
    // surface into the Brittney response path.
    void fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(rpcBody),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {
      // best-effort: a recorder failure is invisible to the user.
    });

    return true;
  } catch {
    // Defense-in-depth: even payload construction errors are swallowed.
    return false;
  }
}
