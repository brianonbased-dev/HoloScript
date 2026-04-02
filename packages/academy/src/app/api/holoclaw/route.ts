import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  const skills = discoverSkills(repoRoot);
  return NextResponse.json({ skills, total: skills.length });
}

// ---------------------------------------------------------------------------
// POST /api/holoclaw — disabled in Academy (Lite mode)
// ---------------------------------------------------------------------------

export async function POST() {
  return NextResponse.json(
    {
      error: 'HoloClaw Academy Lite is read-only. Skill installation is disabled here.',
      mode: 'academy-lite',
      use_instead: {
        studio_api: '/api/holoclaw (Studio app)',
        cli: 'holoscript daemon compositions/holoclaw.hsplus --always-on --debug',
      },
    },
    { status: 405 }
  );
}
