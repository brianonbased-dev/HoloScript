/**
 * Hologram MCP Response - content_type schema for tools whose response
 * payload IS a hologram (.holo / quilt / MV-HEVC), not text.
 *
 * Today: tool returns text -> client renders.
 * Tomorrow: tool returns .holo bundle -> client (Quest, Vision Pro, browser
 *           R3F) hands off to renderer.
 *
 * Spec: task_1778114362909_zp7u - Hologram return type for MCP. Stacks on
 *       holo_hologram_send + the 8 holo_hologram_* tools wrapped by /hologram.
 *
 * Design notes:
 *   - The MCP `content` array entries are `{ type: 'text', text: string }`
 *     today. We don't break that - text is still emitted alongside. Instead
 *     the response carries an extra envelope `hologramContent` that R3F /
 *     Studio detect and route to the /hologram renderer.
 *   - `content_type` is stable across Quest 3 (R3F WebXR), Vision Pro
 *     (MV-HEVC), Looking Glass (quilt), and parallax fallback. Renderers
 *     pick a transport off `payload`.
 *   - Bundle bytes are NOT inlined - payload references the content-addressed
 *     hash so transports can stream from the Studio asset route. (W.067a:
 *     Content hashes must be stable cross-platform.)
 *
 * @version 0.1.0
 * @package @holoscript/core
 */

// =============================================================================
// VERSION + CONTENT TYPE CONSTANTS
// =============================================================================

/** Current schema version for the hologram MCP envelope. */
export const HOLOGRAM_MCP_VERSION = '0.1' as const;
export type HologramMcpVersion = typeof HOLOGRAM_MCP_VERSION;

/**
 * Canonical content_type for MCP tool responses whose payload IS a hologram.
 * Mirrors the IETF media-type pattern (`application/<vendor>+<format>`):
 *   - `application/holoscript+holo`  -> .holo composition bundle (text + assets)
 *   - `application/holoscript+quilt` -> Looking Glass quilt PNG
 *   - `application/holoscript+mvhevc`-> Apple Vision Pro spatial video
 *   - `application/holoscript+parallax` -> WebGL parallax fallback
 */
export const HOLOGRAM_CONTENT_TYPES = {
  holo: 'application/holoscript+holo',
  quilt: 'application/holoscript+quilt',
  mvhevc: 'application/holoscript+mvhevc',
  parallax: 'application/holoscript+parallax',
} as const;

export type HologramContentType =
  | typeof HOLOGRAM_CONTENT_TYPES.holo
  | typeof HOLOGRAM_CONTENT_TYPES.quilt
  | typeof HOLOGRAM_CONTENT_TYPES.mvhevc
  | typeof HOLOGRAM_CONTENT_TYPES.parallax;

const HOLOGRAM_CONTENT_TYPE_SET = new Set<string>(Object.values(HOLOGRAM_CONTENT_TYPES));

// =============================================================================
// PAYLOAD REFERENCES
//
// Bundles can be addressed three ways. Tools pick the lightest one that still
// works for the client. Bytes are deliberately NOT inlined - JSON-RPC over
// stdio chokes on >1MB payloads, and Studio already exposes a content-
// addressed asset route at `/api/hologram/<hash>/<asset>`.
// =============================================================================

/**
 * Reference by content-addressed hash. Renderer fetches assets from
 * `<studioBase>/api/hologram/<hash>/<asset>`. Preferred - survives session
 * restarts and is cache-friendly.
 */
export interface HologramBundleHashRef {
  kind: 'hash';
  hash: string;
  /**
   * Optional studio base URL hint for the renderer. When omitted the renderer
   * uses its configured default (Studio same-origin, or `HOLOGRAM_STUDIO_URL`
   * for cross-origin embeds).
   */
  studioBase?: string;
}

/**
 * Reference by URL. The asset is a single bundled artifact (e.g. an MV-HEVC
 * mp4 hosted on a CDN). Useful for one-shot tools that don't need the full
 * depth/normal/quilt set.
 */
export interface HologramBundleUrlRef {
  kind: 'url';
  url: string;
  /** MIME type of the asset behind `url` (e.g. `image/png`, `video/mp4`). */
  mimeType?: string;
}

/**
 * Reference by .holo source code. The renderer parses + compiles client-side
 * via @holoscript/core. Useful for `visualize_query_result` and other tools
 * that build a small composition on the fly without uploading bytes.
 */
export interface HologramBundleHoloCodeRef {
  kind: 'holo-code';
  /** Raw .holo composition source, parseable by @holoscript/core. */
  holoCode: string;
}

