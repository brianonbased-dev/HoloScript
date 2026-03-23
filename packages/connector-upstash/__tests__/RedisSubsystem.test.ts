import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RedisSubsystem } from '../src/subsystems/RedisSubsystem';

// Mock @upstash/redis
vi.mock('@upstash/redis', () => ({
    Redis: vi.fn().mockImplementation(() => ({
        ping: vi.fn().mockResolvedValue('PONG'),
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
        hset: vi.fn().mockResolvedValue(1),
        keys: vi.fn().mockResolvedValue([]),
        exists: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1)
    }))
}));

describe('RedisSubsystem', () => {
    let redis: RedisSubsystem;

    beforeEach(() => {
        redis = new RedisSubsystem();
        process.env.UPSTASH_REDIS_URL = 'https://test-redis.upstash.io';
        process.env.UPSTASH_REDIS_TOKEN = 'test-token';
    });

    describe('connect', () => {
        it('should connect successfully with valid credentials', async () => {
            await redis.connect();
            expect(await redis.health()).toBe(true);
        });

        it('should throw error if UPSTASH_REDIS_URL is missing', async () => {
            delete process.env.UPSTASH_REDIS_URL;
            await expect(redis.connect()).rejects.toThrow('UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN environment variables are required');
        });

        it('should throw error if UPSTASH_REDIS_TOKEN is missing', async () => {
            delete process.env.UPSTASH_REDIS_TOKEN;
            await expect(redis.connect()).rejects.toThrow('UPSTASH_REDIS_URL and UPSTASH_REDIS_TOKEN environment variables are required');
        });
    });

    describe('disconnect', () => {
        it('should disconnect and mark as not connected', async () => {
            await redis.connect();
            await redis.disconnect();
            expect(await redis.health()).toBe(false);
        });
    });

    describe('health', () => {
        it('should return false when not connected', async () => {
            expect(await redis.health()).toBe(false);
        });

        it('should return true when connected', async () => {
            await redis.connect();
            expect(await redis.health()).toBe(true);
        });
    });

    describe('scene caching', () => {
        beforeEach(async () => {
            await redis.connect();
        });

        it('should get cached scene', async () => {
            const result = await redis.getCachedScene('scene:test');
            expect(result).toBeNull();
        });

        it('should set cached scene with default TTL', async () => {
            await redis.setCachedScene('scene:test', { data: 'compiled' });
            // No error means success
        });

        it('should set cached scene with custom TTL', async () => {
            await redis.setCachedScene('scene:test', { data: 'compiled' }, 3600);
            // No error means success
        });

        it('should delete cached scene', async () => {
            const deleted = await redis.deleteCachedScene('scene:test');
            expect(deleted).toBe(1);
        });

        it('should throw error when not connected', async () => {
            await redis.disconnect();
            await expect(redis.getCachedScene('scene:test')).rejects.toThrow('RedisSubsystem not connected');
        });
    });

    describe('session state', () => {
        beforeEach(async () => {
            await redis.connect();
        });

        it('should get session state', async () => {
            const state = await redis.getSessionState('session-123');
            expect(state).toBeNull();
        });

        it('should set session state with default TTL', async () => {
            await redis.setSessionState('session-123', { user: 'test' });
            // No error means success
        });

        it('should set session state with custom TTL', async () => {
            await redis.setSessionState('session-123', { user: 'test' }, 7200);
            // No error means success
        });

        it('should delete session state', async () => {
            const deleted = await redis.deleteSessionState('session-123');
            expect(deleted).toBe(1);
        });
    });

    describe('user preferences', () => {
        beforeEach(async () => {
            await redis.connect();
        });

        it('should get user preferences', async () => {
            const prefs = await redis.getUserPreferences('user-123');
            expect(prefs).toBeNull();
        });

        it('should set user preferences', async () => {
            await redis.setUserPreferences('user-123', { theme: 'dark' });
            // No error means success
        });

        it('should update specific preference field', async () => {
            await redis.updateUserPreference('user-123', 'theme', 'light');
            // No error means success
        });
    });

    describe('utility methods', () => {
        beforeEach(async () => {
            await redis.connect();
        });

        it('should get keys by pattern', async () => {
            const keys = await redis.getKeysByPattern('scene:*');
            expect(Array.isArray(keys)).toBe(true);
        });

        it('should check if key exists', async () => {
            const exists = await redis.exists('scene:test');
            expect(exists).toBe(1);
        });

        it('should set expiration on key', async () => {
            const result = await redis.expire('scene:test', 3600);
            expect(result).toBe(1);
        });
    });
});
