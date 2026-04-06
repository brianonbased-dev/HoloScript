/**
 * ScenarioMatcher.ts — Matches user intent + ProjectDNA to scenario templates
 *
 * Searches the 30+ scenario modules using keyword scoring, domain mapping,
 * and framework heuristics. Returns ranked matches with confidence scores.
 */

import { SCENARIOS, type ScenarioEntry } from '@/industry/scenarios/ScenarioGallery';
import type { ProjectDNA as ScaffoldProjectDNA } from '@/lib/workspace/scaffolder';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ScenarioMatch {
  scenario: ScenarioEntry;
  score: number;
  /** Why this scenario matched */
  reasons: string[];
}

export interface MatchResult {
  /** Best match (null if nothing scored above threshold) */
  best: ScenarioMatch | null;
  /** All matches sorted by score, descending */
  ranked: ScenarioMatch[];
  /** Whether we fell back to the generic template */
  usedFallback: boolean;
}

// ─── Domain keyword map ──────────────────────────────────────────────────────

/**
 * Maps natural language domain keywords to scenario IDs.
 * Each key is a word/phrase that might appear in user intent;
 * the value is the scenario ID(s) it maps to.
 */
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  // Science
  dna: ['dna'],
  gene: ['dna'],
  genomics: ['dna'],
  crispr: ['dna'],
  biology: ['dna', 'molecular'],
  protein: ['dna', 'molecular'],
  space: ['space'],
  rocket: ['space'],
  orbital: ['space'],
  satellite: ['space'],
  nasa: ['space'],
  brain: ['brain'],
  neuro: ['brain'],
  eeg: ['brain'],
  cognitive: ['brain'],
  radio: ['astro-radio'],
  telescope: ['astro-radio'],
  astrophysics: ['astro-radio'],
  fits: ['astro-radio'],
  forensic: ['forensic'],
  csi: ['forensic'],
  evidence: ['forensic', 'courtroom'],
  molecule: ['molecular'],
  drug: ['molecular'],
  pharma: ['molecular'],
  chemistry: ['molecular'],

  // Health
  surgery: ['surgery'],
  surgical: ['surgery'],
  medical: ['surgery'],
  hospital: ['surgery'],
  patient: ['surgery'],
  operating: ['surgery'],
  epidemic: ['epidemic'],
  virus: ['epidemic'],
  pandemic: ['epidemic'],
  disease: ['epidemic'],
  health: ['epidemic', 'biomech'],
  fitness: ['biomech'],
  sports: ['biomech'],
  biomechanics: ['biomech'],
  workout: ['biomech'],
  dream: ['dream'],
  sleep: ['dream'],
  psychology: ['dream'],
  therapy: ['dream'],

  // Engineering
  bridge: ['bridge'],
  structural: ['bridge'],
  civil: ['bridge'],
  themepark: ['themepark'],
  ride: ['themepark'],
  amusement: ['themepark'],
  roller: ['themepark'],
  accessibility: ['accessibility'],
  wcag: ['accessibility'],
  a11y: ['accessibility'],
  compiler: ['v6-compiler'],
  sandbox: ['v6-sandbox'],
  security: ['v6-sandbox', 'soc'],
  rbac: ['v6-sandbox'],
  hardware: ['inventor'],
  prototype: ['inventor'],
  bom: ['inventor'],
  invention: ['inventor'],
  farm: ['farm'],
  agriculture: ['farm'],
  crop: ['farm'],
  permaculture: ['farm'],
  iot: ['farm'],

  // Arts
  wine: ['wine'],
  sommelier: ['wine'],
  cellar: ['wine'],
  music: ['music'],
  audio: ['music'],
  midi: ['music'],
  film: ['film'],
  movie: ['film'],
  storyboard: ['film'],
  cinema: ['film'],
  fashion: ['fashion'],
  runway: ['fashion'],
  clothing: ['fashion'],
  escape: ['escape'],
  puzzle: ['escape'],
  game: ['escape'],

  // Nature
  climate: ['climate'],
  weather: ['climate'],
  carbon: ['climate'],
  warming: ['climate'],
  ocean: ['ocean'],
  marine: ['ocean'],
  underwater: ['ocean'],
  geology: ['geology'],
  seismic: ['geology'],
  earthquake: ['geology'],
  mining: ['geology'],
  star: ['stars'],
  constellation: ['stars'],
  astronomy: ['stars', 'astro-radio'],

  // Society
  disaster: ['disaster'],
  emergency: ['disaster'],
  evacuation: ['disaster'],
  triage: ['disaster'],
  court: ['courtroom'],
  legal: ['courtroom'],
  law: ['courtroom'],
  archaeology: ['archaeology'],
  artifact: ['archaeology'],
  history: ['archaeology', 'timecapsule'],
  timecapsule: ['timecapsule'],
  capsule: ['timecapsule'],
  cybersecurity: ['soc'],
  threat: ['soc'],
  breach: ['soc'],

  // Platform
  agent: ['v6-swarm'],
  swarm: ['v6-swarm'],
  mesh: ['v6-swarm'],
  p2p: ['v6-swarm'],
  neural: ['v6-snn'],
  snn: ['v6-snn'],
  spiking: ['v6-snn'],
  market: ['v6-market'],
  marketplace: ['v6-market'],
  economy: ['v6-market'],
  orchestrat: ['absorb-orchestrator'],
  graphrag: ['absorb-orchestrator'],
  knowledge: ['absorb-orchestrator'],

  // Business domains (map to closest scenarios)
  dispensary: ['farm', 'nonspatial'],
  cannabis: ['farm', 'nonspatial'],
  retail: ['nonspatial'],
  ecommerce: ['nonspatial'],
  restaurant: ['wine', 'nonspatial'],
  api: ['nonspatial'],
  web: ['nonspatial'],
  dashboard: ['nonspatial'],
  crdt: ['nonspatial'],
};

