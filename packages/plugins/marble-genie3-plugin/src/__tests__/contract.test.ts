/**
 * @holoscript/marble-genie3-plugin — ADAPTER CONTRACT TEST
 *
 * Contract gate for the World Labs Marble + DeepMind Genie 3 rows of the
 * Universal-IR coverage matrix (docs/universal-ir-coverage.md). MUST keep
 * passing or the matrix rows cannot claim "🟡 Roadmap + 🟡 Stub" status.
 *
 * Extends the a7ef1f8ed pattern (URDF / OpenUSD / VRM) to row 2 of the
 * founder-scoped OpenUSD+marble-genie3 slice. This stub is special — it
 * declares tier:'T1' linking to the paper-13 neural-rendering contract,
 * which is the only row that makes an explicit neural-asset guarantee.
 *
 * Source:  .ai-ecosystem/research/2026-04-24_world-labs-marble-genie3-holoscript-world-models.md
 * Audit:   task_1776937048052_ybf4 (Wave D negative sweep, stream 3 — follow-on)
 * Paper:   paper-13 neural-rendering contract (docs/universal-ir-coverage.md §2.1 row)
 *
 * Contract surface (what the adapter promises):
 *   1. Exposes importWorldModel at a stable public path.
 *   2. Emitted neural_asset.tier is always 'T1' — this is the paper-13 gate.
 *   3. Emitted neural_asset.representation is always 'world_model'.
 *   4. asset_id format: starts with 'wm:', contains source token, contains
 *      first 12 chars of checkpoint_hash. Stable for reproducible pipelines.
 *   5. canonical_viewpoints equals frames.length exactly.
 *   6. Every input frame produces exactly one '@world_frame' trait.
 *   7. Each trait's target_id embeds the original frame timestamp.
 *   8. Trait params preserve image_uri and latent_hash (or empty string).
 *   9. Empty frames array → empty traits array + canonical_viewpoints=0, no throw.
 *  10. checkpoint_hash is preserved bit-identical on the neural_asset.
 *  11. Both 'marble' and 'genie3' sources route through the same shape —
 *      row 9 and row 10 of the matrix share the stub.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { importWorldModel, type WorldModelInput } from '../index';

function fixtureInput(overrides: Partial<WorldModelInput> = {}): WorldModelInput {
  return {
    source: 'marble',
    checkpoint_hash: 'sha256:abcdef012345_checkpoint_hash_for_test',
    frames: [
      { t: 0.0, image_uri: 'cas://frame0', latent_hash: 'lat:a' },
      { t: 0.5, image_uri: 'cas://frame1', latent_hash: 'lat:b' },
      { t: 1.0, image_uri: 'cas://frame2' }, // latent_hash omitted to exercise default
    ],
    ...overrides,
  };
}

describe('CONTRACT: marble-genie3-plugin adapter', () => {
  it('exposes importWorldModel at stable public path', () => {
    expect(typeof mod.importWorldModel).toBe('function');
  });

  it('neural_asset.tier is always T1 (paper-13 gate)', () => {
    const out = importWorldModel(fixtureInput());
    expect(out.neural_asset.tier).toBe('T1');
  });

  it('neural_asset.representation is always world_model', () => {
    const out = importWorldModel(fixtureInput());
    expect(out.neural_asset.representation).toBe('world_model');
  });

  it('asset_id format: wm:<source>:<first-12-of-checkpoint>', () => {
    const out = importWorldModel(fixtureInput());
    expect(out.neural_asset.asset_id.startsWith('wm:marble:')).toBe(true);
    expect(out.neural_asset.asset_id).toBe('wm:marble:sha256:abcde');
  });

  it('canonical_viewpoints equals frames.length exactly', () => {
    const out = importWorldModel(fixtureInput());
    expect(out.neural_asset.canonical_viewpoints).toBe(3);
    const bigger = importWorldModel(
      fixtureInput({
        frames: Array.from({ length: 7 }, (_, i) => ({
          t: i * 0.1,
          image_uri: `cas://f${i}`,
        })),
      })
    );
    expect(bigger.neural_asset.canonical_viewpoints).toBe(7);
  });

  it('every input frame produces exactly one @world_frame trait', () => {
    const out = importWorldModel(fixtureInput());
    expect(out.traits.length).toBe(3);
    for (const t of out.traits) {
      expect(t.kind).toBe('@world_frame');
    }
  });

  it('each trait target_id embeds the frame timestamp', () => {
    const out = importWorldModel(fixtureInput());
    expect(out.traits[0].target_id).toContain('@t0');
    expect(out.traits[1].target_id).toContain('@t0.5');
    expect(out.traits[2].target_id).toContain('@t1');
  });

  it('trait params preserve image_uri and latent_hash (empty string when missing)', () => {
    const out = importWorldModel(fixtureInput());
    expect(out.traits[0].params.image_uri).toBe('cas://frame0');
    expect(out.traits[0].params.latent_hash).toBe('lat:a');
    // Third frame omitted latent_hash — contract promises empty string, not undefined
    expect(out.traits[2].params.latent_hash).toBe('');
    expect(out.traits[2].params.image_uri).toBe('cas://frame2');
  });

  it('empty frames array → empty traits, canonical_viewpoints=0, no throw', () => {
    expect(() => importWorldModel(fixtureInput({ frames: [] }))).not.toThrow();
    const out = importWorldModel(fixtureInput({ frames: [] }));
    expect(out.traits).toEqual([]);
    expect(out.neural_asset.canonical_viewpoints).toBe(0);
    expect(out.neural_asset.tier).toBe('T1');
  });

  it('checkpoint_hash is preserved bit-identical on neural_asset', () => {
    const ckpt = 'sha256:unique_ckpt_hash_preserve_test_12345';
    const out = importWorldModel(fixtureInput({ checkpoint_hash: ckpt }));
    expect(out.neural_asset.checkpoint_hash).toBe(ckpt);
  });

  it('both marble and genie3 sources share the same emission shape (rows 9 and 10)', () => {
    const marble = importWorldModel(fixtureInput({ source: 'marble' }));
    const genie3 = importWorldModel(fixtureInput({ source: 'genie3' }));
    expect(marble.neural_asset.tier).toBe(genie3.neural_asset.tier);
    expect(marble.neural_asset.representation).toBe(genie3.neural_asset.representation);
    expect(marble.traits.length).toBe(genie3.traits.length);
    expect(marble.neural_asset.asset_id.startsWith('wm:marble:')).toBe(true);
    expect(genie3.neural_asset.asset_id.startsWith('wm:genie3:')).toBe(true);
  });
});
