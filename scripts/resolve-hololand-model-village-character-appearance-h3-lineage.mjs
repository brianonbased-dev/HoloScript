#!/usr/bin/env node

/**
 * Resolves the H3A <-> H3B lineage pins in ONE topological pass.
 *
 * This script exists because the pair used to have no fixed point. H3A recorded H3B's
 * source hash (metadata.successorSourceSha256) while H3B recorded H3A's source, policy,
 * seed, manifest and report hashes. Editing either file invalidated the other's record,
 * and re-resolving the other invalidated the first -- a genuine cycle, so a lineage sweep
 * could never terminate.
 *
 * The cycle was removed by deleting successorSourceSha256 and replacing it with an
 * EXECUTED supersession proof (see proveSupersessionBoundary in the H3A checker), which
 * needs no hash of the successor at all. What is left is a strict DAG:
 *
 *     H3A source/policy/seed/checker/test/report
 *                  |
 *                  v
 *          H3A manifest  ------+
 *                              |
 *                              v
 *                        H3B source  ---->  H3B manifest
 *
 * Each stage below depends only on stages above it, so running them in order converges
 * in a single pass. If a second pass would ever change anything, --check says so.
 *
 * SCOPE DISCIPLINE. This refreshes only the LINEAGE pins listed here -- the ones this
 * change is expected to invalidate. Every other pinned artifact (atlases, hero renders,
 * LOD plates) is VERIFIED and reported, never rewritten, so a resolver run cannot quietly
 * paper over real asset drift.
 *
 * Usage:
 *   node scripts/resolve-hololand-model-village-character-appearance-h3-lineage.mjs
 *   node scripts/resolve-hololand-model-village-character-appearance-h3-lineage.mjs --check
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || 'C:/Users/josep/Documents/GitHub/HoloScript';

/** Canonical history. Pins derived here must be resolvable from a fresh clone, not just here. */
const CANON_REF = process.env.HOLOSCRIPT_CANON_REF || 'canon/main';

const MODEL_VILLAGE = 'source/layers/vr/frontier/model-village';
const H3A_MANIFEST = `${MODEL_VILLAGE}/model-village-character-appearance-h3a-neutral-personas-manifest.holo`;
const H3B_SOURCE = `${MODEL_VILLAGE}/model-village-character-appearance-h3b-native-channels.holo`;
const H3B_MANIFEST = `${MODEL_VILLAGE}/model-village-character-appearance-h3b-native-channels-manifest.holo`;
const H3C_SOURCE = `${MODEL_VILLAGE}/model-village-character-appearance-h3c-face-foundation.holo`;
const H3C_MANIFEST = `${MODEL_VILLAGE}/model-village-character-appearance-h3c-face-foundation-manifest.holo`;

/**
 * The forward chain, in topological order, from the first gate the seven-patch repair
 * moved down to the last gate it can reach.
 *
 * Why this exists now and did not before: the original resolver stopped one hop past H3B
 * because propagating further would have rewritten H3D/H3E/H3F while they were red for
 * unrelated upstream drift, and would have turned the then-green H3G red to tidy up gates
 * that were broken anyway. That reason expired when H3D-H3N were repaired and re-witnessed.
 * The graph was also re-measured and is a strict DAG (h3a -> h4a, 28 nodes, no cycle), so
 * a single ordered pass converges.
 *
 * A lineage pin records "I was witnessed against THIS version of my predecessor". It
 * asserts nothing about whether the gate's property holds, so refreshing one cannot launder
 * a gate green -- verified below: every gate red for a non-lineage reason stays red.
 */