// ─── Framework-to-scenario heuristics ────────────────────────────────────────

const FRAMEWORK_HINTS: Record<string, string[]> = {
  react: ['nonspatial'],
  'next.js': ['nonspatial'],
  express: ['nonspatial'],
  fastapi: ['nonspatial'],
  django: ['nonspatial'],
  unity: ['v6-compiler'],
  unreal: ['v6-compiler'],
  godot: ['v6-compiler'],
  pytorch: ['v6-snn', 'brain'],
  tensorflow: ['v6-snn', 'brain'],
  ros: ['inventor'],
  arduino: ['inventor', 'farm'],
};

// ─── Scoring ─────────────────────────────────────────────────────────────────

const KEYWORD_MATCH_WEIGHT = 3;
const TAG_MATCH_WEIGHT = 2;
const FRAMEWORK_MATCH_WEIGHT = 1.5;
const DESCRIPTION_MATCH_WEIGHT = 1;
const MINIMUM_MATCH_THRESHOLD = 2;

/**
 * Build a scenario ID -> score map from the user's intent string.
 */
function scoreFromIntent(intent: string): Map<string, { score: number; reasons: string[] }> {
  const scores = new Map<string, { score: number; reasons: string[] }>();
  const words = intent.toLowerCase().split(/\s+/);

  function addScore(scenarioId: string, points: number, reason: string): void {
    const existing = scores.get(scenarioId) ?? { score: 0, reasons: [] };
    existing.score += points;
    existing.reasons.push(reason);
    scores.set(scenarioId, existing);
  }

  // Check domain keywords
  for (const word of words) {
    for (const [keyword, scenarioIds] of Object.entries(DOMAIN_KEYWORDS)) {
      if (word.includes(keyword) || keyword.includes(word)) {
        for (const id of scenarioIds) {
          addScore(id, KEYWORD_MATCH_WEIGHT, `intent keyword "${word}" matches domain "${keyword}"`);
        }
      }
    }
  }

  // Check scenario tags directly
  for (const scenario of SCENARIOS) {
    for (const tag of scenario.tags) {
      for (const word of words) {
        if (tag.includes(word) || word.includes(tag)) {
          addScore(scenario.id, TAG_MATCH_WEIGHT, `word "${word}" matches tag "${tag}"`);
        }
      }
    }
    // Check scenario description
    const descWords = scenario.description.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length >= 4 && descWords.some((d) => d.includes(word))) {
        addScore(scenario.id, DESCRIPTION_MATCH_WEIGHT, `word "${word}" found in description`);
      }
    }
  }

  return scores;
}

/**
 * Build scores from ProjectDNA framework/language data.
 */
