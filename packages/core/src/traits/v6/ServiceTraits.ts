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
import {
  attachV6RuntimeContract,
  detachV6RuntimeContract,
  type V6RuntimeContractDescriptor,
} from './RuntimeContracts';

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
  name: 'service',
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
  onAttach(node: HSPlusNode, config: ServiceConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, serviceContract(config));
  },
  onDetach(node: HSPlusNode, config: ServiceConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, serviceContract(config));
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
  name: 'endpoint',
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
  onAttach(node: HSPlusNode, config: EndpointConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, endpointContract(config));
  },
  onDetach(node: HSPlusNode, config: EndpointConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, endpointContract(config));
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
  name: 'route',
  defaultConfig: {
    path: '/',
    methods: ['GET'],
    prefix: '',
    middleware: [],
    validate_params: true,
  },
  onAttach(node: HSPlusNode, config: RouteConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, routeContract(config));
  },
  onDetach(node: HSPlusNode, config: RouteConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, routeContract(config));
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
  name: 'handler',
  defaultConfig: {
    name: '',
    type: 'async',
    input_schema: '',
    output_schema: '',
    error_handler: '',
    validate_input: true,
    validate_output: false,
  },
  onAttach(node: HSPlusNode, config: HandlerConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, handlerContract(config));
  },
  onDetach(node: HSPlusNode, config: HandlerConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, handlerContract(config));
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
  name: 'middleware',
  defaultConfig: {
    type: 'custom',
    position: 'before',
    priority: 100,
    strategy: '',
    exclude_paths: [],
    module: '',
  },
  onAttach(node: HSPlusNode, config: MiddlewareConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, middlewareContract(config));
  },
  onDetach(node: HSPlusNode, config: MiddlewareConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, middlewareContract(config));
  },
};

export const V6_SERVICE_TRAIT_HANDLERS = [
  serviceHandler,
  endpointHandler,
  routeHandler,
  handlerHandler,
  middlewareHandler,
] as const;

function serviceContract(config: ServiceConfig): V6RuntimeContractDescriptor<ServiceConfig> {
  return {
    trait: 'service',
    kind: 'service',
    key: `${config.protocol}:${config.port}:${config.base_path}`,
    config,
    capabilities: [
      'service.registry',
      `service.protocol.${config.protocol}`,
      `service.framework.${config.framework}`,
      config.cors ? 'service.cors' : 'service.cors.disabled',
      config.logging ? 'service.logging' : 'service.logging.disabled',
      'service.shutdown',
    ],
    events: {
      attached: 'v6:service:registered',
      detached: 'v6:service:detached',
    },
  };
}

function endpointContract(config: EndpointConfig): V6RuntimeContractDescriptor<EndpointConfig> {
  return {
    trait: 'endpoint',
    kind: 'service-endpoint',
    key: `${config.method}:${config.path}:${config.handler || 'anonymous-handler'}`,
    config,
    capabilities: [
      'service.endpoint',
      `http.method.${config.method}`,
      config.rate_limit > 0 ? 'endpoint.rate-limit' : 'endpoint.rate-limit.unlimited',
      config.cache ? 'endpoint.cache' : 'endpoint.cache.disabled',
      'endpoint.timeout',
    ],
    events: {
      attached: 'v6:endpoint:registered',
      detached: 'v6:endpoint:detached',
    },
  };
}

function routeContract(config: RouteConfig): V6RuntimeContractDescriptor<RouteConfig> {
  return {
    trait: 'route',
    kind: 'service-route',
    key: `${config.prefix}${config.path}:${config.methods.join(',')}`,
    config,
    capabilities: [
      'service.route',
      config.validate_params ? 'route.params.validation' : 'route.params.unvalidated',
      ...config.methods.map((method) => `http.method.${method}`),
      ...config.middleware.map((name) => `route.middleware.${name}`),
    ],
    events: {
      attached: 'v6:route:registered',
      detached: 'v6:route:detached',
    },
  };
}

function handlerContract(config: HandlerConfig): V6RuntimeContractDescriptor<HandlerConfig> {
  return {
    trait: 'handler',
    kind: 'service-handler',
    key: `${config.name || 'anonymous-handler'}:${config.type}`,
    config,
    capabilities: [
      'service.handler',
      `handler.type.${config.type}`,
      config.validate_input ? 'handler.input.validation' : 'handler.input.unvalidated',
      config.validate_output ? 'handler.output.validation' : 'handler.output.unvalidated',
      config.error_handler ? 'handler.error-handler' : 'handler.error-handler.default',
    ],
    events: {
      attached: 'v6:handler:registered',
      detached: 'v6:handler:detached',
    },
  };
}

function middlewareContract(
  config: MiddlewareConfig
): V6RuntimeContractDescriptor<MiddlewareConfig> {
  return {
    trait: 'middleware',
    kind: 'service-middleware',
    key: `${config.position}:${config.priority}:${config.type}`,
    config,
    capabilities: [
      'service.middleware',
      `middleware.type.${config.type}`,
      `middleware.position.${config.position}`,
      config.strategy ? `middleware.strategy.${config.strategy}` : 'middleware.strategy.none',
      ...config.exclude_paths.map((path) => `middleware.exclude.${path}`),
      config.module ? 'middleware.custom-module' : 'middleware.inline',
    ],
    events: {
      attached: 'v6:middleware:registered',
      detached: 'v6:middleware:detached',
    },
  };
}
