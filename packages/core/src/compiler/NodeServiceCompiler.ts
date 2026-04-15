/**
 * Node.js Service Compiler — HoloScript's first non-spatial compilation target
 *
 * Compiles @service, @endpoint, @route, @handler, @middleware traits
 * and service_block domain blocks to Express/Fastify skeleton applications.
 *
 * Output: Multi-file Record<string, string> with:
 *   - index.ts (server entry point)
 *   - routes/*.ts (route modules)
 *   - middleware/*.ts (middleware chains)
 *   - package.json (dependencies)
 *
 * @example
 * ```hsplus
 * service "UserAPI" {
 *   @http { method: "GET", path: "/users" }
 *   @handler { name: "listUsers" }
 *   @middleware { chain: ["auth", "rateLimit"] }
 *
 *   object "HealthCheck" {
 *     @http { method: "GET", path: "/health" }
 *     @handler { name: "healthCheck" }
 *   }
 * }
 * ```
 *
 * Compiles to Express application skeleton:
 * ```typescript
 * // index.ts
 * import express from 'express';
 * import { userAPIRoutes } from './routes/UserAPI';
 * const app = express();
 * app.use('/api', userAPIRoutes);
 * app.listen(3000);
 * ```
 *
 * @module @holoscript/core/compiler/NodeServiceCompiler
 * @version 0.1.0 (v5.2 experimental)
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath } from './identity';
import type { ANSCapabilityPathValue } from './identity';
import type { HoloComposition } from '../parser/HoloCompositionTypes';
import type {
  HoloDomainBlock,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloObjectProperty,
  HoloValue,
} from '../parser/HoloCompositionTypes';
import { DialectRegistry } from './DialectRegistry';
import {
  KNOWN_CONNECTORS,
  CONNECTOR_ENV_REQUIREMENTS,
  CONNECTOR_PACKAGES,
  type KnownConnector,
} from '../traits/constants';


// ── Types ──────────────────────────────────────────────────────────────────

export type ServiceFramework = 'express' | 'fastify';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface NodeServiceCompilerOptions {
  /** Target framework */
  framework?: ServiceFramework;
  /** Base port */
  port?: number;
  /** API prefix path */
  apiPrefix?: string;
  /** Include TypeScript types */
  typescript?: boolean;
  /** Include Dockerfile */
  includeDocker?: boolean;
  /** Node.js version target */
  nodeVersion?: '18' | '20' | '22';
}

interface RouteInfo {
  method: HttpMethod;
  path: string;
  handlerName: string;
  middleware: string[];
  serviceName: string;
}

export interface ConnectorRef {
  name: string;
  config: Record<string, unknown>;
}

export interface EnvVarDecl {
  name: string;
  required: boolean;
  defaultValue?: string;
}

export interface DeployConfig {
  platform: string;
  service?: string;
  environment?: string;
  healthPath?: string;
}

interface ServiceInfo {
  name: string;
  routes: RouteInfo[];
  middleware: string[];
  port: number;
  connectors: ConnectorRef[];
  envVars: EnvVarDecl[];
  deploy?: DeployConfig;
}


// ── Compiler ───────────────────────────────────────────────────────────────

export class NodeServiceCompiler extends CompilerBase {
  protected readonly compilerName = 'NodeServiceCompiler';

  private options: Required<NodeServiceCompilerOptions>;
  private services: ServiceInfo[] = [];

