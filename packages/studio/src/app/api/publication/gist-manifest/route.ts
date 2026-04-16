import { NextRequest, NextResponse } from 'next/server';
import {
  buildGistPublicationManifest,
  serializeGistPublicationManifest,
} from '../../../../../../core/src/export/GistPublicationManifest';

export const maxDuration = 30;

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
    return NextResponse.json({
      ok: true,
      manifest,
      /** Suggested path when committing to a repo or gist bundle */
      suggestedPath: '.holoscript/gist-publication.manifest.json',
      json,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to build manifest' },
      { status: 500 }
    );
  }
}
