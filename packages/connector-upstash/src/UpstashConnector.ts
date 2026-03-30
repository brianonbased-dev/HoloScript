import { ServiceConnector, McpRegistrar } from '@holoscript/connector-core';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { RedisSubsystem } from './subsystems/RedisSubsystem.js';
import { VectorSubsystem } from './subsystems/VectorSubsystem.js';
import { QStashSubsystem } from './subsystems/QStashSubsystem.js';
import { upstashTools } from './tools.js';

/**
 * UpstashConnector bridges HoloScript Studio to Upstash services.
 *
 * Three integrated subsystems:
 * 1. Redis - Compiled scene caching, session state, user preferences
 * 2. Vector - Composition embeddings for semantic "find similar" search
 * 3. QStash - Scheduled compilation triggers, health monitoring, deployments
 *
 * Provides 32 MCP tools for:
 * - Scene caching with TTL (single + batch)
 * - Cache statistics and flush operations
 * - Session persistence across CLI commands
 * - User preference storage
 * - Semantic similarity search for compositions (vector + text)
 * - Batch vector upsert and text-based auto-embedding
 * - Cron-based compilation schedules
 * - One-time delayed tasks
 * - Dead letter queue management
 * - Webhook signature verification
 * - CI/CD integration (nightly compilation, health pings, deployment triggers)
 *
 * Authentication via environment variables:
 * - UPSTASH_REDIS_URL, UPSTASH_REDIS_TOKEN
 * - UPSTASH_VECTOR_URL, UPSTASH_VECTOR_TOKEN
 * - QSTASH_TOKEN, QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY
 */
export class UpstashConnector extends ServiceConnector {
  private redis: RedisSubsystem;
  private vector: VectorSubsystem;
  private qstash: QStashSubsystem;
  private registrar = new McpRegistrar();

  constructor() {
    super();
    this.redis = new RedisSubsystem();
    this.vector = new VectorSubsystem();
    this.qstash = new QStashSubsystem();
  }

  /**
   * Connect all three subsystems and register with MCP orchestrator.
   */
  async connect(): Promise<void> {
    const errors: string[] = [];

    // Try connecting to each subsystem independently
    // (some may be optional depending on use case)
    try {
      await this.redis.connect();
    } catch (error) {
      errors.push(`Redis: ${error}`);
    }

    try {
      await this.vector.connect();
    } catch (error) {
      errors.push(`Vector: ${error}`);
    }

    try {
      await this.qstash.connect();
    } catch (error) {
      errors.push(`QStash: ${error}`);
    }

    // If all subsystems failed, throw aggregate error
    if (errors.length === 3) {
      throw new Error(`All Upstash subsystems failed to connect:\n${errors.join('\n')}`);
    }

    // If at least one subsystem connected, mark as connected
    this.isConnected = true;

    // Register with MCP orchestrator
    try {
      await this.registrar.register({
        name: 'holoscript-upstash',
        url: 'http://localhost:0', // Local connector
        tools: upstashTools.map((t) => t.name),
      });
    } catch (error) {
      // Non-fatal: orchestrator registration failure doesn't prevent local usage
      console.warn('MCP orchestrator registration failed:', error);
    }

    // Log connection status
    if (errors.length > 0) {
      console.warn('Some Upstash subsystems failed to connect (partial mode):', errors);
    }
  }

  /**
   * Disconnect all subsystems and cleanup.
   */
  async disconnect(): Promise<void> {
    await Promise.all([
      this.redis.disconnect(),
      this.vector.disconnect(),
      this.qstash.disconnect(),
    ]);

    this.isConnected = false;
  }

  /**
   * Health check - verify connectivity for all connected subsystems.
   */
  async health(): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    const [redisHealth, vectorHealth, qstashHealth] = await Promise.all([
      this.redis.health(),
      this.vector.health(),
      this.qstash.health(),
    ]);

