/**
 * ingestObservedPage — fold one browser_session observe extract into HoloAbsorb.
 *
 * Accepts the live holoscript-local `browser_session` observe shape
 * (`dom.bodyText` and/or `markdown`) or a single URL's fetched text, then
 * returns the same ingest contracts already used by `holo_absorb_repo`
 * (inline `sourceFiles`) and `absorb_extract_knowledge` (a CodebaseGraph).
 *
 * This is not a crawl or SERP surface. One observed page or one URL only.
 */

import { createHash } from 'node:crypto';
import { CodebaseGraph } from '../engine/CodebaseGraph';
import type { ExternalSymbolDefinition, ScanResult, ScannedFile } from '../engine/types';
import { ingestHoloSource, type IngestHoloSourceResult } from './ingestHoloSource';
import type { IngestExtractedChunk, IngestExtractedDocument, IngestSourceRef } from './types';

export const OBSERVED_PAGE_HOLO_PATH = 'observed-page.holo';
export const OBSERVED_PAGE_MARKDOWN_PATH = 'observed-page.md';
export const OBSERVED_PAGE_EXTRACT_KIND = 'HoloAbsorbPageExtract';

const PAGE_EXTRACT_MAX_CHARS = 200_000;
const HOLO_EXCERPT_MAX_CHARS = 1_500;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export interface ObservedPageDom {
  url?: string;
  title?: string;
  bodyText?: string;
  markdown?: string;
  elementCount?: number;
}

/** Live `browser_session` observe payload, plus the flat aliases callers already use. */
export interface BrowserSessionObserveExtract {
  operation?: string;
  markdown?: string;
  bodyText?: string;
  url?: string;
  title?: string;
  dom?: ObservedPageDom;
  session?: { url?: string };
}

export interface ObservedPageExtractInput {
  observe?: BrowserSessionObserveExtract | unknown;
  pageExtract?: BrowserSessionObserveExtract | unknown;
  markdown?: string;
  bodyText?: string;
  url?: string;
  title?: string;
  fetchImpl?: typeof fetch;
  fetchTimeoutMs?: number;
}

export interface NormalizedObservedPage {
  url: string;
  title: string;
  markdown: string;
  bodyText: string;
  text: string;
  source: 'observe' | 'pageExtract' | 'markdown' | 'bodyText' | 'url';
  fetched: boolean;
  sha256: string;
  charCount: number;
}

export interface ObservedPageSourceFile {
  path: string;
  content: string;
}

export interface IngestObservedPageResult {
  kind: typeof OBSERVED_PAGE_EXTRACT_KIND;
  extract: NormalizedObservedPage;
  document: IngestExtractedDocument;
  sourceFiles: ObservedPageSourceFile[];
  holo: IngestHoloSourceResult;
  graph: CodebaseGraph;
  scanResult: ScanResult;
}

export function hasObservedPageExtractInput(input: ObservedPageExtractInput): boolean {
  return (
    input.observe != null ||
    input.pageExtract != null ||
    (typeof input.markdown === 'string' && input.markdown.length > 0) ||
    (typeof input.bodyText === 'string' && input.bodyText.length > 0) ||
    (typeof input.url === 'string' && input.url.trim().length > 0)
  );
}

export function normalizeObservedPageExtractSync(
  input: ObservedPageExtractInput
): NormalizedObservedPage {
  const observe = asObserveExtract(input.observe);
  const pageExtract = asObserveExtract(input.pageExtract);
  const markdown = firstNonEmpty(
    input.markdown,
    observe?.markdown,
    pageExtract?.markdown,
    observe?.dom?.markdown,
    pageExtract?.dom?.markdown
  );
  const bodyText = firstNonEmpty(
    input.bodyText,
    observe?.bodyText,
    pageExtract?.bodyText,
    observe?.dom?.bodyText,
    pageExtract?.dom?.bodyText
  );
  const url = firstNonEmpty(
    input.url,
    observe?.url,
    pageExtract?.url,
    observe?.dom?.url,
    pageExtract?.dom?.url,
    observe?.session?.url,
    pageExtract?.session?.url
  );
  const title = firstNonEmpty(
    input.title,
    observe?.title,
    pageExtract?.title,
    observe?.dom?.title,
    pageExtract?.dom?.title,
    titleFromUrl(url)
  );
  const text = firstNonEmpty(markdown, bodyText);
  if (!text) {
    throw new Error(
      'Page extract is empty. Provide browser_session observe markdown/bodyText, or a URL that returns text.'
    );
  }

  const source: NormalizedObservedPage['source'] = observe
    ? 'observe'
    : pageExtract
      ? 'pageExtract'
      : markdown
        ? 'markdown'
        : bodyText
          ? 'bodyText'
          : 'url';

  return finalizeNormalizedPage({
    url: url || 'observed-page',
    title: title || 'ObservedPage',
    markdown: markdown || bodyText,
    bodyText: bodyText || markdown,
    text,
    source,
    fetched: false,
  });
}

