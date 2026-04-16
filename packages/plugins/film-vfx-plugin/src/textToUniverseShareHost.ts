/**
 * Host bridge: when TextToUniverse emits `ttu:render_snippet`, POST the Holo snippet
 * to render-service `POST /share` so previews and `/scene/:id/parsed` work.
 */

export interface TextToUniverseShareHostOptions {
  /** Render-service origin, e.g. `http://127.0.0.1:8791` (no trailing slash). */
  renderServiceUrl: string;
  fetchImpl?: typeof fetch;
  defaultTitle?: string;
  defaultDescription?: string;
}

export interface RenderServiceShareResponse {
  id: string;
  playground?: string;
  embed?: string;
  preview?: string;
  qr?: string;
  raw?: string;
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * POST `holoSnippet` as `code` to `{renderServiceUrl}/share`.
 */
export async function postTtuSnippetToRenderShare(
  holoSnippet: string,
  options: TextToUniverseShareHostOptions & { title?: string; description?: string }
): Promise<RenderServiceShareResponse> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  const base = normalizeBase(options.renderServiceUrl);
  const res = await fetchFn(`${base}/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: holoSnippet,
      title: options.title ?? options.defaultTitle ?? 'TextToUniverse scene',
      description:
        options.description ??
        options.defaultDescription ??
        'Scene emitted from @text_to_universe',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`render-service /share failed: ${res.status} ${text}`);
  }
  return (await res.json()) as RenderServiceShareResponse;
}

export interface TtuRenderSnippetPayload {
  holoSnippet: string;
  prompt?: string;
}

/**
 * If `event === 'ttu:render_snippet'`, POSTs `holoSnippet` to `/share` and invokes callbacks.
 * Does not call any other emit handler — compose with your bus manually or use {@link wireTextToUniverseShareToCtx}.
 */
export async function handleTtuRenderSnippetShareEvent(
  event: string,
  payload: unknown,
  options: TextToUniverseShareHostOptions & {
    onShared?: (result: RenderServiceShareResponse, meta: TtuRenderSnippetPayload) => void;
    onError?: (err: unknown, meta: TtuRenderSnippetPayload) => void;
  }
): Promise<RenderServiceShareResponse | null> {
  if (event !== 'ttu:render_snippet') return null;
  const p = payload as Partial<TtuRenderSnippetPayload> | undefined;
  if (!p || typeof p.holoSnippet !== 'string' || !p.holoSnippet.trim()) return null;
  const meta: TtuRenderSnippetPayload = { holoSnippet: p.holoSnippet, prompt: p.prompt };
  try {
    const share = await postTtuSnippetToRenderShare(p.holoSnippet, options);
    options.onShared?.(share, meta);
    return share;
  } catch (err) {
    options.onError?.(err, meta);
    throw err;
  }
}

/**
 * Chains `ttu:render_snippet` → POST `/share` → `ttu:shared` / `ttu:share_error` on the same `ctx.emit`.
 * Returns restore function for tests / teardown.
 */
export function wireTextToUniverseShareToCtx(
  ctx: { emit?: (event: string, payload?: unknown) => void },
  options: TextToUniverseShareHostOptions
): () => void {
  const prev = ctx.emit;
  ctx.emit = (event: string, payload?: unknown) => {
    prev?.(event, payload);
    if (event !== 'ttu:render_snippet') return;
    const p = payload as Partial<TtuRenderSnippetPayload> | undefined;
    if (!p || typeof p.holoSnippet !== 'string') return;
    void handleTtuRenderSnippetShareEvent(event, payload, {
      ...options,
      onShared: (share, meta) => {
        prev?.('ttu:shared', { share, ...meta });
      },
      onError: (err, meta) => {
        prev?.('ttu:share_error', { error: err instanceof Error ? err.message : String(err), ...meta });
      },
    }).catch(() => {
      /* onError already emitted */
    });
  };
  return () => {
    ctx.emit = prev;
  };
}
