import { NextRequest } from 'next/server';

/**
 * GET /api/assets?q=&category=&page=
 *
 * Returns a paginated catalog of HDR environments and GLTF model assets.
 * Seeded with a curated list of public-domain / CC0 assets.
 */

type AssetCategory = 'model' | 'hdr' | 'texture' | 'audio';

interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  tags: string[];
  thumbnail: string;   // URL or placeholder
  url: string;         // download / embed URL
  format: string;
  sizeKb: number;
  creator: string;
  license: string;
}

const SEED_ASSETS: Asset[] = [
  { id: 'a1', name: 'Damaged Helmet', category: 'model', tags: ['sci-fi', 'prop', 'pbr'], thumbnail: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/screenshot/screenshot.png', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/DamagedHelmet/glTF/DamagedHelmet.gltf', format: 'gltf', sizeKb: 2340, creator: 'Khronos', license: 'CC BY 4.0' },
  { id: 'a2', name: 'Flight Helmet', category: 'model', tags: ['prop', 'pbr', 'aviation'], thumbnail: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/FlightHelmet/screenshot/screenshot.jpg', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/FlightHelmet/glTF/FlightHelmet.gltf', format: 'gltf', sizeKb: 8100, creator: 'Khronos', license: 'CC BY 4.0' },
  { id: 'a3', name: 'Antique Camera', category: 'model', tags: ['vintage', 'prop', 'pbr'], thumbnail: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/AntiqueCamera/screenshot/screenshot.jpg', url: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/main/2.0/AntiqueCamera/glTF/AntiqueCamera.gltf', format: 'gltf', sizeKb: 3200, creator: 'Khronos', license: 'CC BY 4.0' },
  { id: 'a4', name: 'Sci-Fi Fighter Jet', category: 'model', tags: ['sci-fi', 'vehicle'], thumbnail: '', url: '', format: 'gltf', sizeKb: 4500, creator: 'OpenGameArt', license: 'CC0' },
  { id: 'a5', name: 'Medieval Castle', category: 'model', tags: ['architecture', 'medieval', 'environment'], thumbnail: '', url: '', format: 'gltf', sizeKb: 12000, creator: 'OpenGameArt', license: 'CC0' },
  { id: 'a6', name: 'Park Bench', category: 'model', tags: ['furniture', 'outdoor', 'urban'], thumbnail: '', url: '', format: 'gltf', sizeKb: 450, creator: 'Poly Haven', license: 'CC0' },
  { id: 'h1', name: 'Sunlit Studio', category: 'hdr', tags: ['interior', 'soft', 'studio'], thumbnail: '', url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr', format: 'hdr', sizeKb: 2048, creator: 'Poly Haven', license: 'CC0' },
  { id: 'h2', name: 'Kloppenheim', category: 'hdr', tags: ['outdoor', 'overcast', 'nature'], thumbnail: '', url: 'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloppenheim_02_1k.hdr', format: 'hdr', sizeKb: 3072, creator: 'Poly Haven', license: 'CC0' },
  { id: 'h3', name: 'Neon Alley', category: 'hdr', tags: ['urban', 'night', 'neon', 'cyberpunk'], thumbnail: '', url: '', format: 'hdr', sizeKb: 4096, creator: 'HdriHaven', license: 'CC0' },
  { id: 'h4', name: 'Desert Dusk', category: 'hdr', tags: ['outdoor', 'desert', 'sunset'], thumbnail: '', url: '', format: 'hdr', sizeKb: 2560, creator: 'Poly Haven', license: 'CC0' },
  { id: 't1', name: 'Rusted Metal', category: 'texture', tags: ['metal', 'pbr', 'industrial'], thumbnail: '', url: '', format: 'png', sizeKb: 1024, creator: 'Poly Haven', license: 'CC0' },
  { id: 't2', name: 'Mossy Stone', category: 'texture', tags: ['stone', 'nature', 'pbr'], thumbnail: '', url: '', format: 'png', sizeKb: 1024, creator: 'Poly Haven', license: 'CC0' },
];

declare global { var __assetCatalog__: Asset[] | undefined; }
const catalog: Asset[] = globalThis.__assetCatalog__ ?? (globalThis.__assetCatalog__ = [...SEED_ASSETS]);

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const q = searchParams.get('q')?.toLowerCase() ?? '';
  const category = searchParams.get('category') as AssetCategory | null;
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const perPage = 12;

  let results = catalog;
  if (q) results = results.filter((a) => a.name.toLowerCase().includes(q) || a.tags.some((t) => t.includes(q)));
  if (category) results = results.filter((a) => a.category === category);

  const total = results.length;
  const items = results.slice((page - 1) * perPage, page * perPage);

  return Response.json({ items, total, page, perPage, pages: Math.ceil(total / perPage) });
}