const FORWARD_CHAIN = [
  // H3D joined the chain when the upstream commit re-pin edited H3C's source. Before that its
  // inherited pin was already correct and it needed no stage; the chain now starts one gate
  // earlier rather than leaving a hole only this run would notice.
  ['H3D', `${MODEL_VILLAGE}/model-village-character-appearance-h3d-native-ocular-regions.holo`],
  ['H3E', `${MODEL_VILLAGE}/model-village-character-appearance-h3e-orbital-fit.holo`],
  ['H3F', `${MODEL_VILLAGE}/model-village-character-appearance-h3f-native-groom.holo`],
  ['H3G', `${MODEL_VILLAGE}/model-village-character-appearance-h3g-hair-response.holo`],
  ['H3H', `${MODEL_VILLAGE}/model-village-character-appearance-h3h-temporal-lod.holo`],
  ['H3I', `${MODEL_VILLAGE}/model-village-character-appearance-h3i-anatomy-surface.holo`],
  ['H3J', `${MODEL_VILLAGE}/model-village-character-appearance-h3j-civic-landmarks.holo`],
  ['H3K', `${MODEL_VILLAGE}/model-village-character-appearance-h3k-upper-body-occlusion.holo`],
  ['H3L', `${MODEL_VILLAGE}/model-village-character-appearance-h3l-upper-limb.holo`],
  ['H3M', `${MODEL_VILLAGE}/model-village-character-appearance-h3m-anatomical-hands.holo`],
  ['H3N', `${MODEL_VILLAGE}/model-village-character-appearance-h3n-hand-landmarks-taa-lod.holo`],
  ['H3O', `${MODEL_VILLAGE}/model-village-character-appearance-h3o-native-hand-material-plates.holo`],
  ['H3P', `${MODEL_VILLAGE}/model-village-character-appearance-h3p-hand-topology-convergence.holo`],
  ['H3Q', `${MODEL_VILLAGE}/model-village-character-appearance-h3q-material-calibration.holo`],
  ['H3R', `${MODEL_VILLAGE}/model-village-character-appearance-h3r-posed-deformation.holo`],
  ['H3S', `${MODEL_VILLAGE}/model-village-character-appearance-h3s-hand-surface-anatomy.holo`],
  ['H3T', `${MODEL_VILLAGE}/model-village-character-appearance-h3t-skin-surface-response.holo`],
  // H3U is walked so its REFUSAL is reported every run rather than being a silent omission
  // from the list. Its pin is in PRE_EXISTING_HOLD, so the resolver reads it, finds it
  // drifted, and says so without rewriting -- the chain effectively ends at H3T.
  ['H3U', `${MODEL_VILLAGE}/model-village-character-appearance-h3u-browser-quest-temporal-lod.holo`],
];

/**
 * Lineage pins this resolver REFUSES to refresh, with the reason.
 *
 * These were measured as already drifted BEFORE the seven-patch integration (by
 * reconstructing the pre-patch worktree from HEAD blobs re-shaped to each file's recorded
 * line endings, then proving the reconstruction against captured sha256s). Refreshing a pin
 * whose predecessor THIS change moved is owed maintenance. Refreshing one that was already
 * wrong is masking a pre-existing fault under cover of a sweep, so it is held instead.
 *
 * The chain therefore STOPS at H3T. H3U's pin on H3T was already stale, and H3U is one of
 * the four GPU gates that cannot be judged headlessly, so it is reported and left alone.
 */
const PRE_EXISTING_HOLD = new Set(['H3U::inheritedH3TSourceSha256']);

/**
 * Blocks whose `sha256:` follows a `path:` naming a file this change can legitimately
 * move. Anything else in the manifest is verified only.
 */
const LINEAGE_BLOCKS = ['source', 'policy', 'seed', 'checker', 'test', 'report'];

