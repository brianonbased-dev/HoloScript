/**
 * GapHandler — Intelligent response when a domain isn't fully covered.
 *
 * Instead of "we can't do that", the platform:
 * 1. Finds the CLOSEST covered domain
 * 2. Identifies which existing solvers partially apply
 * 3. Suggests a bridge approach (import data, use adjacent solver, Python bridge)
 * 4. Offers to visualize imported data even if we can't simulate
 * 5. Logs the gap for the roadmap (every gap is a feature request)
 */

import { DOMAIN_TAXONOMY, matchDomains, type DomainEntry, type CoverageLevel } from './DomainTaxonomy';

// ── Types ────────────────────────────────────────────────────────────────────

export interface GapResponse {
  /** What the user asked for */
  requestedDomain: string;
  /** Whether we found any match at all */
  hasMatch: boolean;
  /** The closest matching domain (even if partial/none) */
  closestDomain: DomainEntry | null;
  /** Related domains that might help */
  relatedDomains: DomainEntry[];
  /** What we CAN do right now */
  capabilities: string[];
  /** Suggested approach to bridge the gap */
  bridgeStrategy: string;
  /** Human-readable message for Brittney to deliver */
  message: string;
  /** Whether this is a novel gap worth logging */
  isNovelGap: boolean;
}

// ── Gap Analysis ─────────────────────────────────────────────────────────────

/**
 * Analyze a user request that doesn't have full coverage.
 * Returns a structured response Brittney can use to help the user anyway.
 */
export function handleGap(keywords: string[]): GapResponse {
  const matches = matchDomains(keywords);
  const kw = keywords.join(' ').toLowerCase();

  // Case 1: We have a match (even partial)
  if (matches.length > 0) {
    const best = matches[0];

    if (best.coverage === 'full') {
      return {
        requestedDomain: kw,
        hasMatch: true,
        closestDomain: best,
        relatedDomains: matches.slice(1, 4),
        capabilities: best.solvers,
        bridgeStrategy: 'direct',
        message: `I can handle this directly using ${best.name}. Let me set it up.`,
        isNovelGap: false,
      };
    }

    if (best.coverage === 'partial') {
      const capabilities = describePartialCapabilities(best);
      return {
        requestedDomain: kw,
        hasMatch: true,
        closestDomain: best,
        relatedDomains: matches.slice(1, 4),
        capabilities: capabilities.can,
        bridgeStrategy: 'partial-with-workaround',
        message: `I can partially handle ${best.name}. ${capabilities.canDo} However, ${capabilities.cantDo} ${capabilities.workaround}`,
        isNovelGap: false,
      };
    }

    if (best.coverage === 'bridge') {
      return {
        requestedDomain: kw,
        hasMatch: true,
        closestDomain: best,
        relatedDomains: matches.slice(1, 4),
        capabilities: [],
        bridgeStrategy: 'external-bridge',
        message: `For ${best.name}, I can connect to external tools (Python/WASM) and visualize the results in 3D here. I can't run the simulation natively, but I can orchestrate the pipeline and show you the results spatially. Want me to set up the bridge?`,
        isNovelGap: false,
      };
    }

    if (best.coverage === 'visualize') {
      return {
        requestedDomain: kw,
        hasMatch: true,
        closestDomain: best,
        relatedDomains: matches.slice(1, 4),
        capabilities: ['data-import', 'visualization', 'annotation', 'measurement'],
        bridgeStrategy: 'import-and-visualize',
        message: `I can't simulate ${best.name} natively, but I can import your data (FITS, CSV, VTK, HDF5) and visualize it in 3D with measurement tools, annotations, and colormaps. You simulate externally, I make the results explorable. Want to drop a file?`,
        isNovelGap: false,
      };
    }
  }

  // Case 2: No match at all — find the closest adjacent domain
  const adjacent = findAdjacentDomains(kw);

  if (adjacent.length > 0) {
    const names = adjacent.slice(0, 3).map((d) => d.name).join(', ');
    return {
      requestedDomain: kw,
      hasMatch: false,
      closestDomain: adjacent[0],
      relatedDomains: adjacent,
      capabilities: ['data-import', 'visualization', 'annotation'],
      bridgeStrategy: 'adjacent-domain',
      message: `I don't have a dedicated solver for "${kw}" yet, but I have related capabilities in ${names}. I can also import and visualize any data you bring (CSV, VTK, FITS, STL). What's your specific goal? I might be able to get you there with the tools I have.`,
      isNovelGap: true,
    };
  }

  // Case 3: Completely unknown domain
  return {
    requestedDomain: kw,
    hasMatch: false,
    closestDomain: null,
    relatedDomains: [],
    capabilities: ['data-import', 'visualization', '3d-annotation', 'measurement', 'report-generation'],
    bridgeStrategy: 'universal-data-platform',
    message: `I don't have a specific solver for "${kw}", but HoloScript is a universal data platform. I can:\n\n` +
      `1. **Import your data** — drop CSV, VTK, FITS, STL, OBJ, or HDF5 files\n` +
      `2. **Visualize in 3D** — colormaps, animations, channel scrubbing\n` +
      `3. **Measure and annotate** — probe values, pin notes to 3D locations\n` +
      `4. **Generate reports** — statistical summaries, auto-interpretation\n` +
      `5. **Run parameter sweeps** — if you can express it as input → output\n\n` +
      `Tell me more about what you're trying to accomplish and I'll find the best path.`,
    isNovelGap: true,
  };
}

