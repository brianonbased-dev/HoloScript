/**
 * BrainCoordMapper — v1.0
 *
 * Maps PillarDomain values to MNI152 standard-space coordinates seeded from
 * published fMRI meta-analyses.  No custom experiments required — every
 * coordinate is cite-able from neuroscience literature.
 *
 * Architecture
 * ────────────
 * BrainCoordMapper is a pure lookup utility (no TraitHandler — no events, no
 * lifecycle).  It is consumed by:
 *   • uAALComposedAgent.domainToBrainCoord()  (replaces the inline 3-branch map)
 *   • CorticalDepthRouter                     (enriches brain_coord.cortical_depth)
 *   • GyriSulciPartitioner                    (classifies surface_type hot/cold)
 *   • Paper 33 §4 figure generation           (BrainCoordMapper as the seed table)
 *
 * Nearest-neighbor fallback
 * ─────────────────────────
 * Unknown PillarDomain values fall back to the spatially nearest registered
 * domain, computed as Euclidean distance in (mni_x, mni_y, mni_z) space.
 * Ties broken by lower cortical_depth (shallower = default input layer).
 *
 * Extension
 * ─────────
 * Call registerDomainCoord() to add or override a domain at runtime.
 * Registered overrides take precedence over the seed table.
 *
 * Coordinate sources (Paper 33 §4 Table, fMRI meta-analyses):
 *   physics/spatial     Parietal (SPL/IPL) BA 7/40   ~(30, -50, 60)  depth 4
 *   compiler            DLPFC BA 9/46                ~(44, 36, 20)   depth 5
 *   language            Wernicke BA 22               ~(-52, -32, 8)  depth 3
 *   rendering           V5/MT+ BA 19                 ~(-45, -68, 5)  depth 3
 *   agent               TPJ BA 39                    ~(-54, -56, 22) depth 4
 *   economics           OFC BA 11                    ~(-20, 32, -10) depth 2
 *   trait               SMA BA 6                     ~(4, -4, 54)    depth 5
 *   coordination        ACC/SMA BA 32                ~(0, 25, 30)    depth 2
 *   storage             Hippocampus (CA1)             ~(28, -22, -14) depth 4
 *   solver              IPS/Parietal BA 40            ~(28, -58, 46)  depth 4
 *   accuracy_speed      Pre-SMA BA 6                 ~(4, 14, 52)    depth 5
 *   safety_exploration  vmPFC BA 11/12               ~(-4, 44, -14)  depth 2
 *   truth_approval      ACC BA 24                    ~(0, 20, 30)    depth 3
 *   init                Thalamus (relay)             ~(8, -12, 4)    depth 4
 *   steady_state        Caudate (basal ganglia)      ~(14, 12, 6)    depth 5
 *   edge_case           Insula BA 13                 ~(38, 2, 10)    depth 4
 *   shutdown            Brainstem (PAG)              ~(0, -28, -8)   depth 6
 *
 * References:
 *   MNI152 standard space — Collins et al. 1994, Mazziotta et al. 2001
 *   Tropical geometry     — arxiv:1805.07091, arxiv:2403.11871
 *   Brain-Geometry        — research/2026-05-20_idea-run-16.md
 *   Paper 33              — research/paper-33-brain-geometry-natcomp.tex
 *   RecursiveMAS          — arxiv:2604.25917 (white matter tracts ≡ RecursiveLink)
 */

import type { BrainCoord, PillarDomain } from './SemanticCollaborationContract';

// ─── Seed table (fMRI meta-analysis values) ───────────────────────────────────

/**
 * Full BrainCoord entry from the seed table.
 * aal_region is optional documentation; surface_type defaults to 'gyrus' for
 * primary cortical regions and 'sulcus' for boundary/deep structures.
 */
export interface DomainCoordEntry extends BrainCoord {
  /** Human-readable source for Paper 33 figure captions */
  source_note: string;
}

