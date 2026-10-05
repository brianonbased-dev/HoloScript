/**
 * Host-path argument confinement for callers that are not administrators.
 *
 * Why this exists (task_1790214096204_56rj). A client that self-registers on the hosted server and asks
 * for scope `tools:execute` is expanded to tools:write + tools:codebase + tools:browser (SCOPE_BRIDGE), and
 * the default registration scope tools:read is enough for the read tools. Measured against the real gates,
 * the real dispatch registry and the real handlers, that client could name ANY absolute path to
 * holo_write_file / holo_read_file / holo_export_emergence_corpus. Gate 3's path check was advisory (it only
 * recorded "restricted by policy") and only refused a double `../`, so an absolute path passed every gate.
 *
 * The rule: a caller that does not hold admin scope has no business naming a location on the server's own
 * disk. Any argument under a path-typed key must be a plain RELATIVE path with no traversal, and no argument
 * may carry a file: URL. The check lives here, in one function, so the HTTP gate AND the dispatcher that
 * every tool call passes through (a batch child, a mesh-invoked tool, a workflow step) call the same code,
 * and nothing re-entered from inside the server can smuggle a path past it.
 *
 * Stdio and other no-context callers are local trust and never reach this (they carry no token).
 */

/** Argument names that carry a location on the server's disk. Compared after lower-casing and dropping `_`/`-`. */
const HOST_PATH_ARG_KEYS: ReadonlySet<string> = new Set(
  [
    'path',
    'paths',
    'file',
    'files',
    'filePath',
    'dir',
    'directory',
    'rootDir',
    'root',
    'outputPath',
    'outPath',
    'outputDir',
    'outDir',
    'output_file',
    'targetDir',
    'sourcePath',
    'modelPath',
    'mmprojPath',
    'grammarPath',
    'loraPath',
    'cudaPath',
    'llamaBinDir',
    'remotePath',
    'ingestPath',
    'projectPath',
    'modulePath',
    'dataPath',
    'holoscriptFile',
    'compositionFile',
    'brain_path',
    'research_files',
    'videoUrl',
  ].map(normalizeKey)
);

/**
 * Keys whose values are free text for a tool to read, never a location it opens: a `file:` at the start of
 * one is prose. Under every other key a file: URL names the server's own disk, whatever the key is called.
 * holo_reconstruct_from_video's videoUrl read any file: URL a caller sent (claude3-x402's review of #396),
 * and it was not a path-typed key because nobody had thought of a video link as a path.
 */
const FREE_TEXT_ARG_KEYS: ReadonlySet<string> = new Set(
  ['content', 'code', 'text', 'prompt', 'message', 'query', 'description'].map(normalizeKey)
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/**
 * A key is path-typed when it is listed above OR its name ends like one. The exact list alone let
 * `rootDirs` (plural of a listed key) and `sourceRoot` through, so holo_absorb_repo would scan any
 * absolute server folder for a non-admin caller (2026-10-04 custody review). Matching by ending
 * means a new argument named like a location is confined without anyone remembering to list it.
 */
const HOST_PATH_KEY_SUFFIXES: readonly string[] = [
  'dir',
  'dirs',
  'directory',
  'directories',
  'path',
  'paths',
  'root',
  'roots',
];

function isHostPathKey(normalized: string): boolean {
  return (
    HOST_PATH_ARG_KEYS.has(normalized) ||
    HOST_PATH_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

/**
 * True when `value` is a file: URL as a URL parser reads it. The parser skips leading spaces and control
 * characters and drops tab and newline anywhere, so "  file:///x" and "fi<TAB>le:///x" both open /x.
 */
function isFileUrl(value: string): boolean {
  return /^file:/i.test(value.replace(/[\t\n\r]/g, '').replace(/^[\x00-\x20]+/, ''));
}

/** Every string in `value`, looking through nested arrays but never into objects (a nested `path` is a route). */
function stringsIn(value: unknown): string[] {
  const found: string[] = [];
  const pending: unknown[] = [value];
  while (pending.length > 0) {
    const next = pending.pop();
    if (typeof next === 'string') found.push(next);
    else if (Array.isArray(next))
      for (let i = next.length - 1; i >= 0; i -= 1) pending.push(next[i]);
  }
  return found;
}

/**
 * True when the caller may name locations on the server's disk: an administrator scope, or the
 * server's own loopback peer in local-custody mode (`localCustody`, set only by http-server's trusted
 * loopback branch, never from a token or request body). A loopback caller is on the machine whose disk
 * it names; what it may absorb is still confined by the absorb root allowlist (absorb-service).
 */
export function callerMayNameHostPaths(
  scopes: readonly string[] | undefined,
  localCustody?: boolean
): boolean {
  if (localCustody === true) return true;
  return !!scopes && (scopes.includes('admin:*') || scopes.includes('tools:admin'));
}

/**
 * Why `value` is not a plain relative path, or null when it is one. Refuses: NUL, `file:` URLs, drive
 * prefixes (`C:\x`, `C:x`), UNC and device prefixes, absolute POSIX paths, `~` expansion, and any `..` segment.
 */
export function hostPathViolation(value: string): string | null {
  if (value.includes('\0')) return 'contains a NUL byte';
  if (isFileUrl(value)) return 'is a file: URL';
  if (/^[a-zA-Z]:/.test(value)) return 'names a drive';
  if (value.startsWith('\\') || value.startsWith('/')) return 'is an absolute or UNC path';
  if (value.startsWith('~')) return 'uses ~ expansion';
  if (value.split(/[\\/]+/).some((segment) => segment === '..')) return 'contains a ".." segment';
  return null;
}

export interface HostPathViolation {
  /** The top-level argument key. */
  key: string;
  reason: string;
}

/**
 * The first TOP-LEVEL argument of the tool being invoked that names a location on the server's disk: a
 * path-typed key holding anything but a plain relative path (arrays of any depth are looked through), or
 * any other key, free text aside, holding a file: URL. Deliberately not recursive into objects: a
 * structured argument (an OpenAPI route list, a scene) may carry a field called `path` that is a URL path,
 * not a file. A tool that runs other tools dispatches them as separate calls, and the dispatcher checks
 * each one with its own top-level arguments.
 */
export function findHostPathViolation(
  args: Record<string, unknown> | undefined
): HostPathViolation | null {
  if (!args || typeof args !== 'object') return null;
  for (const [key, value] of Object.entries(args)) {
    const normalized = normalizeKey(key);
    if (isHostPathKey(normalized)) {
      for (const candidate of stringsIn(value)) {
        const reason = hostPathViolation(candidate);
        if (reason) return { key, reason };
      }
    } else if (!FREE_TEXT_ARG_KEYS.has(normalized) && stringsIn(value).some(isFileUrl)) {
      return { key, reason: 'is a file: URL' };
    }
  }
  return null;
}

/**
 * Throws when a caller without admin scope names a host path. `scopes` is the token's EXPANDED scope set
 * (the same array Gate 2 reads). An absent scope list is treated as non-admin: the caller is refused rather
 * than trusted.
 */
export function assertNoHostPathArgs(
  toolName: string,
  args: Record<string, unknown> | undefined,
  scopes: readonly string[] | undefined,
  localCustody?: boolean
): void {
  if (callerMayNameHostPaths(scopes, localCustody)) return;
  const hit = findHostPathViolation(args);
  if (!hit) return;
  throw new Error(
    `Host path argument refused for "${toolName}": "${hit.key}" ${hit.reason}. ` +
      'Callers without admin scope may only name plain relative paths.'
  );
}
