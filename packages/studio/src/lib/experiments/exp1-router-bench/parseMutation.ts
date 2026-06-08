/**
 * Parse a model's text output into a SceneMutation for grading.
 *
 * Tolerant by design — models wrap JSON in code fences, add prose, or use
 * `name`/`arguments` (OpenAI-style) instead of `tool`/`input`. Returns null
 * when no usable mutation can be extracted (the runner grades null as a fail).
 * Pure + provider-independent → unit-testable without any live call.
 */

import type { SceneMutation } from '../../brittney/SimContractGate';

export function parseMutation(raw: string): SceneMutation | null {
  if (!raw || typeof raw !== 'string') return null;

  // Prefer a fenced ```json ... ``` block; else scan the raw text.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;

  const start = candidate.indexOf('{');
  if (start === -1) return null;

  const obj = tryParseObject(candidate.slice(start));
  if (!obj) return null;

  const tool =
    typeof obj.tool === 'string' ? obj.tool : typeof obj.name === 'string' ? obj.name : null;
  if (!tool) return null;

  const input =
    obj.input && typeof obj.input === 'object'
      ? (obj.input as Record<string, unknown>)
      : obj.arguments && typeof obj.arguments === 'object'
        ? (obj.arguments as Record<string, unknown>)
        : {};

  return { tool, input };
}

/**
 * Parse the longest valid JSON object starting at the front of `s`, tolerating
 * trailing prose after the closing brace by trimming from the last `}` inward.
 */
function tryParseObject(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    /* fall through to trimming */
  }
  let end = s.lastIndexOf('}');
  while (end > 0) {
    try {
      const v = JSON.parse(s.slice(0, end + 1));
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch {
      /* keep trimming */
    }
    end = s.lastIndexOf('}', end - 1);
  }
  return null;
}
