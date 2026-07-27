import type { Warning } from '../types/GraphQLTypes.js';

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function normalizeParserWarnings(value: unknown): Warning[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const warning = asRecord(entry);
    if (!warning || typeof warning.message !== 'string') return [];

    const nestedLocation = asRecord(warning.location);
    const line =
      typeof nestedLocation?.line === 'number'
        ? nestedLocation.line
        : typeof warning.line === 'number'
          ? warning.line
          : undefined;
    const column =
      typeof nestedLocation?.column === 'number'
        ? nestedLocation.column
        : typeof warning.column === 'number'
          ? warning.column
          : undefined;
    const offset =
      typeof nestedLocation?.offset === 'number'
        ? nestedLocation.offset
        : typeof warning.offset === 'number'
          ? warning.offset
          : 0;

    return [
      {
        message: warning.message,
        ...(line !== undefined && column !== undefined
          ? { location: { line, column, offset } }
          : {}),
        ...(typeof warning.severity === 'string' ? { severity: warning.severity } : {}),
      },
    ];
  });
}
