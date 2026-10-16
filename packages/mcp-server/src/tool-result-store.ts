/**
 * tool-result-store.ts — the MCP large-response cap (PLAN: /workspace/mcp-large-response/PLAN.md §3).
 *
 * A tool result whose serialized MCP envelope exceeds `responseMaxBytes`
 * (server-sizing.ts, env `MCP_RESPONSE_MAX_BYTES`, default 256 KiB) is NOT sent
 * inline. The full payload goes into a bounded, caller-scoped, in-memory store
 * (LRU + TTL), and the caller gets:
 *
 *   content[0]  text summary (tool, bytes, sha256, item counts, a short preview)
 *   content[1]  { type: 'resource_link', uri: 'holo-result://<sha256>/<id>', mimeType, size }
 *   _meta['holoscript/result']  { truncated, totalBytes, sha256, totalItems?, handle, ... }
 *
 * The client fetches the payload with `resources/read` on that URI, one window
 * at a time (`?cursor=<opaque>`; the next cursor comes back in `_meta`), so a
 * fetch is itself under the cap. Only the caller (transport + callerId) that
 * produced a result can read it; an expired or foreign handle gets the same
 * "not found or expired" error, so handles can't be probed.
 *
 * Why `_meta` and not `structuredContent`: some tools declare an `outputSchema`,
 * and the spec says `structuredContent` must then conform to it. A truncation
 * summary would not, so it rides in `_meta` (spec-allowed on any result).
 *
 * `capItems` is the shared "first N + count" helper (generalizes the parser's
 * MAX_UNKNOWN_TRAIT_WARNINGS = 100 pattern) for tools that return long lists.
 */

import { createHash, randomBytes } from 'crypto';

export const HOLO_RESULT_SCHEME = 'holo-result:';
export const HOLO_RESULT_URI_TEMPLATE = 'holo-result://{sha256}/{id}';
export const HOLO_RESULT_META_KEY = 'holoscript/result';

export const DEFAULT_RESPONSE_MAX_BYTES = 256 * 1024;
const DEFAULT_TTL_MS = 15 * 60_000;
const DEFAULT_TOTAL_BYTES = 64 * 1024 * 1024;
const PREVIEW_CHARS = 2_000;
/** Headroom for the JSON-RPC/`contents` wrapper around one fetched window. */
const READ_WINDOW_OVERHEAD = 4 * 1024;

// ── capItems ───────────────────────────────────────────────────────────────

export interface CappedItems<T> {
  items: T[];
  total: number;
  omitted: number;
}

/** First `max` items plus counts. `max` defaults to 100 (the HS1006 warning cap). */
export function capItems<T>(arr: readonly T[], max = 100): CappedItems<T> {
  const limit = Math.max(0, Math.floor(max));
  const items = arr.slice(0, limit);
  return { items, total: arr.length, omitted: arr.length - items.length };
}

// ── Store ──────────────────────────────────────────────────────────────────

export interface StoredResult {
  readonly id: string;
  readonly sha256: string;
  readonly scope: string;
  readonly tool: string;
  readonly mimeType: string;
  readonly data: Buffer;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export interface ToolResultStoreOptions {
  ttlMs?: number;
  maxTotalBytes?: number;
  now?: () => number;
}

/** Caller scope key: results never cross transports or callers. */
export function resultScope(transport: string, callerId: string | null | undefined): string {
  return `${transport}:${callerId ?? 'local'}`;
}

export class ToolResultStore {
  private readonly entries = new Map<string, StoredResult>(); // insertion order = LRU order
  private totalBytes = 0;
  readonly ttlMs: number;
  readonly maxTotalBytes: number;
  private readonly now: () => number;

  constructor(options: ToolResultStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxTotalBytes = options.maxTotalBytes ?? DEFAULT_TOTAL_BYTES;
    this.now = options.now ?? Date.now;
  }

  get size(): number {
    return this.entries.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  /** Store a payload. Returns null when it can never fit the store budget. */
  put(input: {
    scope: string;
    tool: string;
    mimeType: string;
    data: Buffer;
    sha256: string;
  }): StoredResult | null {
    if (input.data.length > this.maxTotalBytes) return null;
    this.sweep();
    while (this.totalBytes + input.data.length > this.maxTotalBytes && this.entries.size > 0) {
      const oldest = this.entries.keys().next().value as string;
      this.remove(oldest);
    }
    const now = this.now();
    const entry: StoredResult = {
      id: randomBytes(16).toString('hex'),
      sha256: input.sha256,
      scope: input.scope,
      tool: input.tool,
      mimeType: input.mimeType,
      data: input.data,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };
    this.entries.set(entry.id, entry);
    this.totalBytes += entry.data.length;
    return entry;
  }

  /** Fetch by id for this scope. Foreign, expired and unknown ids all return null. */
  get(id: string, scope: string): StoredResult | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.remove(id);
      return null;
    }
    if (entry.scope !== scope) return null;
    // refresh LRU position
    this.entries.delete(id);
    this.entries.set(id, entry);
    return entry;
  }

