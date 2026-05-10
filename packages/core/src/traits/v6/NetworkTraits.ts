/**
 * @holoscript/core v6 Universal Network Traits
 *
 * Trait handlers for HTTP clients, WebSocket connections, gRPC services,
 * and GraphQL endpoints.
 *
 * @example
 * ```hsplus
 * object "APIGateway" {
 *   @http {
 *     base_url: "https://api.example.com"
 *     timeout: 5000
 *     retry: 3
 *   }
 *
 *   @websocket {
 *     url: "wss://realtime.example.com"
 *     reconnect: true
 *     heartbeat_interval: 30000
 *   }
 *
 *   @graphql {
 *     endpoint: "/graphql"
 *     introspection: true
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

// ── HTTP Client Trait ──────────────────────────────────────────────────────────

export interface HttpConfig {
  /** Base URL for all requests */
  base_url: string;
  /** Default request timeout (ms) */
  timeout: number;
  /** Retry count on failure */
  retry: number;
  /** Retry delay (ms) */
  retry_delay: number;
  /** Default request headers */
  headers: Record<string, string>;
  /** Auth token header name */
  auth_header: string;
  /** Enable response compression */
  compression: boolean;
  /** Follow redirects */
  follow_redirects: boolean;
  /** Maximum redirects */
  max_redirects: number;
}

export const httpHandler: TraitHandler<HttpConfig> = {
  name: 'http',
  defaultConfig: {
    base_url: '',
    timeout: 30000,
    retry: 0,
    retry_delay: 1000,
    headers: {},
    auth_header: 'Authorization',
    compression: true,
    follow_redirects: true,
    max_redirects: 5,
  },
  onAttach(node: HSPlusNode, config: HttpConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, httpContract(config));
  },
  onDetach(node: HSPlusNode, config: HttpConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, httpContract(config));
  },
};

// ── WebSocket Trait ────────────────────────────────────────────────────────────

export type WebSocketProtocol = 'ws' | 'wss';

export interface WebSocketConfig {
  /** WebSocket URL */
  url: string;
  /** Sub-protocols */
  protocols: string[];
  /** Auto-reconnect on disconnect */
  reconnect: boolean;
  /** Max reconnect attempts (0 = unlimited) */
  max_reconnect_attempts: number;
  /** Reconnect delay (ms) */
  reconnect_delay: number;
  /** Heartbeat/ping interval (ms, 0 = disabled) */
  heartbeat_interval: number;
  /** Message format */
  message_format: 'json' | 'binary' | 'text';
  /** Buffer size (bytes) */
  buffer_size: number;
}

export const websocketHandler: TraitHandler<WebSocketConfig> = {
  name: 'websocket',
  defaultConfig: {
    url: '',
    protocols: [],
    reconnect: true,
    max_reconnect_attempts: 10,
    reconnect_delay: 1000,
    heartbeat_interval: 30000,
    message_format: 'json',
    buffer_size: 65536,
  },
  onAttach(node: HSPlusNode, config: WebSocketConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, websocketContract(config));
  },
  onDetach(node: HSPlusNode, config: WebSocketConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, websocketContract(config));
  },
};

// ── gRPC Trait ─────────────────────────────────────────────────────────────────

export interface GrpcConfig {
  /** gRPC service host:port */
  host: string;
  /** Proto file path */
  proto: string;
  /** Service package name */
  package: string;
  /** Enable TLS */
  tls: boolean;
  /** Max message size (bytes) */
  max_message_size: number;
  /** Deadline/timeout (ms) */
  deadline: number;
  /** Load balancing strategy */
  load_balancing: 'round_robin' | 'pick_first' | 'grpclb';
  /** Enable reflection */
  reflection: boolean;
}

export const grpcHandler: TraitHandler<GrpcConfig> = {
  name: 'grpc',
  defaultConfig: {
    host: 'localhost:50051',
    proto: '',
    package: '',
    tls: false,
    max_message_size: 4194304,
    deadline: 30000,
    load_balancing: 'round_robin',
    reflection: false,
  },
  onAttach(node: HSPlusNode, config: GrpcConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, grpcContract(config));
  },
  onDetach(node: HSPlusNode, config: GrpcConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, grpcContract(config));
  },
};

