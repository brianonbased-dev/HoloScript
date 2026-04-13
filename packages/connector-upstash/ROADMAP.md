# @holoscript/connector-upstash — Roadmap

## Current State
- 32 tools across three Upstash products:
  - Redis (12): cache get/set/del, sessions, user prefs, batch ops, TTL management
  - QStash (10): publish, schedule, list messages, DLQ inspect/retry/purge, topics
  - Vector (10): upsert, query, delete, batch upsert, namespace management, index info
- Auth via `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`, `QSTASH_TOKEN`, `UPSTASH_VECTOR_URL`, `UPSTASH_VECTOR_TOKEN`

## Next (v1.1)
- [ ] Rate limiter — `upstash_rate_limit` using Redis sliding window (`EVALSHA` script, configurable window/max)
- [ ] Pipeline chaining — `upstash_pipeline` orchestrating QStash publish -> Redis cache write -> Vector upsert in one call
- [ ] Cache warming — `upstash_cache_warm` bulk-loading keys from a JSON manifest or Vector query results
- [ ] TTL dashboard — `upstash_ttl_report` listing all keys with TTL < threshold (find expiring sessions/caches)
- [ ] QStash workflow — `upstash_workflow_create` chaining multiple QStash steps with retry and DLQ per step
- [ ] Vector hybrid search — `upstash_vector_hybrid` combining metadata filters with semantic similarity

## Future (v2.0)
- [ ] Kafka integration — `upstash_kafka_produce/consume` for event streaming (Upstash Kafka REST API)
- [ ] Cache-aside pattern — `upstash_cache_aside` wrapping any async function with Redis cache + TTL + stale-while-revalidate
- [ ] Vector collections — `upstash_vector_collection_create` managing multiple indexes for different knowledge domains
- [ ] QStash cron — `upstash_cron_create` for recurring scheduled messages (distinct from one-shot schedules)
- [ ] Redis Lua scripting — `upstash_eval` executing custom Lua scripts for atomic multi-key operations
- [ ] Cost tracking — `upstash_usage` reporting daily command counts and bandwidth per product

## Integration Goals
- [ ] Migrate from 5 separate env vars to `CredentialVault` from connector-core (one vault entry per product)
- [ ] connector-moltbook scheduled posts stored as QStash delayed messages with Redis metadata
- [ ] Knowledge store query results cached in Redis (60s TTL) to reduce orchestrator load
- [ ] Vector index serves as local semantic cache for connector-github code search results