  private remove(id: string): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    this.entries.delete(id);
    this.totalBytes -= entry.data.length;
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.remove(id);
    }
  }
}

let defaultStore: ToolResultStore | null = null;
export function getDefaultToolResultStore(): ToolResultStore {
  if (!defaultStore) defaultStore = new ToolResultStore();
  return defaultStore;
}
/** Test seam. */
export function setDefaultToolResultStore(store: ToolResultStore | null): void {
  defaultStore = store;
}

// ── URIs and cursors ───────────────────────────────────────────────────────

export function holoResultUri(entry: Pick<StoredResult, 'sha256' | 'id'>, cursor?: string): string {
  return `holo-result://${entry.sha256}/${entry.id}${cursor ? `?cursor=${cursor}` : ''}`;
}

export function isHoloResultUri(uri: string): boolean {
  return typeof uri === 'string' && uri.startsWith('holo-result://');
}

interface ParsedHoloResultUri {
  sha256: string;
  id: string;
  offset: number;
}

function encodeCursor(offset: number): string {
  return Buffer.from(`o:${offset}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): number | null {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(cursor)) return null;
  const m = /^o:(\d{1,15})$/.exec(Buffer.from(cursor, 'base64url').toString('utf8'));
  return m ? Number(m[1]) : null;
}

export function parseHoloResultUri(uri: string): ParsedHoloResultUri | null {
  const m = /^holo-result:\/\/([0-9a-f]{64})\/([0-9a-f]{32})(?:\?cursor=([^&#]*))?$/.exec(uri);
  if (!m) return null;
  let offset = 0;
  if (m[3] !== undefined) {
    const decoded = decodeCursor(m[3]);
    if (decoded === null) return null;
    offset = decoded;
  }
  return { sha256: m[1], id: m[2], offset };
}

export class HoloResultNotFoundError extends Error {
  constructor(uri: string) {
    super(
      `Result not found or expired: ${uri.split('?')[0]}. Stored results last a limited time ` +
        'and can only be read by the caller that produced them; run the tool again.'
    );
    this.name = 'HoloResultNotFoundError';
  }
}

/** Largest end <= `end` that does not split a UTF-8 sequence. */
function utf8Boundary(buf: Buffer, start: number, end: number): number {
  if (end >= buf.length) return buf.length;
  let e = end;
  while (e > start && (buf[e] & 0xc0) === 0x80) e--;
  return e > start ? e : end;
}

export interface HoloResultReadOptions {
  scope: string;
  maxBytes?: number;
  store?: ToolResultStore;
}

/**
 * Serve one window of a stored result for `resources/read`.
 * Windows are byte ranges cut on UTF-8 boundaries; concatenating every window's
 * text in cursor order reproduces the stored payload byte-for-byte.
 */
export function readHoloResult(uri: string, options: HoloResultReadOptions) {
  const store = options.store ?? getDefaultToolResultStore();
  const parsed = parseHoloResultUri(uri);
  if (!parsed) throw new HoloResultNotFoundError(uri);
  const entry = store.get(parsed.id, options.scope);
  if (!entry || entry.sha256 !== parsed.sha256 || parsed.offset > entry.data.length) {
    throw new HoloResultNotFoundError(uri);
  }
  const maxBytes = options.maxBytes ?? DEFAULT_RESPONSE_MAX_BYTES;
  const window = Math.max(1024, maxBytes - READ_WINDOW_OVERHEAD);
  const start = parsed.offset;
  // Size the window by its JSON-encoded length (quotes, newlines and control characters
  // grow when escaped), shrinking until the encoded window fits the budget.
  let span = window;
  let end = start;
  let text = '';
  for (let attempt = 0; attempt < 8; attempt++) {
    end = utf8Boundary(entry.data, start, Math.min(entry.data.length, start + span));
    text = entry.data.subarray(start, end).toString('utf8');
    const encoded = Buffer.byteLength(JSON.stringify(text), 'utf8');
    if (encoded <= window || end - start <= 1) break;
    span = Math.max(1, Math.floor((end - start) * (window / encoded) * 0.98));
  }
  const done = end >= entry.data.length;
  const nextCursor = done ? undefined : encodeCursor(end);
  return {
    contents: [{ uri: holoResultUri(entry), mimeType: entry.mimeType, text }],
    _meta: {
      [HOLO_RESULT_META_KEY]: {
        sha256: entry.sha256,
        totalBytes: entry.data.length,
        offset: start,
        length: end - start,
        ...(nextCursor ? { nextCursor, nextUri: holoResultUri(entry, nextCursor) } : {}),
      },
    },
  };
}

export const holoResultResourceTemplate = {
  uriTemplate: HOLO_RESULT_URI_TEMPLATE,
  name: 'Stored large tool result',
  description:
    'Full payload of a tool result that was over the response size cap. Read it in windows: ' +
    'each read returns _meta["holoscript/result"].nextUri until the payload is complete.',
  mimeType: 'application/json',
};

// ── The cap ────────────────────────────────────────────────────────────────

interface McpContentItem {
  type: string;
  text?: string;
  [k: string]: unknown;
}

export interface McpToolEnvelope {
  content: McpContentItem[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
  [k: string]: unknown;
}

export function isMcpToolEnvelope(value: unknown): value is McpToolEnvelope {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as { content?: unknown }).content)
  );
}

export interface ResponseCapInfo {
  /** Serialized size of the envelope the tool produced. */
  resultBytes: number;
  truncated: boolean;
  resultSha256?: string;
  /** True when over the cap but too large even for the store (summary only, no link). */
  unstored?: boolean;
}

export interface CapOptions {
  tool: string;
  scope: string;
  maxBytes: number;
  store?: ToolResultStore;
}

function payloadOf(env: McpToolEnvelope): { data: string; mimeType: string; parsed?: unknown } {
  const allText = env.content.every((c) => c && c.type === 'text' && typeof c.text === 'string');
  if (allText && env.content.length === 1) {
    const text = env.content[0].text as string;
    try {
      return { data: text, mimeType: 'application/json', parsed: JSON.parse(text) };
    } catch {
      return { data: text, mimeType: 'text/plain' };
    }
  }
  // Mixed or multi-part content (images, blobs, several texts): keep it all, as JSON.
  return { data: JSON.stringify(env.content), mimeType: 'application/json', parsed: env.content };
}

function itemCounts(parsed: unknown): { totalItems?: number; itemsAt?: string } {
  if (Array.isArray(parsed)) return { totalItems: parsed.length };
  if (parsed && typeof parsed === 'object') {
    let best: { key: string; n: number } | null = null;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v) && (!best || v.length > best.n)) best = { key: k, n: v.length };
    }
    if (best) return { totalItems: best.n, itemsAt: best.key };
  }
  return {};
}

/**
 * Apply the response cap to one MCP tool-result envelope.
 * Under the cap the envelope is returned unchanged (same object).
 */
export function capMcpToolResult(
  env: McpToolEnvelope,
  options: CapOptions
): { result: McpToolEnvelope; info: ResponseCapInfo } {
  const serialized = JSON.stringify(env);
  const resultBytes = Buffer.byteLength(serialized, 'utf8');
  if (resultBytes <= options.maxBytes) {
    return { result: env, info: { resultBytes, truncated: false } };
  }

  const store = options.store ?? getDefaultToolResultStore();
  const { data, mimeType, parsed } = payloadOf(env);
  const buf = Buffer.from(data, 'utf8');
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const counts = itemCounts(parsed);
  const entry = store.put({
    scope: options.scope,
    tool: options.tool,
    mimeType,
    data: buf,
    sha256,
  });

  const kib = (n: number) => `${Math.round(n / 1024)} KiB`;
  const preview = data.slice(0, PREVIEW_CHARS);
  const lines = [
    `Result too large to return inline: ${options.tool} produced ${kib(buf.length)} ` +
      `(limit ${kib(options.maxBytes)}).`,
    `sha256: ${sha256}`,
    ...(counts.totalItems !== undefined
      ? [`items: ${counts.totalItems}${counts.itemsAt ? ` (in "${counts.itemsAt}")` : ''}`]
      : []),
    entry
      ? `Full result: read the resource ${holoResultUri(entry)} (in windows; follow ` +
        `_meta["${HOLO_RESULT_META_KEY}"].nextUri). It expires in ${Math.round(store.ttlMs / 60_000)} min.`
      : 'The full result is too large to keep, so it was not stored. Narrow the request ' +
        '(a limit, a filter or a smaller input) and run the tool again.',
    `Preview (first ${Math.min(PREVIEW_CHARS, data.length)} characters):`,
    preview,
  ];

  const meta = {
    truncated: true,
    totalBytes: buf.length,
    envelopeBytes: resultBytes,
    sha256,
    mimeType,
    ...(counts.totalItems !== undefined ? { totalItems: counts.totalItems, shownItems: 0 } : {}),
    ...(entry
      ? { handle: holoResultUri(entry), expiresAt: new Date(entry.expiresAt).toISOString() }
      : { stored: false }),
  };

  const content: McpContentItem[] = [{ type: 'text', text: lines.join('\n') }];
  if (entry) {
    content.push({
      type: 'resource_link',
      uri: holoResultUri(entry),
      name: `${options.tool} result`,
      mimeType,
      size: buf.length,
      description: `Full ${options.tool} result (${kib(buf.length)}, sha256 ${sha256.slice(0, 12)}…)`,
    });
  }

  const result: McpToolEnvelope = {
    content,
    ...(env.isError ? { isError: true } : {}),
    _meta: { ...(env._meta ?? {}), [HOLO_RESULT_META_KEY]: meta },
  };
  return {
    result,
    info: {
      resultBytes,
      truncated: true,
      resultSha256: sha256,
      ...(entry ? {} : { unstored: true }),
    },
  };
}
