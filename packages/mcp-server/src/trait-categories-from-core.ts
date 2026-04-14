/**
 * Trait category slugs match packages/core/src/traits/constants/*.ts (basename without .ts).
 * Parsed at runtime from source so list_traits stays aligned with core without hand-maintained enums.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Old list_traits enum values → core constant file slug (basename). */
export const LEGACY_TRAIT_CATEGORY_ALIASES: Record<string, string> = {
  interaction: 'core-vr-interaction',
  physics: 'physics-expansion',
  visual: 'visual-effects',
  networking: 'networking-ai',
  behavior: 'intelligence-behavior',
  spatial: 'locomotion-movement',
  audio: 'audio',
  state: 'state-persistence',
  ai: 'intelligence-behavior',
  accessibility: 'accessibility',
  iot: 'iot-autonomous-agents',
  web3: 'geospatial-web3',
  advanced: 'scifi-technology',
  social: 'social-effects',
};

let cached: Record<string, string[]> | null = null;

function resolveCoreConstantsDir(): string {
  return join(__dirname, '..', '..', 'core', 'src', 'traits', 'constants');
}

/**
 * Parse trait names from a constants file (same heuristic as scripts/generate-trait-mappings.mjs).
 */
function parseTraitNamesFromFile(filePath: string): string[] {
  const text = readFileSync(filePath, 'utf8');
  const traits = new Set<string>();
  for (const m of text.matchAll(/'([a-z][a-z0-9_]*)'/g)) {
    traits.add(`@${m[1]}`);
  }
  return Array.from(traits).sort();
}

/**
 * Map slug → @trait[] from core source. Empty if core tree is missing (e.g. broken path).
 */
export function loadTraitCategoriesFromCore(): Record<string, string[]> {
  if (cached) return cached;

  const dir = resolveCoreConstantsDir();
  const out: Record<string, string[]> = {};

  if (!existsSync(dir)) {
    cached = out;
    return out;
  }

  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith('.ts') || ent.name === 'index.ts') continue;
    const slug = ent.name.replace(/\.ts$/, '');
    out[slug] = parseTraitNamesFromFile(join(dir, ent.name));
  }

  cached = out;
  return out;
}

export function resolveTraitCategorySlug(input: string): string {
  const legacy = LEGACY_TRAIT_CATEGORY_ALIASES[input];
  return legacy ?? input;
}

export function traitCategorySlugs(): string[] {
  return Object.keys(loadTraitCategoriesFromCore()).sort();
}
