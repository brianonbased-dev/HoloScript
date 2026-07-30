#!/usr/bin/env node
/*
 * A-003 task_1785348595166_nsog — build stamps must bind source BYTES, not mtimes.
 *
 * The stamp recorded each group's newest input mtime and treated
 * `newestInputMtimeMs <= stampedMtime` as proof the build covered those bytes.
 * Two confirmed false greens:
 *
 *   1. PRESERVED / BACKDATED MTIME — source bytes change while the mtime does
 *      not advance (fresh checkout, archive extraction, `touch -d`, restored
 *      backup). Coverage still passed, so a stale dist was blessed as verified.
 *   2. MID-BUILD MUTATION — source changed after its group built but before the
 *      stamp was written, so unbuilt bytes were recorded as verified.
 *
 * Both are reproduced against real files on disk. mtimes are pinned with
 * utimesSync so the preserved-mtime case is deterministic rather than dependent
 * on filesystem timestamp granularity.
 */
import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildGroupInputDigest,
  buildInputDigestByGroup,
  buildStampCoversInput,
  writeBuildStamp,
} from '../holoscript-mcp-stdio.mjs';

const temporaries = [];

after(() => {
  while (temporaries.length) rmSync(temporaries.pop(), { recursive: true, force: true });
});

const GROUP = {
  id: 'fixture-pkg',
  label: '@fixture/pkg',
  filter: '@fixture/pkg',
  requiredFiles: ['packages/fixture-pkg/dist/index.js'],
};

