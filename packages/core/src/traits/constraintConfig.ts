/**
 * constraintConfig
 *
 * Loads custom trait constraints from `holoscript.config.json`.
 *
 * Config shape:
 * {
 *   "traitConstraints": [
 *     {
 *       "type": "requires",
 *       "source": "myTrait",
 *       "targets": ["otherTrait"],
 *       "message": "myTrait requires otherTrait.",
 *       "suggestion": "Add @otherTrait to the same orb."
 *     },
 *     {
 *       "type": "conflicts",
 *       "source": "traitA",
 *       "targets": ["traitB"],
 *       "message": "traitA cannot be used with traitB."
 *     },
 *     {
 *       "type": "oneof",
 *       "source": "interaction",
 *       "targets": ["grabbable", "clickable", "hoverable"],
 *       "message": "Only one interaction trait at a time."
 *     }
 *   ]
 * }
 */

import type { TraitConstraint } from '../types';
import { readJson } from '../errors/safeJsonParse';

interface ConstraintConfig {
  traitConstraints?: TraitConstraint[];
}

/**
 * Load custom constraints from a parsed config object.
 * Validates each entry and returns only valid TraitConstraint objects.
 */
export function loadConstraintsFromConfig(config: unknown): TraitConstraint[] {
  if (!config || typeof config !== 'object') return [];

  const raw = config as ConstraintConfig;
  if (!Array.isArray(raw.traitConstraints)) return [];

  const valid: TraitConstraint[] = [];

  for (const entry of raw.traitConstraints) {
    if (!entry || typeof entry !== 'object') continue;

    const { type, source, targets, message, suggestion } = entry as unknown as Record<
      string,
      unknown
    >;

    if (
      (type === 'requires' || type === 'conflicts' || type === 'oneof') &&
      typeof source === 'string' &&
      source.length > 0 &&
      Array.isArray(targets) &&
      targets.length > 0 &&
      targets.every((t) => typeof t === 'string')
    ) {
      valid.push({
        type,
        source,
        targets: targets as string[],
        message: typeof message === 'string' ? message : undefined,
        suggestion: typeof suggestion === 'string' ? suggestion : undefined,
      });
    }
  }

  return valid;
}

/**
 * Attempt to read and parse holoscript.config.json from the file system.
 * Returns an empty array when not available (browser / missing file).
 */
export async function loadConstraintsFromFile(
  configPath = 'holoscript.config.json'
): Promise<TraitConstraint[]> {
  try {
    // Dynamic import avoids bundling `fs` in browser builds
    const { readFileSync } = await import('fs');
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = readJson(raw) as unknown;
    return loadConstraintsFromConfig(parsed);
  } catch {
    return [];
  }
}
