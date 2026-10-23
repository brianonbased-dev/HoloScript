/**
 * PaperAdapter — native Markdown adapter for HoloAbsorb paper/doc ingest (A19).
 *
 * This is the ONLY `.md` adapter (CoS addendum). It implements the MD-ADAPTER
 * spec using our own dependency-free parser (`../paper/markdownStructure`):
 *   1. headings -> `section` symbols (GitHub slug, -1/-2 dedupe, level,
 *      line start/end, parent section); fenced code skipped
 *   2. links captured raw (text, target, #anchor, line, kind) on the file
 *      symbol's metadata; relative links also become ImportEdges so the
 *      CodebaseGraph can resolve doc -> doc references
 *   3. doc-contract header (first 5 lines) as file-symbol metadata
 *
 * Native (no tree-sitter): `parse()` returns a stub ParseTree with the
 * structure attached, like HoloAdapter.
 */

import type {
  LanguageAdapter,
  ParseTree,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
} from '../types';
import { parseMarkdownStructure, type MarkdownStructure } from '../paper/markdownStructure';

export interface MarkdownParseTree extends ParseTree {
  __markdown: MarkdownStructure;
}

export function makeDocStubTree<K extends string, T>(
  key: K,
  payload: T,
  source: string
): ParseTree & Record<K, T> {
  const rootNode = {
    type: 'document',
    text: source,
    children: [],
    namedChildren: [],
    childCount: 0,
    namedChildCount: 0,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: 0 },
  } as unknown as ParseTree['rootNode'];
  return { rootNode, [key]: payload } as ParseTree & Record<K, T>;
}

export class PaperAdapter implements LanguageAdapter {
  readonly language = 'markdown' as const;
  readonly extensions = ['.md'];
  /** No tree-sitter grammar: parsed natively by markdownStructure.ts. */
  readonly grammarPackage = '@holoscript/absorb-service';
  /** Marker read by CodebaseScanner / parse-worker to bypass tree-sitter. */
  readonly isNativeAdapter = true as const;

  async parse(source: string, _filePath = 'input.md'): Promise<MarkdownParseTree> {
    return makeDocStubTree('__markdown', parseMarkdownStructure(source), source);
  }

  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[] {
    const md = (tree as MarkdownParseTree).__markdown;
    if (!md) return [];
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
    const out: ExternalSymbolDefinition[] = [
      {
        name: fileName,
        type: 'file',
        language: 'markdown',
        filePath,
        line: 1,
        column: 0,
        endLine: md.lineCount,
        visibility: 'public',
        isExported: true,
        lineCount: md.lineCount,
        metadata: { header: md.header, links: md.links, sectionCount: md.sections.length },
      },
    ];
    for (const s of md.sections) {
      out.push({
        name: s.title || s.slug,
        type: 'section',
        language: 'markdown',
        filePath,
        line: s.lineStart,
        column: 0,
        endLine: s.lineEnd,
        visibility: 'public',
        isExported: true,
        owner: s.parentSlug ?? undefined,
        signature: `${'#'.repeat(s.level)} ${s.title}`,
        lineCount: s.lineEnd - s.lineStart + 1,
        metadata: { slug: s.slug, level: s.level, parentSlug: s.parentSlug },
      });
    }
    return out;
  }

  extractImports(tree: ParseTree, filePath: string): ImportEdge[] {
    const md = (tree as MarkdownParseTree).__markdown;
    if (!md) return [];
    return md.links
      .filter((l) => l.kind === 'relative' && l.target !== '')
      .map((l) => ({ fromFile: filePath, toModule: l.target, line: l.line }));
  }

  extractCalls(_tree: ParseTree, _filePath: string): CallEdge[] {
    return [];
  }
}