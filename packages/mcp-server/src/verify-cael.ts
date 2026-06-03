/**
 * Public CAEL trace verification — the external-repro HTTP path.
 *
 * solve_* simulation results emit a verifyUrl (.../verify-cael?traceId=...).
 * This module backs the public /verify-cael endpoint in http-server.ts so that
 * URL resolves to a real verdict instead of 404ing (the dead-URL honesty bug,
 * task_1780197628410_t4c8). It also closes the TVCG external-repro "no public
 * HTTP path" caveat: anyone holding the self-contained traceJSONL receipt can
 * POST it and obtain an independent hash-chain + deterministic-replay verdict.
 *
 * The verification logic itself is reused verbatim from the verify_cael_trace
 * MCP tool (handleSimulationTool) — this module is purely the HTTP-shaping +
 * human-readable rendering layer. Kept free of server side effects (no port
 * binding / store init) so it can be exercised end-to-end in tests.
 */

import { handleSimulationTool } from './simulation-tools';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a minimal human-readable verdict page, so a verifyUrl clicked in a
 * browser shows a real result instead of a 404. Machine clients get JSON
 * (content negotiation happens in the caller).
 */
export function renderVerifyHtml(verdict: Record<string, unknown>): string {
  const verifiableFalse = verdict.verifiable === false;
  const ok =
    verdict.success === true && verdict.replayValid === true && verdict.hashChainValid === true;
  const statusLabel = verifiableFalse ? 'NOT RESIDENT' : ok ? 'VERIFIED' : 'FAILED';
  const color = verifiableFalse ? '#b58900' : ok ? '#2aa198' : '#dc322f';
  const rows = Object.entries(verdict)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px;color:#888;">${escapeHtml(k)}</td><td style="padding:4px 12px;font-family:monospace;">${escapeHtml(
          typeof v === 'string' ? v : JSON.stringify(v)
        )}</td></tr>`
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>CAEL Trace Verification</title></head>
<body style="font-family:system-ui,sans-serif;max-width:760px;margin:40px auto;padding:0 16px;color:#222;">
<h1 style="font-size:20px;">CAEL Trace Verification</h1>
<p style="font-size:28px;font-weight:700;color:${color};">${statusLabel}</p>
<table style="border-collapse:collapse;font-size:14px;">${rows}</table>
<p style="color:#888;font-size:12px;margin-top:24px;">Canonical external-repro path: <code>POST /verify-cael</code> with <code>{ "traceJSONL": "&lt;receipt&gt;" }</code>. The hash chain and deterministic replay are verified server-side from the self-contained receipt.</p>
</body></html>`;
}

/**
 * Core decision logic for the public /verify-cael endpoint. Given a traceId
 * and/or a self-contained traceJSONL receipt, runs deterministic replay
 * verification and returns a ready-to-serve response.
 *
 * The in-memory trace registry is per-process and ephemeral, so a bare traceId
 * only resolves on the instance that produced it; the canonical stateless path
 * is the embedded traceJSONL. A traceId that is not resident yields a 200
 * `verifiable:false` response (not a failure) that points at the POST path.
 */
export async function verifyCaelResult(opts: {
  traceId: string | null;
  traceJSONL: string | null;
  wantsHtml: boolean;
}): Promise<{ status: number; contentType: string; body: string }> {
  const { traceId, traceJSONL, wantsHtml } = opts;
  if (!traceId && !traceJSONL) {
    return {
      status: 400,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({ error: 'traceId (query) or traceJSONL (POST body) is required' }),
    };
  }

  const verdict = (await handleSimulationTool('verify_cael_trace', {
    ...(traceId ? { traceId } : {}),
    ...(traceJSONL ? { traceJSONL } : {}),
  })) as Record<string, unknown> | null;

  const notResident =
    verdict?.success === false &&
    typeof verdict.error === 'string' &&
    verdict.error.includes('traceJSONL or a known traceId is required');

  const payload: Record<string, unknown> = notResident
    ? {
        verifiable: false,
        traceId,
        reason:
          'Trace is not in this server instance memory (the registry is ephemeral). ' +
          'POST the receipt traceJSONL to /verify-cael for stateless verification.',
        howTo: {
          method: 'POST',
          url: '/verify-cael',
          body: { traceJSONL: '<the traceJSONL field from your solve_* result>' },
        },
      }
    : { traceId, ...(verdict ?? {}) };

  return wantsHtml
    ? { status: 200, contentType: 'text/html; charset=utf-8', body: renderVerifyHtml(payload) }
    : {
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload, null, 2),
      };
}