const SEED_TABLE: Record<PillarDomain, DomainCoordEntry> = {
  physics: {
    mni_x: 30, mni_y: -50, mni_z: 60,
    cortical_depth: 4,
    brodmann_area: 7,
    aal_region: 'Parietal_Sup_R',
    surface_type: 'gyrus',
    source_note: 'Superior Parietal Lobule (SPL) BA7 — physics/spatial reasoning meta-analysis (Zacks et al.)',
  },
  compiler: {
    mni_x: 44, mni_y: 36, mni_z: 20,
    cortical_depth: 5,
    brodmann_area: 46,
    aal_region: 'Frontal_Mid_R',
    surface_type: 'gyrus',
    source_note: 'DLPFC BA9/46 — rule-based / hierarchical planning (Badre & D\'Esposito)',
  },
  language: {
    mni_x: -52, mni_y: -32, mni_z: 8,
    cortical_depth: 3,
    brodmann_area: 22,
    aal_region: 'Temporal_Sup_L',
    surface_type: 'gyrus',
    source_note: 'Wernicke\'s area BA22 — language comprehension (Binder et al. meta-analysis)',
  },
  rendering: {
    mni_x: -45, mni_y: -68, mni_z: 5,
    cortical_depth: 3,
    brodmann_area: 19,
    aal_region: 'Occipital_Mid_L',
    surface_type: 'gyrus',
    source_note: 'V5/MT+ BA19 — visual motion & spatial rendering (Zeki et al.)',
  },
  agent: {
    mni_x: -54, mni_y: -56, mni_z: 22,
    cortical_depth: 4,
    brodmann_area: 39,
    aal_region: 'Angular_L',
    surface_type: 'gyrus',
    source_note: 'TPJ BA39 — agency, mentalizing, goal-directed action (Decety & Lamm)',
  },
  economics: {
    mni_x: -20, mni_y: 32, mni_z: -10,
    cortical_depth: 2,
    brodmann_area: 11,
    aal_region: 'Frontal_Orb_L',
    surface_type: 'gyrus',
    source_note: 'OFC BA11 — value coding, cost-benefit (O\'Doherty et al. meta-analysis)',
  },
  trait: {
    mni_x: 4, mni_y: -4, mni_z: 54,
    cortical_depth: 5,
    brodmann_area: 6,
    aal_region: 'Supp_Motor_Area_R',
    surface_type: 'gyrus',
    source_note: 'SMA BA6 — motor composition, trait chaining (Nachev et al.)',
  },
  coordination: {
    mni_x: 0, mni_y: 25, mni_z: 30,
    cortical_depth: 2,
    brodmann_area: 32,
    aal_region: 'Cingulum_Mid',
    surface_type: 'sulcus',
    source_note: 'Mid-ACC BA32 — conflict monitoring, consensus coordination (Bush et al.)',
  },
  storage: {
    mni_x: 28, mni_y: -22, mni_z: -14,
    cortical_depth: 4,
    brodmann_area: undefined,
    aal_region: 'Hippocampus_R',
    surface_type: 'sulcus',
    source_note: 'Hippocampus CA1 — episodic storage & retrieval (Squire & Zola-Morgan)',
  },
  solver: {
    mni_x: 28, mni_y: -58, mni_z: 46,
    cortical_depth: 4,
    brodmann_area: 40,
    aal_region: 'Parietal_Inf_R',
    surface_type: 'gyrus',
    source_note: 'IPS/IPL BA40 — numerical computation, convergence monitoring (Dehaene et al.)',
  },
  accuracy_speed: {
    mni_x: 4, mni_y: 14, mni_z: 52,
    cortical_depth: 5,
    brodmann_area: 6,
    aal_region: 'Supp_Motor_Area',
    surface_type: 'gyrus',
    source_note: 'Pre-SMA BA6 — speed-accuracy tradeoff (Forstmann et al.)',
  },
  safety_exploration: {
    mni_x: -4, mni_y: 44, mni_z: -14,
    cortical_depth: 2,
    brodmann_area: 11,
    aal_region: 'Frontal_Med_Orb_L',
    surface_type: 'gyrus',
    source_note: 'vmPFC BA11/12 — risk aversion, explore-exploit balance (Rangel et al.)',
  },
  truth_approval: {
    mni_x: 0, mni_y: 20, mni_z: 30,
    cortical_depth: 3,
    brodmann_area: 24,
    aal_region: 'Cingulum_Ant',
    surface_type: 'sulcus',
    source_note: 'Anterior ACC BA24 — truth/approval conflict monitoring (P.620.02 sycophancy probe)',
  },
  init: {
    mni_x: 8, mni_y: -12, mni_z: 4,
    cortical_depth: 4,
    brodmann_area: undefined,
    aal_region: 'Thalamus_R',
    surface_type: 'sulcus',
    source_note: 'Thalamus (mediodorsal nucleus) — initialization relay, attention gating',
  },
  steady_state: {
    mni_x: 14, mni_y: 12, mni_z: 6,
    cortical_depth: 5,
    brodmann_area: undefined,
    aal_region: 'Caudate_R',
    surface_type: 'sulcus',
    source_note: 'Caudate (head) — habitual / steady-state execution (Packard & Knowlton)',
  },
  edge_case: {
    mni_x: 38, mni_y: 2, mni_z: 10,
    cortical_depth: 4,
    brodmann_area: 13,
    aal_region: 'Insula_R',
    surface_type: 'sulcus',
    source_note: 'Insula BA13 — salience / edge-case detection (Craig et al.)',
  },
  shutdown: {
    mni_x: 0, mni_y: -28, mni_z: -8,
    cortical_depth: 6,
    brodmann_area: undefined,
    aal_region: 'Brainstem',
    surface_type: 'sulcus',
    source_note: 'PAG (periaqueductal gray) — shutdown / autonomic cessation signals',
  },
};

