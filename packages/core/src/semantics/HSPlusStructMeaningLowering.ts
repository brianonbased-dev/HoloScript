/**
 * Canonical `.hsplus` structured-record source -> HoloMeaning projection.
 *
 * This adapter lives in core because core owns the HoloScript+ parser and
 * depends downward on parser-independent `@holoscript/meaning`. Keeping this
 * bridge outside the parser preserves the surface/meaning boundary: `parse()`
 * remains syntax-only, while callers that need semantic unknowns opt into one
 * explicit, fail-closed lowering call.
 */

import { lowerUnknownHSPlusStructFields, type UnknownFieldLowering } from '@holoscript/meaning';

import { hsiSourceTextDigest } from '../compiler/HSIIRTypes';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import type { HSPlusNode } from '../types/HoloScriptPlus';

const SCHEMA = 'holoscript.hsplus-unknown-struct-meaning.v1' as const;
const FORMAT = '.hsplus' as const;
const PARSER = 'HoloScriptPlusParser' as const;

export type HSPlusStructMeaningLoweringErrorCode =
  | 'invalid-source'
  | 'invalid-struct'
  | 'duplicate-struct';

export class HSPlusStructMeaningLoweringError extends Error {
  readonly code: HSPlusStructMeaningLoweringErrorCode;

  constructor(code: HSPlusStructMeaningLoweringErrorCode, message: string) {
    super(message);
    this.name = 'HSPlusStructMeaningLoweringError';
    this.code = code;
  }
}

export interface HSPlusStructMeaningLoweringOptions {
  /** Stable source name carried into the projection for receipts and diagnostics. */
  sourceId?: string;
}

export interface HSPlusUnknownStructSource {
  line?: number;
  column?: number;
}

/**
 * One struct that declared at least one parser-admitted `@unknown` field.
 *
 * Plain typed fields and preserved-opaque legacy members remain in the syntax
 * AST; they are intentionally absent here because neither carries an epistemic
 * state to lower.
 */
export interface HSPlusUnknownStructMeaning {
  name: string;
  unknownFields: UnknownFieldLowering[];
  source: HSPlusUnknownStructSource;
}

/**
 * Bounded HoloMeaning projection for uncertainty-bearing HoloScript+ records.
 *
 * This is not a complete HoloMeaning program IR and makes no native-execution
 * claim. It records exactly the structured `@unknown` fields that the current
 * parser can bind to a declaration without reparsing raw bodies.
 */
export interface HSPlusUnknownStructMeaningProjection {
  schema: typeof SCHEMA;
  format: typeof FORMAT;
  parser: typeof PARSER;
  sourceDigest: string;
  sourceId?: string;
  structs: HSPlusUnknownStructMeaning[];
}

function isHSPlusNode(value: unknown): value is HSPlusNode {
  return (
    typeof value === 'object' && value !== null && typeof (value as HSPlusNode).type === 'string'
  );
}

function parserFailureMessage(
  errors: Array<{ message: string; line: number; column: number }>
): string {
  if (errors.length === 0) return 'canonical HoloScript+ parser did not produce an AST';
  return errors.map(({ line, column, message }) => `${line}:${column} ${message}`).join('; ');
}

/**
 * Parse canonical `.hsplus` source and lower its structured `@unknown` record
 * fields through the shared HoloMeaning adapter.
 *
 * The function never reparses a raw struct body. Syntax errors, missing
 * structured fields, anonymous declarations, and ambiguous duplicate struct
 * names fail closed.
 */
export function lowerHSPlusUnknownStructsToMeaning(
  source: string,
  options: HSPlusStructMeaningLoweringOptions = {}
): HSPlusUnknownStructMeaningProjection {
  const parsed = new HoloScriptPlusParser({ strict: true }).parse(source);
  if (!parsed.success || !parsed.ast || !isHSPlusNode(parsed.ast.root)) {
    throw new HSPlusStructMeaningLoweringError(
      'invalid-source',
      parserFailureMessage(parsed.errors)
    );
  }

  const structs: HSPlusUnknownStructMeaning[] = [];
  const structNames = new Set<string>();
  const visited = new Set<HSPlusNode>();

  const visit = (node: HSPlusNode): void => {
    if (visited.has(node)) return;
    visited.add(node);

    if (node.type === 'struct') {
      if (node.nameOrigin !== 'explicit') {
        throw new HSPlusStructMeaningLoweringError(
          'invalid-struct',
          'HoloScript+ meaning lowering rejects parser-synthesized struct names'
        );
      }
      if (typeof node.name !== 'string' || node.name.trim().length === 0) {
        throw new HSPlusStructMeaningLoweringError(
          'invalid-struct',
          'HoloScript+ meaning lowering requires every struct to have a canonical name'
        );
      }
      if (structNames.has(node.name)) {
        throw new HSPlusStructMeaningLoweringError(
          'duplicate-struct',
          `Duplicate HoloScript+ struct "${node.name}" makes meaning projection ambiguous`
        );
      }
      structNames.add(node.name);

      if (!Array.isArray(node.fields)) {
        throw new HSPlusStructMeaningLoweringError(
          'invalid-struct',
          `HoloScript+ struct "${node.name}" has no parser-produced structured field projection`
        );
      }

      let unknownFields: UnknownFieldLowering[];
      try {
        unknownFields = lowerUnknownHSPlusStructFields({
          name: node.name,
          body: typeof node.body === 'string' ? node.body : undefined,
          fields: node.fields,
        });
      } catch (error) {
        throw new HSPlusStructMeaningLoweringError(
          'invalid-struct',
          `HoloScript+ struct "${node.name}" cannot enter HoloMeaning: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      if (unknownFields.length > 0) {
        structs.push({
          name: node.name,
          unknownFields,
          source: {
            line: node.loc?.start.line,
            column: node.loc?.start.column,
          },
        });
      }
    }

    const descendants =
      node.children ?? (Array.isArray(node.body) ? node.body.filter(isHSPlusNode) : []);
    for (const child of descendants) visit(child);
  };

  visit(parsed.ast.root);

  return {
    schema: SCHEMA,
    format: FORMAT,
    parser: PARSER,
    sourceDigest: hsiSourceTextDigest(source),
    sourceId: options.sourceId,
    structs,
  };
}
