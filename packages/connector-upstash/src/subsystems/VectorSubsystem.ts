import { Index } from '@upstash/vector';

/**
 * Metadata for composition embeddings.
 */
export interface CompositionMetadata {
    /** Composition file path or identifier */
    id: string;
    /** HoloScript code snippet (first 500 chars) */
    snippet: string;
    /** Traits used in composition */
    traits: string[];
    /** Compiler targets (unity, unreal, threejs, etc.) */
    targets?: string[];
    /** User-defined tags */
    tags?: string[];
    /** Namespace for multi-tenancy */
    namespace?: string;
    /** Timestamp of embedding creation */
    timestamp: number;
}

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
    ): Promise<Array<{ id: string; score: number; metadata?: CompositionMetadata }>> {
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
    async fetchComposition(id: string): Promise<{
        id: string;
        vector: number[];
        metadata: CompositionMetadata;
    } | null> {
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
    async getInfo(): Promise<{
        vectorCount: number;
        pendingVectorCount: number;
        indexSize: number;
        dimension: number;
        similarityFunction: string;
    }> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        return await this.index.info();
    }

    /**
     * Search by text query (requires embedding generation).
     * This is a convenience method that generates embeddings client-side
     * using the MCP semantic-search-hub orchestrator.
     *
     * @param query - Natural language query
     * @param topK - Number of results
     * @param filter - Metadata filter
     * @returns Similar compositions
     */
    async searchByText(
        query: string,
        topK = 10,
        filter?: string
    ): Promise<Array<{ id: string; score: number; metadata?: CompositionMetadata }>> {
        if (!this.index) {
            throw new Error('VectorSubsystem not connected');
        }

        // Call MCP orchestrator to generate embedding
        const embeddingResponse = await fetch('https://mcp-orchestrator-production-45f9.up.railway.app/tools/call', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-mcp-api-key': process.env.MCP_API_KEY || 'dev-key-12345'
            },
            body: JSON.stringify({
                server: 'semantic-search-hub',
                tool: 'search_knowledge',
                args: { query, limit: 1 }
            })
        });

        if (!embeddingResponse.ok) {
            throw new Error(`Failed to generate embedding: ${embeddingResponse.statusText}`);
        }

        const embeddingData = await embeddingResponse.json() as any;

        // Extract embedding vector from response
        // Note: This is a placeholder - actual implementation depends on semantic-search-hub response format
        const vector = embeddingData.embedding || [];

        return this.searchSimilar(vector, topK, filter);
    }
}
