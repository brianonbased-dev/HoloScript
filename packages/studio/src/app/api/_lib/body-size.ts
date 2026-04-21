/**
 * Body-size cap helper for Studio API routes.
 *
 * SEC-T17: Next.js 14 app-router routes don't enforce a uniform body-size
 * cap across runtimes. The `nodejs` runtime has a lenient default and the
 * `edge` runtime's default is lower but still multi-MB. Combined with our
 * `maxDuration = 300` on LLM routes, an unchecked body is a DoS / spend
 * primitive: an attacker posts a 50MB JSON blob, Next.js buffers it,
 * parsing burns CPU and wall-clock, and a paid provider call may fire
 * downstream.
 *
 * `readJsonBody` reads the request body as text, enforces a **byte-length**
 * cap (using `Buffer.byteLength` — not `String.length`, which counts UTF-16
 * code units and undercounts multibyte characters), then JSON-parses.
 *
 * Returns a discriminated union rather than throwing so callers can produce
 * route-appropriate responses (Next.js JSON, SSE events, custom envelopes).
 *
 * Defaults to 64KB. Routes that legitimately need larger bodies (e.g.
 * voice samples) should set `maxBytes` explicitly.
 */

export type ReadBodyResult<T = unknown> =
  | { ok: true; body: T; bytes: number }
  | { ok: false; status: 413; error: 'payload_too_large'; limit: number; bytes: number }
  | { ok: false; status: 400; error: 'invalid_json'; message: string };

export interface ReadBodyOptions {
  /** Byte-length cap. Default: 65_536 (64KB). */
  maxBytes?: number;
}

const DEFAULT_MAX_BYTES = 65_536;

/**
 * Read a JSON body from a Request (or NextRequest), enforcing a byte-length
 * cap before parsing.
 *
 * Usage:
 *   const parsed = await readJsonBody<MyBody>(req, { maxBytes: 32_000 });
 *   if (!parsed.ok) {
 *     return NextResponse.json({ error: parsed.error }, { status: parsed.status });
 *   }
 *   const { body } = parsed;
 */
export async function readJsonBody<T = unknown>(
  req: Request,
  opts: ReadBodyOptions = {}
): Promise<ReadBodyResult<T>> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

  let text: string;
  try {
    text = await req.text();
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_json',
      message: err instanceof Error ? err.message : 'failed to read request body',
    };
  }

  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: 'payload_too_large',
      limit: maxBytes,
      bytes,
    };
  }

  if (text.length === 0) {
    // Treat empty body as invalid JSON — routes that accept "no body" should
    // use an explicit check before calling this helper.
    return {
      ok: false,
      status: 400,
      error: 'invalid_json',
      message: 'empty body',
    };
  }

  try {
    const body = JSON.parse(text) as T;
    return { ok: true, body, bytes };
  } catch (err) {
    return {
      ok: false,
      status: 400,
      error: 'invalid_json',
      message: err instanceof Error ? err.message : 'JSON parse error',
    };
  }
}