const STAGES = [
  {
    name: 'H3A manifest records the H3A authored triad, checker, test and report',
    file: H3A_MANIFEST,
    kind: 'manifest',
  },
  {
    name: 'H3B source inherits H3A and pins the upstream character-render surface',
    file: H3B_SOURCE,
    kind: 'metadata',
    pins: [
      ['inheritedH3ASource', 'inheritedH3ASourceSha256', ROOT],
      ['inheritedH3APolicy', 'inheritedH3APolicySha256', ROOT],
      ['inheritedH3ASeed', 'inheritedH3ASeedSha256', ROOT],
      ['inheritedH3AManifest', 'inheritedH3AManifestSha256', ROOT],
      ['inheritedH3AReport', 'inheritedH3AReportSha256', ROOT],
      ['appearancePlan', 'appearancePlanSha256', ROOT],
      ['upstreamCharacterHostPath', 'upstreamCharacterHostSha256', HOLOSCRIPT_ROOT],
      [
        'upstreamCompositionBridgePath',
        'upstreamCompositionBridgeSha256',
        HOLOSCRIPT_ROOT,
      ],
      ['upstreamHairBuilderPath', 'upstreamHairBuilderSha256', HOLOSCRIPT_ROOT],
      ['upstreamMorphBuilderPath', 'upstreamMorphBuilderSha256', HOLOSCRIPT_ROOT],
      ['upstreamCompilerPath', 'upstreamCompilerSha256', HOLOSCRIPT_ROOT],
      ['upstreamLodManagerPath', 'upstreamLodManagerSha256', HOLOSCRIPT_ROOT],
      ['temporalPassPath', 'temporalPassSha256', HOLOSCRIPT_ROOT],
    ],
    // The commit that last moved the pinned upstream surface. Must be an ancestor of
    // upstream HEAD; H3B's checker enforces that.
    upstreamCommitKey: 'upstreamHoloScriptCommit',
    upstreamCommitFor: [
      'upstreamCharacterHostPath',
      'upstreamCompositionBridgePath',
      'upstreamHairBuilderPath',
      'upstreamMorphBuilderPath',
      'upstreamCompilerPath',
      'upstreamLodManagerPath',
    ],
  },
  {
    name: 'H3B manifest records the H3B authored triad, checker, test and report',
    file: H3B_MANIFEST,
    kind: 'manifest',
  },
  {
    name: 'H3C inherits H3B',
    file: H3C_SOURCE,
    kind: 'metadata',
    pins: [['inheritedH3BSource', 'inheritedH3BSourceSha256', ROOT]],
  },
  // H3D's own inherited pin is carried by its repaired source and needs no stage here.
  // From H3E the chain is walked generically: each gate's lineage pins are DISCOVERED from
  // its own text rather than hardcoded, so a gate that grows a second predecessor (H3I pins
  // both H3G and H3H) is handled without editing this list.
  ...FORWARD_CHAIN.map(([gate, file]) => ({
    name: `${gate} inherits its predecessor(s)`,
    file,
    kind: 'lineage',
    gate,
  })),
];

// Deliberately NOT a stage: H3C's manifest. Its source, checker, test and report pins
// were already stale before this change and H3C passes anyway, which means H3C's gate
// does not read them. Refreshing them here would rewrite records of pre-existing drift
// that nothing verifies -- laundering, not resolving -- so they are left exactly as
// found and reported instead. H3C's SOURCE pin on H3B is a different matter: its gate
// does check that one, so it is resolved above.
void H3C_MANIFEST;

function sha256File(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function readValue(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}:\\s*"([^"]*)"`, 'm'));
  return match ? match[1] : null;
}

/** Replaces the quoted value of `key`, requiring exactly one occurrence. */
function writeValue(text, key, value, label) {
  const pattern = new RegExp(`(^\\s*${key}:\\s*")([^"]*)(")`, 'gm');
  const hits = text.match(pattern) || [];
  if (hits.length !== 1) {
    throw new Error(`${label}: expected 1 occurrence of ${key}, found ${hits.length}`);
  }
  return text.replace(pattern, `$1${value}$3`);
}

