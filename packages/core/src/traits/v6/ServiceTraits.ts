/**
 * @holoscript/core v6 Universal Service Traits
 *
 * Trait handlers for backend service primitives: service endpoints,
 * routes, handlers, and middleware chains.
 *
 * @example
 * ```hsplus
 * service "UserAPI" {
 *   port: 3000
 *   base_path: "/api/v1"
 *
 *   @endpoint {
 *     method: "GET"
 *     path: "/users"
 *     handler: "listUsers"
 *   }
 *
 *   @middleware {
 *     type: "auth"
 *     strategy: "jwt"
 *   }
 * }
 * ```
 */

import type { TraitHandler, TraitContext } from '../TraitTypes';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

// ── Service Trait ──────────────────────────────────────────────────────────────

export type ServiceProtocol = 'http' | 'https' | 'http2' | 'grpc' | 'websocket';
export type ServiceFramework = 'express' | 'fastify' | 'koa' | 'hono';

export interface ServiceConfig {
  /** Service port number */
  port: number;
  /** Base URL path prefix */
  base_path: string;
  /** Transport protocol */
  protocol: ServiceProtocol;
  /** Target framework for code generation */
  framework: ServiceFramework;
  /** Enable CORS */
  cors: boolean;
  /** Allowed CORS origins */
  cors_origins: string[];
  /** Request body size limit */
  body_limit: string;
  /** Enable request logging */
  logging: boolean;
  /** Graceful shutdown timeout (ms) */
  shutdown_timeout: number;
}

export const serviceHandler: TraitHandler<ServiceConfig> = {
  name: 'service' as any,
  defaultConfig: {
    port: 3000,
    base_path: '/',
    protocol: 'http',
    framework: 'express',
    cors: true,
    cors_origins: ['*'],
    body_limit: '10mb',
    logging: true,
    shutdown_timeout: 5000,
  },
  onAttach(_node: HSPlusNode, _config: ServiceConfig, _context: TraitContext) {
    // v6 stub: service registration
  },
  onDetach(_node: HSPlusNode, _config: ServiceConfig, _context: TraitContext) {
    // v6 stub: service teardown
  },
};

// ── Endpoint Trait ─────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface EndpointConfig {
  /** HTTP method */
  method: HttpMethod;
  /** URL path (relative to service base_path) */
  path: string;
  /** Handler function name */
  handler: string;
  /** Response content type */
  content_type: string;
  /** Rate limit (requests per minute, 0 = unlimited) */
  rate_limit: number;
  /** Request timeout (ms) */
  timeout: number;
  /** Enable response caching */
  cache: boolean;
  /** Cache TTL (seconds) */
  cache_ttl: number;
}

export const endpointHandler: TraitHandler<EndpointConfig> = {
  name: 'endpoint' as any,
  defaultConfig: {
    method: 'GET',
    path: '/',
    handler: '',
    content_type: 'application/json',
    rate_limit: 0,
    timeout: 30000,
    cache: false,
    cache_ttl: 60,
  },
  onAttach(_node: HSPlusNode, _config: EndpointConfig, _context: TraitContext) {
    // v6 stub: endpoint registration
  },
};

// ── Route Trait ─────────────────────────────────────────────────────────────────

export interface RouteConfig {
  /** Route path pattern (supports :params and wildcards) */
  path: string;
  /** HTTP methods this route accepts */
  methods: HttpMethod[];
  /** Route group/prefix */
  prefix: string;
  /** Route-level middleware names */
  middleware: string[];
  /** Enable route parameter validation */
  validate_params: boolean;
}

export const routeHandler: TraitHandler<RouteConfig> = {
  name: 'route' as any,
  defaultConfig: {
    path: '/',
    methods: ['GET'],
    prefix: '',
    middleware: [],
    validate_params: true,
  },
  onAttach(_node: HSPlusNode, _config: RouteConfig, _context: TraitContext) {
    // v6 stub: route registration
  },
};

// ── Handler Trait ──────────────────────────────────────────────────────────────

export type HandlerType = 'sync' | 'async' | 'stream' | 'sse';

export interface HandlerConfig {
  /** Handler function name */
  name: string;
  /** Handler execution type */
  type: HandlerType;
  /** Input schema reference */
  input_schema: string;
  /** Output schema reference */
  output_schema: string;
  /** Error handler name */
  error_handler: string;
  /** Enable request validation */
  validate_input: boolean;
  /** Enable response validation */
  validate_output: boolean;
}

export const handlerHandler: TraitHandler<HandlerConfig> = {
  name: 'handler' as any,
  defaultConfig: {
    name: '',
    type: 'async',
    input_schema: '',
    output_schema: '',
    error_handler: '',
    validate_input: true,
    validate_output: false,
  },
  onAttach(_node: HSPlusNode, _config: HandlerConfig, _context: TraitContext) {
    // v6 stub: handler registration
  },
};

// ── Middleware Trait ───────────────────────────────────────────────────────────

export type MiddlewareType =
  | 'auth'
  | 'cors'
  | 'rate_limit'
  | 'logging'
  | 'compression'
  | 'validation'
  | 'custom';
export type MiddlewarePosition = 'before' | 'after' | 'error';

export interface MiddlewareConfig {
  /** Middleware type */
  type: MiddlewareType;
  /** Execution position in chain */
  position: MiddlewarePosition;
  /** Priority (lower = earlier execution) */
  priority: number;
  /** Auth strategy (when type = auth) */
  strategy: string;
  /** Paths to exclude from this middleware */
  exclude_paths: string[];
  /** Custom middleware module path */
  module: string;
}

export const middlewareHandler: TraitHandler<MiddlewareConfig> = {
  name: 'middleware' as any,
  defaultConfig: {
    type: 'custom',
    position: 'before',
    priority: 100,
    strategy: '',
    exclude_paths: [],
    module: '',
  },
  onAttach(_node: HSPlusNode, _config: MiddlewareConfig, _context: TraitContext) {
    // v6 stub: middleware registration
  },
};
