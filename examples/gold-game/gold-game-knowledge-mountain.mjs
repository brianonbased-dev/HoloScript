// Gate 41 — Knowledge Mountain MOUNT (pure module, F.077 module-first).
//
// Gate 39 PLACED the full real GOLD vault as a climbable region (186 entries by
// semantics->x/z + tier->elevation, 83 lineage cables) and built a STANDALONE viewer
// (knowledge-mountain.html). It did NOT mount that region into the playable drive-build
// — the ledger was honest: "full drive-build mount is a follow-on like Gates 1/32".
//
// This pure module turns the committed Gate-39 coords artifact (knowledge-mountain-coords.json)
// into the deterministic render payload the drive-build embeds: node placements (offset so the
// additive region sits BEHIND/ABOVE the ratified 5-seed onboarding vault, never overlapping it),
// tier-colored crystals scaled by lineage_in, and lineage cables. No three.js here — this is the
// data the build serializes and the verifier asserts byte-equal. Deterministic by construction:
// same coords in -> same payload + digest out (drive-build stays byte-reproducible for Gate 30).

import { createHash } from 'node:crypto';

// Tier palette (matches the standalone viewer / the in-game tier banding).
export const TIER_COLOR = {
  bronze: '#b08d57',
  silver: '#c7d0d8',
  gold: '#f0c651',
  platinum: '#dfe6ef',
  diamond: '#9fe9ff',
};

// The additive region is placed as a distinct landmass so it never collides with the
// onboarding vault (which lives near the origin). These constants are deterministic.
export const MOUNT = {
  // world-space offset of the whole mountain region (x,y,z)
  origin: [0, 0, -140],
  // coords artifact uses x in ~[0,40], z in ~[0,40], y in {0..4} tier bands.
  // scale them into a climbable landmass.
  xzScale: 2.4,
  // tier band (0..4) -> world height; diamond peak is tall and climbable
  tierHeight: 9.0,
  // crystal base size; lineage_in grows the crystal (more-cited = bigger landmark)
  crystalBase: 0.55,
  crystalPerLineage: 0.14,
  crystalMax: 2.6,
};

/**
 * Build the deterministic mount payload from the Gate-39 coords artifact.
 * @param {object} coords parsed knowledge-mountain-coords.json
 * @returns {{ origin:number[], nodes:Array, cables:Array, tierColor:object,
 *             entryCount:number, cableCount:number, missingBridgeCount:number,
 *             terrainDigest:string, mountDigest:string }}
 */
export function buildMountainMount(coords) {
  if (!coords || !Array.isArray(coords.coords)) {
    throw new Error('buildMountainMount: coords artifact missing .coords array');
  }
  const byId = new Map();
  const nodes = coords.coords.map((c) => {
    const wx = MOUNT.origin[0] + c.x * MOUNT.xzScale;
    const wz = MOUNT.origin[2] + c.z * MOUNT.xzScale;
    // y from the artifact is the tier band index (tier_y); place on the band height.
    const wy = MOUNT.origin[1] + c.y * MOUNT.tierHeight;
    const size = Math.min(
      MOUNT.crystalMax,
      MOUNT.crystalBase + (c.lineage_in || 0) * MOUNT.crystalPerLineage,
    );
    const node = {
      id: c.id,
      tier: c.tier,
      domain: c.domain || null,
      pos: [round(wx), round(wy), round(wz)],
      size: round(size),
      lineageIn: c.lineage_in || 0,
      lineageOut: c.lineage_out || 0,
      color: TIER_COLOR[c.tier] || '#cccccc',
    };
    byId.set(c.id, node);
    return node;
  });

  // Lineage cables: only those whose BOTH endpoints resolve to a placed node (Gate 39
  // guarantees this, but we assert it so a dropped node can't smuggle a dangling cable).
  const cables = [];
  for (const edge of coords.lineage_edges || []) {
    const a = byId.get(edge[0]);
    const b = byId.get(edge[1]);
    if (a && b) cables.push({ from: edge[0], to: edge[1], a: a.pos, b: b.pos });
  }

  const payload = {
    origin: MOUNT.origin,
    nodes,
    cables,
    tierColor: TIER_COLOR,
    entryCount: nodes.length,
    cableCount: cables.length,
    missingBridgeCount: (coords.missing_bridges || []).length,
    terrainDigest: coords.terrainDigest || coords.terrain_digest || null,
  };
  payload.mountDigest = createHash('sha256')
    .update(JSON.stringify({ origin: payload.origin, nodes: payload.nodes, cables: payload.cables }))
    .digest('hex');
  return payload;
}

function round(n) {
  // 4 decimal places — deterministic, stable across runs (Gate 30 byte-reproducibility).
  return Math.round(n * 1e4) / 1e4;
}
