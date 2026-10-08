/**
 * Types for holo_strict.mjs, the pure rejection layer (no Node built-ins).
 * Codes and meanings: ERROR_CONTRACT.md.
 */

export type StrictCode =
  | 'HS1001'
  | 'HS1002'
  | 'HS1003'
  | 'HS1004'
  | 'HS1005'
  | 'HS1006'
  | 'HS1007'
  | 'HS1008'
  | 'HS1009'
  | 'HS1010';

export interface StrictDiagnostic {
  code: StrictCode;
  severity: 'error' | 'warning';
  message: string;
  /** 1-based. */
  line: number;
  /** 1-based. */
  column: number;
  hint?: string;
}

export interface StrictDeps {
  tokenizeHoloSource: (source: string) => unknown[];
  /** Called once, with the source alone. */
  parseHolo: (source: string) => unknown;
  /** The trait vocabulary. Missing or empty: the unknown-trait check (HS1006) is skipped. */
  traitIds?: Set<string>;
}

export interface StrictOptions {
  knownTraits?: Iterable<string>;
  unknownTraits?: 'warning' | 'error';
}

export function analyze(
  source: unknown,
  deps: StrictDeps,
  options?: StrictOptions
): { ast: unknown; diagnostics: StrictDiagnostic[] };

export function parseStrict(
  source: unknown,
  deps: StrictDeps,
  options?: StrictOptions
): { ok: boolean; mode: 'strict'; ast: unknown; diagnostics: StrictDiagnostic[] };

export function parseTolerant(
  source: unknown,
  deps: StrictDeps,
  options?: StrictOptions
): { ok: true; mode: 'tolerant'; ast: unknown; diagnostics: StrictDiagnostic[] };

export function normalizeTrait(name: string): string;
