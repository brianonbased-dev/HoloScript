import { Redis } from '@upstash/redis';
import type { CacheStatistics, BatchCacheResult } from '../types.js';

/**
 * RedisSubsystem manages scene caching, session state, and user preferences
 * via Upstash Redis HTTP client.
 *
 * Features:
 * - Scene cache with configurable TTL (default 24h)
 * - Session state persistence across CLI commands
 * - User preferences storage
 * - Batch cache operations (set/delete multiple keys)
 * - Cache statistics (key counts per domain)
 * - Atomic operations with JSON serialization
 */
export class RedisSubsystem {
    private redis: Redis | null = null;
    private isConnected = false;

    /**
     * Connect to Upstash Redis using environment variables.
     * Requires UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN.
     */
    async connect(): Promise<void> {
        const url = process.env.UPSTASH_REDIS_URL;
        const token = process.env.UPSTASH_REDIS_TOKEN;

        if (!url || !token) {
            throw new Error('UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN environment variables are required');
        }

        this.redis = new Redis({
            url,
            token
        });

        // Verify connection with PING
        try {
            await this.redis.ping();
            this.isConnected = true;
        } catch (error) {
            this.isConnected = false;
            throw new Error(`Upstash Redis connection failed: ${error}`);
        }
    }

    /**
     * Disconnect and cleanup.
     */
    async disconnect(): Promise<void> {
        this.redis = null;
        this.isConnected = false;
    }

    /**
     * Health check - verify Redis connectivity.
     */
    async health(): Promise<boolean> {
        if (!this.isConnected || !this.redis) {
            return false;
        }

        try {
            const pong = await this.redis.ping();
            return pong === 'PONG';
        } catch {
            return false;
        }
    }

