import { NextRequest } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { extractTraits } from '@holoscript/std';

/**
 * GET /api/examples
 * Scans the examples/ directory for .holo files and returns metadata.
 *
 * Query params:
 *   q        — search query (matches filename, category, or first-line description)
 *   category — filter by parent directory (quickstart, platforms, real-world, etc.)
 */

interface ExampleFile {
  id: string;
  name: string;
  filename: string;
  category: string;
  description: string;
  sizeBytes: number;
  code: string;
  traits: string[];
}

interface ExamplesResponse {
  examples: ExampleFile[];
  categories: string[];
  total: number;
}

// Cache: scan once per server lifetime (examples directory rarely changes)
let cachedExamples: ExampleFile[] | null = null;
let cachedCategories: string[] | null = null;

function findExamplesDir(): string {
  // Walk up from studio package to monorepo root
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'examples');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  // Fallback for monorepo layout
  const monoCandidate = path.resolve(process.cwd(), '../../examples');
  if (fs.existsSync(monoCandidate)) return monoCandidate;
  return '';
}

function extractDescription(code: string): string {
  // Try to extract from first comment
  const lines = code.split('\n');
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//')) {
      const desc = trimmed.replace(/^\/\/\s*/, '').trim();
      if (desc.length > 5) return desc;
    }
    if (trimmed.startsWith('/*')) {
      const desc = trimmed
        .replace(/^\/\*\s*/, '')
        .replace(/\s*\*\/$/, '')
        .trim();
      if (desc.length > 5) return desc;
    }
  }
  return '';
}

function prettifyName(filename: string): string {
  return filename
    .replace(/\.holo$/, '')
    .replace(/^\d+-/, '') // Remove leading numbers like "1-"
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function scanExamples(): { examples: ExampleFile[]; categories: string[] } {
  if (cachedExamples && cachedCategories) {
    return { examples: cachedExamples, categories: cachedCategories };
  }

  const examplesDir = findExamplesDir();
  if (!examplesDir) {
    return { examples: [], categories: [] };
  }

  const examples: ExampleFile[] = [];
  const categorySet = new Set<string>();

  function walkDir(dir: string, categoryPrefix: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath, entry.name);
      } else if (entry.name.endsWith('.holo')) {
        try {
          const code = fs.readFileSync(fullPath, 'utf-8');
          const category = categoryPrefix || 'root';
          categorySet.add(category);
          examples.push({
            id: `${category}/${entry.name}`.replace(/[^a-zA-Z0-9/_.-]/g, '_'),
            name: prettifyName(entry.name),
            filename: entry.name,
            category,
            description: extractDescription(code) || `${prettifyName(entry.name)} example`,
            sizeBytes: Buffer.byteLength(code, 'utf-8'),
            code,
            traits: extractTraits(code).slice(0, 12),
          });
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  walkDir(examplesDir, '');

  // Sort: quickstart first, then alphabetical
  const priority = ['quickstart', 'sample-projects', 'real-world', 'platforms', 'templates'];
  examples.sort((a, b) => {
    const ai = priority.indexOf(a.category);
    const bi = priority.indexOf(b.category);
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.name.localeCompare(b.name);
  });

  cachedExamples = examples;
  cachedCategories = [...categorySet].sort(
    (a, b) =>
      (priority.indexOf(a) === -1 ? 99 : priority.indexOf(a)) -
      (priority.indexOf(b) === -1 ? 99 : priority.indexOf(b))
  );

  return { examples: cachedExamples, categories: cachedCategories };
}

export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').toLowerCase();
  const category = request.nextUrl.searchParams.get('category') ?? '';

  const { examples, categories } = scanExamples();
  let filtered = examples;

  if (category) {
    filtered = filtered.filter((e) => e.category === category);
  }
  if (q) {
    filtered = filtered.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.filename.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.traits.some((t) => t.toLowerCase().includes(q))
    );
  }

  const result: ExamplesResponse = {
    examples: filtered,
    categories,
    total: filtered.length,
  };

  return Response.json(result);
}
