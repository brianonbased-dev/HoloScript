import { NextRequest } from 'next/server';
import { SCENE_TEMPLATES } from '@/lib/scene/sceneTemplates';

/**
 * GET /api/templates?category=&q=
 * Returns HoloScript scene templates from the canonical SCENE_TEMPLATES source.
 * Both client and API now serve the same template catalog.
 */

interface ApiTemplate {
  id: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  thumbnail: string;
  code: string;
  objectCount: number;
  complexity: 'simple' | 'medium' | 'complex';
}

function enrichTemplate(t: {
  id: string;
  name: string;
  category: string;
  tags: string[];
  description: string;
  thumbnail: string;
  code: string;
}): ApiTemplate {
  const objectMatches = t.code.match(/object\s+"/g);
  const objectCount = objectMatches ? objectMatches.length : 1;
  const complexity: 'simple' | 'medium' | 'complex' =
    objectCount <= 3 ? 'simple' : objectCount <= 7 ? 'medium' : 'complex';
  return { ...t, objectCount, complexity };
}

declare global {
  var __templateCatalog__: ApiTemplate[] | undefined;
}
const catalog =
  globalThis.__templateCatalog__ ??
  (globalThis.__templateCatalog__ = SCENE_TEMPLATES.map(enrichTemplate));

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const category = searchParams.get('category');

  let results = catalog;
  if (q)
    results = results.filter(
      (t) => t.name.toLowerCase().includes(q) || t.tags.some((tag) => tag.includes(q))
    );
  if (category) results = results.filter((t) => t.category === category);

  const categories = [...new Set(catalog.map((t) => t.category))];
  return Response.json({ templates: results, total: results.length, categories });
}
