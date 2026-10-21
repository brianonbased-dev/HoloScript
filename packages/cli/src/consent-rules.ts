/**
 * HS1011 consent rules for `holoscript validate`: the `.hs` render_likeness result, read from
 * `--consent-rules <file.json>` as `{ "<grant>": ["face" | "voice" | "body", ...] }`.
 * Without the flag no rules are passed and every likeness source (@face_mesh, @voice_print,
 * @body_scan) fails validation: fail closed.
 */
import { readFileSync } from 'node:fs';
import {
  validateCanonicalSource,
  type CanonicalHsDetailedValidator,
  type CanonicalSourceValidationResult,
  type ConsentRules,
} from '@holoscript/core';

const SOURCES = new Set(['face', 'voice', 'body']);

export function parseConsentRules(json: string, origin = 'consent rules'): ConsentRules {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (error) {
    throw new Error(`${origin}: not JSON (${error instanceof Error ? error.message : error})`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${origin}: expected an object { "<grant>": ["face", "voice", "body"] }`);
  }
  const rules: Record<string, string[]> = {};
  for (const [grant, sources] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(sources) || !sources.every((s) => typeof s === 'string' && SOURCES.has(s))) {
      throw new Error(`${origin}: grant "${grant}" must list sources from face, voice, body`);
    }
    rules[grant] = sources as string[];
  }
  return rules;
}

export function loadConsentRules(file: string): ConsentRules {
  return parseConsentRules(readFileSync(file, 'utf8'), file);
}

/** The canonical validation `holoscript validate` runs, with the likeness rules threaded in. */
export function validateForCli(
  content: string,
  fileName: string,
  consentRules?: ConsentRules,
  validateHsDetailed?: CanonicalHsDetailedValidator
): CanonicalSourceValidationResult {
  return validateCanonicalSource(
    { source: content, fileName, consentRules },
    { validateHsDetailed }
  );
}