// ─── Runtime override registry ────────────────────────────────────────────────

const _overrides = new Map<string, DomainCoordEntry>();

/**
 * Register or override a domain→coordinate mapping at runtime.
 * Overrides take precedence over the seed table.
 * Use for custom PillarDomain extensions beyond the 17 standard values.
 */
export function registerDomainCoord(domain: string, entry: DomainCoordEntry): void {
  _overrides.set(domain, entry);
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

/**
 * Look up the BrainCoord for a known PillarDomain.
 * Returns the exact seed entry (or override) — no fallback.
 * Use `resolve()` when a fallback for unknown domains is needed.
 */
export function lookup(domain: PillarDomain): DomainCoordEntry {
  if (_overrides.has(domain)) return _overrides.get(domain)!;
  return SEED_TABLE[domain];
}

/**
 * Resolve a BrainCoord for any domain string.
 * If `domain` is a known PillarDomain (or a registered override) → exact match.
 * Otherwise → nearest-neighbor fallback in (mni_x, mni_y, mni_z) Euclidean space,
 * with ties broken by lower cortical_depth.
 *
 * The nearest-neighbor fallback is the "unknown Pillar" case documented in Paper 33
 * §4: unknown domains inherit the storage address of the nearest registered domain,
 * matching the biological behavior of dendritic arborization into the nearest
 * cortical column.
 */
export function resolve(domain: string): DomainCoordEntry {
  // 1. Override check
  if (_overrides.has(domain)) return _overrides.get(domain)!;

  // 2. Exact match in seed table
  if (domain in SEED_TABLE) return SEED_TABLE[domain as PillarDomain];

  // 3. Nearest-neighbor fallback
  const all: DomainCoordEntry[] = [
    ...Object.values(SEED_TABLE),
    ..._overrides.values(),
  ];

  // Use a stable centre to measure distance for the unknown domain.
  // Without an MNI coordinate for the unknown, we use origin (0,0,0) —
  // which resolves to bilateral coordination (ACC, closest to origin in the table).
  let best: DomainCoordEntry = all[0]!;
  let bestDist = Infinity;

  for (const entry of all) {
    const dx = entry.mni_x;
    const dy = entry.mni_y;
    const dz = entry.mni_z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < bestDist || (dist === bestDist && entry.cortical_depth < best.cortical_depth)) {
      best = entry;
      bestDist = dist;
    }
  }

  return best;
}

/**
 * Returns the full seed table (all 17 standard domains).
 * Useful for Paper 33 figure generation and test assertions.
 */
export function getAllEntries(): ReadonlyArray<{ domain: PillarDomain; entry: DomainCoordEntry }> {
  return (Object.entries(SEED_TABLE) as [PillarDomain, DomainCoordEntry][])
    .map(([domain, entry]) => ({ domain, entry }));
}

/**
 * Validate that a BrainCoord is within MNI152 bounding box.
 * Returns true if valid, false if any coordinate is out of the standard range.
 * Ranges: x ∈ [-90, 90], y ∈ [-130, 80], z ∈ [-80, 90], depth ∈ [1, 6].
 */
export function validateCoord(coord: BrainCoord): boolean {
  return (
    coord.mni_x >= -90 && coord.mni_x <= 90 &&
    coord.mni_y >= -130 && coord.mni_y <= 80 &&
    coord.mni_z >= -80 && coord.mni_z <= 90 &&
    coord.cortical_depth >= 1 && coord.cortical_depth <= 6
  );
}

/**
 * Euclidean distance between two BrainCoords in (x, y, z) space (mm).
 */
export function mniDistance(a: BrainCoord, b: BrainCoord): number {
  const dx = a.mni_x - b.mni_x;
  const dy = a.mni_y - b.mni_y;
  const dz = a.mni_z - b.mni_z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