// ── Partial Capability Descriptions ──────────────────────────────────────────

interface PartialCapabilities {
  can: string[];
  canDo: string;
  cantDo: string;
  workaround: string;
}

function describePartialCapabilities(domain: DomainEntry): PartialCapabilities {
  const partialDescriptions: Record<string, PartialCapabilities> = {
    'structural-dynamic': {
      can: ['modal-analysis', 'natural-frequencies'],
      canDo: 'I can extract natural frequencies and mode shapes via eigenvalue analysis.',
      cantDo: 'full transient dynamics (explicit time integration, crash, impact) aren\'t implemented yet.',
      workaround: 'For vibration analysis, I can identify resonant frequencies and critical modes. Want me to run a modal analysis?',
    },
    'fatigue': {
      can: ['safety-factor', 'stress-analysis'],
      canDo: 'I can compute Von Mises stress and safety factors for static loads.',
      cantDo: 'cycle counting (Rainflow), S-N curves, and crack propagation aren\'t built in.',
      workaround: 'I can identify stress hotspots and safety margins. You can use the stress data for external fatigue life estimation.',
    },
    'convection': {
      can: ['boundary-convection', 'coupled-thermal-cfd'],
      canDo: 'I can apply convective boundary conditions (h, T_ambient) and couple thermal + CFD solvers.',
      cantDo: 'fully resolved conjugate heat transfer with turbulence isn\'t available.',
      workaround: 'For most HVAC and electronics cooling, boundary convection gives good results. Want me to set up a coupled thermal-CFD simulation?',
    },
    'ultrasound': {
      can: ['wave-propagation', 'acoustic-simulation'],
      canDo: 'I can simulate acoustic wave propagation at any frequency, including ultrasound ranges.',
      cantDo: 'tissue models, B-mode image formation, and DICOM import aren\'t included.',
      workaround: 'I can model the wave physics. You\'d need to post-process for image formation.',
    },
    'rf-design': {
      can: ['fdtd-em', 'antenna-pattern'],
      canDo: 'I can run FDTD for antenna radiation patterns, S-parameters approximation, and field visualization.',
      cantDo: 'frequency-domain methods (Method of Moments, FEM-EM) and Smith chart tools aren\'t available.',
      workaround: 'FDTD gives accurate broadband results. I can sweep frequency via Gaussian pulse excitation.',
    },
    'hemodynamics': {
      can: ['navier-stokes', 'flow-visualization'],
      canDo: 'I can simulate incompressible flow through vessel-like geometries.',
      cantDo: 'non-Newtonian blood viscosity models (Carreau, power-law) aren\'t included.',
      workaround: 'For large arteries, Newtonian approximation is reasonable. Want me to set up a flow simulation?',
    },
    'reservoir': {
      can: ['multiphase-flow'],
      canDo: 'I can simulate two-phase flow with level-set interface tracking.',
      cantDo: 'Darcy flow, porous media permeability, and multi-component transport aren\'t specialized for reservoir.',
      workaround: 'The multiphase solver handles immiscible fluid interfaces. For reservoir-specific features, I can import and visualize your data.',
    },
    'aerospace': {
      can: ['structural-tet10', 'navier-stokes', 'acoustic'],
      canDo: 'I can do structural stress analysis, subsonic flow, and acoustic radiation.',
      cantDo: 'transonic/supersonic (compressible) flow isn\'t implemented.',
      workaround: 'For subsonic aircraft components (wing structure, cabin acoustics), I have full coverage. What\'s your specific analysis?',
    },
  };

  return partialDescriptions[domain.id] ?? {
    can: domain.solvers,
    canDo: `I have ${domain.solvers.length} solver(s) that apply: ${domain.solvers.join(', ')}.`,
    cantDo: 'some specialized features for this domain aren\'t available.',
    workaround: 'Let me know your specific goal and I\'ll find the best approach with what I have.',
  };
}

// ── Adjacent Domain Finder ───────────────────────────────────────────────────

function findAdjacentDomains(query: string): DomainEntry[] {
  // Find domains whose description or keywords partially match
  const scored = DOMAIN_TAXONOMY
    .filter((d) => d.coverage === 'full' || d.coverage === 'partial')
    .map((d) => {
      let score = 0;
      const words = query.split(/\s+/);
      for (const w of words) {
        if (d.description.toLowerCase().includes(w)) score += 2;
        if (d.keywords.some((k) => k.includes(w))) score += 3;
        if (d.category.toLowerCase().includes(w)) score += 1;
      }
      return { domain: d, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5).map((s) => s.domain);
}

/**
 * Log a novel gap for roadmap consideration.
 * In production, this would post to the knowledge store or team board.
 */
export function logGapRequest(gap: GapResponse): void {
  if (!gap.isNovelGap) return;
  console.log(`[GapHandler] Novel domain request: "${gap.requestedDomain}". Closest: ${gap.closestDomain?.name ?? 'none'}. Strategy: ${gap.bridgeStrategy}`);
}