export async function normalizeObservedPageExtract(
  input: ObservedPageExtractInput
): Promise<NormalizedObservedPage> {
  try {
    return normalizeObservedPageExtractSync(input);
  } catch (error) {
    const url = typeof input.url === 'string' ? input.url.trim() : '';
    if (!url) throw error;
    const fetched = await fetchObservedPageText(url, input.fetchImpl, input.fetchTimeoutMs);
    return finalizeNormalizedPage({
      url,
      title: firstNonEmpty(input.title, fetched.title, titleFromUrl(url)) || 'ObservedPage',
      markdown: fetched.markdown,
      bodyText: fetched.bodyText,
      text: fetched.text,
      source: 'url',
      fetched: true,
    });
  }
}

export function ingestObservedPageSync(input: ObservedPageExtractInput): IngestObservedPageResult {
  return buildObservedPageAbsorb(normalizeObservedPageExtractSync(input));
}

export async function ingestObservedPage(
  input: ObservedPageExtractInput
): Promise<IngestObservedPageResult> {
  return buildObservedPageAbsorb(await normalizeObservedPageExtract(input));
}

export function observedPageToSourceFiles(
  extract: NormalizedObservedPage
): ObservedPageSourceFile[] {
  return [
    { path: OBSERVED_PAGE_HOLO_PATH, content: observedPageToHoloSource(extract) },
    { path: OBSERVED_PAGE_MARKDOWN_PATH, content: extract.text },
  ];
}

export function observedPageToHoloSource(extract: NormalizedObservedPage): string {
  if (looksLikeHoloSource(extract.text)) {
    return extract.text;
  }

  const excerpt = extract.text.slice(0, HOLO_EXCERPT_MAX_CHARS);
  return `composition "ObservedPage" {
  object "PageExtract" {
    @knowledge(source: "${escapeHoloString(extract.url)}")
    url: "${escapeHoloString(extract.url)}"
    title: "${escapeHoloString(extract.title)}"
    sha256: "${extract.sha256}"
    charCount: ${extract.charCount}
    excerpt: "${escapeHoloString(excerpt)}"
  }
}
`;
}

function buildObservedPageAbsorb(extract: NormalizedObservedPage): IngestObservedPageResult {
  const sourceFiles = observedPageToSourceFiles(extract);
  const holo = ingestHoloSource(sourceFiles[0].content, {
    filePath: OBSERVED_PAGE_HOLO_PATH,
    tolerant: true,
  });
  const scanResult = observedPageToScanResult(extract);
  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);

  return {
    kind: OBSERVED_PAGE_EXTRACT_KIND,
    extract,
    document: observedPageToDocument(extract),
    sourceFiles,
    holo,
    graph,
    scanResult,
  };
}

function observedPageToDocument(extract: NormalizedObservedPage): IngestExtractedDocument {
  const source: IngestSourceRef = {
    uri: extract.url,
    fileName: OBSERVED_PAGE_MARKDOWN_PATH,
    mimeType: 'text/markdown',
    sizeBytes: Buffer.byteLength(extract.text, 'utf-8'),
    sha256: extract.sha256,
  };
  const chunk: IngestExtractedChunk = {
    id: `observed-page:${extract.sha256.slice(0, 12)}`,
    text: extract.text,
    kind: 'text',
    metadata: {
      title: extract.title,
      source: extract.source,
      fetched: extract.fetched,
    },
    provenance: { source },
  };
  return {
    formatId: 'markdown',
    title: extract.title,
    chunks: [chunk],
    metadata: {
      kind: OBSERVED_PAGE_EXTRACT_KIND,
      url: extract.url,
      sha256: extract.sha256,
      charCount: extract.charCount,
    },
    warnings: extract.fetched ? ['Text was fetched from a single URL, not a crawl.'] : [],
  };
}

