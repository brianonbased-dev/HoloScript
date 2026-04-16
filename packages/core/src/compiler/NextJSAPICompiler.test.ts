import { describe, it, expect } from 'vitest';
import { compileToNextJSAPI, compileAllToNextJSAPI } from './NextJSAPICompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../parser/HoloCompositionTypes';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Minimal valid HoloComposition */
function makeComposition(name: string, overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'HoloComposition',
    name,
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    imports: [],
    ...overrides,
  } as unknown as HoloComposition;
}

/** Minimal HoloObjectDecl with an @http trait */
function makeHttpObject(
  name: string,
  method: string,
  extra: Record<string, unknown> = {}
): HoloObjectDecl {
  const httpTrait: HoloObjectTrait = {
    type: 'ObjectTrait',
    name: 'http',
    config: { method },
  } as unknown as HoloObjectTrait;

  const properties = Object.entries(extra).map(([key, value]) => ({
    type: 'ObjectProperty' as const,
    key,
    value: value as any,
  }));

  return {
    type: 'ObjectDecl',
    name,
    traits: [httpTrait],
    properties,
    children: [],
  } as unknown as HoloObjectDecl;
}

/** Root-level @http trait on a composition */
function withRootHttpTrait(
  comp: HoloComposition,
  config: Record<string, unknown>
): HoloComposition {
  return {
    ...comp,
    traits: [
      {
        type: 'ObjectTrait',
        name: 'http',
        config,
      } as unknown as HoloObjectTrait,
    ],
  };
}

// ── Route segment / name derivation ─────────────────────────────────────────

describe('NextJSAPICompiler — route segment derivation', () => {
  it('converts PascalCase to kebab-case', () => {
    const result = compileToNextJSAPI(makeComposition('EnvironmentPresetsAPI'));
    expect(result.path).toBe('api/environment-presets/route.ts');
  });

  it('strips trailing "API" suffix', () => {
    const result = compileToNextJSAPI(makeComposition('AudioPresetsAPI'));
    expect(result.path).toBe('api/audio-presets/route.ts');
  });

  it('handles simple names without suffix', () => {
    const result = compileToNextJSAPI(makeComposition('Materials'));
    expect(result.path).toBe('api/materials/route.ts');
  });

  it('handles ALL_CAPS abbreviation like "LOD"', () => {
    const result = compileToNextJSAPI(makeComposition('LodPresetsAPI'));
    expect(result.path).toBe('api/lod-presets/route.ts');
  });

  it('respects explicit apiRoute override', () => {
    const result = compileToNextJSAPI(makeComposition('SomeAPI'), {
      apiRoute: '/api/custom-route',
    });
    expect(result.path).toBe('api/custom-route/route.ts');
  });

  it('strips leading /api/ from apiRoute override', () => {
    const result = compileToNextJSAPI(makeComposition('SomeAPI'), {
      apiRoute: 'custom-segment',
    });
    expect(result.path).toBe('api/custom-segment/route.ts');
  });

  it('respects custom outputDir', () => {
    const result = compileToNextJSAPI(makeComposition('HealthAPI'), {
      outputDir: 'src/app/api',
    });
    expect(result.path).toBe('src/app/api/health/route.ts');
  });
});

// ── Fallback handler ─────────────────────────────────────────────────────────

describe('NextJSAPICompiler — fallback GET stub', () => {
  it('emits a GET stub when no @http traits are present', () => {
    const result = compileToNextJSAPI(makeComposition('DataAPI'));
    expect(result.code).toContain('export async function GET(');
    expect(result.code).not.toContain('export async function POST(');
  });

  it('fallback imports NextRequest', () => {
    const result = compileToNextJSAPI(makeComposition('DataAPI'));
    expect(result.code).toContain("from 'next/server'");
  });
});

// ── Root-level @http trait ────────────────────────────────────────────────────