  constructor(options: NodeServiceCompilerOptions = {}) {
    super();
    this.options = {
      framework: options.framework ?? 'express',
      port: options.port ?? 3000,
      apiPrefix: options.apiPrefix ?? '/api',
      typescript: options.typescript ?? true,
      nodeVersion: options.nodeVersion ?? '20',
      includeDocker: options.includeDocker ?? false,
    };
  }

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.NODE_SERVICE;
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): Record<string, string> {
    console.log('DEBUG: Composition:', JSON.stringify(composition, null, 2));

    this.validateCompilerAccess(agentToken, outputPath);


    // Reset state
    this.services = [];

    // Extract service definitions from domain blocks and objects
    this.extractServices(composition);

    // Generate output files
    const output: Record<string, string> = {};

    // Generate entry point
    output[this.ext('index')] = this.emitEntryPoint();

    // Generate route modules
    for (const service of this.services) {
      output[this.ext(`routes/${this.toFileName(service.name)}`)] = this.emitRouteModule(service);
    }

    // Generate middleware stubs
    const allMiddleware = this.collectMiddleware();
    if (allMiddleware.length > 0) {
      output[this.ext('middleware/index')] = this.emitMiddlewareIndex(allMiddleware);
    }

    // Generate environment config
    const allEnvVars = this.collectEnvVars();
    if (allEnvVars.length > 0) {
      output[this.ext('config/env')] = this.emitEnvConfig(allEnvVars);
    }

    // Generate connectors
    const allConnectors = this.collectConnectors();
    if (allConnectors.length > 0) {
      output[this.ext('connectors/index')] = this.emitConnectorsIndex(allConnectors);
    }

    // Generate Railway config
    const railwayService = this.services.find((s) => s.deploy?.platform === 'railway');
    if (railwayService?.deploy) {
      output['railway.json'] = this.emitRailwayConfig(railwayService.deploy);
    }


    // Generate package.json
    output['package.json'] = this.emitPackageJson(composition.name);

    // Generate tsconfig.json (when typescript enabled)
    if (this.options.typescript) {
      output['tsconfig.json'] = this.emitTsConfig();
    }

    // Generate Dockerfile (when enabled)
    if (this.options.includeDocker) {
      output['Dockerfile'] = this.emitDockerfile();
    }

    // Perform connector validation
    this.validateConnectorIntegration();

    return output;
  }


  // ── Extraction ─────────────────────────────────────────────────────────

  private extractServices(composition: HoloComposition): void {
    // Extract from domain blocks (service_block in grammar)
    if (composition.domainBlocks) {
      for (const block of composition.domainBlocks) {
        if (this.isServiceBlock(block)) {
          this.services.push(this.parseServiceBlock(block));
        }
      }
    }

    // Extract from objects with @service trait
    if (composition.objects) {
      for (const obj of composition.objects) {
        if (this.hasServiceTraits(obj)) {
          this.services.push(this.parseServiceObject(obj));
        }
      }
    }


    // If no services found, create a default from composition name
    if (this.services.length === 0) {
      this.services.push({
        name: composition.name || 'App',
        routes: [],
        middleware: [],
        connectors: [],
        envVars: [],
        port: this.options.port,
      });
    }
  }

  private isServiceBlock(block: HoloDomainBlock): boolean {
    return (
      block.keyword === 'service' ||
      block.keyword === 'endpoint' ||
      block.keyword === 'gateway' ||
      block.keyword === 'handler'
    );
  }

  private hasServiceTraits(obj: HoloObjectDecl): boolean {
    if (!obj.traits) return false;
    const serviceTraits = ['service', 'endpoint', 'http', 'handler', 'route', 'connector', 'env', 'deploy'];
    return obj.traits.some((t) => serviceTraits.includes(t.name));
  }


  private parseServiceBlock(block: HoloDomainBlock): ServiceInfo {
    const service: ServiceInfo = {
      name: block.name,
      routes: [],
      middleware: [],
      port: this.resolveNumber(block.properties['port']) ?? this.options.port,
      connectors: [],
      envVars: [],
    };

    // Extract traits from block
    if (block.traits) {
      service.middleware = this.extractMiddlewareFromTraits(block.traits);
      service.connectors = this.extractConnectors(block.traits, block.properties);
      service.envVars = this.extractEnvVars(block.traits, block.properties);
      service.deploy = this.extractDeploy(block.traits, block.properties);
    }


    // Extract routes from nested children
    if (block.children) {
      for (const child of block.children) {
        const route = this.extractRoute(child, block.name);
        if (route) service.routes.push(route);
      }
    }

    // Extract inline route from block properties
    const inlineRoute = this.extractInlineRoute(block);
    if (inlineRoute) service.routes.push(inlineRoute);

    return service;
  }

  private parseServiceObject(obj: HoloObjectDecl): ServiceInfo {
    const service: ServiceInfo = {
      name: obj.name,
      routes: [],
      middleware: [],
      port: this.options.port,
      connectors: [],
      envVars: [],
    };

    if (obj.traits) {
      const traitNames = obj.traits.map((t) => t.name);
      service.middleware = this.extractMiddlewareFromTraits(traitNames);
      service.connectors = this.extractConnectors(traitNames, this.objectPropsToMap(obj.properties));
      service.envVars = this.extractEnvVars(traitNames, this.objectPropsToMap(obj.properties));
      service.deploy = this.extractDeploy(traitNames, this.objectPropsToMap(obj.properties));
    }


    // Extract route from object itself
    const route = this.extractRoute(obj, obj.name);
    if (route) service.routes.push(route);

    return service;
  }

  private extractRoute(obj: HoloObjectDecl, serviceName: string): RouteInfo | null {
    const propMap = this.objectPropsToMap(obj.properties);
    const traits = (obj.traits || []).map((t: HoloObjectTrait) => t.name);

    // Look for @http or route properties
    const method =
      (this.resolveString(propMap.get('method'))?.toUpperCase() as HttpMethod) || 'GET';
    const path = this.resolveString(propMap.get('path')) || `/${this.toKebab(obj.name)}`;
    const handlerName = this.resolveString(propMap.get('handler')) || this.toCamelCase(obj.name);

    // Only generate route if there are http-related properties or traits
    const hasHttpInfo =
      propMap.has('method') ||
      propMap.has('path') ||
      traits.includes('http') ||
      traits.includes('route');
    if (!hasHttpInfo) return null;

    return {
      method,
      path,
      handlerName,
      middleware: this.extractMiddlewareFromTraits(traits),
      serviceName,
    };
  }

  private extractInlineRoute(block: HoloDomainBlock): RouteInfo | null {
    const props = block.properties;
    if (!props['method'] && !props['path']) return null;

    return {
      method: (this.resolveString(props['method'])?.toUpperCase() as HttpMethod) || 'GET',
      path: this.resolveString(props['path']) || `/${this.toKebab(block.name)}`,
      handlerName: this.resolveString(props['handler']) || this.toCamelCase(block.name),
      middleware: [],
      serviceName: block.name,
    };
  }

  private extractMiddlewareFromTraits(traits: string[]): string[] {
    const mw: string[] = [];
    for (const t of traits) {
      if (
        t === 'middleware' ||
        t === 'auth' ||
        t === 'rate_limit' ||
        t === 'cors' ||
        t === 'validation'
      ) {
        mw.push(t);
      }
    }
    return mw;
  }

  private collectMiddleware(): string[] {
    const set = new Set<string>();
    for (const service of this.services) {
      for (const mw of service.middleware) set.add(mw);
      for (const route of service.routes) {
        for (const mw of route.middleware) set.add(mw);
      }
    }
    return [...set];
  }



  // ── Connector Extraction ──────────────────────────────────────────────

  private extractConnectors(
    traits: string[],
    props: Record<string, HoloValue> | Map<string, HoloValue>
  ): ConnectorRef[] {
    const connectors: ConnectorRef[] = [];
    const propMap = props instanceof Map ? props : this.objectPropsToMapFromRecord(props);

    // This is simple trait-based extraction. In a real compiler, we would
    // look at the arguments of the trait, but here we assume the trait name
    // or associated properties carry the info for this version.
    for (const t of traits) {
      if (t === 'connector' || t === '@connector') {
        const name = this.resolveString(propMap.get('connector_name')) || 'unknown';
        connectors.push({ name, config: {} });
      }
    }

    return connectors;
  }

  private extractEnvVars(
    traits: string[],
    props: Record<string, HoloValue> | Map<string, HoloValue>
  ): EnvVarDecl[] {
    const envVars: EnvVarDecl[] = [];
    const propMap = props instanceof Map ? props : this.objectPropsToMapFromRecord(props);

    for (const t of traits) {
      if (t === 'env' || t === '@env') {

        const name = this.resolveString(propMap.get('env_name')) || 'UNKNOWN_VAR';
        envVars.push({
          name,
          required: this.resolveBoolean(propMap.get('env_required')) ?? true,
          defaultValue: this.resolveString(propMap.get('env_default')),
        });
      }
    }
    return envVars;
  }

  private extractDeploy(
    traits: string[],
    props: Record<string, HoloValue> | Map<string, HoloValue>
  ): DeployConfig | undefined {
    if (!traits.some(t => t === 'deploy' || t === '@deploy')) return undefined;


    const propMap = props instanceof Map ? props : this.objectPropsToMapFromRecord(props);
    return {
      platform: this.resolveString(propMap.get('platform')) || 'railway',
      service: this.resolveString(propMap.get('service')),
      environment: this.resolveString(propMap.get('environment')),
      healthPath: this.resolveString(propMap.get('healthPath')) || '/health',
    };
  }

  private objectPropsToMapFromRecord(props: Record<string, HoloValue>): Map<string, HoloValue> {
    const map = new Map<string, HoloValue>();
    for (const [k, v] of Object.entries(props)) {
      map.set(k, v);
    }
    return map;
  }

  private resolveBoolean(val: HoloValue | undefined): boolean | undefined {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val === 'true';
    return undefined;
  }


  // ── Code Emission ──────────────────────────────────────────────────────

  private emitEntryPoint(): string {
    const isExpress = this.options.framework === 'express';
    const lines: string[] = [];

    lines.push(`/**`);
    lines.push(` * Auto-generated by HoloScript NodeServiceCompiler v0.1.0`);
    lines.push(` * Framework: ${this.options.framework}`);
    lines.push(` */`);
    lines.push('');

    if (isExpress) {
      lines.push(`import express from 'express';`);
      lines.push(`import './config/env';`);
      const hasConnectors = this.collectConnectors().length > 0;
      if (hasConnectors) {
        lines.push(`import { initConnectors } from './connectors';`);
      }
      for (const service of this.services) {
        const importName = `${this.toCamelCase(service.name)}Routes`;
        lines.push(`import { ${importName} } from './routes/${this.toFileName(service.name)}';`);
      }
      lines.push('');
      lines.push(`const app = express();`);
      lines.push(`app.use(express.json());`);
      lines.push(`app.use(express.urlencoded({ extended: true }));`);
      lines.push('');
      for (const service of this.services) {
        const importName = `${this.toCamelCase(service.name)}Routes`;
        lines.push(
          `app.use('${this.escapeStringValue(this.options.apiPrefix, 'TypeScript')}', ${importName});`
        );
      }
      lines.push('');
      lines.push(`const PORT = process.env['PORT'] || ${this.options.port};`);
      
      if (hasConnectors) {
        lines.push(`initConnectors().then(() => {`);
        lines.push(`  app.listen(PORT, () => {`);
        lines.push(`    console.log(\`Server running on port \${PORT}\`);`);
        lines.push(`  });`);
        lines.push(`});`);
      } else {
        lines.push(`app.listen(PORT, () => {`);
        lines.push(`  console.log(\`Server running on port \${PORT}\`);`);
        lines.push(`});`);
      }
      lines.push('');
      lines.push(`export { app };`);
    } else {
      // Fastify
      lines.push(`import Fastify from 'fastify';`);
      for (const service of this.services) {
        const importName = `${this.toCamelCase(service.name)}Routes`;
        lines.push(`import { ${importName} } from './routes/${this.toFileName(service.name)}';`);
      }
      lines.push('');
      lines.push(`const app = Fastify({ logger: true });`);
      lines.push('');
      for (const service of this.services) {
        const importName = `${this.toCamelCase(service.name)}Routes`;
        lines.push(
          `app.register(${importName}, { prefix: '${this.escapeStringValue(this.options.apiPrefix, 'TypeScript')}' });`
        );
      }
      lines.push('');
      lines.push(`const PORT = Number(process.env['PORT']) || ${this.options.port};`);
      lines.push(`app.listen({ port: PORT, host: '0.0.0.0' }).then((address) => {`);
      lines.push(`  console.log(\`Server running at \${address}\`);`);
      lines.push(`});`);
      lines.push('');
      lines.push(`export { app };`);
    }

    return lines.join('\n');
  }

  private emitRouteModule(service: ServiceInfo): string {
    const isExpress = this.options.framework === 'express';
    const lines: string[] = [];
    const routerName = `${this.toCamelCase(service.name)}Routes`;

    lines.push(`/**`);
    lines.push(` * Routes for ${service.name}`);
    lines.push(` * Auto-generated by HoloScript NodeServiceCompiler`);
    lines.push(` */`);
    lines.push('');

    if (isExpress) {
      lines.push(`import { Router } from 'express';`);
      if (this.options.typescript) {
        lines.push(`import type { Request, Response } from 'express';`);
      }
      lines.push('');
      lines.push(`const router = Router();`);
      lines.push('');

      for (const route of service.routes) {
        const methodLower = route.method.toLowerCase();
        const mwArgs =
          route.middleware.length > 0
            ? route.middleware.map((mw) => `/* ${mw} */`).join(', ') + ', '
            : '';

        lines.push(`// ${route.method} ${route.path}`);
        if (this.options.typescript) {
          lines.push(
            `router.${methodLower}('${this.escapeStringValue(route.path, 'TypeScript')}', ${mwArgs}(req: Request, res: Response) => {`
          );
        } else {
          lines.push(
            `router.${methodLower}('${this.escapeStringValue(route.path, 'TypeScript')}', ${mwArgs}(req, res) => {`
          );
        }
        lines.push(`  // Stub: implement ${route.handlerName}`);
        lines.push(
          `  res.json({ message: '${this.escapeStringValue(route.handlerName, 'TypeScript')} not implemented' });`
        );
        lines.push(`});`);
        lines.push('');
      }

      // Default health route if no routes defined
      if (service.routes.length === 0) {
        lines.push(`// Default health check`);
        if (this.options.typescript) {
          lines.push(`router.get('/health', (_req: Request, res: Response) => {`);
        } else {
          lines.push(`router.get('/health', (_req, res) => {`);
        }
        lines.push(
          `  res.json({ status: 'ok', service: '${this.escapeStringValue(service.name, 'TypeScript')}' });`
        );
        lines.push(`});`);
        lines.push('');
      }

      lines.push(`export { router as ${routerName} };`);
    } else {
      // Fastify
      lines.push(`import type { FastifyInstance } from 'fastify';`);
      lines.push('');
      lines.push(`export async function ${routerName}(app: FastifyInstance) {`);

      for (const route of service.routes) {
        const methodLower = route.method.toLowerCase();
        lines.push(`  // ${route.method} ${route.path}`);
        lines.push(
          `  app.${methodLower}('${this.escapeStringValue(route.path, 'TypeScript')}', async (request, reply) => {`
        );
        lines.push(`    // Stub: implement ${route.handlerName}`);
        lines.push(
          `    return { message: '${this.escapeStringValue(route.handlerName, 'TypeScript')} not implemented' };`
        );
        lines.push(`  });`);
        lines.push('');
      }

      if (service.routes.length === 0) {
        lines.push(`  // Default health check`);
        lines.push(`  app.get('/health', async () => {`);
        lines.push(
          `    return { status: 'ok', service: '${this.escapeStringValue(service.name, 'TypeScript')}' };`
        );
        lines.push(`  });`);
        lines.push('');
      }

      lines.push(`}`);
    }

    return lines.join('\n');
  }

  private emitMiddlewareIndex(middleware: string[]): string {
    const lines: string[] = [];

    lines.push(`/**`);
    lines.push(` * Middleware stubs`);
    lines.push(` * Auto-generated by HoloScript NodeServiceCompiler`);
    lines.push(` */`);
    lines.push('');

    if (this.options.framework === 'express') {
      lines.push(`import type { Request, Response, NextFunction } from 'express';`);
      lines.push('');
      for (const mw of middleware) {
        const fnName = this.toCamelCase(mw) + 'Middleware';
        lines.push(`export function ${fnName}(req: Request, _res: Response, next: NextFunction) {`);
        lines.push(`  // Stub: implement ${mw} middleware`);
        lines.push(`  next();`);
        lines.push(`}`);
        lines.push('');
      }
    } else {
      lines.push(
        `import type { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';`
      );
      lines.push('');
      for (const mw of middleware) {
        const fnName = this.toCamelCase(mw) + 'Middleware';
        lines.push(
          `export function ${fnName}(request: FastifyRequest, _reply: FastifyReply, done: HookHandlerDoneFunction) {`
        );
        lines.push(`  // Stub: implement ${mw} middleware`);
        lines.push(`  done();`);
        lines.push(`}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  private emitPackageJson(projectName: string): string {
    const name = this.toKebab(projectName || 'holoscript-service');
    const isExpress = this.options.framework === 'express';

    const dependencies: Record<string, string> = isExpress 
      ? { express: '^4.21.0', dotenv: '^16.4.0' } 
      : { fastify: '^5.0.0', dotenv: '^16.4.0' };

    // Add connector dependencies
    const connectors = this.collectConnectors();
    for (const conn of connectors) {
      const pkg = CONNECTOR_PACKAGES[conn.name as KnownConnector];
      if (pkg) {
        dependencies[pkg] = 'latest'; // Or a specific version if known
      }
    }

    const pkg: Record<string, unknown> = {
      name,
      version: '0.1.0',
      description: `Generated by HoloScript NodeServiceCompiler`,
      main: this.options.typescript ? 'dist/index.js' : 'index.js',
      scripts: {
        ...(this.options.typescript
          ? {
              build: 'tsc',
              start: 'node dist/index.js',
              dev: 'tsx watch index.ts',
            }
          : {
              start: 'node index.js',
              dev: 'node --watch index.js',
            }),
      },
      dependencies,
      ...(this.options.typescript && {
        devDependencies: {
          typescript: '^5.5.0',
          tsx: '^4.0.0',
          ...(isExpress
            ? { '@types/express': '^4.17.21', '@types/node': '^20.0.0' }
            : { '@types/node': '^20.0.0' }),
        },
      }),
    };


    return JSON.stringify(pkg, null, 2);
  }

  private emitTsConfig(): string {
    const config = {
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        outDir: './dist',
        rootDir: './',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        declaration: true,
      },
      include: ['./**/*.ts'],
      exclude: ['node_modules', 'dist'],
    };
    return JSON.stringify(config, null, 2);
  }

  private emitDockerfile(): string {
    const nodeVer = this.options.nodeVersion;
    return [
      `FROM node:${nodeVer}-alpine AS builder`,
      `WORKDIR /app`,
      `COPY package*.json ./`,
      `RUN npm ci`,
      `COPY . .`,
      ...(this.options.typescript ? [`RUN npm run build`] : []),
      ``,
      `FROM node:${nodeVer}-alpine`,
      `WORKDIR /app`,
      `COPY --from=builder /app/package*.json ./`,
      `RUN npm ci --omit=dev`,
      ...(this.options.typescript
        ? [`COPY --from=builder /app/dist ./dist`]
        : [`COPY --from=builder /app/*.js ./`]),
      `EXPOSE ${this.options.port}`,
      `CMD ["npm", "start"]`,
      ``,
    ].join('\n');
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  private collectEnvVars(): EnvVarDecl[] {
    const map = new Map<string, EnvVarDecl>();
    for (const service of this.services) {
      for (const env of service.envVars) {
        map.set(env.name, env);
      }
      // Automagically add env vars required by connectors
      for (const conn of service.connectors) {
        const requirements = CONNECTOR_ENV_REQUIREMENTS[conn.name as KnownConnector] || [];
        for (const req of requirements) {
          if (!map.has(req)) {
            map.set(req, { name: req, required: true });
          }
        }
      }
    }
    return Array.from(map.values());
  }

  private collectConnectors(): ConnectorRef[] {
    const map = new Map<string, ConnectorRef>();
    for (const service of this.services) {
      for (const conn of service.connectors) {
        map.set(conn.name, conn);
      }
    }
    return Array.from(map.values());
  }

  // ── Emitters ──────────────────────────────────────────────────────────

  private emitEnvConfig(envVars: EnvVarDecl[]): string {
    const lines: string[] = [];
    lines.push(`/**`);
    lines.push(` * Environment Configuration`);
    lines.push(` * Auto-generated by HoloScript NodeServiceCompiler`);
    lines.push(` */`);
    lines.push(``);
    lines.push(`import dotenv from 'dotenv';`);
    lines.push(`dotenv.config();`);
    lines.push(``);
    lines.push(`export const env = {`);
    for (const ev of envVars) {
      const fallback = ev.defaultValue ? ` || '${ev.defaultValue}'` : '';
      lines.push(`  ${ev.name}: process.env['${ev.name}']${fallback},`);
    }
    lines.push(`};`);
    lines.push(``);
    lines.push(`// Validation`);
    lines.push(`const missing: string[] = [];`);
    for (const ev of envVars) {
      if (ev.required) {
        lines.push(`if (!env.${ev.name}) missing.push('${ev.name}');`);
      }
    }
    lines.push(``);
    lines.push(`if (missing.length > 0) {`);
    lines.push(`  console.error('Missing required environment variables:', missing.join(', '));`);
    lines.push(`  process.exit(1);`);
    lines.push(`}`);
    return lines.join('\n');
  }

  private emitConnectorsIndex(connectors: ConnectorRef[]): string {
    const lines: string[] = [];
    lines.push(`/**`);
    lines.push(` * Connector Registry`);
    lines.push(` * Auto-generated by HoloScript NodeServiceCompiler`);
    lines.push(` */`);
    lines.push(``);
    for (const conn of connectors) {
      const pkg = CONNECTOR_PACKAGES[conn.name as KnownConnector];
      if (pkg) {
        lines.push(`import { ${this.toClassName(conn.name)}Connector } from '${pkg}';`);
      }
    }
    lines.push(``);
    for (const conn of connectors) {
      const className = this.toClassName(conn.name);
      lines.push(`export const ${conn.name} = new ${className}Connector();`);
    }
    lines.push(``);
    lines.push(`export async function initConnectors(): Promise<void> {`);
    lines.push(`  await Promise.all([`);
    for (const conn of connectors) {
      lines.push(`    ${conn.name}.connect(),`);
    }
    lines.push(`  ]);`);
    for (const conn of connectors) {
      lines.push(`  console.log('[connectors] ${conn.name}: connected');`);
    }
    lines.push(`}`);
    lines.push(``);
    lines.push(`export async function shutdownConnectors(): Promise<void> {`);
    lines.push(`  await Promise.all([`);
    for (const conn of connectors) {
      lines.push(`    ${conn.name}.disconnect(),`);
    }
    lines.push(`  ]);`);
    lines.push(`}`);
    return lines.join('\n');
  }

  private emitRailwayConfig(deploy: DeployConfig): string {
    const config = {
      $schema: 'https://railway.app/railway.schema.json',
      build: {
        builder: 'DOCKERFILE',
        dockerfilePath: 'Dockerfile',
      },
      deploy: {
        numReplicas: 1,
        sleepApplication: false,
        restartPolicyType: 'ON_FAILURE',
        healthcheckPath: deploy.healthPath || '/health',
      },
    };
    return JSON.stringify(config, null, 2);
  }

  private toClassName(name: string): string {
    return name.charAt(0).toUpperCase() + this.toCamelCase(name).slice(1);
  }

  /** Convert HoloObjectProperty[] to a Map for key-based lookup */

  private objectPropsToMap(props: HoloObjectProperty[] | undefined): Map<string, HoloValue> {
    const map = new Map<string, HoloValue>();
    if (!props) return map;
    for (const prop of props) {
      map.set(prop.key, prop.value);
    }
    return map;
  }

  private ext(name: string): string {
    return this.options.typescript ? `${name}.ts` : `${name}.js`;
  }

  private toFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
  }

  private toKebab(name: string): string {
    return name
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[^a-zA-Z0-9]/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase();
  }

  private toCamelCase(name: string): string {
    const parts = name
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (parts.length === 0) return 'unnamed';
    return (
      parts[0].toLowerCase() +
      parts
        .slice(1)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join('')
    );
  }

  private resolveString(val: HoloValue | undefined): string | undefined {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'string') return val;
    if (typeof val === 'object' && 'value' in val) return String(val.value);
    return String(val);
  }

  private resolveNumber(val: HoloValue | undefined): number | undefined {
    if (val === undefined || val === null) return undefined;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const n = Number(val);
      return isNaN(n) ? undefined : n;
    }
    if (typeof val === 'object' && 'value' in val) {
      const n = Number(val.value);
      return isNaN(n) ? undefined : n;
    }
    return undefined;
  }

  private validateConnectorIntegration(): void {
    const connectors = this.collectConnectors();
    const envVars = this.collectEnvVars();
    const envMap = new Map(envVars.map((ev) => [ev.name, ev]));

    for (const conn of connectors) {



      // 1. Check if connector is known
      if (!KNOWN_CONNECTORS.includes(conn.name as KnownConnector)) {
        console.warn(`[NodeServiceCompiler] Warning: Unknown connector '${conn.name}'. Package dependency will not be added.`);
      } else {
        // 2. Check for missing environment variables
        const requirements = CONNECTOR_ENV_REQUIREMENTS[conn.name as KnownConnector] || [];
        for (const req of requirements) {
          if (!envMap.has(req)) {
            // This is a validation error — the user must declare the env var
            throw new Error(`Connector '${conn.name}' requires environment variable '${req}'`);
          }

        }
      }
    }

    // 3. Validate deployment target
    const deployable = this.services.find((s) => s.deploy);
    if (deployable?.deploy) {
      if (deployable.deploy.platform !== 'railway') {
        console.warn(
          `[NodeServiceCompiler] Warning: Platform '${deployable.deploy.platform}' is not explicitly supported for config generation yet.`
        );
      }
    }
  }
}


// ── Dialect Registration ───────────────────────────────────────────────────

/**
 * Register node-service as an MLIR-style dialect.
 * This runs at module load time — importing NodeServiceCompiler auto-registers.
 */
DialectRegistry.register({
  name: 'node-service',
  domain: 'service',
  description: 'Compiles @service traits to Express/Fastify Node.js applications',
  supportedTraits: [
    'service',
    'endpoint',
    'route',
    'handler',
    'middleware',
    'http',
    'gateway',
    'proxy',
    'load_balancer',
    'auth',
    'cors',
    'rate_limit',
    'validation',
    'connector',
    'env',
    'deploy',
    'on_connector_event',
  ],

  riskTier: 'standard',
  factory: (options) => new NodeServiceCompiler(options as NodeServiceCompilerOptions),
  outputExtensions: ['.ts', '.js', '.json'],
  experimental: true,
});
