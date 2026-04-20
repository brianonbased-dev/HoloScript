import { NextRequest, NextResponse } from 'next/server';
import {
  buildGistPublicationManifest,
  serializeGistPublicationManifest,
  type Film3dAttestationBinding,
} from '../../../../../../core/src/export/GistPublicationManifest';

export const maxDuration = 30;

function resolveHolomeshEndpoint(explicit?: string): string | undefined {
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const fromEnv = process.env.HOLOMESH_SCENE_INGEST_URL;
  return fromEnv && fromEnv.trim().length > 0 ? fromEnv.trim() : undefined;
}

async function deployToHolomesh(params: {
  endpoint: string;
  apiKey?: string;
  room: string;
  title?: string;
  gistId?: string;
  gistUrl?: string;
  scene: Record<string, unknown>;
  manifest: Record<string, unknown>;
}): Promise<{ deployed: true; status: number; response: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = params.apiKey || process.env.HOLOMESH_API_KEY;
  if (token && token.trim().length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(params.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      source: 'studio-gist-publication',
      room: params.room,
      title: params.title,
      gist_id: params.gistId,
      gist_url: params.gistUrl,
      scene: params.scene,
      manifest: params.manifest,
    }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(`HoloMesh deploy failed (${response.status})`);
  }

  return {
    deployed: true,
    status: response.status,
    response: payload,
  };
}

/**
 * Legacy: when `GIST_MANIFEST_REQUIRE_X402=true`, require a non-empty `x402Receipt`.
 * Prefer `GIST_MANIFEST_X402_TIER` for explicit policy (see below).
 */
function requireX402Enabled(): boolean {
  return process.env.GIST_MANIFEST_REQUIRE_X402 === 'true' || process.env.GIST_MANIFEST_REQUIRE_X402 === '1';
}

type X402Tier = 'off' | 'required' | 'strict';

/**
 * Tiered x402 enforcement (Trust / sovereign origination):
 * - `off` — optional x402 (default)
 * - `required` — non-empty `x402Receipt` object (same as legacy REQUIRE flag)
 * - `strict` — receipt must include non-empty `payment_id` and `network`
 *
 * `GIST_MANIFEST_X402_TIER` wins over legacy when set to `off` or `strict`.
 * When unset, legacy `GIST_MANIFEST_REQUIRE_X402` maps to `required`.
 */
function getX402Tier(): X402Tier {
  const tier = process.env.GIST_MANIFEST_X402_TIER?.trim().toLowerCase();
  if (tier === 'strict') return 'strict';
  if (tier === 'off' || tier === 'none') return 'off';
  if (tier === 'required' || tier === 'standard') return 'required';
  if (requireX402Enabled()) return 'required';
  return 'off';
}

function receiptIsNonEmpty(o: unknown): o is Record<string, unknown> {
  return o !== null && typeof o === 'object' && !Array.isArray(o) && Object.keys(o as object).length > 0;
}

function strictX402ReceiptValid(o: Record<string, unknown>): boolean {
  const pid = o.payment_id;
  const net = o.network;
  return typeof pid === 'string' && pid.trim().length > 0 && typeof net === 'string' && net.trim().length > 0;
}

