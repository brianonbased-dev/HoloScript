/**
 * @holoscript/niantic-lgm-plugin — Lightship / LGM geospatial bridge stub.
 *
 * Research: ai-ecosystem/research/2026-04-23_niantic-lgm-holoscript-geospatial-traits.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (geospatial column)
 *
 * Status: STUB. Real VPS tile ingestion + mesh-anchor binding are future work.
 */

export interface GeoAnchor {
  id: string;
  lat: number;
  lon: number;
  alt?: number; // meters above ellipsoid
  orientation?: { heading: number; pitch?: number; roll?: number };
  confidence?: number; // 0..1
}

export interface LgmVpsResponse {
  anchors: GeoAnchor[];
  coverage_tile?: { s2_cell_id?: string; bounds?: [number, number, number, number] };
}

export interface GeospatialTraitEmission {
  traits: Array<{
    kind: '@geospatial' | '@anchor';
    target_id: string;
    params: Record<string, unknown>;
  }>;
  unresolved: string[];
}

/** Map LGM VPS response to .holo @geospatial / @anchor traits. */
export function mapVpsToTraits(resp: LgmVpsResponse): GeospatialTraitEmission {
  const traits: GeospatialTraitEmission['traits'] = [];
  const unresolved: string[] = [];

  for (const a of resp.anchors) {
    if (typeof a.confidence === 'number' && a.confidence < 0.5) {
      unresolved.push(a.id);
      continue;
    }
    traits.push({
      kind: '@anchor',
      target_id: a.id,
      params: {
        lat: a.lat,
        lon: a.lon,
        alt: a.alt ?? 0,
        heading: a.orientation?.heading ?? 0,
        confidence: a.confidence ?? 1,
      },
    });
  }

  if (resp.coverage_tile) {
    traits.push({
      kind: '@geospatial',
      target_id: 'coverage',
      params: {
        s2_cell_id: resp.coverage_tile.s2_cell_id ?? '',
        bounds: resp.coverage_tile.bounds ?? [0, 0, 0, 0],
      },
    });
  }

  return { traits, unresolved };
}
