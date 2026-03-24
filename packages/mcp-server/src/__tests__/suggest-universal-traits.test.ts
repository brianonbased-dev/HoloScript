/**
 * Tests for suggest_universal_traits MCP tool
 *
 * Validates the UNIVERSAL_TRAIT_KEYWORDS mapping and suggestUniversalTraits()
 * function across all 8 v6 domains: service, contract, data, network,
 * pipeline, metric, container, resilience.
 */
import { describe, it, expect } from 'vitest';
import { suggestUniversalTraits } from '../generators';

describe('suggestUniversalTraits', () => {
  // ── Service domain ───────────────────────────────────────────────────────
  describe('service domain', () => {
    it('should suggest service traits for REST API descriptions', () => {
      const result = suggestUniversalTraits('a REST API for user management');
      expect(result.traits).toContain('@rest_resource');
      expect(result.traits).toContain('@endpoint');
      expect(result.domains).toHaveProperty('service');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should suggest gateway traits for API gateway descriptions', () => {
      const result = suggestUniversalTraits('an API gateway with rate limiting');
      expect(result.traits).toContain('@api_gateway');
      expect(result.traits).toContain('@rate_limiter');
    });

    it('should suggest middleware traits', () => {
      const result = suggestUniversalTraits('authentication middleware');
      expect(result.traits).toContain('@middleware');
      expect(result.domains).toHaveProperty('service');
    });

    it('should suggest load balancer traits', () => {
      const result = suggestUniversalTraits('a load balancer for microservices');
      expect(result.traits).toContain('@load_balancer');
    });

    it('should suggest webhook traits', () => {
      const result = suggestUniversalTraits('a webhook endpoint that receives payment events');
      expect(result.traits).toContain('@webhook_receiver');
      expect(result.traits).toContain('@webhook_sender');
    });

    it('should suggest CORS policy traits', () => {
      const result = suggestUniversalTraits('an endpoint with cors enabled');
      expect(result.traits).toContain('@cors_policy');
    });

    it('should suggest SSE traits', () => {
      const result = suggestUniversalTraits('server-sent events for live sse updates');
      expect(result.traits).toContain('@sse_endpoint');
    });
  });

  // ── Contract domain ──────────────────────────────────────────────────────
  describe('contract domain', () => {
    it('should suggest schema traits for data validation', () => {
      const result = suggestUniversalTraits('a JSON schema for user validation');
      expect(result.traits).toContain('@schema');
      expect(result.traits).toContain('@contract');
      expect(result.traits).toContain('@json_schema');
      expect(result.domains).toHaveProperty('contract');
    });

    it('should suggest protobuf traits', () => {
      const result = suggestUniversalTraits('protobuf message definitions');
      expect(result.traits).toContain('@protobuf_message');
      expect(result.traits).toContain('@serializer');
    });

    it('should suggest OpenAPI traits', () => {
      const result = suggestUniversalTraits('openapi spec documentation');
      expect(result.traits).toContain('@openapi_path');
      expect(result.traits).toContain('@openapi_response');
    });

    it('should suggest DTO traits', () => {
      const result = suggestUniversalTraits('data transfer object dto for API responses');
      expect(result.traits).toContain('@dto');
      expect(result.traits).toContain('@data_transformer');
    });

    it('should suggest contract test traits', () => {
      const result = suggestUniversalTraits('contract test for consumer-driven contracts');
      expect(result.traits).toContain('@contract_test');
      expect(result.traits).toContain('@consumer_contract');
    });
  });

  // ── Data domain ──────────────────────────────────────────────────────────
  describe('data domain', () => {
    it('should suggest database traits', () => {
      const result = suggestUniversalTraits('a database model for users');
      expect(result.traits).toContain('@db');
      expect(result.traits).toContain('@model');
      expect(result.domains).toHaveProperty('data');
    });

    it('should suggest cache traits', () => {
      const result = suggestUniversalTraits('redis cache for session data');
      expect(result.traits).toContain('@cache');
      expect(result.traits).toContain('@key_value_store');
    });

    it('should suggest migration traits', () => {
      const result = suggestUniversalTraits('database migration scripts');
      expect(result.traits).toContain('@migration');
      expect(result.traits).toContain('@db');
    });

    it('should suggest ORM/repository traits', () => {
      const result = suggestUniversalTraits('orm repository for data access');
      expect(result.traits).toContain('@repository');
      expect(result.traits).toContain('@data_mapper');
    });

    it('should suggest CQRS traits', () => {
      const result = suggestUniversalTraits('cqrs pattern for read/write separation');
      expect(result.traits).toContain('@cqrs_command');
      expect(result.traits).toContain('@cqrs_query');
    });

    it('should suggest postgres traits', () => {
      const result = suggestUniversalTraits('postgres relational database');
      expect(result.traits).toContain('@relational_db');
    });

    it('should suggest vector DB traits', () => {
      const result = suggestUniversalTraits('vector db for semantic search');
      expect(result.traits).toContain('@vector_db');
      expect(result.traits).toContain('@search_index');
    });
  });

  // ── Network domain ──────────────────────────────────────────────────────
  describe('network domain', () => {
    it('should suggest WebSocket traits', () => {
      const result = suggestUniversalTraits('websocket server for real-time chat');
      expect(result.traits).toContain('@websocket');
      expect(result.domains).toHaveProperty('network');
    });

    it('should suggest gRPC traits', () => {
      const result = suggestUniversalTraits('grpc service for inter-service communication');
      expect(result.traits).toContain('@grpc');
    });

    it('should suggest JWT traits', () => {
      const result = suggestUniversalTraits('jwt authentication and token verification');
      expect(result.traits).toContain('@jwt_config');
      expect(result.traits).toContain('@jwt_verifier');
    });

    it('should suggest TLS traits', () => {
      const result = suggestUniversalTraits('tls encrypted connections');
      expect(result.traits).toContain('@tls_config');
    });
  });

  // ── Pipeline domain ─────────────────────────────────────────────────────
  describe('pipeline domain', () => {
    it('should suggest pipeline traits', () => {
      const result = suggestUniversalTraits('a data pipeline for ETL processing');
      expect(result.traits).toContain('@pipeline');
      expect(result.traits).toContain('@etl_pipeline');
      expect(result.domains).toHaveProperty('pipeline');
    });

    it('should suggest queue/worker traits', () => {
      const result = suggestUniversalTraits('a job queue with background workers');
      expect(result.traits).toContain('@queue');
      expect(result.traits).toContain('@worker');
    });

    it('should suggest Kafka traits', () => {
      const result = suggestUniversalTraits('kafka message broker with topics');
      expect(result.traits).toContain('@message_broker');
      expect(result.traits).toContain('@topic');
    });

    it('should suggest dead letter queue traits', () => {
      const result = suggestUniversalTraits('dead letter queue for failed messages');
      expect(result.traits).toContain('@dlq_handler');
    });

    it('should suggest saga traits', () => {
      const result = suggestUniversalTraits('distributed saga orchestration');
      expect(result.traits).toContain('@saga_orchestrator');
      expect(result.traits).toContain('@compensating_transaction');
    });

    it('should suggest workflow traits', () => {
      const result = suggestUniversalTraits('workflow engine with state machine');
      expect(result.traits).toContain('@workflow_engine');
      expect(result.traits).toContain('@state_machine');
    });
  });

  // ── Metric domain ──────────────────────────────────────────────────────
  describe('metric domain', () => {
    it('should suggest metric/monitoring traits', () => {
      const result = suggestUniversalTraits('prometheus metrics with grafana dashboards');
      expect(result.traits).toContain('@prometheus_exporter');
      expect(result.traits).toContain('@grafana_dashboard');
      expect(result.domains).toHaveProperty('metric');
    });

    it('should suggest tracing traits', () => {
      const result = suggestUniversalTraits('distributed tracing with spans');
      expect(result.traits).toContain('@trace');
      expect(result.traits).toContain('@span');
    });

    it('should suggest health check traits', () => {
      const result = suggestUniversalTraits('liveness health check probe');
      expect(result.traits).toContain('@health_check');
    });

    it('should suggest SLO traits', () => {
      const result = suggestUniversalTraits('slo targets and error budgets');
      expect(result.traits).toContain('@slo');
      expect(result.traits).toContain('@sli');
      expect(result.traits).toContain('@error_budget');
    });

    it('should suggest audit log traits', () => {
      const result = suggestUniversalTraits('audit log for compliance');
      expect(result.traits).toContain('@audit_log');
      expect(result.traits).toContain('@access_log');
    });
  });

  // ── Container domain ───────────────────────────────────────────────────
  describe('container domain', () => {
    it('should suggest Docker traits', () => {
      const result = suggestUniversalTraits('docker container with Dockerfile');
      expect(result.traits).toContain('@dockerfile');
      expect(result.traits).toContain('@docker_compose');
      expect(result.domains).toHaveProperty('container');
    });

    it('should suggest Kubernetes traits', () => {
      const result = suggestUniversalTraits('kubernetes deployment with auto scaling');
      expect(result.traits).toContain('@kubernetes_deployment');
      expect(result.traits).toContain('@kubernetes_service');
      expect(result.traits).toContain('@scaling');
    });

    it('should suggest Helm traits', () => {
      const result = suggestUniversalTraits('helm chart for application packaging');
      expect(result.traits).toContain('@helm_chart');
      expect(result.traits).toContain('@helm_values');
    });

    it('should suggest Terraform traits', () => {
      const result = suggestUniversalTraits('terraform infrastructure as code');
      expect(result.traits).toContain('@terraform_resource');
      expect(result.traits).toContain('@terraform_module');
    });

    it('should suggest secret traits', () => {
      const result = suggestUniversalTraits('secret management for API keys');
      expect(result.traits).toContain('@secret');
    });
  });

  // ── Resilience domain ──────────────────────────────────────────────────
  describe('resilience domain', () => {
    it('should suggest circuit breaker traits', () => {
      const result = suggestUniversalTraits('circuit breaker for fault tolerance');
      expect(result.traits).toContain('@circuit_breaker');
      expect(result.domains).toHaveProperty('resilience');
    });

    it('should suggest retry traits', () => {
      const result = suggestUniversalTraits('retry logic with exponential backoff');
      expect(result.traits).toContain('@retry');
      expect(result.traits).toContain('@exponential_backoff');
    });

    it('should suggest timeout/fallback traits', () => {
      const result = suggestUniversalTraits('request timeout with fallback response');
      expect(result.traits).toContain('@timeout');
      expect(result.traits).toContain('@fallback');
    });

    it('should suggest canary release traits', () => {
      const result = suggestUniversalTraits('canary deployment strategy');
      expect(result.traits).toContain('@canary_release');
    });

    it('should suggest chaos engineering traits', () => {
      const result = suggestUniversalTraits('chaos engineering with fault injection');
      expect(result.traits).toContain('@chaos_experiment');
      expect(result.traits).toContain('@fault_injection');
    });
  });

  // ── Cross-domain inference ──────────────────────────────────────────────
  describe('cross-domain inference', () => {
    it('should auto-suggest health_check when service traits are present', () => {
      const result = suggestUniversalTraits('a REST API service');
      expect(result.traits).toContain('@health_check');
      expect(result.reasoning['@health_check']).toContain('Auto-suggested');
    });

    it('should auto-suggest resilience when pipeline traits are present', () => {
      const result = suggestUniversalTraits('a message queue with workers');
      expect(result.traits).toContain('@retry');
      expect(result.traits).toContain('@circuit_breaker');
      expect(result.reasoning['@retry']).toContain('Auto-suggested');
    });

    it('should auto-suggest structured_log when data traits are present alone', () => {
      const result = suggestUniversalTraits('a database model');
      expect(result.traits).toContain('@structured_log');
      expect(result.reasoning['@structured_log']).toContain('Auto-suggested');
    });

    it('should return multiple domains for cross-cutting descriptions', () => {
      const result = suggestUniversalTraits('REST API with Redis cache and Kafka pipeline');
      expect(Object.keys(result.domains).length).toBeGreaterThanOrEqual(3);
      expect(result.domains).toHaveProperty('service');
      expect(result.domains).toHaveProperty('data');
      expect(result.domains).toHaveProperty('pipeline');
    });

    it('should have higher confidence for multi-domain matches', () => {
      const single = suggestUniversalTraits('a simple endpoint');
      const multi = suggestUniversalTraits('REST API with Redis cache, Kafka queue, and Prometheus metrics');
      expect(multi.confidence).toBeGreaterThan(single.confidence);
    });
  });

  // ── Domain filtering ──────────────────────────────────────────────────
  describe('domain filtering', () => {
    it('should filter to service domain only', () => {
      const result = suggestUniversalTraits('REST API with Redis cache', 'service');
      for (const trait of result.traits) {
        // Filtered results should only be from service domain (plus auto-inferred)
        const isServiceOrInferred = result.domains['service']?.includes(trait) ||
          result.reasoning[trait]?.includes('Auto-suggested');
        expect(isServiceOrInferred).toBe(true);
      }
    });

    it('should filter to data domain only', () => {
      const result = suggestUniversalTraits('database model with cache', 'data');
      expect(result.domains).toHaveProperty('data');
      // Should not have service domain
      expect(result.domains).not.toHaveProperty('service');
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────────
  describe('edge cases', () => {
    it('should return defaults for empty-ish descriptions', () => {
      const result = suggestUniversalTraits('a thing');
      expect(result.traits.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should use context parameter for additional matching', () => {
      const withoutContext = suggestUniversalTraits('user management');
      const withContext = suggestUniversalTraits('user management', undefined, 'REST API with JWT auth');
      expect(withContext.traits.length).toBeGreaterThan(withoutContext.traits.length);
    });

    it('should not duplicate traits', () => {
      const result = suggestUniversalTraits('REST API endpoint with REST resource');
      const uniqueTraits = new Set(result.traits);
      expect(result.traits.length).toBe(uniqueTraits.size);
    });

    it('should include reasoning for every trait', () => {
      const result = suggestUniversalTraits('kubernetes deployment with prometheus metrics');
      for (const trait of result.traits) {
        expect(result.reasoning).toHaveProperty(trait);
      }
    });
  });
});
