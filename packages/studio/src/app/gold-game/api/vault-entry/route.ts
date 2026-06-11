import fs from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

/**
 * GET /gold-game/api/vault-entry?id=W.GOLD.343 — fetch one vault entry for
 * the gold-game entry browser. Ported verbatim from
 * examples/gold-game/server.cjs vaultEntry()/findEntryFile(), including the
 * path.resolve(VAULT) escape guard. lineage/provenance come from the
 * optional vault-ops module in the original; this port returns the same
 * empty shapes the original uses when vault-ops is absent.
 */
export const dynamic = 'force-dynamic';

const VAULT = process.env.GOLD_ROOT || 'D:/GOLD';

function normalizeEntryId(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/_/g, '.')
    .replace(/-/g, '.')
    .toUpperCase();
}

function entryStem(id: string): string {
  return normalizeEntryId(id).toLowerCase().replace(/\./g, '_') + '.md';
}

function findEntryFile(id: string): string | null {
  const wanted = entryStem(id);
  const roots = [
    'wisdom',
    'patterns',
    'gotchas',
    'architectures',
    'protocols',
    'bronze',
    'silver',
    'gold',
    'platinum',
    'diamond',
    'graduated',
  ];
  const seen = new Set<string>();
  const walk = (dir: string): string | null => {
    const resolved = path.resolve(dir);
    if (seen.has(resolved) || !resolved.startsWith(path.resolve(VAULT))) return null;
    seen.add(resolved);
    let items: fs.Dirent[] = [];
    try {
      items = fs.readdirSync(resolved, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const item of items) {
      if (item.name === '.git') continue;
      const p = path.join(resolved, item.name);
      if (item.isFile() && item.name.toLowerCase() === wanted) return p;
      if (item.isDirectory()) {
        const found = walk(p);
        if (found) return found;
      }
    }
    return null;
  };
  for (const root of roots) {
    const found = walk(path.join(VAULT, root));
    if (found) return found;
  }
  return null;
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const lines = String(markdown || '').split(/\r?\n/);
  if (lines[0] !== '---') return {};
  const out: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const idx = lines[i].indexOf(':');
    if (idx > 0) out[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }
  return out;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') ?? '';
  const normalized = normalizeEntryId(id);
  if (!/^[A-Z0-9]+(\.[A-Z0-9]+)+$/.test(normalized)) {
    return Response.json({
      connected: fs.existsSync(VAULT),
      id: normalized,
      found: false,
      error: 'invalid id',
    });
  }
  const file = findEntryFile(normalized);
  if (!file) {
    return Response.json({ connected: fs.existsSync(VAULT), id: normalized, found: false });
  }
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(VAULT, file).replace(/\\/g, '/');
  const metadata = parseFrontmatter(content);
  return Response.json({
    connected: true,
    found: true,
    id: normalized,
    vaultPath: VAULT,
    relativePath: rel,
    metadata,
    lineage: [],
    provenance: {},
    bytes: Buffer.byteLength(content),
    content,
  });
}
