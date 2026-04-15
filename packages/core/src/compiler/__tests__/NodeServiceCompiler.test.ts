import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeServiceCompiler } from '../NodeServiceCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';
import { DialectRegistry } from '../DialectRegistry';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// Helper to build a minimal composition
function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestService',
    objects: [],
    ...overrides,
  } as HoloComposition;
}

// Helper to build a composition with a service domain block
function makeServiceComposition(
  serviceName: string,
  props: Record<string, unknown> = {},
  children: any[] = [],
  traits: string[] = []
): HoloComposition {
  return makeComposition({
    domainBlocks: [
      {
        type: 'DomainBlock',
        domain: 'service',
        keyword: 'service',
        name: serviceName,
        traits,
        properties: props,
        children,
      },
    ] as any,
  });
}

describe('NodeServiceCompiler', () => {
  let compiler: NodeServiceCompiler;

  beforeEach(() => {
    compiler = new NodeServiceCompiler();
  });

  // =========== Constructor / Defaults ===========

  describe('constructor', () => {
    it('uses default options (express, port 3000, typescript)', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toBeDefined();
      expect(result['index.ts']).toContain("import express from 'express'");
      expect(result['package.json']).toContain('"express"');
    });

    it('respects fastify framework option', () => {
      const c = new NodeServiceCompiler({ framework: 'fastify' });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain("import Fastify from 'fastify'");
      expect(result['package.json']).toContain('"fastify"');
    });

    it('respects custom port', () => {
      const c = new NodeServiceCompiler({ port: 8080 });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain('8080');
    });

    it('respects custom API prefix', () => {
      const c = new NodeServiceCompiler({ apiPrefix: '/v2' });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain("'/v2'");
    });

    it('generates JS files when typescript is false', () => {
      const c = new NodeServiceCompiler({ typescript: false });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['index.js']).toBeDefined();
      expect(result['index.ts']).toBeUndefined();
      expect(result['tsconfig.json']).toBeUndefined();
    });

    it('includes Dockerfile when enabled', () => {
      const c = new NodeServiceCompiler({ includeDocker: true });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['Dockerfile']).toBeDefined();
      expect(result['Dockerfile']).toContain('FROM node:');
    });

    it('Dockerfile respects nodeVersion', () => {
      const c = new NodeServiceCompiler({ includeDocker: true, nodeVersion: '22' });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['Dockerfile']).toContain('node:22-alpine');
    });
  });

  // =========== compile: Output Files ===========

  describe('output structure', () => {
    it('returns Record<string, string>', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(typeof result).toBe('object');
      for (const [key, value] of Object.entries(result)) {
        expect(typeof key).toBe('string');
        expect(typeof value).toBe('string');
      }
    });

    it('always includes index file', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toBeDefined();
    });

    it('always includes package.json', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      const pkg = JSON.parse(result['package.json']);
      expect(pkg.name).toBeDefined();
      expect(pkg.version).toBe('0.1.0');
    });

    it('includes tsconfig.json when typescript enabled', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      const tsconfig = JSON.parse(result['tsconfig.json']);
      expect(tsconfig.compilerOptions.strict).toBe(true);
      expect(tsconfig.compilerOptions.target).toBe('ES2022');
    });

    it('generates route files for each service', () => {
      const comp = makeServiceComposition('UserAPI');
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/UserAPI.ts']).toBeDefined();
    });
  });

  // =========== Express Entry Point ===========

  describe('express entry point', () => {
    it('imports express', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain("import express from 'express'");
    });

    it('creates express app', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain('const app = express()');
    });

    it('adds json middleware', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain('app.use(express.json())');
    });

    it('sets up route imports for each service', () => {
      const comp = makeServiceComposition('ItemAPI');
      const result = compiler.compile(comp, 'test-token');
      expect(result['index.ts']).toContain('import { itemapiRoutes }');
      expect(result['index.ts']).toContain("app.use('/api', itemapiRoutes)");
    });

    it('exports app', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain('export { app }');
    });

    it('includes auto-generated comment header', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain('Auto-generated by HoloScript NodeServiceCompiler');
    });
  });

  // =========== Fastify Entry Point ===========

  describe('fastify entry point', () => {
    let fastifyCompiler: NodeServiceCompiler;

    beforeEach(() => {
      fastifyCompiler = new NodeServiceCompiler({ framework: 'fastify' });
    });

    it('imports Fastify', () => {
      const result = fastifyCompiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain("import Fastify from 'fastify'");
    });

    it('creates fastify instance with logger', () => {
      const result = fastifyCompiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toContain('Fastify({ logger: true })');
    });

    it('registers routes as plugins', () => {
      const comp = makeServiceComposition('OrderAPI');
      const result = fastifyCompiler.compile(comp, 'test-token');
      expect(result['index.ts']).toContain('app.register(orderapiRoutes');
    });
  });

  // =========== Service Extraction from Domain Blocks ===========

  describe('service extraction from domain blocks', () => {
    it('extracts service from service_block', () => {
      const comp = makeServiceComposition('UserAPI', { port: 4000 });
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/UserAPI.ts']).toBeDefined();
    });

    it('extracts service from endpoint keyword', () => {
      const comp = makeComposition({
        domainBlocks: [
          {
            type: 'DomainBlock',
            domain: 'service',
            keyword: 'endpoint',
            name: 'GetUsers',
            traits: [],
            properties: { method: 'GET', path: '/users' },
          },
        ] as any,
      });
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/GetUsers.ts']).toBeDefined();
    });

    it('extracts service from gateway keyword', () => {
      const comp = makeComposition({
        domainBlocks: [
          {
            type: 'DomainBlock',
            domain: 'service',
            keyword: 'gateway',
            name: 'APIGateway',
            traits: [],
            properties: { port: 443 },
          },
        ] as any,
      });
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/APIGateway.ts']).toBeDefined();
    });

    it('extracts routes from nested objects with @http trait', () => {
      const comp = makeServiceComposition('ItemAPI', {}, [
        {
          name: 'ListItems',
          properties: [
            { key: 'method', value: 'GET' },
            { key: 'path', value: '/items' },
            { key: 'handler', value: 'listItems' },
          ],
          traits: [{ name: 'http' }],
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      const routeFile = result['routes/ItemAPI.ts'];
      expect(routeFile).toContain("'/items'");
      expect(routeFile).toContain('listItems');
    });

    it('extracts multiple routes from nested objects', () => {
      const comp = makeServiceComposition('CRUD', {}, [
        {
          name: 'Create',
          properties: [
            { key: 'method', value: 'POST' },
            { key: 'path', value: '/items' },
          ],
          traits: [{ name: 'http' }],
        },
        {
          name: 'Read',
          properties: [
            { key: 'method', value: 'GET' },
            { key: 'path', value: '/items/:id' },
          ],
          traits: [{ name: 'http' }],
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      const routeFile = result['routes/CRUD.ts'];
      expect(routeFile).toContain('router.post');
      expect(routeFile).toContain('router.get');
    });

    it('handles service with no routes (default health check)', () => {
      const comp = makeServiceComposition('EmptyService');
      const result = compiler.compile(comp, 'test-token');
      const routeFile = result['routes/EmptyService.ts'];
      expect(routeFile).toContain('/health');
    });

    it('extracts middleware from service traits', () => {
      const comp = makeServiceComposition(
        'SecureAPI',
        {},
        [
          {
            name: 'Login',
            properties: [
              { key: 'method', value: 'POST' },
              { key: 'path', value: '/login' },
            ],
            traits: [{ name: 'http' }, { name: 'auth' }],
          },
        ],
        ['cors', 'rate_limit']
      );
      const result = compiler.compile(comp, 'test-token');
      expect(result['middleware/index.ts']).toBeDefined();
      expect(result['middleware/index.ts']).toContain('cors');
      expect(result['middleware/index.ts']).toContain('rateLimit');
    });
  });

  // =========== Service Extraction from Objects ===========

  describe('service extraction from objects', () => {
    it('extracts service from objects with @service trait', () => {
      const comp = makeComposition({
        objects: [
          {
            name: 'OrderService',
            properties: [
              { key: 'method', value: 'GET' },
              { key: 'path', value: '/orders' },
            ],
            traits: [{ name: 'service' }, { name: 'http' }],
          },
        ] as any,
      });
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/OrderService.ts']).toBeDefined();
    });

    it('ignores objects without service traits', () => {
      const comp = makeComposition({
        objects: [
          {
            name: 'Cube',
            properties: [{ key: 'geometry', value: 'box' }],
            traits: [{ name: 'physics' }],
          },
        ] as any,
      });
      const result = compiler.compile(comp, 'test-token');
      // Should still have default service from composition name
      expect(Object.keys(result).some((k) => k.startsWith('routes/'))).toBe(true);
    });
  });

  // =========== Express Route Modules ===========

  describe('express route modules', () => {
    it('imports Router from express', () => {
      const comp = makeServiceComposition('API');
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain("import { Router } from 'express'");
    });

    it('imports Request/Response types when typescript', () => {
      const comp = makeServiceComposition('API');
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain('import type { Request, Response }');
    });

    it('creates Router instance', () => {
      const comp = makeServiceComposition('API');
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain('const router = Router()');
    });

    it('exports named router', () => {
      const comp = makeServiceComposition('UserAPI');
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/UserAPI.ts']).toContain('export { router as userapiRoutes }');
    });

    it('generates route handlers with correct HTTP method', () => {
      const comp = makeServiceComposition('API', {}, [
        {
          name: 'DeleteItem',
          properties: [
            { key: 'method', value: 'DELETE' },
            { key: 'path', value: '/items/:id' },
          ],
          traits: [{ name: 'http' }],
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain("router.delete('/items/:id'");
    });

    it('includes stub comment for handler implementation', () => {
      const comp = makeServiceComposition('API', {}, [
        {
          name: 'GetItem',
          properties: [
            { key: 'method', value: 'GET' },
            { key: 'path', value: '/items' },
            { key: 'handler', value: 'getItem' },
          ],
          traits: [{ name: 'http' }],
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain('Stub: implement getItem');
    });
  });

  // =========== Fastify Route Modules ===========

  describe('fastify route modules', () => {
    let fastifyCompiler: NodeServiceCompiler;

    beforeEach(() => {
      fastifyCompiler = new NodeServiceCompiler({ framework: 'fastify' });
    });

    it('imports FastifyInstance type', () => {
      const comp = makeServiceComposition('API');
      const result = fastifyCompiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain('import type { FastifyInstance }');
    });

    it('exports async plugin function', () => {
      const comp = makeServiceComposition('UserAPI');
      const result = fastifyCompiler.compile(comp, 'test-token');
      expect(result['routes/UserAPI.ts']).toContain(
        'export async function userapiRoutes(app: FastifyInstance)'
      );
    });

    it('generates fastify route with request/reply', () => {
      const comp = makeServiceComposition('API', {}, [
        {
          name: 'GetItem',
          properties: [
            { key: 'method', value: 'GET' },
            { key: 'path', value: '/items' },
          ],
          traits: [{ name: 'http' }],
        },
      ]);
      const result = fastifyCompiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain("app.get('/items', async (request, reply)");
    });
  });

  // =========== Middleware Generation ===========

  describe('middleware generation', () => {
    it('generates middleware index when middleware traits present', () => {
      const comp = makeServiceComposition('API', {}, [
        {
          name: 'Login',
          properties: [
            { key: 'method', value: 'POST' },
            { key: 'path', value: '/login' },
          ],
          traits: [{ name: 'http' }, { name: 'auth' }],
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result['middleware/index.ts']).toBeDefined();
    });

    it('express middleware has correct signature', () => {
      const comp = makeServiceComposition('API', {}, [], ['cors']);
      const result = compiler.compile(comp, 'test-token');
      expect(result['middleware/index.ts']).toContain(
        'req: Request, _res: Response, next: NextFunction'
      );
    });

    it('fastify middleware has correct signature', () => {
      const c = new NodeServiceCompiler({ framework: 'fastify' });
      const comp = makeServiceComposition('API', {}, [], ['auth']);
      const result = c.compile(comp, 'test-token');
      expect(result['middleware/index.ts']).toContain('request: FastifyRequest');
    });

    it('does not generate middleware when none present', () => {
      const comp = makeServiceComposition('API');
      const result = compiler.compile(comp, 'test-token');
      expect(result['middleware/index.ts']).toBeUndefined();
    });
  });

  // =========== Package.json ===========

  describe('package.json', () => {
    it('generates valid JSON', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(() => JSON.parse(result['package.json'])).not.toThrow();
    });

    it('includes express dependency for express framework', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      const pkg = JSON.parse(result['package.json']);
      expect(pkg.dependencies.express).toBeDefined();
    });

    it('includes fastify dependency for fastify framework', () => {
      const c = new NodeServiceCompiler({ framework: 'fastify' });
      const result = c.compile(makeComposition(), 'test-token');
      const pkg = JSON.parse(result['package.json']);
      expect(pkg.dependencies.fastify).toBeDefined();
    });

    it('includes typescript devDependencies when typescript enabled', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      const pkg = JSON.parse(result['package.json']);
      expect(pkg.devDependencies.typescript).toBeDefined();
      expect(pkg.devDependencies.tsx).toBeDefined();
    });

    it('includes @types/express for express + typescript', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      const pkg = JSON.parse(result['package.json']);
      expect(pkg.devDependencies['@types/express']).toBeDefined();
    });

    it('kebab-cases project name', () => {
      const comp = makeComposition({ name: 'MyGreatService' });
      const result = compiler.compile(comp, 'test-token');
      const pkg = JSON.parse(result['package.json']);
      expect(pkg.name).toBe('my-great-service');
    });

    it('includes build and start scripts', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      const pkg = JSON.parse(result['package.json']);
      expect(pkg.scripts.build).toBe('tsc');
      expect(pkg.scripts.start).toBe('node dist/index.js');
      expect(pkg.scripts.dev).toBe('tsx watch index.ts');
    });
  });

  // =========== Dockerfile ===========

  describe('Dockerfile', () => {
    it('uses multi-stage build', () => {
      const c = new NodeServiceCompiler({ includeDocker: true });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['Dockerfile']).toContain('AS builder');
      expect(result['Dockerfile']).toContain('--from=builder');
    });

    it('runs npm ci for production deps', () => {
      const c = new NodeServiceCompiler({ includeDocker: true });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['Dockerfile']).toContain('npm ci --omit=dev');
    });

    it('exposes configured port', () => {
      const c = new NodeServiceCompiler({ includeDocker: true, port: 8080 });
      const result = c.compile(makeComposition(), 'test-token');
      expect(result['Dockerfile']).toContain('EXPOSE 8080');
    });
  });

  // =========== Default Behavior ===========

  describe('default behavior', () => {
    it('creates default service from composition name when no services found', () => {
      const result = compiler.compile(makeComposition({ name: 'DefaultApp' }), 'test-token');
      // Should have at least one route file
      expect(Object.keys(result).some((k) => k.startsWith('routes/'))).toBe(true);
    });

    it('defaults HTTP method to GET', () => {
      const comp = makeServiceComposition('API', {}, [
        {
          name: 'Something',
          properties: [{ key: 'path', value: '/test' }],
          traits: [{ name: 'http' }],
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain("router.get('/test'");
    });

    it('generates path from object name when path not specified', () => {
      const comp = makeServiceComposition('API', {}, [
        {
          name: 'GetUsers',
          properties: [{ key: 'method', value: 'GET' }],
          traits: [{ name: 'http' }],
        },
      ]);
      const result = compiler.compile(comp, 'test-token');
      expect(result['routes/API.ts']).toContain('/get-users');
    });
  });

  // =========== Dialect Registration ===========

  describe('dialect registration', () => {
    it('auto-registers with DialectRegistry', () => {
      expect(DialectRegistry.has('node-service')).toBe(true);
    });

    it('is discoverable by domain', () => {
      const dialects = DialectRegistry.listByDomain('service');
      expect(dialects.some((d) => d.name === 'node-service')).toBe(true);
    });

    it('is discoverable by trait', () => {
      const dialects = DialectRegistry.findByTrait('service');
      expect(dialects.some((d) => d.name === 'node-service')).toBe(true);
    });

    it('reports as experimental', () => {
      const info = DialectRegistry.get('node-service');
      expect(info).toBeDefined();
      expect(info!.experimental).toBe(true);
    });

    it('creates compiler instance via factory', () => {
      const instance = DialectRegistry.create('node-service', { framework: 'fastify' });
      expect(instance).toBeInstanceOf(NodeServiceCompiler);
    });
  });

  // =========== Edge Cases ===========

  describe('edge cases', () => {
    it('handles composition with empty objects array', () => {
      const result = compiler.compile(makeComposition({ objects: [] }), 'test-token');
      expect(result['index.ts']).toBeDefined();
    });

    it('handles composition with undefined domainBlocks', () => {
      const result = compiler.compile(makeComposition(), 'test-token');
      expect(result['index.ts']).toBeDefined();
    });

    it('handles service name with special characters', () => {
      const comp = makeServiceComposition('My Service!@#');
      const result = compiler.compile(comp, 'test-token');
      // File name should be sanitized
      expect(Object.keys(result).some((k) => k.startsWith('routes/'))).toBe(true);
    });

    it('resets state between compile calls', () => {
      const comp1 = makeServiceComposition('Service1');
      const comp2 = makeServiceComposition('Service2');
      const result1 = compiler.compile(comp1, 'test-token');
      const result2 = compiler.compile(comp2, 'test-token');
      expect(result1['routes/Service1.ts']).toBeDefined();
      expect(result2['routes/Service2.ts']).toBeDefined();
      expect(result2['routes/Service1.ts']).toBeUndefined();
    });
  });
});
