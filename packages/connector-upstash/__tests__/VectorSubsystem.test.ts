import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VectorSubsystem } from '../src/subsystems/VectorSubsystem';

// Mock @upstash/vector
vi.mock('@upstash/vector', () => ({
    Index: vi.fn().mockImplementation(() => ({
        info: vi.fn().mockResolvedValue({
            vectorCount: 100,
            pendingVectorCount: 0,
            indexSize: 1024,
            dimension: 1536,
            similarityFunction: 'COSINE'
        }),
        upsert: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue([
            {
                id: 'comp-1',
                score: 0.95,
                metadata: {
                    id: 'comp-1',
                    snippet: 'object Cube { @physics }',
                    traits: ['@physics'],
                    targets: ['unity'],
                    tags: ['3d', 'physics'],
                    namespace: 'user123',
                    timestamp: Date.now()
                }
            }
        ]),
        fetch: vi.fn().mockResolvedValue([
            {
                id: 'comp-1',
                vector: [0.1, 0.2, 0.3],
                metadata: {
                    id: 'comp-1',
                    snippet: 'object Cube { @physics }',
                    traits: ['@physics'],
                    timestamp: Date.now()
                }
            }
        ]),
        delete: vi.fn().mockResolvedValue(undefined)
    }))
}));

describe('VectorSubsystem', () => {
    let vector: VectorSubsystem;

    beforeEach(() => {
        vector = new VectorSubsystem();
        process.env.UPSTASH_VECTOR_URL = 'https://test-vector.upstash.io';
        process.env.UPSTASH_VECTOR_TOKEN = 'test-token';
    });

    describe('connect', () => {
        it('should connect successfully with valid credentials', async () => {
            await vector.connect();
            expect(await vector.health()).toBe(true);
        });

        it('should throw error if UPSTASH_VECTOR_URL is missing', async () => {
            delete process.env.UPSTASH_VECTOR_URL;
            await expect(vector.connect()).rejects.toThrow('UPSTASH_VECTOR_URL and UPSTASH_VECTOR_TOKEN environment variables are required');
        });

        it('should throw error if UPSTASH_VECTOR_TOKEN is missing', async () => {
            delete process.env.UPSTASH_VECTOR_TOKEN;
            await expect(vector.connect()).rejects.toThrow('UPSTASH_VECTOR_URL and UPSTASH_VECTOR_TOKEN environment variables are required');
        });
    });

    describe('disconnect', () => {
        it('should disconnect and mark as not connected', async () => {
            await vector.connect();
            await vector.disconnect();
            expect(await vector.health()).toBe(false);
        });
    });

    describe('health', () => {
        it('should return false when not connected', async () => {
            expect(await vector.health()).toBe(false);
        });

        it('should return true when connected', async () => {
            await vector.connect();
            expect(await vector.health()).toBe(true);
        });
    });

    describe('composition embeddings', () => {
        beforeEach(async () => {
            await vector.connect();
        });

        it('should upsert composition embedding', async () => {
            await vector.upsertComposition(
                'comp-1',
                [0.1, 0.2, 0.3],
                {
                    snippet: 'object Cube { @physics }',
                    traits: ['@physics'],
                    targets: ['unity'],
                    tags: ['3d', 'physics'],
                    namespace: 'user123',
                    timestamp: Date.now()
                }
            );
            // No error means success
        });

        it('should search similar compositions by vector', async () => {
            const results = await vector.searchSimilar([0.1, 0.2, 0.3], 10);
            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('comp-1');
            expect(results[0].score).toBe(0.95);
            expect(results[0].metadata?.traits).toEqual(['@physics']);
        });

        it('should search with metadata filter', async () => {
            const results = await vector.searchSimilar(
                [0.1, 0.2, 0.3],
                10,
                'namespace = "user123" AND traits INCLUDES "@physics"'
            );
            expect(results).toHaveLength(1);
        });

        it('should fetch composition by ID', async () => {
            const result = await vector.fetchComposition('comp-1');
            expect(result).not.toBeNull();
            expect(result?.id).toBe('comp-1');
            expect(result?.vector).toEqual([0.1, 0.2, 0.3]);
        });

        it('should delete composition', async () => {
            await vector.deleteComposition('comp-1');
            // No error means success
        });

        it('should delete by namespace', async () => {
            await vector.deleteByNamespace('user123');
            // No error means success
        });

        it('should get index info', async () => {
            const info = await vector.getInfo();
            expect(info.vectorCount).toBe(100);
            expect(info.dimension).toBe(1536);
            expect(info.similarityFunction).toBe('COSINE');
        });

        it('should throw error when not connected', async () => {
            await vector.disconnect();
            await expect(vector.upsertComposition('comp-1', [0.1, 0.2], { snippet: 'test', traits: [], timestamp: Date.now() }))
                .rejects.toThrow('VectorSubsystem not connected');
        });
    });
});
