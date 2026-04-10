import { NextResponse } from 'next/server';
import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { sharedScenes } from '@/db/schema';

interface HostedWorld {
  id: string;
  title: string;
  publishedAt: string;
  status: 'live';
  liveUrl: string;
  embedUrl: string;
}

const PUBLISH_DIR = path.join(process.cwd(), '.published');

function getBaseUrl(req: Request): string {
  return req.headers.get('origin') ?? '';
}

async function loadFromFilesystem(baseUrl: string): Promise<HostedWorld[]> {
  if (!existsSync(PUBLISH_DIR)) return [];
  const files = await readdir(PUBLISH_DIR);

  const out: HostedWorld[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const id = file.replace(/\.json$/, '');
    const raw = await readFile(path.join(PUBLISH_DIR, file), 'utf8');
    const parsed = JSON.parse(raw) as {
      publishedAt?: string;
      scene?: { metadata?: { name?: string } };
    };

    out.push({
      id,
      title: parsed.scene?.metadata?.name ?? `World ${id}`,
      publishedAt: parsed.publishedAt ?? new Date().toISOString(),
      status: 'live',
      liveUrl: `${baseUrl}/view/${id}`,
      embedUrl: `${baseUrl}/shared/${id}`,
    });
  }

  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

async function loadFromDatabase(baseUrl: string): Promise<HostedWorld[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select()
    .from(sharedScenes)
    .orderBy(sql`${sharedScenes.createdAt} desc`)
    .limit(50);

  return rows.map((row) => {
    const id = row.id.slice(0, 8);
    const parsed = JSON.parse(row.code) as { metadata?: { name?: string } };

    return {
      id,
      title: parsed.metadata?.name ?? `World ${id}`,
      publishedAt: row.createdAt.toISOString(),
      status: 'live' as const,
      liveUrl: `${baseUrl}/view/${id}`,
      embedUrl: `${baseUrl}/shared/${id}`,
    };
  });
}

export async function GET(req: Request) {
  const baseUrl = getBaseUrl(req);
  const fromDb = await loadFromDatabase(baseUrl);
  const worlds = fromDb.length > 0 ? fromDb : await loadFromFilesystem(baseUrl);

  return NextResponse.json({
    provider: 'studio-hosting',
    total: worlds.length,
    worlds,
  });
}
