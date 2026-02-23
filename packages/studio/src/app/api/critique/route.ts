import { NextRequest } from 'next/server';

/**
 * POST /api/critique — AI-powered scene critique.
 * Sends HoloScript code to a rule-based analyser and returns structured findings.
 */

export interface CritiqueFinding {
  id: string;
  category: 'performance' | 'naming' | 'missing-trait' | 'structure' | 'best-practice';
  severity: 'error' | 'warning' | 'tip';
  title: string;
  detail: string;
  line?: number;
  suggestion: string;
  snippet?: string;
}

export interface CritiqueResult {
  score: number;        // 0-100
  grade: string;        // A+ .. F
  summary: string;
  findings: CritiqueFinding[];
  objectCount: number;
  traitCoverage: number; // fraction of objects with at least one trait
}

function gradeFromScore(s: number) {
  if (s >= 95) return 'A+';
  if (s >= 88) return 'A';
  if (s >= 80) return 'B+';
  if (s >= 72) return 'B';
  if (s >= 65) return 'C+';
  if (s >= 55) return 'C';
  if (s >= 40) return 'D';
  return 'F';
}

function analyseCode(code: string): CritiqueResult {
  const lines = code.split('\n');
  const findings: CritiqueFinding[] = [];
  let score = 100;

  const objectLines: { name: string; line: number }[] = [];
  const traitedObjects = new Set<string>();
  lines.forEach((raw, i) => {
    const lineNum = i + 1;
    const objMatch = raw.trim().match(/^object\s+"([^"]+)"/);
    const traitMatch = raw.trim().match(/^@(\w+)/);
    if (objMatch) objectLines.push({ name: objMatch[1], line: lineNum });
    if (traitMatch && objectLines.length > 0) traitedObjects.add(objectLines[objectLines.length - 1].name);
  });

  const objectCount = objectLines.length;
  const traitCoverage = objectCount > 0 ? traitedObjects.size / objectCount : 1;

  if (objectCount > 40) {
    score -= 15;
    findings.push({
      id: 'perf-01', category: 'performance', severity: 'warning',
      title: 'High object count',
      detail: `${objectCount} objects detected. Scenes with >40 objects may impact GPU performance.`,
      suggestion: 'Consider grouping objects into @lod groups or using instancing for repeated geometry.',
    });
  }

  const genericNames = ['Object', 'Mesh', 'Box', 'Sphere', 'Cube', 'Plane', 'Group'];
  objectLines.forEach(({ name, line }) => {
    if (genericNames.some((g) => name === g || (name.startsWith(g + '_') && /\d+$/.test(name)))) {
      score -= 3;
      findings.push({
        id: `name-${line}`, category: 'naming', severity: 'tip',
        title: `Generic object name: "${name}"`,
        detail: 'Generic names make scenes harder to maintain and collaborate on.',
        line,
        suggestion: 'Rename to something descriptive, e.g. "WallNorth", "PlayerSpawn", "AmbientLight_01".',
      });
    }
  });

  objectLines.forEach(({ name, line }) => {
    if (!traitedObjects.has(name)) {
      score -= 5;
      findings.push({
        id: `trait-${line}`, category: 'missing-trait', severity: 'tip',
        title: `"${name}" has no traits`,
        detail: 'Objects without traits miss out on HoloScript\'s powerful behaviour system.',
        line,
        suggestion: 'Add at least @material, @physics, or @lod to enhance the object.',
        snippet: `  @material {\n    albedo: "#cccccc"\n    roughness: 0.5\n  }`,
      });
    }
  });

  if (!code.includes('environment') && !code.includes('@environment')) {
    score -= 8;
    findings.push({
      id: 'struct-01', category: 'structure', severity: 'warning',
      title: 'No environment block',
      detail: 'Scenes without an environment block use engine defaults for lighting and skybox.',
      suggestion: 'Add an environment block to control skybox, ambient light, fog, and shadow quality.',
      snippet: `environment {\n  skybox: "studio"\n  ambient_light: 0.5\n  shadows: true\n}`,
    });
  }

  if (objectCount > 15 && !code.includes('@lod')) {
    score -= 8;
    findings.push({
      id: 'bp-01', category: 'best-practice', severity: 'warning',
      title: 'No @lod traits in large scene',
      detail: `Scene has ${objectCount} objects but no @lod trait. All objects render at full detail at any distance.`,
      suggestion: 'Add @lod to large/complex objects to reduce draw calls at distance.',
      snippet: `  @lod {\n    high: 0\n    medium: 15\n    low: 40\n    culled: 100\n  }`,
    });
  }

  lines.forEach((raw, i) => {
    const lineNum = i + 1;
    if (/\blight\b/i.test(raw) && raw.trim().match(/^(object|light)\s+"/i)) {
      const block = lines.slice(i, i + 10).join('\n');
      if (!block.includes('intensity')) {
        score -= 3;
        findings.push({
          id: `light-${lineNum}`, category: 'best-practice', severity: 'tip',
          title: 'Light without explicit intensity',
          detail: 'Light objects without an intensity property use the engine default (1.0).',
          line: lineNum,
          suggestion: 'Set intensity explicitly for predictable lighting across render targets.',
          snippet: `  intensity: 1.5`,
        });
      }
    }
  });

  score = Math.max(0, Math.min(100, score));
  const summary = findings.length === 0
    ? 'Excellent scene! No issues found.'
    : `Found ${findings.length} finding${findings.length !== 1 ? 's' : ''} across ${[...new Set(findings.map((f) => f.category))].length} categories.`;

  return { score, grade: gradeFromScore(score), summary, findings, objectCount, traitCoverage };
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { code?: string };
  const code = (body.code ?? '').trim();
  if (!code) return Response.json({ error: 'No code provided' }, { status: 400 });
  const result = analyseCode(code);
  return Response.json(result);
}
