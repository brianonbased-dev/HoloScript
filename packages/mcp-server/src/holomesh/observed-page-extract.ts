/**
 * Fold one leftover-2 / browser_session observe extract into existing
 * HoloMesh `holomesh_contribute` / `holomesh_feed_source`.
 *
 * Same input shape as absorb `ObservedPageExtractInput`:
 *   observe | pageExtract | bodyText + markdown + url
 *
 * One observed page or one URL only. Not a crawl. Not a new product home.
 */

import { createHash } from 'node:crypto';

export const HOLOMESH_PAGE_EXTRACT_KIND = 'HoloMeshPageExtract' as const;
export const PAGE_EXTRACT_MAX_CHARS = 200_000;
const HOLO_EXCERPT_MAX_CHARS = 1_500;
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export interface ObservedPageDom {
  url?: string;
  title?: string;
  bodyText?: string;
  markdown?: string;
  elementCount?: number;
}

/** Live `browser_session` observe payload, plus leftover-2 absorb aliases. */
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

export interface HoloMeshPageExtractReceipt {
  kind: typeof HOLOMESH_PAGE_EXTRACT_KIND;
  pageExtractPresent: true;
  url: string;
  title: string;
  charCount: number;
  sha256: string;
  source: NormalizedObservedPage['source'];
  fetched: boolean;
}

/** Shared MCP input properties for contribute + feed_source. */
export const OBSERVED_PAGE_EXTRACT_SCHEMA_PROPERTIES = {
  observe: {
    type: 'object',
    description:
      'One browser_session observe payload (dom.bodyText and/or markdown). Same leftover-2 absorb observe shape. One page only.',
  },
  pageExtract: {
    type: 'object',
    description:
      'Absorb leftover-2 pageExtract receipt or observe-shaped object (url/title/bodyText/markdown). One page only.',
  },
  markdown: {
    type: 'string',
    description: 'Observed page markdown from browser_session observe or absorb pageExtract.',
  },
  bodyText: {
    type: 'string',
    description: 'Observed page bodyText from browser_session observe or absorb pageExtract.',
  },
  url: {
    type: 'string',
    description: 'Single page URL. One URL only — not a crawl or SERP.',
  },
  title: {
    type: 'string',
    description: 'Optional page title when the observe payload does not include one.',
  },
} as const;

export function meshArgsHavePageExtract(args: Record<string, unknown>): boolean {
  if (hasCrawlShape(args)) return false;
  return hasObservedPageExtractInput(pageExtractInputFromMeshArgs(args));
}

export function pageExtractInputFromMeshArgs(
  args: Record<string, unknown>
): ObservedPageExtractInput {
  return {
    observe: args.observe,
    pageExtract: args.pageExtract,
    markdown: typeof args.markdown === 'string' ? args.markdown : undefined,
    bodyText: typeof args.bodyText === 'string' ? args.bodyText : undefined,
    url: typeof args.url === 'string' ? args.url : undefined,
    title: typeof args.title === 'string' ? args.title : undefined,
  };
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

export function hasCrawlShape(args: Record<string, unknown>): boolean {
  return Array.isArray(args.urls) || Array.isArray(args.url) || Array.isArray(args.observe);
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
      'Page extract is empty. Provide browser_session observe markdown/bodyText, absorb pageExtract, or one URL that returns text.'
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

export async function resolveMeshObservedPage(
  args: Record<string, unknown>,
  fetchImpl?: typeof fetch
): Promise<
  | { ok: true; extract: NormalizedObservedPage; receipt: HoloMeshPageExtractReceipt }
  | { ok: false; error: string; message: string }
> {
  if (hasCrawlShape(args)) {
    return {
      ok: false,
      error: 'page_extract_not_crawl',
      message: 'Page extract accepts one URL or one observed page only — not a crawl or SERP.',
    };
  }

  const input = pageExtractInputFromMeshArgs(args);
  if (!hasObservedPageExtractInput(input)) {
    return {
      ok: false,
      error: 'page_extract_missing',
      message:
        'Provide observe, pageExtract, bodyText+markdown, or one url. holomesh_contribute still accepts type+content without an extract.',
    };
  }

  try {
    const extract = await normalizeObservedPageExtract({
      ...input,
      fetchImpl: fetchImpl ?? input.fetchImpl,
    });
    return { ok: true, extract, receipt: meshPageExtractReceipt(extract) };
  } catch (error) {
    return {
      ok: false,
      error: 'page_extract_failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function meshPageExtractReceipt(extract: NormalizedObservedPage): HoloMeshPageExtractReceipt {
  return {
    kind: HOLOMESH_PAGE_EXTRACT_KIND,
    pageExtractPresent: true,
    url: extract.url,
    title: extract.title,
    charCount: extract.charCount,
    sha256: extract.sha256,
    source: extract.source,
    fetched: extract.fetched,
  };
}

export function observedPageToKnowledgeContent(extract: NormalizedObservedPage): string {
  return [
    `# ${extract.title}`,
    '',
    `URL: ${extract.url}`,
    `Source: ${extract.source}`,
    `SHA-256: ${extract.sha256}`,
    '',
    extract.text,
  ].join('\n');
}

/** Comment-only feed block so extract text cannot become executable HS. */
export function observedPageToFeedBlock(extract: NormalizedObservedPage): string {
  const excerpt = extract.text
    .slice(0, HOLO_EXCERPT_MAX_CHARS)
    .split(/\r?\n/)
    .map((line) => `//   ${line}`)
    .join('\n');
  return [
    `// @observed_page url=${JSON.stringify(extract.url)} title=${JSON.stringify(extract.title)} sha256=${extract.sha256} source=${extract.source} chars=${extract.charCount}`,
    '// excerpt:',
    excerpt,
  ].join('\n');
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

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  return '';
}