/**
 * In a manifest, finds the hash that belongs to the block named `block`.
 *
 * The series does not use one spelling: H3A and H3B write `sha256:` inside each block,
 * while H3C writes `sourceSha256:` / `policySha256:`. Both are accepted rather than
 * normalised, because reformatting sibling gates' manifests is not this change's business.
 */
function manifestBlock(text, block) {
  const start = text.search(new RegExp(`^\\s*${block}:\\s*\\{`, 'm'));
  if (start < 0) return null;
  const slice = text.slice(start);
  const end = slice.indexOf('\n    }');
  const body = end < 0 ? slice : slice.slice(0, end);
  const pathValue = body.match(/^\s*path:\s*"([^"]*)"/m);
  const hashValue = body.match(
    new RegExp(`^\\s*(?:sha256|${block}Sha256):\\s*"([0-9a-f]{64})"`, 'm'),
  );
  if (!pathValue || !hashValue) return null;
  return {
    start,
    body,
    path: pathValue[1],
    sha256: hashValue[1],
  };
}

/**
 * Newest commit touching these files WITHIN CANON.
 *
 * This used to walk from local HEAD, which quietly reintroduced the defect the upstream-pin
 * validator exists to catch: it derived a commit that lives only in this checkout, so every
 * resolver run overwrote a reproducible pin with an unreproducible one. Restricting the walk
 * to the canon ref means the derived pin is one a fresh clone can resolve.
 */
function lastCommitTouching(files) {
  let newest = null;
  for (const file of files) {
    const commit = execFileSync(
      'git',
      ['log', '-1', '--format=%H', CANON_REF, '--', file],
      { cwd: HOLOSCRIPT_ROOT, encoding: 'utf8' },
    ).trim();
    if (!commit) continue;
    if (
      newest === null ||
      isAncestor(newest, commit)
    ) {
      newest = commit;
    }
  }
  return newest;
}

