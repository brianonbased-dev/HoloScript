// Resolves the HoloScript checkout a model-village gate should witness against.
//
// WHAT THIS REPLACED, AND WHY IT MATTERED MORE THAN IT LOOKED.
//
// Thirteen character gates each hardcoded their own default root, pointing at a per-gate
// HoloRepo worktree that was deleted long ago:
//
//     const DEFAULT_HOLOSCRIPT_ROOT =
//       process.env.HOLOSCRIPT_ROOT || 'C:/holorepo-worktrees/holoscript-h3u-temporal-convergence';
//
// Neither `C:/holorepo-worktrees/` nor `C:/Users/josep/Documents/GitHub/.holorepo-worktrees/`
// exists. Every one of those gates therefore ran against a path that is not there -- and,
// because each failed at whatever it happened to touch first, the SAME defect surfaced as
// three unrelated-looking errors:
//
//     h3u..h3x   "Cannot find module 'esbuild'"                  (esbuild IS installed)
//     h3y..h4a   "AgentAvatarGarment.ts is missing"              (the file IS present)
//     h4b..h4i   "spawnSync git ENOENT"                          (git IS on PATH)
//
// All three are false. Pointed at a real checkout the same gates report substantive things --
// h4b reports a HEAD mismatch and three hash drifts, h3y reports drift on three files. The
// dead root was hiding the true state of roughly a dozen gates behind errors that each
// invited a different wrong repair (install esbuild, restore a file, fix PATH).
//
// FAIL LOUD, NEVER RETURN A PATH THAT IS NOT THERE. The old code returned a string and let
// whatever ran next fail in its own vocabulary. This validates the candidate is really a
// HoloScript checkout and throws naming everywhere it looked, so an unresolvable root reads
// as an unresolvable root.

import { existsSync } from 'node:fs';
import path from 'node:path';

/** Checkouts to try, in order, when nothing more specific is given. */
export const CANONICAL_HOLOSCRIPT_ROOTS = Object.freeze([
  'C:/holo-dev/HoloRepo/HoloScript',
  'C:/Users/josep/Documents/GitHub/HoloScript',
]);

/**
 * A directory counts as a HoloScript checkout only if it carries the surfaces these gates
 * actually read. A bare `existsSync(root)` would accept an empty leftover directory and put
 * us straight back to failing later in someone else's vocabulary.
 */
export function isHoloScriptCheckout(candidate) {
  if (!candidate || !existsSync(candidate)) return false;
  return (
    existsSync(path.join(candidate, 'packages/engine/src/character-render'))
    && existsSync(path.join(candidate, 'packages/core'))
  );
}

/**
 * @param {object} [options]
 * @param {string} [options.gate]        Gate id, for the error message only.
 * @param {string[]} [options.candidates] Gate-specific roots to try before the canonical ones.
 * @returns {string} an existing HoloScript checkout
 * @throws if none resolves — deliberately, rather than returning a path that is not there.
 */
export function resolveHoloScriptRoot({ gate = 'model-village', candidates = [] } = {}) {
  const tried = [];
  const ordered = [process.env.HOLOSCRIPT_ROOT, ...candidates, ...CANONICAL_HOLOSCRIPT_ROOTS];
  for (const candidate of ordered) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    tried.push(resolved);
    if (isHoloScriptCheckout(resolved)) return resolved;
  }
  throw new Error(
    `${gate}: no HoloScript checkout found. Looked at: ${tried.join(', ')}. `
    + 'Set HOLOSCRIPT_ROOT to a checkout containing packages/engine/src/character-render '
    + 'and packages/core.',
  );
}
