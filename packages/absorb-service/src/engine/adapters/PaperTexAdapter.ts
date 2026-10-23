/**
 * PaperTexAdapter — native LaTeX adapter for HoloAbsorb paper ingest (A19).
 * Separate class from PaperAdapter because the language registry keys one
 * adapter class per language/file (check-language-registry.mjs).
 * Sections -> `section` symbols, \begin{claim} -> `claim` symbols,
 * \input/\include -> ImportEdges, refs/cites/urls on file metadata.
 */

import type {
  LanguageAdapter,
  ParseTree,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
} from '../types';
import { parseTexStructure, type TexStructure } from '../paper/texStructure';
import { makeDocStubTree } from './PaperAdapter';

export interface TexParseTree extends ParseTree {
  __tex: TexStructure;
}

export class PaperTexAdapter implements LanguageAdapter {
  readonly language = 'latex' as const;
  readonly extensions = ['.tex'];
  /** No tree-sitter grammar: parsed natively by texStructure.ts. */
  readonly grammarPackage = '@holoscript/absorb-service';
  readonly isNativeAdapter = true as const;

  async parse(source: string, _filePath = 'input.tex'): Promise<TexParseTree> {
    return makeDocStubTree('__tex', parseTexStructure(source), source);
  }

  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[] {
    const tex = (tree as TexParseTree).__tex;
    if (!tex) return [];
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
    const base = { language: 'latex' as const, filePath, column: 0, visibility: 'public' as const, isExported: true };
    const out: ExternalSymbolDefinition[] = [
      {
        ...base,
        name: fileName,
        type: 'file',
        line: 1,
        endLine: tex.lineCount,
        lineCount: tex.lineCount,
        metadata: { refs: tex.refs, labels: tex.labels, sectionCount: tex.sections.length },
      },
    ];
    for (const s of tex.sections) {
      out.push({
        ...base,
        name: s.title || s.slug,
        type: 'section',
        line: s.lineStart,
        endLine: s.lineEnd,
        owner: s.parentSlug ?? undefined,
        signature: `\\${s.command}{${s.title}}`,
        lineCount: s.lineEnd - s.lineStart + 1,
        metadata: { slug: s.slug, level: s.level, label: s.label, parentSlug: s.parentSlug },
      });
    }
    tex.claims.forEach((c, idx) => {
      out.push({
        ...base,
        name: c.label ?? `claim-${idx + 1}`,
        type: 'claim',
        line: c.lineStart,
        endLine: c.lineEnd,
        owner: c.sectionSlug ?? undefined,
        signature: c.text.slice(0, 160),
        lineCount: c.lineEnd - c.lineStart + 1,
        metadata: { claimText: c.text, label: c.label, sectionSlug: c.sectionSlug },
      });
    });
    return out;
  }

  extractImports(tree: ParseTree, filePath: string): ImportEdge[] {
    const tex = (tree as TexParseTree).__tex;
    if (!tex) return [];
    return tex.refs
      .filter((r) => r.kind === 'input')
      .map((r) => ({
        fromFile: filePath,
        toModule: /\.tex$/i.test(r.target) ? r.target : `${r.target}.tex`,
        line: r.line,
      }));
  }

  extractCalls(_tree: ParseTree, _filePath: string): CallEdge[] {
    return [];
  }
}