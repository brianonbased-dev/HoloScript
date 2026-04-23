/**
 * @holoscript/web-preview-plugin — iframe HTML surface bridge stub.
 *
 * Universal-IR matrix: docs/universal-ir-coverage.md (web-surface column)
 *
 * Status: STUB. Real iframe lifecycle + input-event routing are future work.
 * Scope declares the embed contract: URL, size, sandbox attrs, position in
 * .holo scene, expected traits on load.
 */

export interface WebPreviewEmbed {
  url: string;
  size: [number, number]; // logical px
  position?: [number, number, number]; // .holo world coords
  sandbox?: string[]; // iframe sandbox tokens: allow-scripts, allow-same-origin, etc.
  allow_mic?: boolean;
  allow_camera?: boolean;
  origin_whitelist?: string[]; // permitted postMessage origins
}

export interface HoloWebSurfaceEmission {
  trait: { kind: '@web_surface'; target_id: string; params: Record<string, unknown> };
  security_warnings: string[];
  effective_sandbox: string;
}

const DANGEROUS_TOKENS = ['allow-same-origin', 'allow-top-navigation'];
const DEFAULT_SANDBOX = ['allow-scripts', 'allow-forms'];

export function embedWebPreview(input: WebPreviewEmbed): HoloWebSurfaceEmission {
  const warnings: string[] = [];
  const sandbox = input.sandbox ?? DEFAULT_SANDBOX;
  for (const t of sandbox) {
    if (DANGEROUS_TOKENS.includes(t)) {
      warnings.push(`sandbox token '${t}' weakens isolation — justify in composition`);
    }
  }
  try {
    const u = new URL(input.url);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost') {
      warnings.push(`non-HTTPS embed URL (${u.protocol}) — spatial scene will block in production`);
    }
  } catch {
    warnings.push('URL did not parse as absolute URL');
  }
  if ((input.allow_mic || input.allow_camera) && !input.origin_whitelist?.length) {
    warnings.push('mic/camera allowed without origin_whitelist — accept-all is not OK for agent scenes');
  }
  return {
    trait: {
      kind: '@web_surface',
      target_id: input.url,
      params: {
        url: input.url,
        size: input.size,
        position: input.position ?? [0, 0, 0],
        sandbox,
        allow_mic: !!input.allow_mic,
        allow_camera: !!input.allow_camera,
        origin_whitelist: input.origin_whitelist ?? [],
      },
    },
    security_warnings: warnings,
    effective_sandbox: sandbox.join(' '),
  };
}
