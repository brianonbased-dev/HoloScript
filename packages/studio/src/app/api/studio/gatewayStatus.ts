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

/** The one header the mesh services read a caller key from. */
export const MESH_KEY_HEADER = 'x-mcp-api-key';

/**
 * What an outside agent must send, and in which header.
 *
 * Doors audit 2026-09-15: the agent-facing endpoints handed out the gateway URL
 * with no credential guidance at all, so an agent that wired itself up exactly
 * as told sent nothing and met a refusal it could not diagnose. The mesh
 * services read the key from `x-mcp-api-key` only, so naming the wrong form
 * would be worse than naming none.
 *
 * This lived as three byte-identical copies — in mcp-config, in quickstart, and
 * about to become a third in capabilities. One copy, so the three endpoints
 * cannot drift into telling an agent three different things.
 */
export const AGENT_AUTH = {
  header: MESH_KEY_HEADER,
  value: '<your HoloMesh API key>',
  required: true,
  how: `Send your own key on every request as "${MESH_KEY_HEADER}: <your key>". You then run as yourself, and Studio's own key is never spent on your behalf.`,
  without_a_key:
    "Without a key, only a signed-in Studio browser session can reach the small set of tools Studio's own UI uses. Every other call is refused.",
  bearer: `The Studio gateway also accepts "Authorization: Bearer <key>" and forwards it as ${MESH_KEY_HEADER}; the mesh services themselves read only ${MESH_KEY_HEADER}.`,
} as const;