// ── GraphQL Trait ──────────────────────────────────────────────────────────────

export interface GraphQLConfig {
  /** GraphQL endpoint path */
  endpoint: string;
  /** Schema file path */
  schema: string;
  /** Enable introspection */
  introspection: boolean;
  /** Enable GraphQL playground/explorer */
  playground: boolean;
  /** Query depth limit */
  depth_limit: number;
  /** Query complexity limit */
  complexity_limit: number;
  /** Enable persisted queries */
  persisted_queries: boolean;
  /** Subscription transport */
  subscription_transport: 'ws' | 'sse' | 'none';
}

export const graphqlHandler: TraitHandler<GraphQLConfig> = {
  name: 'graphql',
  defaultConfig: {
    endpoint: '/graphql',
    schema: '',
    introspection: true,
    playground: true,
    depth_limit: 10,
    complexity_limit: 1000,
    persisted_queries: false,
    subscription_transport: 'ws',
  },
  onAttach(node: HSPlusNode, config: GraphQLConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, graphqlContract(config));
  },
  onDetach(node: HSPlusNode, config: GraphQLConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, graphqlContract(config));
  },
};

// ── OPC-UA Trait ───────────────────────────────────────────────────────────────

export interface OpcUaConfig {
  /** OPC-UA server endpoint URL */
  endpoint_url: string;
  /** Security policy (None, Basic128Rsa15, Basic256, Basic256Sha256) */
  security_policy: string;
  /** Message security mode (None, Sign, SignAndEncrypt) */
  security_mode: string;
  /** Application URI */
  application_uri: string;
  /** Namespace index for custom nodes */
  namespace_index: number;
  /** Polling interval (ms) */
  polling_interval: number;
  /** Enable subscriptions (monitored items) */
  subscriptions: boolean;
  /** Max monitored items per subscription */
  max_monitored_items: number;
}

export const opcUaHandler: TraitHandler<OpcUaConfig> = {
  name: 'opc_ua',
  defaultConfig: {
    endpoint_url: 'opc.tcp://localhost:4840',
    security_policy: 'None',
    security_mode: 'None',
    application_uri: 'urn:holoscript:client',
    namespace_index: 1,
    polling_interval: 1000,
    subscriptions: true,
    max_monitored_items: 100,
  },
  onAttach(node: HSPlusNode, config: OpcUaConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, opcUaContract(config));
  },
  onDetach(node: HSPlusNode, config: OpcUaConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, opcUaContract(config));
  },
};

// ── Modbus Trait ───────────────────────────────────────────────────────────────

export interface ModbusConfig {
  /** Connection type (tcp, rtu, ascii) */
  connection_type: string;
  /** Host:port for TCP, serial port for RTU/ASCII */
  host: string;
  /** Unit/slave ID */
  unit_id: number;
  /** Default register offset */
  register_offset: number;
  /** Polling interval (ms) */
  polling_interval: number;
  /** Timeout (ms) */
  timeout: number;
  /** Retry count */
  retry: number;
}

export const modbusHandler: TraitHandler<ModbusConfig> = {
  name: 'modbus',
  defaultConfig: {
    connection_type: 'tcp',
    host: 'localhost:502',
    unit_id: 1,
    register_offset: 0,
    polling_interval: 1000,
    timeout: 5000,
    retry: 3,
  },
  onAttach(node: HSPlusNode, config: ModbusConfig, context: TraitContext) {
    attachV6RuntimeContract(node, context, modbusContract(config));
  },
  onDetach(node: HSPlusNode, config: ModbusConfig, context: TraitContext) {
    detachV6RuntimeContract(node, context, modbusContract(config));
  },
};

export const V6_NETWORK_TRAIT_HANDLERS = [
  httpHandler,
  websocketHandler,
  grpcHandler,
  graphqlHandler,
  opcUaHandler,
  modbusHandler,
] as const;

