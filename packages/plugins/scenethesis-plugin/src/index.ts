/**
 * @holoscript/scenethesis-plugin — Scenethesis scene-synthesis bridge stub.
 *
 * Research: ai-ecosystem/research/2026-04-22_scenethesis-scenecraft-holoscript-comparison.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (world-synthesis column)
 *
 * Status: STUB. Full Scenethesis output-format parsing + bidirectional
 * round-trip are future work. Current scope: declare input/output interfaces
 * + a minimal object-to-trait mapper for the seven Scenethesis primitive
 * categories (object, relation, constraint, region, light, camera, metadata).
 */

export interface ScenethesisObject {
  id: string;
  category: string; // 'furniture', 'wall', 'prop', etc.
  position: [number, number, number];
  orientation?: [number, number, number, number]; // quat
  scale?: [number, number, number];
}

export interface ScenethesisRelation {
  subject: string; // object.id
  predicate: 'on' | 'inside' | 'against' | 'near' | 'facing';
  object: string; // object.id
}

export interface ScenethesisInput {
  objects: ScenethesisObject[];
  relations?: ScenethesisRelation[];
  region?: { bounds: [number, number, number, number, number, number] }; // min-max AABB
}

export interface HoloTraitEmission {
  traits: Array<{
    kind: string; // '@spatial', '@constraint', '@region', etc.
    target_id: string;
    params: Record<string, unknown>;
  }>;
  warnings: string[];
}

/**
 * Map a Scenethesis scene to HoloScript trait emissions.
 * Intent: each object → `@spatial` trait; each relation → `@constraint` trait;
 * region → `@region` trait.
 */
export function mapToHoloTraits(input: ScenethesisInput): HoloTraitEmission {
  const traits: HoloTraitEmission['traits'] = [];
  const warnings: string[] = [];

  for (const obj of input.objects) {
    traits.push({
      kind: '@spatial',
      target_id: obj.id,
      params: {
        category: obj.category,
        position: obj.position,
        orientation: obj.orientation ?? [0, 0, 0, 1],
        scale: obj.scale ?? [1, 1, 1],
      },
    });
  }

  for (const rel of input.relations ?? []) {
    // Map Scenethesis predicates to HoloScript constraint verbs (coarse stub).
    const verb =
      rel.predicate === 'on' ? 'rests_on' :
      rel.predicate === 'inside' ? 'contained_by' :
      rel.predicate === 'against' ? 'adjacent_to' :
      rel.predicate === 'near' ? 'proximal_to' :
      rel.predicate === 'facing' ? 'oriented_toward' : 'related_to';
    traits.push({
      kind: '@constraint',
      target_id: rel.subject,
      params: { verb, other: rel.object },
    });
  }

  if (input.region) {
    traits.push({
      kind: '@region',
      target_id: 'scene',
      params: { aabb: input.region.bounds },
    });
  }

  // Warn on missing metadata categories
  const seen_cats = new Set(input.objects.map((o) => o.category));
  for (const expected of ['wall', 'floor', 'ceiling']) {
    if (!seen_cats.has(expected)) {
      warnings.push(`no ${expected} category detected — bounded region may be incomplete`);
    }
  }

  return { traits, warnings };
}
