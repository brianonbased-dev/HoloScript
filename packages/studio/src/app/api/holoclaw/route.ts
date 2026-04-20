export const maxDuration = 300;

import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketplaceMeta {
  published: true;
  displayTitle: string;
  category: string;
  summary: string;
}

interface SkillMeta {
  name: string;
  fileName: string;
  path: string;
  size: number;
  modifiedAt: string;
  actions: string[];
  traits: string[];
  states: number;
  description: string;
  marketplace?: MarketplaceMeta;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSkillMeta(
  content: string,
  filePath: string
): Omit<SkillMeta, 'size' | 'modifiedAt'> {
  const fileName = path.basename(filePath);
  const nameMatch = content.match(/composition\s+"([^"]+)"/);
  const name = nameMatch ? nameMatch[1] : fileName.replace(/\.hsplus$/, '');

  const actions: string[] = [];
  const actionRe = /action\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = actionRe.exec(content)) !== null) {
    actions.push(m[1]);
  }

  const traits: string[] = [];
  const traitRe = /@(\w+)/g;
  const seenTraits = new Set<string>();
  while ((m = traitRe.exec(content)) !== null) {
    const t = m[1];
    if (!seenTraits.has(t) && t !== 'absorb') {
      seenTraits.add(t);
      traits.push(t);
    }
  }

  const stateRe = /state\s+\w+/g;
  let stateCount = 0;
  while (stateRe.exec(content) !== null) stateCount++;

  const descMatch = content.match(/\/\/\s*(.+)/);
  const description = descMatch ? descMatch[1].trim() : '';

  return { name, fileName, path: filePath, actions, traits, states: stateCount, description };
}

function loadPublishedCatalog(rootDir: string): Map<string, MarketplaceMeta> {
  const catalogPath = path.join(rootDir, 'compositions', 'holoclaw-published-skills.json');
  if (!fs.existsSync(catalogPath)) return new Map();

  try {
    const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf-8')) as {
      skills?: Array<{
        compositionName?: string;
        fileName?: string;
        displayTitle?: string;
        category?: string;
        summary?: string;
      }>;
    };
    const map = new Map<string, MarketplaceMeta>();
    for (const e of raw.skills || []) {
      const file = (e.fileName || `${e.compositionName || ''}.hsplus`).trim();
      if (!file || !e.displayTitle || !e.category || !e.summary) continue;
      const meta: MarketplaceMeta = {
        published: true,
        displayTitle: e.displayTitle,
        category: e.category,
        summary: e.summary,
      };
      map.set(file, meta);
      if (e.compositionName) map.set(`${e.compositionName}.hsplus`, meta);
    }
    return map;
  } catch {
    return new Map();
  }
}

function attachMarketplaceMeta(skills: SkillMeta[], catalog: Map<string, MarketplaceMeta>): SkillMeta[] {
  return skills.map((s) => {
    const fromFile = catalog.get(s.fileName);
    const fromName = catalog.get(`${s.name}.hsplus`);
    const m = fromFile || fromName;
    return m ? { ...s, marketplace: m } : s;
  });
}

function discoverSkills(rootDir: string): SkillMeta[] {
  const skillsDirs = [
    path.join(rootDir, 'compositions', 'skills'),
    path.join(rootDir, 'compositions'),
  ];

  const skills: SkillMeta[] = [];
  const seen = new Set<string>();

  for (const dir of skillsDirs) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.hsplus'));
    for (const file of files) {
      if (seen.has(file)) continue;
      seen.add(file);
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const meta = extractSkillMeta(content, path.relative(rootDir, fullPath).replace(/\\/g, '/'));
      skills.push({
        ...meta,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }

  return skills.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
}

// ---------------------------------------------------------------------------
// GET /api/holoclaw — list installed skills
// ---------------------------------------------------------------------------

export async function GET() {
  const repoRoot = process.env.HOLOSCRIPT_REPO_ROOT || process.cwd();
  const catalog = loadPublishedCatalog(repoRoot);
  const skills = attachMarketplaceMeta(discoverSkills(repoRoot), catalog);
  const publishedCount = skills.filter((s) => s.marketplace?.published).length;
  return NextResponse.json({ skills, total: skills.length, publishedCount });
}

// ---------------------------------------------------------------------------
// POST /api/holoclaw — install a new skill
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  const repoRoot = process.env.HOLOSCRIPT_REPO_ROOT || process.cwd();
  const skillsDir = path.join(repoRoot, 'compositions', 'skills');

  if (!fs.existsSync(skillsDir)) {
    fs.mkdirSync(skillsDir, { recursive: true });
  }

  const body = (await request.json()) as { name?: string; content?: string };
  if (!body.name || !body.content) {
    return NextResponse.json({ error: 'name and content are required' }, { status: 400 });
  }

  const safeName = body.name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  if (!safeName) {
    return NextResponse.json({ error: 'invalid skill name' }, { status: 400 });
  }

  const targetPath = path.join(skillsDir, `${safeName}.hsplus`);
  fs.writeFileSync(targetPath, body.content, 'utf-8');

  return NextResponse.json({
    installed: true,
    path: `compositions/skills/${safeName}.hsplus`,
    name: safeName,
  });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