function isAncestor(candidate, of) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', candidate, of], {
      cwd: HOLOSCRIPT_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function run({ check }) {
  const changed = [];
  const verified = [];
  const stale = [];
  // Pins deliberately NOT refreshed because they were already drifted before this change.
  // Kept apart from `stale` so a held pin does not read as fresh asset drift, and so the
  // exit code still means "there is drift nobody has accounted for".
  const held = [];

  for (const stage of STAGES) {
    const file = path.join(ROOT, stage.file);
    const raw = readFileSync(file, 'utf8');
    const wasCRLF = raw.includes('\r\n');
    let text = raw.split('\r\n').join('\n');

    if (stage.kind === 'manifest') {
      // Refresh only the lineage blocks; verify everything else.
      let cursor = text;
      for (const block of LINEAGE_BLOCKS) {
        const found = manifestBlock(cursor, block);
        if (!found) throw new Error(`${stage.file}: block ${block} not found`);
        const target = path.resolve(ROOT, found.path);
        if (!existsSync(target)) throw new Error(`${stage.file}: missing ${found.path}`);
        const actual = sha256File(target);
        if (actual === found.sha256) {
          verified.push(`${stage.file} :: ${block}`);
          continue;
        }
        const before = cursor;
        cursor =
          cursor.slice(0, found.start) +
          cursor
            .slice(found.start)
            .replace(found.sha256, actual);
        if (cursor === before) throw new Error(`${stage.file}: ${block} rewrite missed`);
        changed.push(`${stage.file} :: ${block} -> ${actual.slice(0, 12)}`);
      }
      // Verify-only pass over every other pinned artifact.
      for (const blockMatch of cursor.matchAll(
        /^\s*(\w+):\s*\{[\s\S]*?^\s*path:\s*"([^"]*)"[\s\S]*?^\s*\w*[sS]ha256:\s*"([0-9a-f]{64})"/gm,
      )) {
        const [, block, rel, recorded] = blockMatch;
        if (LINEAGE_BLOCKS.includes(block)) continue;
        const target = path.resolve(ROOT, rel);
        if (!existsSync(target)) {
          stale.push(`${stage.file} :: ${block} -> missing ${rel}`);
          continue;
        }
        if (sha256File(target) !== recorded) {
          stale.push(`${stage.file} :: ${block} -> ${rel} drifted (NOT rewritten)`);
        } else {
          verified.push(`${stage.file} :: ${block} (verify-only)`);
        }
      }
      text = cursor;
    } else if (stage.kind === 'lineage') {
      // Discover this gate's lineage pins from its own text: every inherited<X>Source that
      // has a sibling inherited<X>Source Sha256. Held pins are reported, never rewritten.
      const pins = [...text.matchAll(/inherited([A-Za-z0-9]+)Source:\s*"([^"]+)"/g)];
      if (!pins.length) throw new Error(`${stage.file}: no inherited*Source pin found`);
      for (const [, key, rel] of pins) {
        const hashKey = `inherited${key}SourceSha256`;
        if (readValue(text, hashKey) === null) {
          stale.push(`${stage.file} :: ${hashKey} absent (pin records no hash; NOT added)`);
          continue;
        }
        const target = path.resolve(ROOT, rel);
        if (!existsSync(target)) {
          stale.push(`${stage.file} :: ${hashKey} -> missing ${rel} (NOT rewritten)`);
          continue;
        }
        const actual = sha256File(target);
        if (readValue(text, hashKey) === actual) {
          verified.push(`${stage.file} :: ${hashKey}`);
          continue;
        }
        if (PRE_EXISTING_HOLD.has(`${stage.gate}::${hashKey}`)) {
          held.push(
            `${stage.file} :: ${hashKey} drifted BEFORE this change — HELD, not rewritten`,
          );
          continue;
        }
        text = writeValue(text, hashKey, actual, stage.file);
        changed.push(`${stage.file} :: ${hashKey} -> ${actual.slice(0, 12)}`);
      }
    } else {
      for (const [pathKey, hashKey, base] of stage.pins) {
        const rel = readValue(text, pathKey);
        if (!rel) throw new Error(`${stage.file}: ${pathKey} missing`);
        const target = path.resolve(base, rel);
        if (!existsSync(target)) throw new Error(`${stage.file}: missing ${rel}`);
        const actual = sha256File(target);
        if (readValue(text, hashKey) === actual) {
          verified.push(`${stage.file} :: ${hashKey}`);
          continue;
        }
        text = writeValue(text, hashKey, actual, stage.file);
        changed.push(`${stage.file} :: ${hashKey} -> ${actual.slice(0, 12)}`);
      }
      if (stage.upstreamCommitKey) {
        const files = stage.upstreamCommitFor.map((key) => readValue(text, key));
        const commit = lastCommitTouching(files);
        if (commit && readValue(text, stage.upstreamCommitKey) !== commit) {
          text = writeValue(text, stage.upstreamCommitKey, commit, stage.file);
          changed.push(
            `${stage.file} :: ${stage.upstreamCommitKey} -> ${commit.slice(0, 12)}`,
          );
        } else {
          verified.push(`${stage.file} :: ${stage.upstreamCommitKey}`);
        }
      }
    }

    const next = wasCRLF ? text.split('\n').join('\r\n') : text;
    if (next !== raw && !check) writeFileSync(file, next, 'utf8');
    if (next !== raw && check) {
      // recorded in `changed`; nothing written
    }
  }

  return { changed, verified, stale, held };
}

const check = process.argv.includes('--check');
const result = run({ check });
console.log(
  JSON.stringify(
    {
      mode: check ? 'check' : 'resolve',
      converged: result.changed.length === 0,
      rewritten: result.changed,
      verified: result.verified.length,
      staleNotRewritten: result.stale,
      heldPreExisting: result.held,
    },
    null,
    2,
  ),
);
if (check && (result.changed.length || result.stale.length)) process.exit(1);
if (!check && result.stale.length) process.exit(1);
