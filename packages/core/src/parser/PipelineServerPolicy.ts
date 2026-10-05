/**
 * Pipeline server policy: where a pipeline's MCP stages may send requests.
 *
 * A pipeline file reads like configuration, and it is often written by someone
 * else. Its `server` value decides where an MCP source, transform or sink sends
 * records, and the generated code can attach HOLOSCRIPT_API_KEY to that request.
 * So the file must not be able to pick an arbitrary host, nor read environment
 * variables into the address. The operator, not the file, decides which remote
 * MCP server is trusted: HOLOSCRIPT_MCP_URL, or https://mcp.holoscript.net when
 * it is not set. That one URL is the whole allowlist; no list is ever read from
 * the pipeline file.
 *
 * A `server` value may be:
 *   - absent: the configured MCP server;
 *   - exactly `${env.HOLOSCRIPT_MCP_URL}` or `${env.HOLOSCRIPT_MCP_URL:-<url>}`:
 *     the configured MCP server. `<url>` is used only when HOLOSCRIPT_MCP_URL is
 *     not set, when the configured server is the default, so `<url>` must be on
 *     this machine or on the default server;
 *   - an http(s) URL on this machine: localhost, 127.0.0.1 or [::1];
 *   - an http(s) URL on the configured MCP server's origin;
 *   - a plain server name such as "bio-research" (letters, digits, "-", "_").
 *     A name has no scheme and no host, so no request can be made with it; the
 *     docs define `server` as a name, and the tracked example pipelines use names.
 *
 * Anything else is refused at compile time, by both pipeline emitters
 * (parser/PipelineCompiler.ts and compiler/PipelineNodeCompiler.ts).
 * PipelineCompiler.ts also re-checks the origin at run time before it attaches
 * the key, because the environment can differ between compiling and running.
 *
 * Board task task_1791176003202_obsc.
 */

import type { Pipeline, PipelineParseError } from './PipelineParser';

/** The MCP server used when HOLOSCRIPT_MCP_URL is not set. */
export const DEFAULT_PIPELINE_MCP_URL = 'https://mcp.holoscript.net';

/** The `server` value an MCP stage gets when it does not name one. */
export const DEFAULT_PIPELINE_MCP_SERVER =
  '${env.HOLOSCRIPT_MCP_URL:-' + DEFAULT_PIPELINE_MCP_URL + '}';

/**
 * The only `${...}` a server value may contain: the whole value is the configured
 * MCP URL, with an optional fallback. Group 1 is the fallback. The generated code
 * uses this same pattern (PipelineCompiler.ts emits its source).
 */
export const CONFIGURED_MCP_SERVER_FORM = /^\$\{env\.HOLOSCRIPT_MCP_URL(?::-([^${}]*))?\}$/;

/** Hostnames of this machine, as the URL parser spells them. */
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** A plain server name. No ':' means it can never parse as an absolute URL. */
const SERVER_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

type Env = Readonly<Record<string, string | undefined>>;

