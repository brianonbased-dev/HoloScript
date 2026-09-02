/**
 * Compile fan-out → StateAuthority producer (CG-757, Slice 2c "make it real").
 *
 * Runs ONE compile job across MANY real targets in parallel and writes the
 * per-target results — status, real artifact size, and the compile handler's
 * own output sha256 as the receipt hash — into the `compile-job-{id}`
 * StateAuthority entity via the same in-process `push_state_delta` path agents
 * use (precedent: hologram-mcp-tools.ts calls handleNetworkingTool locally).
 *
 * This is the render-independent source of truth the @verified_view runtime
 * checker compares panels against (research/2026-07-10_verified-view-v1-design.md,
 * Slice 2c): nothing here is estimated, and nothing here reads from or writes
 * to any render path. A degraded compile (reference-substitute fallback) is
 * deliberately NOT `ok` — reporting a fallback as a success would put a false
 * artifact trail in the twin.
 *
 * Write topology: each target settles into its own top-level entity key
 * (`t_<target>`) so parallel completions never last-writer-wins over one
 * another, then one final summary write sets the scalar fields panels bind
 * (`status`, `targetCount`, `okCount`, `totalKb`) plus the consolidated
 * `targets` array. `push_state_delta` returns `skipped` for a no-diff re-push;
 * that is recorded, not treated as failure.
 */

import { createHash } from 'node:crypto';

import { handleCompilerTool } from './compiler-tools.js';
import { handleNetworkingTool } from './networking-tools.js';

export interface CompileFanoutTargetResult {
  target: string;
  status: 'ok' | 'degraded' | 'error';
  sizeKb: number;
  receiptHash: string;
  durationMs: number;
  warnings?: string[];
  error?: string;
}

export interface CompileFanoutResult {
  jobId: string;
  entityId: string;
  status: 'complete' | 'partial';
  targetCount: number;
  okCount: number;
  totalKb: number;
  durationMs: number;
  targets: CompileFanoutTargetResult[];
  /** push_state_delta outcome per write, in write order (initial, per-target…, summary). */
  writes: Array<'success' | 'skipped'>;
}

const ENTITY_ID_SAFE = /^[a-z0-9][a-z0-9_-]*$/i;

function sha256Text(text: string): string {
  // Match the compile handler's canonical receipt format ("sha256:<hex>") so a
  // fallback-computed hash is indistinguishable in shape from the handler's own.
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

async function pushDelta(
  entityId: string,
  payload: Record<string, unknown>
): Promise<'success' | 'skipped'> {
  const result = (await handleNetworkingTool('push_state_delta', {
    entityId,
    payload,
  })) as { status?: string };
  return result?.status === 'skipped' ? 'skipped' : 'success';
}

async function compileOneTarget(
  code: string,
  target: string,
  jobId: string
): Promise<CompileFanoutTargetResult> {
  const startedAt = Date.now();
  try {
    const result = (await handleCompilerTool('compile_holoscript', {
      code,
      target,
      jobId: `${jobId}-${target}`,
    })) as {
      success?: boolean;
      output?: string;
      outputSha256?: string;
      degraded?: boolean;
      warnings?: string[];
      error?: string;
    } | null;
    const durationMs = Date.now() - startedAt;
    if (!result || result.success !== true || typeof result.output !== 'string') {
      return {
        target,
        status: 'error',
        sizeKb: 0,
        receiptHash: '',
        durationMs,
        error: result?.error || 'compile returned no output',
      };
    }
    const sizeKb = Buffer.byteLength(result.output, 'utf8') / 1024;
    // The receipt hash is the compile handler's own artifact digest — recomputed
    // here only when the handler predates outputSha256, never invented.
    const receiptHash = result.outputSha256 || sha256Text(result.output);
    return {
      target,
      status: result.degraded ? 'degraded' : 'ok',
      sizeKb,
      receiptHash,
      durationMs,
      ...(result.warnings?.length ? { warnings: result.warnings } : {}),
    };
  } catch (error) {
    return {
      target,
      status: 'error',
      sizeKb: 0,
      receiptHash: '',
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runCompileFanout({
  jobId,
  code,
  targets,
}: {
  jobId: string;
  code: string;
  targets: string[];
}): Promise<CompileFanoutResult> {
  if (!jobId || !ENTITY_ID_SAFE.test(jobId)) {
    throw new Error(
      `jobId must match ${ENTITY_ID_SAFE} (it names the compile-job-{id} StateAuthority entity); got "${jobId}"`
    );
  }
  if (!code) {
    throw new Error('code is required: the HoloScript source to fan out across targets');
  }
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('targets must be a non-empty array of export target names');
  }

  const entityId = `compile-job-${jobId}`;
  const startedAt = Date.now();
  const writes: Array<'success' | 'skipped'> = [];

  writes.push(
    await pushDelta(entityId, {
      status: 'running',
      targetCount: targets.length,
      okCount: 0,
      totalKb: 0,
    })
  );

  const settled = await Promise.all(
    targets.map(async (target) => {
      const result = await compileOneTarget(code, target, jobId);
      // Per-target key: parallel settles must not LWW-clobber a shared key.
      writes.push(await pushDelta(entityId, { [`t_${target}`]: result }));
      return result;
    })
  );

  const okCount = settled.filter((t) => t.status === 'ok').length;
  const totalKb = settled.reduce((sum, t) => sum + t.sizeKb, 0);
  const status: CompileFanoutResult['status'] =
    okCount === settled.length ? 'complete' : 'partial';

  writes.push(
    await pushDelta(entityId, {
      status,
      targetCount: settled.length,
      okCount,
      totalKb,
      targets: settled,
    })
  );

  return {
    jobId,
    entityId,
    status,
    targetCount: settled.length,
    okCount,
    totalKb,
    durationMs: Date.now() - startedAt,
    targets: settled,
    writes,
  };
}
