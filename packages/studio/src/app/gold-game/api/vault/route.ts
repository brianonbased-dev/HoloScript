import fs from 'node:fs';
import path from 'node:path';

/**
 * GET /gold-game/api/vault — live GOLD-vault state for the gold-game banner.
 *
 * Ported verbatim from examples/gold-game/server.cjs vaultState(). On
 * machines without the vault (Railway), returns connected:false and the
 * game falls back to its embedded snapshot — graceful by design.
 */
export const dynamic = 'force-dynamic';

const VAULT = process.env.GOLD_ROOT || 'D:/GOLD';

export async function GET() {
  const tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as const;
  const counts: Record<string, number> = {};
  for (const t of tiers) {
    try {
      const dir = path.join(VAULT, t);
      counts[t] = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => f.endsWith('.md')).length
        : 0;
    } catch {
      counts[t] = 0;
    }
  }
  let total: string | null = null;
  let asOf: string | null = null;
  try {
    const idx = fs.readFileSync(path.join(VAULT, 'INDEX.md'), 'utf8');
    const m = idx.match(/\*\*([\d,]+)\s+entries\*\*/);
    if (m) total = m[1];
    const d = idx.match(/Last updated\*\*:\s*([\d-]+)/);
    if (d) asOf = d[1];
  } catch {
    // vault not on this machine
  }
  return Response.json({
    connected: fs.existsSync(VAULT),
    vaultPath: VAULT,
    total,
    asOf,
    tierDirCounts: counts,
  });
}
