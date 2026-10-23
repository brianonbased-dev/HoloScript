// Cheap field check for the Brian identity spec. Run: node --test <this file>
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
  const raw = JSON.stringify(spec);
  assert.doesNotMatch(raw, /[A-Za-z]:\\\\|\/Users\/|\/home\/|josep\b|OneDrive/i);
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
