/**
 * What the agent-facing endpoints must say about the Studio tool gateway.
 *
 * Doors audit 2026-09-15. Both onboarding endpoints hand an outside agent a
 * credential and a URL for `POST /api/mcp/call`. Now that the credential half
 * is correct, an agent following them exactly will authenticate successfully
 * and still get nothing back, because the gateway forwards to an upstream
 * `/call` path while the registered upstream path is `/tools/call`.
 *
 * Telling an agent how to knock on a door that is not answering is the same
 * failure as not naming the credential — it just costs the agent longer to
 * discover. So the state is advertised beside the endpoint.
 *
 * The path itself is deliberately NOT corrected here: doing that inside a
 * security change would turn a dead route into a live tool-execution route,
 * which needs its own change and its own decision.
 */
export const GATEWAY_TOOL_CALL_STATUS = {
  endpoint: 'POST /api/mcp/call',
  answering: false,
  since: '2026-09-15 (doors audit)',
  what_happens:
    'Authentication on this gateway is enforced and works, but the call is then forwarded to an upstream path that is not registered, so tool calls sent here are not expected to execute. A correct key does not change that.',
  do_instead:
    'Call the mesh tools endpoint directly with your own key until the gateway path is corrected. The credential is the same one named in `authentication`.',
  tracking:
    'Correcting the forwarded path is held out of the security change that found it: it would turn a dead route into a live tool-execution route.',
} as const;