export type HologramBundleRef =
  | HologramBundleHashRef
  | HologramBundleUrlRef
  | HologramBundleHoloCodeRef;

// =============================================================================
// TARGETING / CLIENT HINTS
//
// Optional hints the renderer uses to pick a viewer (parallax / quilt /
// mvhevc). When omitted the client picks via `detectViewer()`.
// =============================================================================

export interface HologramRenderHints {
  /** Preferred viewer kind. The renderer may override based on capability. */
  preferredViewer?: 'parallax' | 'quilt' | 'mvhevc' | 'auto';
  /** [width, height] hint in CSS pixels for the viewport (default fits container). */
  size?: readonly [number, number];
  /** Background color for the viewer (CSS color string, default 'transparent'). */
  background?: string;
  /** Whether the renderer should auto-rotate / pan (default true). */
  animate?: boolean;
}

// =============================================================================
// METADATA
// =============================================================================

export interface HologramMcpMeta {
  /** Tool that produced this hologram (e.g. `visualize_query_result`). */
  producedBy: string;
  /** Creation timestamp (ISO8601). */
  createdAt: string;
  /** Optional human-readable label shown in the renderer header. */
  label?: string;
  /** Optional caption / description shown alongside the renderer. */
  caption?: string;
  /** Free-form key-value pairs. Renderer ignores unknown keys. */
  [extra: string]: unknown;
}

// =============================================================================
// THE ENVELOPE
//
// MCP tools return `HologramMcpResponse`. The MCP server packages it into the
// standard `{ content: [...] }` envelope at dispatch time and adds an extra
// `hologramContent` field that downstream clients (Studio, R3F renderer,
// Quest 3 client) detect and hand off to /hologram.
//
// Backwards-compatible: MCP clients that don't know about `hologramContent`
// still see a JSON-stringified text payload at `content[0].text`.
// =============================================================================

export interface HologramMcpResponse {
  /** Content type discriminant - clients dispatch on this. */
  content_type: HologramContentType;
  /** Bundle reference. Renderer resolves bytes from this. */
  payload: HologramBundleRef;
  /** Optional rendering hints. */
  hints?: HologramRenderHints;
  /** Provenance metadata. */
  meta: HologramMcpMeta;
  /** Human-readable summary for chat-only clients (always present). */
  text: string;
  /** Schema version - server rejects unknown majors. */
  version: HologramMcpVersion;
}

// =============================================================================
// MCP DISPATCH ENVELOPE
//
// Wraps `HologramMcpResponse` in the standard MCP `content` array shape so
// existing JSON-RPC clients still parse it. The `hologramContent` field is
// the new typed channel for hologram-aware clients.
// =============================================================================

export interface HologramMcpEnvelope {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  hologramContent: HologramMcpResponse;
  isError?: false;
}

// =============================================================================
// VALIDATION
// =============================================================================

export interface HologramMcpValidationError {
  path: string;
  message: string;
}

