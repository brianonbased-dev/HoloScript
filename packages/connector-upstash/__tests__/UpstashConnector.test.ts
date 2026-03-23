import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UpstashConnector } from '../src/UpstashConnector';

// Mock all subsystems
vi.mock('../src/subsystems/RedisSubsystem', () => ({
    RedisSubsystem: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        health: vi.fn().mockResolvedValue(true),
        getCachedScene: vi.fn().mockResolvedValue({ data: 'cached' }),
        setCachedScene: vi.fn().mockResolvedValue(undefined),
        deleteCachedScene: vi.fn().mockResolvedValue(1),
        getSessionState: vi.fn().mockResolvedValue({ user: 'test' }),
        setSessionState: vi.fn().mockResolvedValue(undefined),
        getUserPreferences: vi.fn().mockResolvedValue({ theme: 'dark' }),
        setUserPreferences: vi.fn().mockResolvedValue(undefined)
    }))
}));

vi.mock('../src/subsystems/VectorSubsystem', () => ({
    VectorSubsystem: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        health: vi.fn().mockResolvedValue(true),
        upsertComposition: vi.fn().mockResolvedValue(undefined),
        searchSimilar: vi.fn().mockResolvedValue([{ id: 'comp-1', score: 0.95 }]),
        searchByText: vi.fn().mockResolvedValue([{ id: 'comp-1', score: 0.95 }]),
        fetchComposition: vi.fn().mockResolvedValue({ id: 'comp-1', vector: [0.1, 0.2] }),
        deleteComposition: vi.fn().mockResolvedValue(undefined),
        getInfo: vi.fn().mockResolvedValue({ vectorCount: 100, dimension: 1536 })
    }))
}));

vi.mock('../src/subsystems/QStashSubsystem', () => ({
    QStashSubsystem: vi.fn().mockImplementation(() => ({
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        health: vi.fn().mockResolvedValue(true),
        createSchedule: vi.fn().mockResolvedValue('sched-1'),
        listSchedules: vi.fn().mockResolvedValue([{ scheduleId: 'sched-1' }]),
        getSchedule: vi.fn().mockResolvedValue({ scheduleId: 'sched-1' }),
        deleteSchedule: vi.fn().mockResolvedValue(undefined),
        pauseSchedule: vi.fn().mockResolvedValue(undefined),
        resumeSchedule: vi.fn().mockResolvedValue(undefined),
        publishMessage: vi.fn().mockResolvedValue('msg-1'),
        listDLQ: vi.fn().mockResolvedValue([{ messageId: 'dlq-1' }]),
        deleteDLQMessage: vi.fn().mockResolvedValue(undefined),
        scheduleNightlyCompilation: vi.fn().mockResolvedValue('sched-1'),
        scheduleHealthPing: vi.fn().mockResolvedValue('sched-1'),
        triggerDeployment: vi.fn().mockResolvedValue('msg-1')
    }))
}));

vi.mock('@holoscript/connector-core', () => ({
    ServiceConnector: class {
        protected isConnected = false;
    },
    McpRegistrar: vi.fn().mockImplementation(() => ({
        register: vi.fn().mockResolvedValue(undefined)
    }))
}));