/** The http(s) origin of a URL, or null when the value is not an http(s) URL. */
export function httpOrigin(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** The URL an MCP stage posts to: the same string the generated code builds from its base. */
export function mcpEndpointFor(base: string): string {
  return base.replace(/\/$/, '') + '/mcp';
}

/** The configured MCP server: HOLOSCRIPT_MCP_URL when set, otherwise the default. */
export function configuredMcpUrl(env: Env = process.env): string {
  return env.HOLOSCRIPT_MCP_URL || DEFAULT_PIPELINE_MCP_URL;
}

const NOT_ON_THIS_MACHINE = 'is not on this machine (localhost, 127.0.0.1, ::1)';
const WHY =
  'A pipeline file must not choose where your HOLOSCRIPT_API_KEY and your records go. ' +
  'To use another MCP server, set HOLOSCRIPT_MCP_URL to its address.';

/**
 * Where a URL would send an MCP request, judged against `trusted`: the origin of
 * the MCP server that is configured when this URL is used (null if none).
 * Returns null when allowed, 'not-a-url' when no request could be built from it,
 * or the refused origin.
 */
function locationProblem(url: string, trusted: string | null): string | null {
  let parsed: URL;
  try {
    // Judge the URL the generated code actually fetches, not the raw value:
    // e.g. "http:" alone does not parse, but "http:/mcp" is a request to host "mcp".
    parsed = new URL(mcpEndpointFor(url));
  } catch {
    return 'not-a-url';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'not-a-url';
  if (LOOPBACK_HOSTNAMES.has(parsed.hostname)) return null;
  if (trusted !== null && parsed.origin === trusted) return null;
  return parsed.origin;
}

/**
 * The reason an MCP stage's `server` is refused, or null when it is allowed.
 * `stage` names the stage the way other pipeline errors do, e.g. `Sink "ToolOut"`.
 */
export function pipelineServerRefusal(
  stage: string,
  server: unknown,
  env: Env = process.env
): string | null {
  // Mirror the emitters: a missing or empty server means the default.
  const value = String(server || DEFAULT_PIPELINE_MCP_SERVER);
  const shown = JSON.stringify(value.length > 200 ? `${value.slice(0, 200)}...` : value);
  const refuse = (reason: string) => `${stage} cannot use server ${shown}: ${reason}`;

  if (value.includes('${')) {
    const form = CONFIGURED_MCP_SERVER_FORM.exec(value);
    if (!form) {
      return refuse(
        'a server may not contain ${...} placeholders, because they let the pipeline file read ' +
          'environment variables, such as keys and passwords, into the address it sends to. ' +
          'The only form allowed is ${env.HOLOSCRIPT_MCP_URL} or ${env.HOLOSCRIPT_MCP_URL:-<url>}.'
      );
    }
    const fallback = form[1];
    if (!fallback) return null; // resolves to the configured MCP server
    // The fallback is used only when HOLOSCRIPT_MCP_URL is not set, and then the
    // configured server is the default one.
    const problem = locationProblem(fallback, httpOrigin(DEFAULT_PIPELINE_MCP_URL));
    if (problem === null) return null;
    if (problem === 'not-a-url') {
      return refuse(
        `its fallback ${JSON.stringify(fallback)} is not an http(s) URL (such as http://127.0.0.1:7411).`
      );
    }
    return refuse(
      `its fallback, used when HOLOSCRIPT_MCP_URL is not set, goes to ${problem}, which ` +
        `${NOT_ON_THIS_MACHINE} and is not the default MCP server ${DEFAULT_PIPELINE_MCP_URL}. ${WHY}`
    );
  }

  if (SERVER_NAME.test(value)) return null;

  const configured = httpOrigin(configuredMcpUrl(env));
  const problem = locationProblem(value, configured);
  if (problem === null) return null;
  if (problem === 'not-a-url') {
    return refuse(
      'it is neither an http(s) URL (such as http://127.0.0.1:7411) nor a plain server name ' +
        '(letters, digits, "-" and "_").'
    );
  }
  const configuredLabel =
    configured === null
      ? 'the configured MCP server (HOLOSCRIPT_MCP_URL is set but is not an http(s) URL)'
      : `the configured MCP server ${configured}`;
  return refuse(`its host ${problem} ${NOT_ON_THIS_MACHINE} and is not ${configuredLabel}. ${WHY}`);
}

/**
 * Check every MCP stage's `server`. Returns one error per refused stage, in the
 * same shape as parse errors, so compilers report them through the same channel.
 */
export function checkPipelineServers(
  pipeline: Pipeline,
  env: Env = process.env
): PipelineParseError[] {
  const errors: PipelineParseError[] = [];
  const check = (kind: string, name: string, server: unknown) => {
    const message = pipelineServerRefusal(`${kind} "${name}"`, server, env);
    if (message) errors.push({ message, block: name });
  };
  for (const source of pipeline.sources) {
    if (source.type === 'mcp') check('Source', source.name, source.properties.server);
  }
  for (const transform of pipeline.transforms) {
    if (transform.type === 'mcp') check('Transform', transform.name, transform.server);
  }
  for (const sink of pipeline.sinks) {
    if (sink.type === 'mcp') check('Sink', sink.name, sink.server);
  }
  return errors;
}
