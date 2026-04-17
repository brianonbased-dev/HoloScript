import { NextRequest, NextResponse } from 'next/server';
import {
  buildGistPublicationManifest,
  serializeGistPublicationManifest,
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
 * When `GIST_MANIFEST_REQUIRE_X402=true`, reject requests without a non-empty `x402Receipt`
 * (HTTP 402 Payment Required). Use for publish tiers that mandate an economic anchor.
 */
function requireX402Enabled(): boolean {
  return process.env.GIST_MANIFEST_REQUIRE_X402 === 'true' || process.env.GIST_MANIFEST_REQUIRE_X402 === '1';
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
    if (requireX402Enabled()) {
      if (!x402Receipt || typeof x402Receipt !== 'object' || Object.keys(x402Receipt).length === 0) {
        return NextResponse.json(
          { error: 'x402Receipt is required for this deployment tier (GIST_MANIFEST_REQUIRE_X402)' },
          { status: 402 }
        );
      }
    }

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
