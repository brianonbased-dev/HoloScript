/**
 * Staged-scope path list shared by the pre-commit dev-floor gates.
 *
 * --files-from <path>
 *   Newline-separated repo-relative paths. This is what .githooks/pre-commit
 *   uses. The list stays off the command line so a large merge does not exceed
 *   Windows' 32,767-character CreateProcess limit.
 * --files <comma-or-newline list>
 *   Legacy single-argument form. Kept because tests and ad-hoc invocations
 *   still pass it. A path that itself contains a comma cannot survive this
 *   form; use --files-from for those.
 *
 * Returns null when neither flag is present (full-tree mode).
 * Returns an array (possibly empty) when a flag is present.
 * Exits 2 when --files-from has no path or the list file cannot be read.
 * If both flags are present, --files-from wins.
 */

import { readFileSync } from 'node:fs';

export function readScopedFileList(argv) {
  const fromIdx = argv.indexOf('--files-from');
  if (fromIdx >= 0) {
    const listPath = argv[fromIdx + 1];
    if (!listPath || listPath.startsWith('--')) {
      console.error('[scoped-files] --files-from requires a path to a newline-separated list');
      process.exit(2);
    }
    let text;
    try {
      text = readFileSync(listPath, 'utf8');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[scoped-files] cannot read --files-from ${listPath}: ${message}`);
      process.exit(2);
    }
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const filesIdx = argv.indexOf('--files');
  if (filesIdx >= 0) {
    return (argv[filesIdx + 1] || '')
      .split(/[,\n]/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return null;
}
