/**
 * @holoscript/core v6 Universal Traits
 *
 * Additive namespace for v6 "Universal Semantic Platform" traits.
 * These traits extend HoloScript beyond spatial/agent/simulation domains
 * into backend services, data infrastructure, networking, and deployment.
 *
 * Categories:
 * - Service: endpoints, routes, handlers, middleware
 * - Contract: schemas, validators, serializers
 * - Data: databases, models, queries, migrations, caching
 * - Network: HTTP, WebSocket, gRPC, GraphQL
 * - Pipeline: streams, queues, workers, schedulers
 * - Metric: observability, tracing, logging, health checks
 * - Container: deployment, scaling, secrets
 * - Resilience: circuit breakers, retry, timeout, fallback, bulkhead
 */

// Service primitives
export * from './ServiceTraits';

// Contract & schema validation
export * from './ContractTraits';

// Data access layer
export * from './DataTraits';

// Network protocols
export * from './NetworkTraits';

// Data pipelines & messaging
export * from './PipelineTraits';

// Observability & metrics
export * from './MetricTraits';

// Container & deployment
export * from './ContainerTraits';

// Resilience patterns
export * from './ResilienceTraits';
