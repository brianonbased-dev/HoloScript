/**
 * dispatchFanout.ts — CG-757: the create-page "multi-target fan-out" button
 * stops pretending. Before this module, handleMultiTargetDispatch set
 * setExecutionState('running') and toasted "dispatched … receipts" while
 * executing nothing. This module invokes the REAL `compile_fanout` MCP tool
 * (packages/mcp-server/src/compileFanout.ts) through the same /api/mcp/call
 * proxy the palette commands use, so a user-triggered fan-out genuinely
 * compiles every target and writes the compile-job-{id} StateAuthority entity
 * the compilerExport panel is twin-checked against.
 *
 * The tool caller is injected so tests mock the transport seam, never the
 * result semantics: a failed or offline call reports ok:false with an honest
 * message — no receipt language without receipts.
 */

export interface FanoutDispatchTargetResult {
  target: string;
  status: 'ok' | 'degraded' | 'error';
  sizeKb: number;
  receiptHash: string;
  durationMs: number;
  error?: string;
}

export interface FanoutDispatchResult {
  ok: boolean;
  /** Honest one-line summary for the toast — real numbers or a real failure. */
  summary: string;
  jobId: string;
  entityId?: string;
  status?: 'complete' | 'partial';
  okCount?: number;
  targetCount?: number;
  totalKb?: number;
  targets?: FanoutDispatchTargetResult[];
  error?: string;
}

/** Targets proven to compile in-process by packages/mcp-server compileFanout tests. */
export const FANOUT_TARGETS = ['webgpu', 'unity', 'svg', 'usd'];

export type McpToolCaller = (
  tool: string,
  input: Record<string, unknown>
) => Promise<unknown>;

/** Default transport: the same /api/mcp/call gateway the palette commands use. */
export const callMcpTool: McpToolCaller = async (tool, input) => {
  const response = await fetch('/api/mcp/call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, input }),
  });
  const payload = (await response.json()) as {
    error?: string;
    result?: unknown;
    offline?: boolean;
  };
  if (!response.ok || payload.error) {
    throw new Error(payload.error ?? `${tool} failed with status ${response.status}`);
  }
  return payload.result ?? payload;
};

export async function dispatchCompileFanout({
  code,
  jobId = 'studio',
  targets = FANOUT_TARGETS,
  callTool = callMcpTool,
}: {
  code: string;
  jobId?: string;
  targets?: string[];
  callTool?: McpToolCaller;
}): Promise<FanoutDispatchResult> {
  try {
    const raw = (await callTool('compile_fanout', { jobId, code, targets })) as {
      jobId?: string;
      entityId?: string;
      status?: 'complete' | 'partial';
      okCount?: number;
      targetCount?: number;
      totalKb?: number;
      targets?: FanoutDispatchTargetResult[];
    } | null;

    if (!raw || raw.status === undefined || raw.targetCount === undefined) {
      return {
        ok: false,
        jobId,
        summary: 'Fan-out returned no job result — nothing was compiled',
        error: 'empty or shapeless compile_fanout result',
      };
    }

    const okCount = raw.okCount ?? 0;
    const totalKb = raw.totalKb ?? 0;
    const summary =
      raw.status === 'complete'
        ? `Fan-out complete: ${okCount}/${raw.targetCount} targets compiled, ${totalKb.toFixed(2)} KB of real output, receipts written to ${raw.entityId ?? `compile-job-${jobId}`}`
        : `Fan-out partial: ${okCount}/${raw.targetCount} targets compiled — see per-target errors in ${raw.entityId ?? `compile-job-${jobId}`}`;

    return {
      ok: true,
      jobId: raw.jobId ?? jobId,
      entityId: raw.entityId,
      status: raw.status,
      okCount,
      targetCount: raw.targetCount,
      totalKb,
      targets: raw.targets,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      jobId,
      summary: `Fan-out did not run: ${message}`,
      error: message,
    };
  }
}