export interface HologramMcpValidationResult {
  ok: boolean;
  errors: HologramMcpValidationError[];
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validatePayload(
  payload: unknown,
  path: string,
  errors: HologramMcpValidationError[]
): void {
  if (!payload || typeof payload !== 'object') {
    errors.push({ path, message: 'payload must be an object' });
    return;
  }
  const ref = payload as Record<string, unknown>;
  const kind = ref.kind;
  if (kind === 'hash') {
    if (!isNonEmptyString(ref.hash)) {
      errors.push({ path: `${path}.hash`, message: 'hash must be a non-empty string' });
    }
    if (ref.studioBase !== undefined && !isNonEmptyString(ref.studioBase)) {
      errors.push({
        path: `${path}.studioBase`,
        message: 'studioBase must be a non-empty string when present',
      });
    }
  } else if (kind === 'url') {
    if (!isNonEmptyString(ref.url)) {
      errors.push({ path: `${path}.url`, message: 'url must be a non-empty string' });
    }
  } else if (kind === 'holo-code') {
    if (!isNonEmptyString(ref.holoCode)) {
      errors.push({
        path: `${path}.holoCode`,
        message: 'holoCode must be a non-empty string',
      });
    }
  } else {
    errors.push({
      path: `${path}.kind`,
      message: `kind must be one of 'hash' | 'url' | 'holo-code', got ${String(kind)}`,
    });
  }
}

/**
 * Validate a {@link HologramMcpResponse}. Returns structured errors instead of
 * throwing so MCP tools can surface them in the response.
 */
export function validateHologramMcpResponse(value: unknown): HologramMcpValidationResult {
  const errors: HologramMcpValidationError[] = [];
  if (!value || typeof value !== 'object') {
    return { ok: false, errors: [{ path: '', message: 'response must be an object' }] };
  }
  const r = value as Record<string, unknown>;

  if (typeof r.content_type !== 'string' || !HOLOGRAM_CONTENT_TYPE_SET.has(r.content_type)) {
    errors.push({
      path: 'content_type',
      message: `content_type must be one of ${Array.from(HOLOGRAM_CONTENT_TYPE_SET).join(', ')}`,
    });
  }

  validatePayload(r.payload, 'payload', errors);

  if (!r.meta || typeof r.meta !== 'object') {
    errors.push({ path: 'meta', message: 'meta must be an object' });
  } else {
    const m = r.meta as Record<string, unknown>;
    if (!isNonEmptyString(m.producedBy)) {
      errors.push({ path: 'meta.producedBy', message: 'meta.producedBy is required' });
    }
    if (!isNonEmptyString(m.createdAt)) {
      errors.push({ path: 'meta.createdAt', message: 'meta.createdAt is required' });
    }
  }

  if (!isNonEmptyString(r.text)) {
    errors.push({ path: 'text', message: 'text must be a non-empty string (chat-only fallback)' });
  }

  if (r.version !== HOLOGRAM_MCP_VERSION) {
    errors.push({
      path: 'version',
      message: `version must be exactly '${HOLOGRAM_MCP_VERSION}', got ${String(r.version)}`,
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Type-guard that narrows an arbitrary value to a {@link HologramMcpResponse}
 * if it passes validation. Useful for hot-path branching in renderers /
 * studio chat without re-stringifying validation errors.
 */
export function isHologramMcpResponse(value: unknown): value is HologramMcpResponse {
  return validateHologramMcpResponse(value).ok;
}

/**
 * Detect whether an MCP tool result envelope carries a hologram content type.
 * Renderers call this on every chat message before falling back to text.
 *
 * Accepts:
 *   - Raw {@link HologramMcpResponse} (e.g. when the server passes it through
 *     directly without wrapping)
 *   - {@link HologramMcpEnvelope} from the MCP dispatch layer
 *   - Standard MCP `{ content: [{ type:'text', text }] }` where text is JSON
 *     containing a `content_type` field. Used for backwards compat with
 *     clients that don't know about the typed channel.
 */
export function detectHologramContent(envelope: unknown): HologramMcpResponse | null {
  if (!envelope || typeof envelope !== 'object') return null;
  const obj = envelope as Record<string, unknown>;

  // Path 1: typed channel (post-dispatch envelope)
  if (obj.hologramContent && isHologramMcpResponse(obj.hologramContent)) {
    return obj.hologramContent;
  }

  // Path 2: raw response object
  if (isHologramMcpResponse(obj)) {
    return obj as unknown as HologramMcpResponse;
  }

  // Path 3: legacy text-only envelope - try to parse content[0].text as JSON
  const content = obj.content;
  if (Array.isArray(content) && content.length > 0) {
    const first = content[0] as Record<string, unknown> | undefined;
    if (first && first.type === 'text' && typeof first.text === 'string') {
      try {
        const parsed = JSON.parse(first.text);
        if (isHologramMcpResponse(parsed)) {
          return parsed as HologramMcpResponse;
        }
      } catch {
        // not JSON - fall through to null
      }
    }
  }

  return null;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a {@link HologramMcpResponse} with sensible defaults. Tools call this
 * instead of constructing the object literal so the schema version + ISO
 * timestamp stay in sync.
 */
export function buildHologramMcpResponse(input: {
  contentType: HologramContentType;
  payload: HologramBundleRef;
  text: string;
  producedBy: string;
  createdAt?: string;
  label?: string;
  caption?: string;
  hints?: HologramRenderHints;
  extraMeta?: Record<string, unknown>;
}): HologramMcpResponse {
  return {
    content_type: input.contentType,
    payload: input.payload,
    hints: input.hints,
    meta: {
      producedBy: input.producedBy,
      createdAt: input.createdAt ?? new Date().toISOString(),
      label: input.label,
      caption: input.caption,
      ...(input.extraMeta ?? {}),
    },
    text: input.text,
    version: HOLOGRAM_MCP_VERSION,
  };
}

/**
 * Wrap a {@link HologramMcpResponse} in the MCP dispatch envelope. The MCP
 * server's `_handleSingleToolLogic` calls this when a tool's return value
 * matches the hologram schema, so `holo_*` tools and tools like
 * `visualize_query_result` all get the same wire shape without each tool
 * having to know about the `content` array layout.
 */
export function wrapHologramMcpEnvelope(response: HologramMcpResponse): HologramMcpEnvelope {
  return {
    content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
    hologramContent: response,
  };
}
