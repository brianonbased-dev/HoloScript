/**
 * Studio's own origin, from configuration only (NEXTAUTH_URL, else
 * NEXT_PUBLIC_STUDIO_URL). Never from Host or X-Forwarded-Host, which a caller
 * (or a rewriting proxy such as Railway's edge) controls. Shared by quest-proof
 * capture (#607/#609), OAuth consent (#579) and Connected apps (#610).
 */
export function studioOwnOrigin(env: NodeJS.ProcessEnv = process.env): string | null {
  for (const v of [env.NEXTAUTH_URL, env.NEXT_PUBLIC_STUDIO_URL]) {
    if (!v) continue;
    try {
      return new URL(v).origin;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * A state-changing request from Studio's own pages: the Origin header must be
 * present and equal the configured Studio origin. A missing or "null" Origin is
 * refused, and so is everything when no Studio URL is configured (fail closed).
 * Host and X-Forwarded-Host are not consulted at all.
 */
export function isOwnOriginRequest(
  req: Request,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const own = studioOwnOrigin(env);
  const origin = req.headers.get('origin');
  if (!own || !origin || origin === 'null') return false;
  return origin === own;
}
