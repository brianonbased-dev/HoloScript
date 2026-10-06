/**
 * Who may read source code through the codebase tools (2026-10-05).
 *
 * `holo_query_codebase` queryType "source" (and its `match` filter) returns a
 * symbol's code, and `holo_ask_codebase` puts the code of its top results into
 * the answer prompt and quotes it in a no-model answer. On the hosted MCP
 * server the absorbed graph is one per process and its allowed roots include
 * the server's own folder and a temp area every caller shares, so a customer
 * key holding only `tools:codebase` could read the server's code or another
 * customer's absorbed repo (claude6's review of #501/#513).
 *
 * The MCP server runs every tool call inside `runWithCodeReadAccess`, deciding
 * per caller (local stdio user, loopback local custody, or an admin scope), and
 * the HTTP server sets the default to "no" at startup so a call that loses its
 * caller reads nothing. Outside the MCP server (the CLI, tests, a library
 * caller) the process is the local user and the default stays "yes".
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const access = new AsyncLocalStorage<boolean>();
let defaultAllowed = true;

/** Run `fn` with code reading allowed or refused for everything it calls. */
export function runWithCodeReadAccess<T>(allowed: boolean, fn: () => T): T {
  return access.run(allowed, fn);
}

/** The process-wide answer when no call has decided. The hosted server sets false. */
export function setCodeReadDefault(allowed: boolean): void {
  defaultAllowed = allowed;
}

/** May the current call see source code? */
export function codeReadAllowed(): boolean {
  return access.getStore() ?? defaultAllowed;
}

export const CODE_READ_REFUSED =
  'Reading source code needs the local MCP (stdio or loopback local custody) or an admin scope; this caller gets graph answers without code.';