    /**
     * Get cached scene by key.
     * @param key - Cache key (e.g., 'scene:my-vr-world')
     * @returns Cached value or null if not found
     */
    async getCachedScene(key: string): Promise<unknown> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const value = await this.redis.get(key);
        return value;
    }

    /**
     * Set cached scene with TTL.
     * @param key - Cache key
     * @param value - Scene data (will be JSON serialized)
     * @param ttl - Time to live in seconds (default 86400 = 24h)
     */
    async setCachedScene(key: string, value: unknown, ttl = 86400): Promise<void> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        await this.redis.set(key, value, { ex: ttl });
    }

    /**
     * Delete cached scene.
     * @param key - Cache key to delete
     * @returns Number of keys deleted (0 or 1)
     */
    async deleteCachedScene(key: string): Promise<number> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        return await this.redis.del(key);
    }

    /**
     * Get session state by session ID.
     * @param sessionId - Unique session identifier
     * @returns Session state object or null
     */
    async getSessionState(sessionId: string): Promise<Record<string, unknown> | null> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const key = `session:${sessionId}`;
        const value = await this.redis.get(key);
        return value as Record<string, unknown> | null;
    }

    /**
     * Set session state with automatic expiration (default 1 hour).
     * @param sessionId - Unique session identifier
     * @param state - Session state object
     * @param ttl - Time to live in seconds (default 3600 = 1h)
     */
    async setSessionState(sessionId: string, state: Record<string, unknown>, ttl = 3600): Promise<void> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const key = `session:${sessionId}`;
        await this.redis.set(key, state, { ex: ttl });
    }

    /**
     * Delete session state.
     * @param sessionId - Session ID to delete
     */
    async deleteSessionState(sessionId: string): Promise<number> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const key = `session:${sessionId}`;
        return await this.redis.del(key);
    }

    /**
     * Get user preferences by user ID.
     * @param userId - Unique user identifier
     * @returns User preferences object or null
     */
    async getUserPreferences(userId: string): Promise<Record<string, unknown> | null> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const key = `prefs:${userId}`;
        const value = await this.redis.get(key);
        return value as Record<string, unknown> | null;
    }

    /**
     * Set user preferences (no expiration - persistent).
     * @param userId - Unique user identifier
     * @param preferences - User preferences object
     */
    async setUserPreferences(userId: string, preferences: Record<string, unknown>): Promise<void> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const key = `prefs:${userId}`;
        await this.redis.set(key, preferences);
    }

    /**
     * Update specific preference field without overwriting entire object.
     * Uses Redis HSET for field-level updates.
     * @param userId - Unique user identifier
     * @param field - Preference field name
     * @param value - Field value
     */
    async updateUserPreference(userId: string, field: string, value: unknown): Promise<void> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const key = `prefs:${userId}`;
        await this.redis.hset(key, { [field]: value });
    }

    /**
     * Get all keys matching a pattern.
     * WARNING: Use sparingly on large datasets.
     * @param pattern - Redis key pattern (e.g., 'scene:*')
     * @returns Array of matching keys
     */
    async getKeysByPattern(pattern: string): Promise<string[]> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        return await this.redis.keys(pattern);
    }

    /**
     * Check if key exists.
     * @param key - Key to check
     * @returns 1 if exists, 0 if not
     */
    async exists(key: string): Promise<number> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        return await this.redis.exists(key);
    }

    /**
     * Set expiration time on existing key.
     * @param key - Key to expire
     * @param ttl - Time to live in seconds
     * @returns 1 if expiration was set, 0 if key does not exist
     */
    async expire(key: string, ttl: number): Promise<number> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        return await this.redis.expire(key, ttl);
    }

    /**
     * Batch set multiple cached scenes atomically.
     * Uses Redis pipeline for efficiency.
     * @param entries - Array of { key, value, ttl } entries
     * @returns BatchCacheResult with success/failure counts
     */
    async batchSetCachedScenes(
        entries: Array<{ key: string; value: unknown; ttl?: number }>
    ): Promise<BatchCacheResult> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const result: BatchCacheResult = { successful: 0, failed: 0, errors: [] };
        const pipeline = this.redis.pipeline();

        for (const entry of entries) {
            const ttl = entry.ttl ?? 86400;
            pipeline.set(entry.key, entry.value, { ex: ttl });
        }

        try {
            const results = await pipeline.exec();
            for (let i = 0; i < results.length; i++) {
                if (results[i] === 'OK') {
                    result.successful++;
                } else {
                    result.failed++;
                    result.errors.push(`Failed to set key: ${entries[i].key}`);
                }
            }
        } catch (error) {
            result.failed = entries.length;
            result.errors.push(`Pipeline execution failed: ${error}`);
        }

        return result;
    }

    /**
     * Batch delete multiple cached scenes.
     * @param keys - Array of cache keys to delete
     * @returns Number of keys actually deleted
     */
    async batchDeleteCachedScenes(keys: string[]): Promise<number> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        if (keys.length === 0) return 0;
        return await this.redis.del(...keys);
    }

    /**
     * Get cache statistics: counts of scenes, sessions, and user preferences.
     * WARNING: Uses KEYS command - use sparingly on large datasets.
     * @returns CacheStatistics object
     */
    async getCacheStatistics(): Promise<CacheStatistics> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const [sceneKeys, sessionKeys, prefsKeys] = await Promise.all([
            this.redis.keys('scene:*'),
            this.redis.keys('session:*'),
            this.redis.keys('prefs:*')
        ]);

        return {
            sceneCount: sceneKeys.length,
            sessionCount: sessionKeys.length,
            prefsCount: prefsKeys.length,
            sceneKeys
        };
    }

    /**
     * Flush all cached scenes (preserves sessions and preferences).
     * @returns Number of scene keys deleted
     */
    async flushSceneCache(): Promise<number> {
        if (!this.redis) {
            throw new Error('RedisSubsystem not connected');
        }

        const sceneKeys = await this.redis.keys('scene:*');
        if (sceneKeys.length === 0) return 0;
        return await this.redis.del(...sceneKeys);
    }
}
