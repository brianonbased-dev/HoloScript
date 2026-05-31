// Railway health check target. next.config rewrites /health → /api/health.
// Returns 200 + JSON so Railway's healthcheck and external monitors pass.
export const dynamic = 'force-static';

export function GET() {
  return Response.json({
    status: 'ok',
    service: 'holoscript-net-v2',
    ts: new Date().toISOString(),
  });
}