function normalizeFilm3dAttestation(raw: unknown): Film3dAttestationBinding | undefined {
  if (!receiptIsNonEmpty(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: Film3dAttestationBinding = {};
  if (typeof o.scheme === 'string' && o.scheme.trim()) {
    out.scheme = o.scheme.trim().slice(0, 128);
  }
  if (typeof o.session_id === 'string' && o.session_id.trim()) {
    out.session_id = o.session_id.trim().slice(0, 256);
  }
  if (typeof o.captured_at_iso === 'string' && o.captured_at_iso.trim()) {
    out.captured_at_iso = o.captured_at_iso.trim().slice(0, 64);
  }
  if (
    o.device_summary !== null &&
    typeof o.device_summary === 'object' &&
    !Array.isArray(o.device_summary)
  ) {
    out.device_summary = o.device_summary as Record<string, unknown>;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * POST /api/publication/gist-manifest
 *
 * Builds `holoscript_publication_manifest_version` JSON that binds
 * `provenance_receipt` (Loro / room), optional `x402_receipt`, optional `xr_metrics`,
 * and v0 `provenance_semiring_digest` (SHA-256 over canonical room + Loro + xr_metrics).
 *
 * Body: {
 *   room: string;
 *   loroDocVersion: Record<string, unknown>;
 *   x402Receipt?: { payment_id?, tx_hash?, network?, ... };
 *   title?: string;
 *   primaryAssetSha256?: string;
 *   xrMetrics?: Record<string, unknown>;
 *   film3dAttestation?: { scheme?, session_id?, captured_at_iso?, device_summary? };
 *   includeSemiringDigest?: boolean;
 *   deployToHolomesh?: boolean;
 *   holomesh?: {
 *     endpoint?: string;
 *     apiKey?: string;
 *     scene?: Record<string, unknown>;
 *     gistId?: string;
 *     gistUrl?: string;
 *   };
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const room = body.room;
    const loroDocVersion = body.loroDocVersion;
    if (typeof room !== 'string' || !room.length) {
      return NextResponse.json({ error: 'room (non-empty string) is required' }, { status: 400 });
    }
    if (loroDocVersion === null || typeof loroDocVersion !== 'object' || Array.isArray(loroDocVersion)) {
      return NextResponse.json({ error: 'loroDocVersion (object) is required' }, { status: 400 });
    }

    const x402Receipt = body.x402Receipt as Record<string, unknown> | undefined;
    const x402Tier = getX402Tier();

    if (x402Tier === 'required') {
      if (!receiptIsNonEmpty(x402Receipt)) {
        return NextResponse.json(
          {
            error: 'x402Receipt is required for this publication tier',
            x402_tier: 'required',
          },
          { status: 402 }
        );
      }
    } else if (x402Tier === 'strict') {
      if (!receiptIsNonEmpty(x402Receipt) || !strictX402ReceiptValid(x402Receipt)) {
        return NextResponse.json(
          {
            error:
              'x402Receipt must include non-empty payment_id and network for strict tier (GIST_MANIFEST_X402_TIER=strict)',
            x402_tier: 'strict',
          },
          { status: 402 }
        );
      }
    }

    const film3dAttestation = normalizeFilm3dAttestation(body.film3dAttestation);

    const xrRaw = body.xrMetrics;
    const xrMetrics =
      xrRaw !== null && xrRaw !== undefined && typeof xrRaw === 'object' && !Array.isArray(xrRaw)
        ? (xrRaw as Record<string, unknown>)
        : undefined;

    const manifest = buildGistPublicationManifest({
      room,
      loroDocVersion: loroDocVersion as Record<string, unknown>,
      x402Receipt: (x402Receipt as Record<string, unknown> | undefined) ?? undefined,
      title: typeof body.title === 'string' ? body.title : undefined,
      primaryAssetSha256: typeof body.primaryAssetSha256 === 'string' ? body.primaryAssetSha256 : undefined,
      xrMetrics,
      film3dAttestation,
      includeSemiringDigest: body.includeSemiringDigest === false ? false : undefined,
    });

    const json = serializeGistPublicationManifest(manifest);

    const deployRequested = body.deployToHolomesh === true;
    let deployment:
      | {
          deployed: true;
          endpoint: string;
          status: number;
          response: unknown;
        }
      | undefined;

    if (deployRequested) {
      const holomesh =
        body.holomesh !== null && typeof body.holomesh === 'object' && !Array.isArray(body.holomesh)
          ? (body.holomesh as Record<string, unknown>)
          : {};

      const endpoint = resolveHolomeshEndpoint(
        typeof holomesh.endpoint === 'string' ? holomesh.endpoint : undefined
      );

      if (!endpoint) {
        return NextResponse.json(
          { error: 'holomesh.endpoint or HOLOMESH_SCENE_INGEST_URL is required when deployToHolomesh=true' },
          { status: 400 }
        );
      }

      const scene = holomesh.scene;
      if (scene === null || typeof scene !== 'object' || Array.isArray(scene)) {
        return NextResponse.json(
          { error: 'holomesh.scene (object) is required when deployToHolomesh=true' },
          { status: 400 }
        );
      }

      try {
        const deployResult = await deployToHolomesh({
          endpoint,
          apiKey: typeof holomesh.apiKey === 'string' ? holomesh.apiKey : undefined,
          room,
          title: typeof body.title === 'string' ? body.title : undefined,
          gistId: typeof holomesh.gistId === 'string' ? holomesh.gistId : undefined,
          gistUrl: typeof holomesh.gistUrl === 'string' ? holomesh.gistUrl : undefined,
          scene: scene as Record<string, unknown>,
          manifest: manifest as unknown as Record<string, unknown>,
        });

        deployment = {
          deployed: true,
          endpoint,
          status: deployResult.status,
          response: deployResult.response,
        };
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Failed to deploy scene to HoloMesh' },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      ok: true,
      manifest,
      /** Suggested path when committing to a repo or gist bundle */
      suggestedPath: '.holoscript/gist-publication.manifest.json',
      json,
      deployment,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build manifest' },
      { status: 500 }
    );
  }
}
