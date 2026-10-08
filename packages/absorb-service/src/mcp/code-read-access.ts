/**
 * Who may read source code through the codebase tools, and which caller a call
 * belongs to (2026-10-05, fail-closed since claude4's review of 2aa95c6e5).
 *
 * `holo_query_codebase` queryType "source" (and its `match` filter) returns a
 * symbol's code, and `holo_ask_codebase` puts the code of its top results into
 * the answer prompt and quotes it in a no-model answer. On a hosted server the
 * absorbed graph is one per process and its roots include the server's own
 * folder and a temp area every caller shares, so a customer key could read the
 * server's code or another customer's absorbed repo (claude6, #501/#513;
 * claude4: the absorb host at services/absorb-service never set a gate at all).
 *
 * So the default is "no". A host runs each tool call inside
 * `runWithCodeReadAccess`, deciding per caller (mcp-server: the local stdio
 * user, loopback local custody or an admin scope; the absorb host: admins), and
 * the true local entry points (the CLI) opt the whole process in with
 * `setCodeReadDefault(true)`. A host that forgets to decide reads no code.
 *
 * The store and the default live on globalThis under a registered Symbol, so
 * every bundled copy of this module (the hosted CJS bundle also loads the ESM
 * build through `await import()`) shares one gate instead of each copy keeping
 * its own default.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface CodeReadCaller {
  /** May this call see source code? */
  codeRead: boolean;
  /**
   * Who is calling, when the host knows. Inline `sourceFiles` uploads are bound
   * to it, so one caller's upload never answers another caller's questions.
   */
  principal?: string;
}

interface CodeReadGate {
  access: AsyncLocalStorage<CodeReadCaller>;
  defaultAllowed: boolean;
}

const GATE_KEY = Symbol.for('holoscript.absorb-service.code-read-gate.v1');

function gate(): CodeReadGate {
  const holder = globalThis as unknown as Record<symbol, CodeReadGate | undefined>;
  let existing = holder[GATE_KEY];
  if (!existing) {
    existing = { access: new AsyncLocalStorage<CodeReadCaller>(), defaultAllowed: false };
    holder[GATE_KEY] = existing;
  }
  return existing;
}

/** Run `fn` as one caller: code reading allowed or refused, and who it is. */
export function runWithCodeReadAccess<T>(allowed: boolean, fn: () => T, principal?: string): T {
  return gate().access.run({ codeRead: allowed, principal }, fn);
}

/** The process-wide answer when no call has decided. Only true local entry points set true. */
export function setCodeReadDefault(allowed: boolean): void {
  gate().defaultAllowed = allowed;
}

/** May the current call see source code? */
export function codeReadAllowed(): boolean {
  return gate().access.getStore()?.codeRead ?? gate().defaultAllowed;
}

/**
 * May the current caller tie an inline `sourceFiles` upload to a named folder
 * on this server (rootDir, rootDirs, or a snapshot receipt's roots)? Such an
 * upload is published as that folder's cache generation, which every later
 * caller loads from disk without the uploader's tag, and its self-asserted
 * receipt makes it trusted. So only the callers that may name the server's
 * folders may do it: the process's own user (no host-decided call: the CLI, a
 * library caller, and an isolated absorb worker thread, whose parent already
 * decided before dispatch) and a call the host let read code (mcp-server:
 * stdio, loopback local custody or an admin scope, the same set as
 * callerMayNameHostPaths plus the stdio user; the absorb host: admins).
 * claude4's round 2 review of claudecode/absorb-agent-brief, 2026-10-08.
 */
export function callerMayNameUploadRoots(): boolean {
  const store = gate().access.getStore();
  return store === undefined || store.codeRead;
}

/**
 * The principal of the current call, or LOCAL_PRINCIPAL outside any decided
 * call (the CLI, a test, a library caller: the process is its own user).
 */
export function currentCallerPrincipal(): string {
  const store = gate().access.getStore();
  if (!store) return LOCAL_PRINCIPAL;
  return store.principal && store.principal.length > 0 ? store.principal : UNKNOWN_PRINCIPAL;
}

/** Who sent the inline sourceFiles upload a graph was built from, if it was one. */
export function inlineUploadOwner(graph: unknown): string | undefined {
  return (graph as { inlineUploadPrincipal?: string } | null | undefined)?.inlineUploadPrincipal;
}

/** True unless the graph is an inline upload sent by a different caller than this one. */
export function uploadBelongsToCaller(graph: unknown): boolean {
  const owner = inlineUploadOwner(graph);
  return owner === undefined || owner === currentCallerPrincipal();
}

/** The process's own user, outside any host-decided call. */
export const LOCAL_PRINCIPAL = 'holoscript-absorb:local-process';
/** A host-decided call that named no caller. It owns no upload but its own. */
export const UNKNOWN_PRINCIPAL = 'holoscript-absorb:unnamed-caller';

export const CODE_READ_REFUSED =
  'Reading source code needs the local MCP (stdio or loopback local custody) or an admin scope; this caller gets graph answers without code.';