/** A minimal workspace shaped like the real one: package src plus global inputs. */
function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'mcp-stdio-stamp-'));
  temporaries.push(root);
  const pkg = join(root, 'packages', 'fixture-pkg');
  mkdirSync(join(pkg, 'src'), { recursive: true });
  mkdirSync(join(pkg, 'dist'), { recursive: true });
  writeFileSync(join(pkg, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
  writeFileSync(join(pkg, 'package.json'), '{"name":"@fixture/pkg"}\n', 'utf8');
  writeFileSync(join(pkg, 'dist', 'index.js'), 'built\n', 'utf8');
  writeFileSync(join(root, 'package.json'), '{"name":"root"}\n', 'utf8');
  writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8');
  return { root, pkg };
}

/** Rewrite a file's bytes while forcing its mtime back to the original. */
function editPreservingMtime(file, nextContent) {
  const before = statSync(file);
  writeFileSync(file, nextContent, 'utf8');
  const seconds = before.mtimeMs / 1000;
  utimesSync(file, seconds, seconds);
  return before.mtimeMs;
}

describe('buildGroupInputDigest', () => {
  it('changes when source bytes change', () => {
    const { root, pkg } = workspace();
    const before = buildGroupInputDigest(GROUP, { root });
    writeFileSync(join(pkg, 'src', 'index.ts'), 'export const value = 2;\n', 'utf8');
    assert.notStrictEqual(buildGroupInputDigest(GROUP, { root }), before);
  });

  it('is stable when nothing changes', () => {
    const { root } = workspace();
    assert.strictEqual(
      buildGroupInputDigest(GROUP, { root }),
      buildGroupInputDigest(GROUP, { root }),
    );
  });

  it('changes when a SHARED build input changes, not just package source', () => {
    // A lockfile edit changes what every group means, so it must move the digest.
    const { root } = workspace();
    const before = buildGroupInputDigest(GROUP, { root });
    writeFileSync(join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n# bumped\n', 'utf8');
    assert.notStrictEqual(buildGroupInputDigest(GROUP, { root }), before);
  });

  it('does NOT change when only dist output changes', () => {
    const { root, pkg } = workspace();
    const before = buildGroupInputDigest(GROUP, { root });
    writeFileSync(join(pkg, 'dist', 'index.js'), 'rebuilt\n', 'utf8');
    assert.strictEqual(buildGroupInputDigest(GROUP, { root }), before);
  });

  it('THE BUG: changes even when the mtime is preserved', () => {
    const { root, pkg } = workspace();
    const file = join(pkg, 'src', 'index.ts');
    const before = buildGroupInputDigest(GROUP, { root });
    const originalMtime = editPreservingMtime(file, 'export const value = 999;\n');

    // The mtime genuinely did not advance -- this is what fooled the old check.
    // utimesSync round-trips through float seconds, so allow sub-millisecond
    // wobble; the old comparison was `<=` and would have passed regardless.
    assert.ok(
      Math.abs(statSync(file).mtimeMs - originalMtime) < 1,
      `mtime moved by ${statSync(file).mtimeMs - originalMtime}ms`,
    );
    // ...but the content identity moved, so no stamp can still cover it.
    assert.notStrictEqual(buildGroupInputDigest(GROUP, { root }), before);
  });

  it('returns null for a group with no resolvable package root', () => {
    const { root } = workspace();
    const digest = buildGroupInputDigest(
      { id: 'x', requiredFiles: ['no-output-marker.js'] },
      { root },
    );
    assert.strictEqual(digest, null);
  });
});

describe('buildStampCoversInput fails closed', () => {
  const freshness = { id: 'fixture-pkg', newestInputMtimeMs: 1_000, stale: false };

  it('covers when the digest matches', () => {
    const stamp = { inputDigestByGroup: { 'fixture-pkg': 'sha256:abc' } };
    assert.strictEqual(buildStampCoversInput(freshness, stamp, 'sha256:abc'), true);
  });

  it('does NOT cover when the digest differs', () => {
    const stamp = { inputDigestByGroup: { 'fixture-pkg': 'sha256:abc' } };
    assert.strictEqual(buildStampCoversInput(freshness, stamp, 'sha256:different'), false);
  });

  it('does NOT cover a pre-digest stamp from an older launcher', () => {
    // Old stamps carry only mtimes. Trusting one would re-open the hole, so the
    // upgrade costs exactly one rebuild.
    const legacy = { inputMtimeMsByGroup: { 'fixture-pkg': 9_999_999 } };
    assert.strictEqual(buildStampCoversInput(freshness, legacy, 'sha256:abc'), false);
  });

  it('does NOT cover with no stamp at all', () => {
    assert.strictEqual(buildStampCoversInput(freshness, null, 'sha256:abc'), false);
  });

  it('does NOT cover when the current digest is unreadable', () => {
    const stamp = { inputDigestByGroup: { 'fixture-pkg': 'sha256:abc' } };
    assert.strictEqual(buildStampCoversInput(freshness, stamp, null), false);
  });

  it('THE BUG: a newer stamped mtime no longer grants coverage on its own', () => {
    // Old behaviour: newestInputMtimeMs <= stamped mtime => covered. The stamped
    // mtime here is maximal, which used to be sufficient all by itself.
    const stamp = {
      inputMtimeMsByGroup: { 'fixture-pkg': Number.MAX_SAFE_INTEGER },
      inputDigestByGroup: { 'fixture-pkg': 'sha256:built-from-these-bytes' },
    };
    assert.strictEqual(
      buildStampCoversInput(freshness, stamp, 'sha256:but-disk-says-otherwise'),
      false,
    );
  });
});

describe('buildInputDigestByGroup', () => {
  it('returns one digest per requested group', () => {
    const { root } = workspace();
    const digests = buildInputDigestByGroup({ root, groups: [GROUP] });
    assert.deepStrictEqual(Object.keys(digests), ['fixture-pkg']);
    assert.match(digests['fixture-pkg'], /^sha256:[0-9a-f]{64}$/u);
  });
});

describe('writeBuildStamp refuses a mid-build mutation instead of recording it', () => {
  it('stamps normally when inputs held still through the build', () => {
    const { root } = workspace();
    const preBuild = buildInputDigestByGroup({ root, groups: [GROUP] });
    const stampPath = join(root, 'stamp.json');

    const stamp = writeBuildStamp({
      root,
      path: stampPath,
      gitHead: 'a'.repeat(40),
      builtGroups: ['fixture-pkg'],
      groups: [GROUP],
      verifiedInputDigestByGroup: preBuild,
    });

    assert.strictEqual(stamp.inputDigestByGroup['fixture-pkg'], preBuild['fixture-pkg']);
    assert.strictEqual(
      JSON.parse(readFileSync(stampPath, 'utf8')).schemaVersion,
      'holoscript.local-mcp-build-stamp.v1',
    );
  });

  it('THE BUG: refuses to stamp when source changed after the build started', () => {
    const { root, pkg } = workspace();
    const preBuild = buildInputDigestByGroup({ root, groups: [GROUP] });

    // The build ran against the bytes above; THEN someone edits the source.
    // Recording the post-edit state is exactly the false green.
    writeFileSync(join(pkg, 'src', 'index.ts'), 'export const value = 3;\n', 'utf8');

    assert.throws(
      () => writeBuildStamp({
        root,
        path: join(root, 'stamp.json'),
        gitHead: 'a'.repeat(40),
        builtGroups: ['fixture-pkg'],
        groups: [GROUP],
        verifiedInputDigestByGroup: preBuild,
      }),
      /build inputs changed during the build for fixture-pkg/u,
    );
  });

  it('refuses even when the mid-build edit preserved the mtime', () => {
    const { root, pkg } = workspace();
    const preBuild = buildInputDigestByGroup({ root, groups: [GROUP] });
    editPreservingMtime(join(pkg, 'src', 'index.ts'), 'export const value = 4;\n');

    assert.throws(
      () => writeBuildStamp({
        root,
        path: join(root, 'stamp.json'),
        gitHead: 'a'.repeat(40),
        builtGroups: ['fixture-pkg'],
        groups: [GROUP],
        verifiedInputDigestByGroup: preBuild,
      }),
      /build inputs changed during the build/u,
    );
  });

  it('leaves no stamp artifact behind when it refuses', () => {
    const { root, pkg } = workspace();
    const preBuild = buildInputDigestByGroup({ root, groups: [GROUP] });
    const stampPath = join(root, 'stamp.json');
    writeFileSync(join(pkg, 'src', 'index.ts'), 'export const value = 5;\n', 'utf8');

    assert.throws(() => writeBuildStamp({
      root,
      path: stampPath,
      gitHead: 'a'.repeat(40),
      builtGroups: ['fixture-pkg'],
      groups: [GROUP],
      verifiedInputDigestByGroup: preBuild,
    }));
    // A refused stamp must leave nothing a later run could trust.
    assert.throws(() => readFileSync(stampPath, 'utf8'));
  });
});