describe('NextJSAPICompiler — root-level @http trait', () => {
  it('emits a GET handler from root trait', () => {
    const comp = withRootHttpTrait(makeComposition('ItemsAPI'), { method: 'GET' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('export async function GET(');
  });

  it('emits a POST handler from root trait', () => {
    const comp = withRootHttpTrait(makeComposition('OrdersAPI'), { method: 'POST' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('export async function POST(');
    expect(result.code).toContain('request.json()');
  });

  it('emits a DELETE handler with 204 status', () => {
    const comp = withRootHttpTrait(makeComposition('ItemAPI'), { method: 'DELETE' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('export async function DELETE(');
    expect(result.code).toContain('status: 204');
  });

  it('emits a HEAD handler with 200 status', () => {
    const comp = withRootHttpTrait(makeComposition('PingAPI'), { method: 'HEAD' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('export async function HEAD(');
    expect(result.code).toContain('status: 200');
  });

  it('uses statusCode from trait config', () => {
    const comp = withRootHttpTrait(makeComposition('OrdersAPI'), {
      method: 'POST',
      statusCode: 201,
    });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('status: 201');
  });

  it('uses description from trait config as JSDoc', () => {
    const comp = withRootHttpTrait(makeComposition('PresetsAPI'), {
      method: 'GET',
      description: 'Returns all presets',
    });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('/** Returns all presets */');
  });

  it('lowercases the method before comparison (case insensitive input)', () => {
    const comp = withRootHttpTrait(makeComposition('ItemsAPI'), { method: 'get' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('export async function GET(');
  });

  it('ignores unknown method strings', () => {
    const comp = withRootHttpTrait(makeComposition('ItemsAPI'), { method: 'INVALID' });
    // Falls back to GET stub since the bad method is rejected
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('export async function GET(');
  });
});

// ── Object-level @http traits ─────────────────────────────────────────────────

describe('NextJSAPICompiler — object-level @http traits', () => {
  it('emits one handler per @http object', () => {
    const comp = makeComposition('UsersAPI', {
      objects: [makeHttpObject('ListUsers', 'GET'), makeHttpObject('CreateUser', 'POST')] as any,
    });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('export async function GET(');
    expect(result.code).toContain('export async function POST(');
  });

  it('extracts statusCode from object properties', () => {
    const obj = makeHttpObject('CreateItem', 'POST', { statusCode: 201 });
    const comp = makeComposition('ItemsAPI', { objects: [obj] as any });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('status: 201');
  });

  it('skips objects without @http trait', () => {
    const nonHttpObj: HoloObjectDecl = {
      type: 'ObjectDecl',
      name: 'Sphere',
      traits: [{ type: 'ObjectTrait', name: 'physics', config: {} } as any],
      properties: [],
      children: [],
    } as unknown as HoloObjectDecl;
    const comp = makeComposition('SceneAPI', { objects: [nonHttpObj] as any });
    // Falls back to GET stub (no @http objects)
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('export async function GET(');
  });

  it('deduplicates duplicate methods (last definition wins)', () => {
    const comp = makeComposition('DualAPI', {
      objects: [makeHttpObject('GetA', 'GET'), makeHttpObject('GetB', 'GET')] as any,
    });
    // Should only have one GET function, not two
    const result = compileToNextJSAPI(comp);
    const getCount = (result.code.match(/export async function GET/g) ?? []).length;
    expect(getCount).toBe(1);
  });
});

// ── Generated code structure ──────────────────────────────────────────────────

describe('NextJSAPICompiler — generated code', () => {
  it('includes file header by default', () => {
    const result = compileToNextJSAPI(makeComposition('PresetsAPI'));
    expect(result.code).toContain('// @generated by HoloScript NextJSAPICompiler');
  });

  it('omits file header when includeJsDoc is false', () => {
    const result = compileToNextJSAPI(makeComposition('PresetsAPI'), {
      includeJsDoc: false,
    });
    expect(result.code).not.toContain('// @generated');
  });

  it('imports NextRequest for non-passthrough methods', () => {
    const comp = withRootHttpTrait(makeComposition('ItemsAPI'), { method: 'GET' });
    expect(compileToNextJSAPI(comp).code).toContain('NextRequest');
  });

  it('imports only NextResponse for HEAD-only routes', () => {
    const comp = withRootHttpTrait(makeComposition('PingAPI'), { method: 'HEAD' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).not.toContain('NextRequest');
    expect(result.code).toContain('NextResponse');
  });

  it('POST handler contains json body parsing', () => {
    const comp = withRootHttpTrait(makeComposition('ThingsAPI'), { method: 'POST' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('_request.json()');
    expect(result.code).toContain("'Invalid JSON body'");
  });

  it('PUT handler behaves like POST (body)', () => {
    const comp = withRootHttpTrait(makeComposition('ThingsAPI'), { method: 'PUT' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('_request.json()');
  });

  it('PATCH handler behaves like POST (body)', () => {
    const comp = withRootHttpTrait(makeComposition('ThingsAPI'), { method: 'PATCH' });
    const result = compileToNextJSAPI(comp);
    expect(result.code).toContain('_request.json()');
  });

  it('file ends with newline', () => {
    const result = compileToNextJSAPI(makeComposition('PresetsAPI'));
    expect(result.code.endsWith('\n')).toBe(true);
  });
});

// ── Static-data route migrations (5 concrete routes) ─────────────────────────

describe('NextJSAPICompiler — static-data route migrations', () => {
  const cases = [
    { name: 'EnvironmentPresetsAPI', expectedPath: 'api/environment-presets/route.ts' },
    { name: 'AudioPresetsAPI', expectedPath: 'api/audio-presets/route.ts' },
    { name: 'AssetPacksAPI', expectedPath: 'api/asset-packs/route.ts' },
    { name: 'LodPresetsAPI', expectedPath: 'api/lod-presets/route.ts' },
    { name: 'MaterialsAPI', expectedPath: 'api/materials/route.ts' },
  ] as const;

  for (const { name, expectedPath } of cases) {
    it(`compiles ${name} to the correct path`, () => {
      const comp = withRootHttpTrait(makeComposition(name), { method: 'GET' });
      const result = compileToNextJSAPI(comp);
      expect(result.path).toBe(expectedPath);
    });

    it(`${name} code is valid (exports GET, imports NextResponse)`, () => {
      const comp = withRootHttpTrait(makeComposition(name), { method: 'GET' });
      const result = compileToNextJSAPI(comp);
      expect(result.code).toContain('export async function GET(');
      expect(result.code).toContain('NextResponse');
    });
  }
});

// ── compileAllToNextJSAPI ─────────────────────────────────────────────────────

describe('compileAllToNextJSAPI', () => {
  it('compiles a batch of compositions', () => {
    const comps = [
      { name: 'A', composition: withRootHttpTrait(makeComposition('FooAPI'), { method: 'GET' }) },
      { name: 'B', composition: withRootHttpTrait(makeComposition('BarAPI'), { method: 'POST' }) },
    ];
    const results = compileAllToNextJSAPI(comps);
    expect(results).toHaveLength(2);
    expect(results[0]!.path).toBe('api/foo/route.ts');
    expect(results[1]!.path).toBe('api/bar/route.ts');
    expect(results[0]!.code).toContain('function GET(');
    expect(results[1]!.code).toContain('function POST(');
  });

  it('respects shared options across all compositions', () => {
    const comps = [
      { name: 'A', composition: withRootHttpTrait(makeComposition('FooAPI'), { method: 'GET' }) },
    ];
    const results = compileAllToNextJSAPI(comps, { includeJsDoc: false });
    expect(results[0]!.code).not.toContain('// @generated');
  });
});

// ── Body validation & concrete JSON responses (no TODO placeholders) ───────

describe('NextJSAPICompiler — request body schema & responses', () => {
  it('emits required key validation and echo response for POST', () => {
    const comp = withRootHttpTrait(makeComposition('ItemsAPI'), {
      method: 'POST',
      statusCode: 201,
      description: 'Create item',
      requiredBodyKeys: ['title'],
      responseMode: 'echo',
    });
    const { code } = compileToNextJSAPI(comp);
    expect(code).toContain('requiredKeys');
    expect(code).toContain('"title"');
    expect(code).toContain('Invalid JSON body');
    expect(code).toContain('data: record');
    expect(code).not.toContain('TODO');
  });

  it('emits structured GET JSON without TODO placeholders', () => {
    const comp = withRootHttpTrait(makeComposition('HealthProbe'), {
      method: 'GET',
      description: 'Liveness',
    });
    const { code } = compileToNextJSAPI(comp);
    expect(code).toContain('ok: true');
    expect(code).not.toContain('TODO');
  });

  it('emits spatial validation middleware for body handlers by default', () => {
    const comp = withRootHttpTrait(makeComposition('SpatialItemsAPI'), {
      method: 'POST',
      requiredBodyKeys: ['title'],
    });
    const { code } = compileToNextJSAPI(comp);
    expect(code).toContain('function validateSpatialRequestBody(');
    expect(code).toContain('position must be [x, y, z] numeric tuple');
    expect(code).toContain('const spatialValidation = validateSpatialRequestBody(record);');
  });

  it('can disable spatial middleware emission via includeValidation=false', () => {
    const comp = withRootHttpTrait(makeComposition('SpatialItemsAPI'), {
      method: 'POST',
      requiredBodyKeys: ['title'],
    });
    const { code } = compileToNextJSAPI(comp, { includeValidation: false });
    expect(code).not.toContain('function validateSpatialRequestBody(');
    expect(code).not.toContain('const spatialValidation = validateSpatialRequestBody(record);');
  });
});