function observedPageToScanResult(extract: NormalizedObservedPage): ScanResult {
  const headings = extractMarkdownHeadings(extract.text);
  const filePath = OBSERVED_PAGE_MARKDOWN_PATH;
  const symbols: ExternalSymbolDefinition[] = [
    {
      name: sanitizeSymbolName(extract.title) || 'ObservedPage',
      type: 'file',
      filePath,
      line: 1,
      column: 0,
      language: 'plaintext',
      visibility: 'public',
      docComment: extract.url,
      metadata: {
        kind: OBSERVED_PAGE_EXTRACT_KIND,
        url: extract.url,
        sha256: extract.sha256,
      },
    },
    ...headings.map((heading) => ({
      name: heading.name,
      type: 'constant' as const,
      filePath,
      line: heading.line,
      column: 0,
      language: 'plaintext' as const,
      visibility: 'public' as const,
      docComment: heading.text,
    })),
  ];
  const file: ScannedFile = {
    path: filePath,
    language: 'plaintext',
    symbols,
    imports: [],
    calls: [],
    loc: extract.text.split('\n').length,
    sizeBytes: Buffer.byteLength(extract.text, 'utf-8'),
    docComment: extract.title,
  };
  return {
    rootDir: extract.url || 'observed-page',
    rootDirs: [extract.url || 'observed-page'],
    files: [file],
    stats: {
      totalFiles: 1,
      filesByLanguage: { plaintext: 1 },
      totalSymbols: symbols.length,
      symbolsByType: countBy(symbols, (symbol) => symbol.type),
      totalImports: 0,
      totalCalls: 0,
      totalLoc: file.loc,
      durationMs: 0,
      errors: [],
    },
  };
}

async function fetchObservedPageText(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): Promise<{ text: string; markdown: string; bodyText: string; title: string }> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Page extract URL protocol is not allowed: ${parsed.protocol}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'text/markdown, text/plain, text/html;q=0.8' },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Page extract fetch failed: HTTP ${response.status}`);
  }

  const raw = (await response.text()).slice(0, PAGE_EXTRACT_MAX_CHARS);
  const contentType = response.headers.get('content-type') ?? '';
  const isHtml = contentType.includes('text/html') || /^\s*</.test(raw);
  const text = isHtml ? htmlToVisibleText(raw) : raw;
  if (!text.trim()) {
    throw new Error('Fetched page extract is empty.');
  }
  return {
    text,
    markdown: isHtml ? text : raw,
    bodyText: text,
    title: titleFromHtml(raw) || titleFromUrl(url) || 'ObservedPage',
  };
}

function asObserveExtract(value: unknown): BrowserSessionObserveExtract | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return value as BrowserSessionObserveExtract;
}

function finalizeNormalizedPage(
  input: Omit<NormalizedObservedPage, 'sha256' | 'charCount'>
): NormalizedObservedPage {
  const text = input.text.slice(0, PAGE_EXTRACT_MAX_CHARS);
  return {
    ...input,
    markdown: (input.markdown || text).slice(0, PAGE_EXTRACT_MAX_CHARS),
    bodyText: (input.bodyText || text).slice(0, PAGE_EXTRACT_MAX_CHARS),
    text,
    charCount: text.length,
    sha256: createHash('sha256').update(text).digest('hex'),
  };
}

function looksLikeHoloSource(text: string): boolean {
  return /^\s*(composition|object)\b/.test(text);
}

function extractMarkdownHeadings(text: string): Array<{ name: string; text: string; line: number }> {
  const headings: Array<{ name: string; text: string; line: number }> = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+)$/.exec(lines[index]);
    if (!match) continue;
    const headingText = match[2].trim();
    const name = sanitizeSymbolName(headingText);
    if (!name) continue;
    headings.push({ name, text: headingText, line: index + 1 });
    if (headings.length >= 32) break;
  }
  return headings;
}

function htmlToVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromHtml(html: string): string {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? htmlToVisibleText(match[1]) : '';
}

function titleFromUrl(url?: string): string {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const leaf = parsed.pathname.split('/').filter(Boolean).pop();
    return leaf ? decodeURIComponent(leaf) : parsed.hostname;
  } catch {
    return '';
  }
}

function sanitizeSymbolName(value: string): string {
  const cleaned = value.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return cleaned.slice(0, 80);
}

function escapeHoloString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return '';
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyOf(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}
