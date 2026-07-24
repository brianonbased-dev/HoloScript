/**
 * Built-package declaration canary for structured HoloScript+ records.
 *
 * This file must compile against the generated package declarations, not the
 * source tree. The IsAny checks prevent permissive declaration drift from
 * turning the canary into a false green.
 */

import {
  HoloScriptPlusParser,
  lowerHSPlusUnknownStructsToMeaning,
  type ASTProgram,
  type HSPlusCompileResult,
  type HSPlusNode,
  type HSPlusParseResult,
  type HSPlusStructField,
} from '@holoscript/core';
import {
  HoloScriptPlusParser as ParserSubpath,
  parse as parseFromSubpath,
  type HSPlusCompileResult as ParserCompileResult,
  type HSPlusNode as ParserNode,
  type HSPlusParseResult as ParserParseResult,
  type HSPlusStructField as ParserStructField,
} from '@holoscript/core/parser';

type IsAny<T> = 0 extends 1 & T ? true : false;
type AssertFalse<T extends false> = T;

type RootAstIsTyped = AssertFalse<IsAny<NonNullable<HSPlusCompileResult['ast']>>>;
type RootChildrenAreTyped = AssertFalse<IsAny<HSPlusParseResult['ast']['children']>>;
type RootFieldsAreTyped = AssertFalse<IsAny<HSPlusNode['fields']>>;
type RootParserAstIsTyped = AssertFalse<IsAny<ReturnType<HoloScriptPlusParser['parse']>['ast']>>;
type SubpathAstIsTyped = AssertFalse<IsAny<NonNullable<ParserCompileResult['ast']>>>;
type SubpathFieldsAreTyped = AssertFalse<IsAny<ParserNode['fields']>>;
type SubpathParserAstIsTyped = AssertFalse<IsAny<ReturnType<ParserSubpath['parse']>['ast']>>;
type SubpathFunctionAstIsTyped = AssertFalse<IsAny<ReturnType<typeof parseFromSubpath>['ast']>>;

const source = 'struct Reading { @unknown value?: i32 = fallback() }';
const compatibilityResult: HSPlusCompileResult = { success: false, errors: [] };
const rootResult: HSPlusParseResult = new HoloScriptPlusParser().parse(source);
const subpathResult: ParserParseResult = new ParserSubpath().parse(source);
const subpathFunctionResult: ParserParseResult = parseFromSubpath(source);

const rootAst: ASTProgram = rootResult.ast;
const rootField: HSPlusStructField | undefined = rootAst.root.fields?.[0];
const rootNameOrigin: 'explicit' | 'synthetic' | undefined = rootAst.root.nameOrigin;
const rootChildField: HSPlusStructField | undefined = rootAst.children[0]?.fields?.[0];
const firstImportPath: string | undefined = rootAst.imports[0]?.path;
const subpathField: ParserStructField | undefined = subpathResult.ast.root.fields?.[0];
const subpathFunctionField: ParserStructField | undefined =
  subpathFunctionResult.ast.root.fields?.[0];
const meaning = lowerHSPlusUnknownStructsToMeaning(source);
const loweredKey: string = meaning.structs[0].unknownFields[0].key;

void rootField;
void compatibilityResult;
void rootNameOrigin;
void rootChildField;
void firstImportPath;
void subpathField;
void subpathFunctionField;
void loweredKey;

export type {
  RootAstIsTyped,
  RootChildrenAreTyped,
  RootFieldsAreTyped,
  RootParserAstIsTyped,
  SubpathAstIsTyped,
  SubpathFieldsAreTyped,
  SubpathParserAstIsTyped,
  SubpathFunctionAstIsTyped,
};
