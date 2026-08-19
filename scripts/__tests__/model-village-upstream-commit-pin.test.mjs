// The upstream-commit pin validator must be able to go RED.
//
// This validator REPLACED a weaker check ("is the pinned commit an ancestor of HEAD"), and a
// replacement that relaxes anything is worth nothing until it is shown to still catch faults.
// So every case below builds a real git repository, commits real bytes, and asserts the
// validator's verdict against it -- no mocks, no hand-built fixtures that could agree with a
// broken implementation by construction.
//
// The two faults that motivated the change get first-class cases: a commit that exists only
// locally (case 2) and a commit that does not carry the bytes the pin records (case 3). Both
// passed the old check.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Every repo this file builds lives under ONE scratch root, removed once at the end.
//
// This is not tidiness. The first version created and deleted nine git repositories directly
// in the shared TEMP root, and that made the model-village CONTENTION drill fail with
// `EPERM: operation not permitted` later in the same aggregate run -- reproducibly with this
// file in the chain, never without it. On Windows `git` keeps handles open briefly after it
// exits, so a recursive delete can leave directories in a pending-delete state that a later
// process racing file operations in the same root trips over. Confining the churn to one
// subtree, and deleting it with retries, keeps this test from destabilising its neighbours.
const SCRATCH = mkdtempSync(path.join(tmpdir(), 'hololand-upstream-pin-'));
const removeWithRetries = (target) =>
  rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 });
after(() => removeWithRetries(SCRATCH));

const CANON = 'testcanon';
process.env.HOLOSCRIPT_CANON_REF = CANON;
const { validateUpstreamCommitPin } = await import('../lib/model-village-upstream-commit-pin.mjs');

const sha = (s) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/**
 * A repo with two commits on the canon line and one commit that never reached it:
 *
 *   canon:  A(v1) ── B(v2)      <- testcanon
 *              \
 *               ── L(local)      <- never merged; stands for a laptop-only commit
 */
function buildRepo() {
  const dir = mkdtempSync(path.join(SCRATCH, 'repo-'));
  git(dir, 'init', '--quiet', '--initial-branch=main');
  git(dir, 'config', 'user.email', 'test@example.invalid');
  git(dir, 'config', 'user.name', 'pin test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  mkdirSync(path.join(dir, 'pkg'), { recursive: true });

  writeFileSync(path.join(dir, 'pkg/file.ts'), 'v1\n');
  git(dir, 'add', '--', 'pkg/file.ts');
  git(dir, 'commit', '--quiet', '-m', 'A');
  const A = git(dir, 'rev-parse', 'HEAD');

  // A local-only commit that branches off A and is never merged into canon.
  git(dir, 'checkout', '--quiet', '-b', 'local');
  writeFileSync(path.join(dir, 'pkg/file.ts'), 'local\n');
  git(dir, 'commit', '--quiet', '-am', 'L');
  const L = git(dir, 'rev-parse', 'HEAD');

  git(dir, 'checkout', '--quiet', 'main');
  writeFileSync(path.join(dir, 'pkg/file.ts'), 'v2\n');
  git(dir, 'commit', '--quiet', '-am', 'B');
  const B = git(dir, 'rev-parse', 'HEAD');
  git(dir, 'branch', CANON, B);

  return { dir, A, B, L };
}

const pin = (sha256, relative = 'pkg/file.ts') => [{ pathKey: 'upstreamThingPath', relative, sha256 }];

test('a canon commit carrying the pinned bytes passes', () => {
  const { dir, B } = buildRepo();
  try {
    const { errors } = validateUpstreamCommitPin(dir, B, pin(sha('v2\n')));
    assert.deepEqual(errors, [], 'a correct pin must produce no errors');
  } finally { removeWithRetries(dir); }
});

test('a commit that never reached canon FAILS, however good its bytes are', () => {
  const { dir, L } = buildRepo();
  try {
    // The bytes match the commit exactly -- the ONLY defect is that nobody else can resolve
    // it. This is the case the old ancestor-of-HEAD check passed, and it is why nine gates
    // were green on one laptop and unreproducible everywhere else.
    const { errors } = validateUpstreamCommitPin(dir, L, pin(sha('local\n')));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /not contained in testcanon/);
    assert.match(errors[0], /not reproducible/);
  } finally { removeWithRetries(dir); }
});

test('a canon commit that does NOT carry the pinned bytes FAILS', () => {
  const { dir, A } = buildRepo();
  try {
    // A is in canon, but the pin records v2's hash. The gate would be naming one commit and
    // measuring another -- the second fault the old check could not see.
    const { errors } = validateUpstreamCommitPin(dir, A, pin(sha('v2\n')));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /does not match the pinned commit/);
  } finally { removeWithRetries(dir); }
});

test('a path absent from the pinned commit FAILS', () => {
  const { dir, B } = buildRepo();
  try {
    const { errors } = validateUpstreamCommitPin(dir, B, pin(sha('anything'), 'pkg/nope.ts'));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /absent from the pinned commit/);
  } finally { removeWithRetries(dir); }
});

test('an unresolvable commit FAILS instead of being skipped', () => {
  const { dir } = buildRepo();
  try {
    const { errors } = validateUpstreamCommitPin(dir, '0'.repeat(40), pin(sha('v2\n')));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /does not resolve/);
  } finally { removeWithRetries(dir); }
});

test('a missing canon ref is UNMEASURED, never a silent pass', () => {
  const { dir, B } = buildRepo();
  try {
    git(dir, 'branch', '-D', CANON);
    // The pin is otherwise perfect. Without canon the property simply cannot be tested, and a
    // reproducibility check that passes when it cannot see canon reports what it did not test.
    const { errors } = validateUpstreamCommitPin(dir, B, pin(sha('v2\n')));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /UNMEASURED/);
  } finally { removeWithRetries(dir); }
});

test('a missing pin FAILS rather than passing vacuously', () => {
  const { dir } = buildRepo();
  try {
    const { errors } = validateUpstreamCommitPin(dir, undefined, pin(sha('v2\n')));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /missing/);
  } finally { removeWithRetries(dir); }
});

test('node_modules is carved out explicitly, and the carve-out is reported', () => {
  const { dir, B } = buildRepo();
  try {
    // Dependency bytes are pinned by the lockfile, not by HoloScript history, so canon cannot
    // carry them. The exemption must be VISIBLE -- a silent skip is how a pin stops meaning
    // anything without anyone noticing.
    const { errors, carvedOut } = validateUpstreamCommitPin(
      dir, B, pin(sha('irrelevant'), 'node_modules/three/examples/jsm/x.js'),
    );
    assert.deepEqual(errors, []);
    assert.equal(carvedOut.length, 1);
    assert.match(carvedOut[0], /lockfile/);
  } finally { removeWithRetries(dir); }
});

test('every pinned path is checked, not just the first', () => {
  const { dir, B } = buildRepo();
  try {
    const pins = [
      { pathKey: 'goodPath', relative: 'pkg/file.ts', sha256: sha('v2\n') },
      { pathKey: 'badPath', relative: 'pkg/file.ts', sha256: sha('wrong\n') },
    ];
    const { errors } = validateUpstreamCommitPin(dir, B, pins);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /badPath/);
  } finally { removeWithRetries(dir); }
});
