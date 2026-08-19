// Validates a model-village gate's `upstreamHoloScriptCommit` pin.
//
// WHAT THIS REPLACED, AND WHY.
//
// Thirteen character gates each carried a private copy of:
//
//     function gitHasCommit(root, commit) {
//       git merge-base --is-ancestor <commit> HEAD   // true/false
//     }
//     expect(gitHasCommit(...), 'pinned upstream HoloScript commit is not an ancestor of HEAD')
//
// That assertion was both too weak and too strong, in ways that pointed the same direction:
//
//  * TOO WEAK — it accepted a commit that exists only in the local checkout. Nine gates pinned
//    `b3d031dd4` / `721b4608d`, neither of which is reachable from canon, so nobody with a
//    fresh clone could resolve what was witnessed. The gates were green on one laptop and
//    unreproducible everywhere else, and the check said nothing. That is the exact hole the
//    reproducibility step exists to close, and the "ancestor of HEAD" wording hid it: HEAD is
//    whatever branch you happen to be standing on.
//
//  * TOO STRONG — it also failed for a reason that is not a defect. When a peer leaves the
//    shared HoloScript checkout on a feature branch (as now: 26 behind / 37 ahead of canon,
//    131 files dirty), no canon commit is an ancestor of HEAD, so substituting a REPRODUCIBLE
//    pin turned gates red. The gate was measuring a colleague's branch choice.
//
// Ancestry of HEAD was never the property worth having. What makes a witness reproducible is
// that the exact bytes it witnessed live in canonical history under the commit it names, and
// that the tree being run matches those bytes. So this asserts:
//
//   1. the pinned commit resolves, and is contained in CANON — a fresh clone can fetch it;
//   2. every pinned upstream file, AS STORED AT THAT COMMIT, hashes to the pinned sha256 —
//      the commit genuinely carries the witnessed bytes, rather than merely preceding them.
//
// The caller keeps its existing per-file working-tree hash check, so together the three give:
// the bytes I witnessed are in canon at the named commit, and are what I just ran against.
// That is strictly more than ancestry proved, and it does not depend on the local branch.
//
// FAIL LOUD, NEVER SILENTLY PASS. If the canon ref cannot be resolved the result is
// UNMEASURED and the gate fails. A reproducibility check that quietly passes when it cannot
// see canon is worse than no check: it reports the property it was unable to test.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

/** Ref that stands for canonical history. Overridable for a differently-named remote. */
export const CANON_REF = process.env.HOLOSCRIPT_CANON_REF || 'canon/main';

/**
 * Paths that canon does not and should not carry, so rule 2 cannot apply to them.
 *
 * `node_modules/**` is dependency-managed: its bytes are pinned by the lockfile, not by
 * HoloScript's history. Asserting a canon blob for it would fail for a correct tree. The
 * carve-out is RETURNED in the result rather than applied silently, so a reader sees which
 * files got weaker treatment and why.
 */
function canonCannotCarry(relative) {
  return relative.replace(/\\/g, '/').startsWith('node_modules/');
}

function git(holoScriptRoot, args, { buffer = false } = {}) {
  return execFileSync('git', args, {
    cwd: holoScriptRoot,
    encoding: buffer ? 'buffer' : 'utf8',
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function resolves(holoScriptRoot, rev) {
  try {
    git(holoScriptRoot, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

function containedInCanon(holoScriptRoot, commit) {
  try {
    git(holoScriptRoot, ['merge-base', '--is-ancestor', commit, CANON_REF]);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} holoScriptRoot   HoloScript checkout to query.
 * @param {string} commit           The pinned `upstreamHoloScriptCommit`.
 * @param {Array<{pathKey: string, relative: string, sha256: string}>} pins
 *        The upstream files this gate pins, already resolved from its metadata.
 * @returns {{errors: string[], carvedOut: string[], canonRef: string}}
 */
export function validateUpstreamCommitPin(holoScriptRoot, commit, pins) {
  const errors = [];
  const carvedOut = [];

  if (!commit) {
    return { errors: ['upstreamHoloScriptCommit is missing'], carvedOut, canonRef: CANON_REF };
  }
  if (!resolves(holoScriptRoot, CANON_REF)) {
    // UNMEASURED, not pass.
    return {
      errors: [
        `canon ref ${CANON_REF} does not resolve in ${holoScriptRoot}; `
        + 'upstream reproducibility is UNMEASURED (set HOLOSCRIPT_CANON_REF or add the canon remote)',
      ],
      carvedOut,
      canonRef: CANON_REF,
    };
  }
  if (!resolves(holoScriptRoot, commit)) {
    errors.push(`pinned upstream HoloScript commit ${commit} does not resolve`);
    return { errors, carvedOut, canonRef: CANON_REF };
  }
  if (!containedInCanon(holoScriptRoot, commit)) {
    errors.push(
      `pinned upstream HoloScript commit ${commit} is not contained in ${CANON_REF}; `
      + 'a fresh clone cannot resolve it, so this witness is not reproducible',
    );
  }

  for (const { pathKey, relative, sha256 } of pins) {
    if (!relative || !sha256) continue;
    if (canonCannotCarry(relative)) {
      carvedOut.push(`${pathKey} (${relative}) — dependency-managed, pinned by the lockfile`);
      continue;
    }
    let blob;
    try {
      blob = git(holoScriptRoot, ['show', `${commit}:${relative}`], { buffer: true });
    } catch {
      errors.push(`${pathKey} is absent from the pinned commit ${commit} (${relative})`);
      continue;
    }
    const actual = createHash('sha256').update(blob).digest('hex');
    if (actual !== sha256) {
      errors.push(
        `${pathKey} does not match the pinned commit: ${commit} carries ${actual.slice(0, 12)}, `
        + `the pin records ${sha256.slice(0, 12)}`,
      );
    }
  }

  return { errors, carvedOut, canonRef: CANON_REF };
}
