/**
 * @holoscript/marble-genie3-plugin — Marble / Genie3 world-model bridge stub.
 *
 * Research: ai-ecosystem/research/2026-04-24_world-labs-marble-genie3-holoscript-world-models.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (world-model column)
 *
 * Status: STUB. Real frame-ingestion + latent-conditioning pipeline are
 * future work; current shape declares the interface + tier-mapping per
 * paper-13 neural-rendering contract (T1 approximate, golden frames).
 */

export interface WorldModelFrame {
  t: number;           // timestep in seconds
  image_uri: string;   // reference to frame bytes (content-addressed)
  latent_hash?: string; // stable over a generation run
}

export interface WorldModelInput {
  source: 'marble' | 'genie3';
  checkpoint_hash: string;
  frames: WorldModelFrame[];
  canonical_camera?: {
    position: [number, number, number];
    target: [number, number, number];
  };
}

export interface HoloWorldModelEmission {
  neural_asset: {
    asset_id: string;
    tier: 'T1';                      // per paper-13 — neural-approximated
    representation: 'world_model';
    checkpoint_hash: string;
    canonical_viewpoints: number;    // count of frames that can serve as golden
  };
  traits: Array<{ kind: '@world_frame'; target_id: string; params: Record<string, unknown> }>;
}

export function importWorldModel(input: WorldModelInput): HoloWorldModelEmission {
  const asset_id = `wm:${input.source}:${input.checkpoint_hash.slice(0, 12)}`;
  const traits = input.frames.map((f) => ({
    kind: '@world_frame' as const,
    target_id: `${asset_id}@t${f.t}`,
    params: { image_uri: f.image_uri, latent_hash: f.latent_hash ?? '', t: f.t },
  }));
  return {
    neural_asset: {
      asset_id,
      tier: 'T1',
      representation: 'world_model',
      checkpoint_hash: input.checkpoint_hash,
      canonical_viewpoints: input.frames.length,
    },
    traits,
  };
}