describe('UpstashConnector', () => {
    let connector: UpstashConnector;

    beforeEach(() => {
        connector = new UpstashConnector();
        // Set environment variables
        process.env.UPSTASH_REDIS_URL = 'https://test-redis.upstash.io';
        process.env.UPSTASH_REDIS_TOKEN = 'test-redis-token';
        process.env.UPSTASH_VECTOR_URL = 'https://test-vector.upstash.io';
        process.env.UPSTASH_VECTOR_TOKEN = 'test-vector-token';
        process.env.QSTASH_TOKEN = 'test-qstash-token';
    });

    describe('connect', () => {
        it('should connect all subsystems successfully', async () => {
            await connector.connect();
            expect(await connector.health()).toBe(true);
        });
    });

    describe('disconnect', () => {
        it('should disconnect all subsystems', async () => {
            await connector.connect();
            await connector.disconnect();
            expect(await connector.health()).toBe(false);
        });
    });

    describe('health', () => {
        it('should return false when not connected', async () => {
            expect(await connector.health()).toBe(false);
        });

        it('should return true when connected', async () => {
            await connector.connect();
            expect(await connector.health()).toBe(true);
        });
    });

    describe('listTools', () => {
        it('should return all 25 MCP tools', async () => {
            const tools = await connector.listTools();
            expect(tools.length).toBe(25);
        });
    });

    describe('executeTool - Redis tools', () => {
        beforeEach(async () => {
            await connector.connect();
        });

        it('should execute upstash_redis_cache_get', async () => {
            const result = await connector.executeTool('upstash_redis_cache_get', { key: 'scene:test' });
            expect(result).toEqual({ data: 'cached' });
        });

        it('should execute upstash_redis_cache_set', async () => {
            const result = await connector.executeTool('upstash_redis_cache_set', {
                key: 'scene:test',
                value: { data: 'compiled' },
                ttl: 3600
            });
            expect(result).toEqual({ success: true });
        });

        it('should execute upstash_redis_cache_delete', async () => {
            const result = await connector.executeTool('upstash_redis_cache_delete', { key: 'scene:test' });
            expect(result).toEqual({ deleted: 1, success: true });
        });

        it('should execute upstash_redis_session_get', async () => {
            const result = await connector.executeTool('upstash_redis_session_get', { sessionId: 'session-123' });
            expect(result).toEqual({ user: 'test' });
        });

        it('should execute upstash_redis_session_set', async () => {
            const result = await connector.executeTool('upstash_redis_session_set', {
                sessionId: 'session-123',
                state: { user: 'test' }
            });
            expect(result).toEqual({ success: true });
        });

        it('should execute upstash_redis_prefs_get', async () => {
            const result = await connector.executeTool('upstash_redis_prefs_get', { userId: 'user-123' });
            expect(result).toEqual({ theme: 'dark' });
        });

        it('should execute upstash_redis_prefs_set', async () => {
            const result = await connector.executeTool('upstash_redis_prefs_set', {
                userId: 'user-123',
                preferences: { theme: 'light' }
            });
            expect(result).toEqual({ success: true });
        });
    });

    describe('executeTool - Vector tools', () => {
        beforeEach(async () => {
            await connector.connect();
        });

        it('should execute upstash_vector_upsert', async () => {
            const result = await connector.executeTool('upstash_vector_upsert', {
                id: 'comp-1',
                vector: [0.1, 0.2, 0.3],
                snippet: 'object Cube {}',
                traits: ['@physics']
            });
            expect(result).toEqual({ success: true });
        });

        it('should execute upstash_vector_search', async () => {
            const result = await connector.executeTool('upstash_vector_search', {
                vector: [0.1, 0.2, 0.3],
                topK: 10
            });
            expect(result).toEqual([{ id: 'comp-1', score: 0.95 }]);
        });

        it('should execute upstash_vector_search_text', async () => {
            const result = await connector.executeTool('upstash_vector_search_text', {
                query: 'physics simulation',
                topK: 10
            });
            expect(result).toEqual([{ id: 'comp-1', score: 0.95 }]);
        });

        it('should execute upstash_vector_fetch', async () => {
            const result = await connector.executeTool('upstash_vector_fetch', { id: 'comp-1' });
            expect(result).toEqual({ id: 'comp-1', vector: [0.1, 0.2] });
        });

        it('should execute upstash_vector_delete', async () => {
            const result = await connector.executeTool('upstash_vector_delete', { id: 'comp-1' });
            expect(result).toEqual({ success: true });
        });

        it('should execute upstash_vector_info', async () => {
            const result = await connector.executeTool('upstash_vector_info', {});
            expect(result).toEqual({ vectorCount: 100, dimension: 1536 });
        });
    });

    describe('executeTool - QStash tools', () => {
        beforeEach(async () => {
            await connector.connect();
        });

        it('should execute upstash_qstash_schedule', async () => {
            const result = await connector.executeTool('upstash_qstash_schedule', {
                cron: '0 2 * * *',
                url: 'https://api.holoscript.net/compile'
            });
            expect(result).toEqual({ scheduleId: 'sched-1', success: true });
        });

        it('should execute upstash_qstash_publish', async () => {
            const result = await connector.executeTool('upstash_qstash_publish', {
                url: 'https://api.holoscript.net/webhook',
                body: { event: 'test' }
            });
            expect(result).toEqual({ messageId: 'msg-1', success: true });
        });

        it('should execute upstash_qstash_list', async () => {
            const result = await connector.executeTool('upstash_qstash_list', {});
            expect(result).toEqual([{ scheduleId: 'sched-1' }]);
        });

        it('should execute upstash_qstash_get', async () => {
            const result = await connector.executeTool('upstash_qstash_get', { scheduleId: 'sched-1' });
            expect(result).toEqual({ scheduleId: 'sched-1' });
        });

        it('should execute upstash_qstash_delete', async () => {
            const result = await connector.executeTool('upstash_qstash_delete', { scheduleId: 'sched-1' });
            expect(result).toEqual({ success: true });
        });

        it('should execute upstash_qstash_pause', async () => {
            const result = await connector.executeTool('upstash_qstash_pause', { scheduleId: 'sched-1' });
            expect(result).toEqual({ success: true });
        });

        it('should execute upstash_qstash_resume', async () => {
            const result = await connector.executeTool('upstash_qstash_resume', { scheduleId: 'sched-1' });
            expect(result).toEqual({ success: true });
        });

        it('should execute upstash_qstash_dlq_list', async () => {
            const result = await connector.executeTool('upstash_qstash_dlq_list', {});
            expect(result).toEqual([{ messageId: 'dlq-1' }]);
        });

        it('should execute upstash_qstash_dlq_delete', async () => {
            const result = await connector.executeTool('upstash_qstash_dlq_delete', { messageId: 'dlq-1' });
            expect(result).toEqual({ success: true });
        });
    });

    describe('executeTool - Convenience tools', () => {
        beforeEach(async () => {
            await connector.connect();
        });

        it('should execute upstash_schedule_nightly_compilation', async () => {
            const result = await connector.executeTool('upstash_schedule_nightly_compilation', {
                url: 'https://api.holoscript.net/compile',
                target: 'unity',
                scene: 'main.holo'
            });
            expect(result).toEqual({ scheduleId: 'sched-1', success: true });
        });

        it('should execute upstash_schedule_health_ping', async () => {
            const result = await connector.executeTool('upstash_schedule_health_ping', {
                url: 'https://api.holoscript.net/health'
            });
            expect(result).toEqual({ scheduleId: 'sched-1', success: true });
        });

        it('should execute upstash_trigger_deployment', async () => {
            const result = await connector.executeTool('upstash_trigger_deployment', {
                deploymentUrl: 'https://api.holoscript.net/deploy'
            });
            expect(result).toEqual({ messageId: 'msg-1', success: true });
        });
    });

    describe('error handling', () => {
        it('should throw error for unknown tool', async () => {
            await connector.connect();
            await expect(connector.executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool: unknown_tool');
        });

        it('should throw error when executing without connection', async () => {
            await expect(connector.executeTool('upstash_redis_cache_get', { key: 'test' }))
                .rejects.toThrow('UpstashConnector is not connected');
        });
    });
});