function scoreFromDNA(dna: ScaffoldProjectDNA): Map<string, { score: number; reasons: string[] }> {
  const scores = new Map<string, { score: number; reasons: string[] }>();

  function addScore(scenarioId: string, points: number, reason: string): void {
    const existing = scores.get(scenarioId) ?? { score: 0, reasons: [] };
    existing.score += points;
    existing.reasons.push(reason);
    scores.set(scenarioId, existing);
  }

  for (const fw of dna.frameworks) {
    const fwLower = fw.toLowerCase();
    for (const [key, scenarioIds] of Object.entries(FRAMEWORK_HINTS)) {
      if (fwLower.includes(key)) {
        for (const id of scenarioIds) {
          addScore(id, FRAMEWORK_MATCH_WEIGHT, `framework "${fw}" suggests this scenario`);
        }
      }
    }
  }

  // Compilation targets hint at specific scenarios
  for (const target of dna.compilationTargets) {
    const tLower = target.toLowerCase();
    if (tLower.includes('unity') || tLower.includes('usd')) {
      addScore('v6-compiler', FRAMEWORK_MATCH_WEIGHT, `target "${target}" suggests compiler scenario`);
    }
    if (tLower.includes('vr') || tLower.includes('ar')) {
      addScore('v6-swarm', FRAMEWORK_MATCH_WEIGHT, `target "${target}" suggests spatial scenario`);
    }
  }

  return scores;
}

/**
 * Merge two score maps, combining scores and reasons.
 */
function mergeScores(
  a: Map<string, { score: number; reasons: string[] }>,
  b: Map<string, { score: number; reasons: string[] }>
): Map<string, { score: number; reasons: string[] }> {
  const merged = new Map(a);
  for (const [id, data] of b) {
    const existing = merged.get(id);
    if (existing) {
      existing.score += data.score;
      existing.reasons.push(...data.reasons);
    } else {
      merged.set(id, { ...data });
    }
  }
  return merged;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Match user intent and optional ProjectDNA against the scenario library.
 *
 * @param intent - Natural language description of what the user wants
 * @param dna - Optional ProjectDNA from Absorb scan
 * @returns Ranked matches with the best match highlighted
 */
export function matchScenarios(intent: string, dna?: ScaffoldProjectDNA): MatchResult {
  const intentScores = scoreFromIntent(intent);
  const dnaScores = dna ? scoreFromDNA(dna) : new Map();
  const combined = mergeScores(intentScores, dnaScores);

  // Build ScenarioMatch objects
  const scenarioMap = new Map(SCENARIOS.map((s) => [s.id, s]));
  const matches: ScenarioMatch[] = [];

  for (const [id, data] of combined) {
    const scenario = scenarioMap.get(id);
    if (scenario && data.score >= MINIMUM_MATCH_THRESHOLD) {
      matches.push({
        scenario,
        score: data.score,
        reasons: data.reasons,
      });
    }
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);

  const best = matches.length > 0 ? matches[0] : null;

  return {
    best,
    ranked: matches,
    usedFallback: best === null,
  };
}

/**
 * Extract domain keywords from a user's intent string.
 * These are used for classification and scenario matching.
 */
export function extractDomainKeywords(intent: string): string[] {
  const words = intent.toLowerCase().split(/\s+/);
  const matched = new Set<string>();

  for (const word of words) {
    for (const keyword of Object.keys(DOMAIN_KEYWORDS)) {
      if (word.includes(keyword) || keyword.includes(word)) {
        matched.add(keyword);
      }
    }
  }

  return [...matched];
}

/**
 * Get the generic/fallback scenario template code for projects
 * that don't match any specific scenario.
 */
export function getGenericTemplate(projectName: string, targets: string[]): string {
  const targetComment = targets.length > 0
    ? `// Compilation targets: ${targets.join(', ')}`
    : '// No compilation targets configured yet';

  return `// ${projectName} — Generated by Brittney Wizard
${targetComment}

scene "${projectName}" {
  @environment {
    preset: "studio"
    ambient: 0.4
  }

  object "Root" {
    position: [0, 0, 0]

    @interactive {
      hoverable: true
      clickable: true
    }
  }
}
`;
}

/**
 * Get a scenario-specific template code given a scenario entry.
 */
export function getScenarioTemplate(scenario: ScenarioEntry, projectName: string): string {
  return `// ${projectName} — Based on ${scenario.name} template
// Engine: ${scenario.engine}
// Tags: ${scenario.tags.join(', ')}

scene "${projectName}" {
  @environment {
    preset: "studio"
    ambient: 0.4
  }

  // ${scenario.description}
  group "${scenario.name}" {
    @${scenario.engine} {
      enabled: true
    }
  }
}
`;
}