    // Return true if at least one subsystem is healthy
    return redisHealth || vectorHealth || qstashHealth;
  }

  /**
   * List all available MCP tools.
   */
  async listTools(): Promise<Tool[]> {
    return upstashTools;
  }

  /**
   * Execute MCP tool by routing to the appropriate subsystem.
   */
  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('UpstashConnector is not connected. Call connect() first.');
    }

    // Redis Subsystem Tools
    if (name === 'upstash_redis_cache_get') {
      return this.redis.getCachedScene(args.key as string);
    }

    if (name === 'upstash_redis_cache_set') {
      await this.redis.setCachedScene(
        args.key as string,
        args.value,
        args.ttl as number | undefined
      );
      return { success: true };
    }

    if (name === 'upstash_redis_cache_delete') {
      const deleted = await this.redis.deleteCachedScene(args.key as string);
      return { deleted, success: deleted > 0 };
    }

    if (name === 'upstash_redis_session_get') {
      return this.redis.getSessionState(args.sessionId as string);
    }

    if (name === 'upstash_redis_session_set') {
      await this.redis.setSessionState(
        args.sessionId as string,
        args.state as Record<string, unknown>,
        args.ttl as number | undefined
      );
      return { success: true };
    }

    if (name === 'upstash_redis_prefs_get') {
      return this.redis.getUserPreferences(args.userId as string);
    }

    if (name === 'upstash_redis_prefs_set') {
      await this.redis.setUserPreferences(
        args.userId as string,
        args.preferences as Record<string, unknown>
      );
      return { success: true };
    }

    if (name === 'upstash_redis_batch_set') {
      return this.redis.batchSetCachedScenes(
        args.entries as Array<{ key: string; value: unknown; ttl?: number }>
      );
    }

    if (name === 'upstash_redis_batch_delete') {
      const deleted = await this.redis.batchDeleteCachedScenes(args.keys as string[]);
      return { deleted, success: true };
    }

    if (name === 'upstash_redis_cache_stats') {
      return this.redis.getCacheStatistics();
    }

    if (name === 'upstash_redis_flush_scenes') {
      const deleted = await this.redis.flushSceneCache();
      return { deleted, success: true };
    }

    // Vector Subsystem Tools
    if (name === 'upstash_vector_upsert') {
      await this.vector.upsertComposition(args.id as string, args.vector as number[], {
        snippet: args.snippet as string,
        traits: args.traits as string[],
        targets: args.targets as string[] | undefined,
        tags: args.tags as string[] | undefined,
        namespace: args.namespace as string | undefined,
        timestamp: Date.now(),
      });
      return { success: true };
    }

    if (name === 'upstash_vector_search') {
      return this.vector.searchSimilar(
        args.vector as number[],
        args.topK as number | undefined,
        args.filter as string | undefined,
        args.includeMetadata as boolean | undefined
      );
    }

    if (name === 'upstash_vector_search_text') {
      return this.vector.searchByText(
        args.query as string,
        args.topK as number | undefined,
        args.filter as string | undefined
      );
    }

    if (name === 'upstash_vector_fetch') {
      return this.vector.fetchComposition(args.id as string);
    }

    if (name === 'upstash_vector_delete') {
      await this.vector.deleteComposition(args.id as string);
      return { success: true };
    }

    if (name === 'upstash_vector_info') {
      return this.vector.getInfo();
    }

    if (name === 'upstash_vector_upsert_text') {
      await this.vector.upsertCompositionWithData(args.id as string, args.data as string, {
        snippet: args.snippet as string,
        traits: args.traits as string[],
        targets: args.targets as string[] | undefined,
        tags: args.tags as string[] | undefined,
        namespace: args.namespace as string | undefined,
        timestamp: Date.now(),
      });
      return { success: true };
    }

    if (name === 'upstash_vector_batch_upsert') {
      const compositions = (
        args.compositions as Array<{
          id: string;
          vector: number[];
          snippet: string;
          traits: string[];
          targets?: string[];
          tags?: string[];
          namespace?: string;
        }>
      ).map((comp) => ({
        id: comp.id,
        vector: comp.vector,
        metadata: {
          snippet: comp.snippet,
          traits: comp.traits,
          targets: comp.targets,
          tags: comp.tags,
          namespace: comp.namespace,
          timestamp: Date.now(),
        },
      }));
      await this.vector.batchUpsert(compositions);
      return { success: true, count: compositions.length };
    }

    // QStash Subsystem Tools
    if (name === 'upstash_qstash_schedule') {
      const scheduleId = await this.qstash.createSchedule({
        cron: args.cron as string,
        url: args.url as string,
        body: args.body as Record<string, unknown> | undefined,
        headers: args.headers as Record<string, string> | undefined,
        retries: args.retries as number | undefined,
        callback: args.callback as string | undefined,
      });
      return { scheduleId, success: true };
    }

    if (name === 'upstash_qstash_publish') {
      const messageId = await this.qstash.publishMessage({
        url: args.url as string,
        body: args.body as Record<string, unknown> | undefined,
        headers: args.headers as Record<string, string> | undefined,
        delay: args.delay as number | undefined,
        retries: args.retries as number | undefined,
      });
      return { messageId, success: true };
    }

    if (name === 'upstash_qstash_list') {
      return this.qstash.listSchedules();
    }

    if (name === 'upstash_qstash_get') {
      return this.qstash.getSchedule(args.scheduleId as string);
    }

    if (name === 'upstash_qstash_delete') {
      await this.qstash.deleteSchedule(args.scheduleId as string);
      return { success: true };
    }

    if (name === 'upstash_qstash_pause') {
      await this.qstash.pauseSchedule(args.scheduleId as string);
      return { success: true };
    }

    if (name === 'upstash_qstash_resume') {
      await this.qstash.resumeSchedule(args.scheduleId as string);
      return { success: true };
    }

    if (name === 'upstash_qstash_dlq_list') {
      return this.qstash.listDLQ();
    }

    if (name === 'upstash_qstash_dlq_delete') {
      await this.qstash.deleteDLQMessage(args.messageId as string);
      return { success: true };
    }

    if (name === 'upstash_qstash_verify_webhook') {
      return this.qstash.verifyWebhookSignature(
        args.signature as string,
        args.body as string,
        args.url as string | undefined
      );
    }

    // Convenience Tools
    if (name === 'upstash_schedule_nightly_compilation') {
      const scheduleId = await this.qstash.scheduleNightlyCompilation(
        args.url as string,
        args.target as string,
        args.scene as string,
        args.hour as number | undefined
      );
      return { scheduleId, success: true };
    }

    if (name === 'upstash_schedule_health_ping') {
      const scheduleId = await this.qstash.scheduleHealthPing(
        args.url as string,
        args.intervalMinutes as number | undefined
      );
      return { scheduleId, success: true };
    }

    if (name === 'upstash_trigger_deployment') {
      const messageId = await this.qstash.triggerDeployment(
        args.deploymentUrl as string,
        args.delaySeconds as number | undefined,
        args.metadata as Record<string, unknown> | undefined
      );
      return { messageId, success: true };
    }

    throw new Error(`Unknown tool: ${name}`);
  }
}
