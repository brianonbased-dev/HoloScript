// Cheap field check for the Brian identity spec. Run: node --test <this file>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const README = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const LEAK =
  /[A-Za-z]:\\|\/Users\/|\/home\/|\/mnt\/|\\\\[A-Za-z0-9._$-]+|DESKTOP-[A-Z0-9]+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+|josep\b|OneDrive/i;
const spec = JSON.parse(readFileSync(new URL('./brian.identity.json', import.meta.url), 'utf8'));
const FILES = [
  'Brian_Flexing_001.glb',
  'Brian_Boxing.glb',
  'Brian_Situps.glb',
  'Bicycle Crunch.glb',
];

test('identity and origin', () => {
  assert.equal(spec.schema, 'holoscript.character-identity/v0');
  assert.equal(spec.id, 'brian');
  assert.equal(spec.origin.kind, 'original_character');
  assert.equal(spec.origin.creator, 'Joseph Krzywoszyja');
});

test('canonical source: 4 GLBs by filename + sha256, no personal paths', () => {
  const assets = spec.canonical_source.assets;
  assert.deepEqual(
    assets.map((a) => a.filename),
    FILES
  );
  for (const a of assets) {
    assert.match(a.sha256, /^[0-9a-f]{64}$/);
    assert.equal(a.skins, 0);
    assert.equal(a.animations, 0);
  }
  assert.doesNotMatch(JSON.stringify(spec), LEAK);
});

test('static x4, rig unknown', () => {
  assert.equal(spec.geometry.kind, 'static_pose_meshes');
  assert.equal(spec.geometry.pose_count, 4);
  assert.equal(spec.geometry.rig, 'unknown');
  assert.equal(spec.geometry.skins_total, 0);
  assert.equal(spec.geometry.animations_total, 0);
});

test('body map is a guide', () => {
  const g = spec.canonical_source.guides.find((x) => x.filename === 'Brian_Body_Map.jpg');
  assert.ok(g);
  assert.equal(g.role, 'body_map_guide');
  assert.match(g.sha256, /^[0-9a-f]{64}$/);
});

test('likeness/consent pending with Trust', () => {
  assert.equal(spec.likeness_consent.status, 'pending');
  assert.equal(spec.likeness_consent.owner, 'Trust');
});

test('export logs by filename + size + sha256', () => {
  const logs = spec.canonical_source.export_logs;
  assert.deepEqual(
    logs.map((l) => l.filename),
    ['Brian_Boxing.glb.log', 'Brian_Situps.glb.log']
  );
  for (const l of logs) {
    assert.equal(l.role, 'export_log');
    assert.ok(Number.isInteger(l.bytes) && l.bytes > 0);
    assert.match(l.sha256, /^[0-9a-f]{64}$/);
  }
});

test('openart PNG is a non-canonical reference render', () => {
  const r = spec.non_canonical_references.find((x) => x.filename.startsWith('openart-d2c449cd'));
  assert.ok(r);
  assert.equal(r.label, 'reference render, not canon sheet');
  assert.equal(r.canonical, false);
  assert.equal(r.ai_generated, true);
  assert.equal(r.turnaround, false);
  assert.match(r.sha256, /^[0-9a-f]{64}$/);
  const canon = [
    ...spec.canonical_source.assets,
    ...spec.canonical_source.guides,
    ...spec.canonical_source.export_logs,
  ];
  assert.ok(!canon.some((a) => a.filename.startsWith('openart')));
});

test('dragon template stays excluded', () => {
  assert.ok(
    spec.excluded.some(
      (e) => /gltfpipeline-brian-generate\.glb/.test(e.filename) && /dragon/i.test(e.reason)
    )
  );
  assert.ok(spec.not_brian.some((x) => /dragon/i.test(x)));
});

test('provenance: 3ds Max via Autodesk glTF exporter, materials dropped, no rig attempted', () => {
  const p = spec.provenance;
  assert.equal(p.tool, '3ds Max');
  assert.match(p.exporter, /Autodesk glTF exporter/);
  assert.match(p.exporter_evidence, /glb\.log/);
  assert.equal(p.material_channels, 'dropped');
  assert.match(p.material_channels_evidence, /per Idea seed/);
  assert.equal(p.rig_attempted, false);
  assert.match(p.rig_evidence, /per Idea seed/);
});

test('no personal paths, hosts or emails in README', () => {
  assert.doesNotMatch(README, LEAK);
});

test('leak pattern catches known personal-path shapes', () => {
  for (const bad of [
    'C:\\Users\\x',
    '/mnt/c/x',
    '/home/x',
    '\\\\server\\share',
    'DESKTOP-AB12CD',
    'joseph@local',
    'a.b@example.com',
    'OneDrive',
  ]) {
    assert.match(bad, LEAK, bad);
  }
});

test('local filename aliases tie to the canonical sha256', () => {
  const by = Object.fromEntries(spec.canonical_source.assets.map((a) => [a.filename, a]));
  assert.deepEqual(by['Brian_Flexing_001.glb'].aliases, ['Brian_Flexing.glb']);
  assert.deepEqual(by['Bicycle Crunch.glb'].aliases, ['Brian_BicycleCrunch.glb']);
  assert.match(spec.canonical_source.alias_rule, /sha256 is canon/);
});
