import { Index } from '@upstash/vector';
import type { CompositionMetadata, SimilarityResult, CompositionRecord, VectorIndexInfo } from '../types.js';

export type { CompositionMetadata } from '../types.js';

/**
 * VectorSubsystem extends semantic-search-hub on MCP orchestrator with
 * composition embeddings for "find similar" search.
 *
 * Features:
 * - Upsert composition embeddings (code → vector)
 * - Semantic similarity search
 * - Metadata filtering (traits, targets, tags)
 * - Hybrid search (vector + metadata)
 * - Namespace isolation (per-user/per-project)
 */
export class VectorSubsystem {
    private index: Index | null = null;
    private isConnected = false;

    /**
     * Connect to Upstash Vector using environment variables.
     * Requires UPSTASH_VECTOR_URL and UPSTASH_VECTOR_TOKEN.
     */
    async connect(): Promise<void> {
        const url = process.env.UPSTASH_VECTOR_URL;
        const token = process.env.UPSTASH_VECTOR_TOKEN;

        if (!url || !token) {
            throw new Error('UPSTASH_VECTOR_URL and UPSTASH_VECTOR_TOKEN environment variables are required');
        }

        this.index = new Index({
            url,
            token
        });

        // Verify connection with info query
        try {
            await this.index.info();
            this.isConnected = true;
        } catch (error) {
            this.isConnected = false;
            throw new Error(`Upstash Vector connection failed: ${error}`);
        }
    }

    /**
     * Disconnect and cleanup.
     */
    async disconnect(): Promise<void> {
        this.index = null;
        this.isConnected = false;
    }

    /**
     * Health check - verify Vector index connectivity.
     */
    async health(): Promise<boolean> {
        if (!this.isConnected || !this.index) {
            return false;
        }

        try {
            await this.index.info();
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Upsert composition embedding.
     * @param id - Unique composition identifier
     * @param vector - Embedding vector (e.g., from OpenAI, Xenova)
     * @param metadata - Composition metadata
     */
    async upsertComposition(
        id: string,
        vector: number[],
        metadata: Omit<CompositionMetadata, 'id'>
    ): Promise<void> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        await this.index.upsert({
            id,
            vector,
            metadata: {
                ...metadata,
                id
            }
        });
    }

    /**
     * Search for similar compositions by vector.
     * @param vector - Query embedding vector
     * @param topK - Number of results to return (default 10)
     * @param filter - Metadata filter string (e.g., 'namespace = "user123" AND traits INCLUDES "@physics"')
     * @param includeMetadata - Include metadata in results (default true)
     * @returns Array of similar compositions with scores
     */
    async searchSimilar(
        vector: number[],
        topK = 10,
        filter?: string,
        includeMetadata = true
    ): Promise<SimilarityResult[]> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        const results = await this.index.query({
            vector,
            topK,
            filter,
            includeMetadata
        });

        return results.map((result) => ({
            id: String(result.id),
            score: result.score,
            metadata: result.metadata as CompositionMetadata | undefined
        }));
    }

    /**
     * Fetch composition by ID.
     * @param id - Composition identifier
     * @returns Vector and metadata or null if not found
     */
    async fetchComposition(id: string): Promise<CompositionRecord | null> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        const results = await this.index.fetch([id], { includeVectors: true });

        if (results.length === 0 || !results[0]) {
            return null;
        }

        const result = results[0];
        return {
            id: String(result.id),
            vector: result.vector || [],
            metadata: (result.metadata || {}) as unknown as CompositionMetadata
        };
    }

    /**
     * Delete composition embedding.
     * @param id - Composition identifier to delete
     */
    async deleteComposition(id: string): Promise<void> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        await this.index.delete(id);
    }

    /**
     * Delete multiple compositions by namespace.
     * @param namespace - Namespace to delete (e.g., 'user123')
     */
    async deleteByNamespace(namespace: string): Promise<void> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        // Use range delete with namespace filter
        await this.index.delete({
            filter: `namespace = "${namespace}"`
        });
    }

    /**
     * Get index information (dimensions, count, etc.).
     */
    async getInfo(): Promise<VectorIndexInfo> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        return await this.index.info();
    }

    /**
     * Search by text query using Upstash Vector's built-in embedding model.
     *
     * Requires the Upstash Vector index to be created with an embedding model
     * (e.g., BAAI/bge-small-en-v1.5). When configured, Upstash Vector generates
     * embeddings server-side from raw text queries.
     *
     * @param query - Natural language query (e.g., "physics simulation with rigidbody")
     * @param topK - Number of results
     * @param filter - Metadata filter
     * @returns Similar compositions
     */
    async searchByText(
        query: string,
        topK = 10,
        filter?: string
    ): Promise<SimilarityResult[]> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        // Use Upstash Vector's built-in text embedding (data field)
        // The index must be created with an embedding model for this to work
        const results = await this.index.query({
            data: query,
            topK,
            filter,
            includeMetadata: true
        });

        return results.map((result) => ({
            id: String(result.id),
            score: result.score,
            metadata: result.metadata as CompositionMetadata | undefined
        }));
    }

    /**
     * Upsert composition with text data for automatic embedding generation.
     * Uses Upstash Vector's built-in embedding model instead of requiring
     * pre-computed vectors.
     *
     * @param id - Unique composition identifier
     * @param data - Raw text data (HoloScript source code) for embedding
     * @param metadata - Composition metadata
     */
    async upsertCompositionWithData(
        id: string,
        data: string,
        metadata: Omit<CompositionMetadata, 'id'>
    ): Promise<void> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        await this.index.upsert({
            id,
            data,
            metadata: {
                ...metadata,
                id
            }
        });
    }

    /**
     * Batch upsert multiple compositions.
     * @param compositions - Array of { id, vector, metadata } entries
     */
    async batchUpsert(
        compositions: Array<{
            id: string;
            vector: number[];
            metadata: Omit<CompositionMetadata, 'id'>;
        }>
    ): Promise<void> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        const entries = compositions.map((comp) => ({
            id: comp.id,
            vector: comp.vector,
            metadata: {
                ...comp.metadata,
                id: comp.id
            }
        }));

        await this.index.upsert(entries);
    }
}
