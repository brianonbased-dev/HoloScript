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
 * disk. Any argument under a path-typed key must be a plain RELATIVE path with no traversal. The check lives
 * here, in one function, so the HTTP gate AND the batch meta-tools (which re-check children only at Gate 2)
 * call the same code and a batch cannot smuggle a path past it.
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
  ].map(normalizeKey)
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/** True when the token carries an administrator scope (the only callers allowed to name host paths). */
export function callerMayNameHostPaths(scopes: readonly string[] | undefined): boolean {
  return !!scopes && (scopes.includes('admin:*') || scopes.includes('tools:admin'));
}

/**
 * Why `value` is not a plain relative path, or null when it is one. Refuses: NUL, `file:` URLs, drive
 * prefixes (`C:\x`, `C:x`), UNC and device prefixes, absolute POSIX paths, `~` expansion, and any `..` segment.
 */
export function hostPathViolation(value: string): string | null {
  if (value.includes('\0')) return 'contains a NUL byte';
  if (/^file:/i.test(value)) return 'is a file: URL';
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
 * The first TOP-LEVEL path-typed argument of the tool being invoked that is not a plain relative path.
 * Deliberately not recursive: a structured argument (an OpenAPI route list, a scene) may carry a field
 * called `path` that is a URL path, not a file. The batch meta-tools dispatch their children as separate
 * tool calls, and each child is checked with its own top-level arguments.
 */
export function findHostPathViolation(args: Record<string, unknown> | undefined): HostPathViolation | null {
  if (!args || typeof args !== 'object') return null;
  for (const [key, value] of Object.entries(args)) {
    if (!HOST_PATH_ARG_KEYS.has(normalizeKey(key))) continue;
    const candidates = Array.isArray(value) ? value : [value];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const reason = hostPathViolation(candidate);
      if (reason) return { key, reason };
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
  scopes: readonly string[] | undefined
): void {
  if (callerMayNameHostPaths(scopes)) return;
  const hit = findHostPathViolation(args);
  if (!hit) return;
  throw new Error(
    `Host path argument refused for "${toolName}": "${hit.key}" ${hit.reason}. ` +
      'Callers without admin scope may only name plain relative paths.'
  );
}