function httpContract(config: HttpConfig): V6RuntimeContractDescriptor<HttpConfig> {
  return {
    trait: 'http',
    kind: 'network-http-client',
    key: config.base_url || 'relative-http-client',
    config,
    capabilities: [
      'network.http-client',
      config.compression ? 'http.compression' : 'http.compression.disabled',
      config.follow_redirects ? 'http.redirects' : 'http.redirects.disabled',
      config.retry > 0 ? 'http.retry' : 'http.retry.disabled',
      config.auth_header ? `http.auth-header.${config.auth_header}` : 'http.auth-header.none',
    ],
    events: {
      attached: 'v6:http:registered',
      detached: 'v6:http:detached',
    },
  };
}

function websocketContract(config: WebSocketConfig): V6RuntimeContractDescriptor<WebSocketConfig> {
  return {
    trait: 'websocket',
    kind: 'network-websocket-client',
    key: config.url || 'unbound-websocket',
    config,
    capabilities: [
      'network.websocket',
      config.reconnect ? 'websocket.reconnect' : 'websocket.reconnect.disabled',
      config.heartbeat_interval > 0 ? 'websocket.heartbeat' : 'websocket.heartbeat.disabled',
      `websocket.message-format.${config.message_format}`,
      ...config.protocols.map((protocol) => `websocket.protocol.${protocol}`),
    ],
    events: {
      attached: 'v6:websocket:registered',
      detached: 'v6:websocket:detached',
    },
  };
}

function grpcContract(config: GrpcConfig): V6RuntimeContractDescriptor<GrpcConfig> {
  return {
    trait: 'grpc',
    kind: 'network-grpc-channel',
    key: `${config.host}:${config.package || 'default-package'}`,
    config,
    capabilities: [
      'network.grpc',
      config.tls ? 'grpc.tls' : 'grpc.plaintext',
      `grpc.load-balancing.${config.load_balancing}`,
      config.reflection ? 'grpc.reflection' : 'grpc.reflection.disabled',
      config.proto ? 'grpc.proto' : 'grpc.proto.missing',
    ],
    events: {
      attached: 'v6:grpc:registered',
      detached: 'v6:grpc:detached',
    },
  };
}

function graphqlContract(config: GraphQLConfig): V6RuntimeContractDescriptor<GraphQLConfig> {
  return {
    trait: 'graphql',
    kind: 'network-graphql-endpoint',
    key: config.endpoint || '/graphql',
    config,
    capabilities: [
      'network.graphql',
      config.schema ? 'graphql.schema' : 'graphql.schema.inline-or-missing',
      config.introspection ? 'graphql.introspection' : 'graphql.introspection.disabled',
      config.playground ? 'graphql.playground' : 'graphql.playground.disabled',
      config.persisted_queries ? 'graphql.persisted-queries' : 'graphql.persisted-queries.disabled',
      `graphql.subscription.${config.subscription_transport}`,
    ],
    events: {
      attached: 'v6:graphql:registered',
      detached: 'v6:graphql:detached',
    },
  };
}

function opcUaContract(config: OpcUaConfig): V6RuntimeContractDescriptor<OpcUaConfig> {
  return {
    trait: 'opc_ua',
    kind: 'network-opc-ua-session',
    key: config.endpoint_url,
    config,
    capabilities: [
      'network.opc-ua',
      `opcua.security-policy.${config.security_policy}`,
      `opcua.security-mode.${config.security_mode}`,
      config.subscriptions ? 'opcua.subscriptions' : 'opcua.subscriptions.disabled',
      'opcua.polling',
    ],
    events: {
      attached: 'v6:opc_ua:registered',
      detached: 'v6:opc_ua:detached',
    },
  };
}

function modbusContract(config: ModbusConfig): V6RuntimeContractDescriptor<ModbusConfig> {
  return {
    trait: 'modbus',
    kind: 'network-modbus-client',
    key: `${config.connection_type}:${config.host}:${config.unit_id}`,
    config,
    capabilities: [
      'network.modbus',
      `modbus.connection.${config.connection_type}`,
      'modbus.polling',
      config.retry > 0 ? 'modbus.retry' : 'modbus.retry.disabled',
    ],
    events: {
      attached: 'v6:modbus:registered',
      detached: 'v6:modbus:detached',
    },
  };
}
