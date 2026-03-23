/**
 * Type definitions for @holoscript/connector-upstash
 *
 * Covers all three Upstash subsystems:
 * - Redis: Scene caching, session state, user preferences
 * - Vector: Composition embeddings, similarity search
 * - QStash: Scheduled compilation, health monitoring, deployment
 */

// ============================================================================
// Redis Types
// ============================================================================

/** Cached scene entry with metadata */
export interface CachedScene {
    /** The compiled scene data */
    data: unknown;
    /** Compiler target used (e.g., 'unity', 'threejs') */
    target?: string;
    /** Source file path */
    source?: string;
    /** Compilation timestamp */
    compiledAt: number;
    /** Cache hit count (tracked via Redis INCR) */
    hits?: number;
}

/** Session state for CLI or Studio sessions */
export interface SessionState {
    /** User ID if authenticated */
    userId?: string;
    /** Currently open project path */
    projectPath?: string;
    /** Active compiler target */
    activeTarget?: string;
    /** Open file tabs */
    openFiles?: string[];
    /** Arbitrary session data */
    [key: string]: unknown;
}

/** User preferences stored persistently in Redis */
export interface UserPreferences {
    /** UI theme */
    theme?: 'light' | 'dark' | 'system';
    /** Default compiler target */
    defaultTarget?: string;
    /** Editor font size */
    fontSize?: number;
    /** Whether to auto-save */
    autoSave?: boolean;
    /** Quality tier for GAPS rendering */
    qualityTier?: 'low' | 'med' | 'high' | 'ultra';
    /** Arbitrary preference data */
    [key: string]: unknown;
}

/** Redis cache statistics */
export interface CacheStatistics {
    /** Total number of cached scenes */
    sceneCount: number;
    /** Total number of active sessions */
    sessionCount: number;
    /** Total number of users with preferences */
    prefsCount: number;
    /** All cached scene keys */
    sceneKeys: string[];
}

/** Result from a batch cache operation */
export interface BatchCacheResult {
    /** Number of successful operations */
    successful: number;
    /** Number of failed operations */
    failed: number;
    /** Error messages for failed operations */
    errors: string[];
}

// ============================================================================
// Vector Types
// ============================================================================

/** Metadata for composition embeddings */
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

/** Result from a vector similarity search */
export interface SimilarityResult {
    /** Composition identifier */
    id: string;
    /** Similarity score (0-1, higher = more similar) */
    score: number;
    /** Composition metadata if requested */
    metadata?: CompositionMetadata;
}

/** Full composition record including vector */
export interface CompositionRecord {
    /** Composition identifier */
    id: string;
    /** Embedding vector */
    vector: number[];
    /** Composition metadata */
    metadata: CompositionMetadata;
}

/** Vector index information */
export interface VectorIndexInfo {
    /** Total number of vectors in the index */
    vectorCount: number;
    /** Number of vectors pending indexing */
    pendingVectorCount: number;
    /** Total index size in bytes */
    indexSize: number;
    /** Vector dimension */
    dimension: number;
    /** Similarity function (e.g., 'COSINE') */
    similarityFunction: string;
}

// ============================================================================
// QStash Types
// ============================================================================

/** Schedule configuration for QStash cron jobs */
export interface ScheduleConfig {
    /** Unique schedule identifier (auto-generated if omitted) */
    scheduleId?: string;
    /** Cron expression (e.g., '0 2 * * *' for 2 AM daily) */
    cron: string;
    /** Webhook URL to call */
    url: string;
    /** Request body (JSON) */
    body?: Record<string, unknown>;
    /** HTTP headers */
    headers?: Record<string, string>;
    /** Retry configuration */
    retries?: number;
    /** Callback URL for success/failure notifications */
    callback?: string;
    /** Dead letter queue URL for failures */
    failureCallback?: string;
}

/** One-time message configuration */
export interface PublishConfig {
    /** Webhook URL to call */
    url: string;
    /** Request body (JSON) */
    body?: Record<string, unknown>;
    /** HTTP headers */
    headers?: Record<string, string>;
    /** Delay in seconds before delivery */
    delay?: number;
    /** Retry configuration */
    retries?: number;
    /** Callback URL for success/failure notifications */
    callback?: string;
}

/** Schedule summary from list operations */
export interface ScheduleSummary {
    /** Schedule identifier */
    scheduleId: string;
    /** Cron expression */
    cron: string;
    /** Destination webhook URL */
    destination: string;
    /** Creation timestamp */
    createdAt: number;
    /** Whether the schedule is paused */
    isPaused: boolean;
}

/** Dead letter queue message */
export interface DLQMessage {
    /** Message identifier */
    messageId: string;
    /** Original destination URL */
    url: string;
    /** Original request body */
    body: string;
    /** Creation timestamp */
    createdAt: number;
    /** HTTP response status from the failed attempt */
    responseStatus: number;
    /** Response body from the failed attempt */
    responseBody: string;
}

/** Webhook verification result */
export interface WebhookVerification {
    /** Whether the signature is valid */
    isValid: boolean;
    /** The verified request body */
    body?: string;
    /** Error message if verification failed */
    error?: string;
}

// ============================================================================
// Connector-level Types
// ============================================================================

/** Health status for the entire connector */
export interface ConnectorHealth {
    /** Overall health */
    healthy: boolean;
    /** Individual subsystem health */
    subsystems: {
        redis: boolean;
        vector: boolean;
        qstash: boolean;
    };
    /** Timestamp of health check */
    checkedAt: number;
}

/** Environment variable configuration */
export interface UpstashConfig {
    /** Redis REST URL */
    redisUrl?: string;
    /** Redis REST token */
    redisToken?: string;
    /** Vector REST URL */
    vectorUrl?: string;
    /** Vector REST token */
    vectorToken?: string;
    /** QStash token */
    qstashToken?: string;
    /** QStash current signing key (for webhook verification) */
    qstashCurrentSigningKey?: string;
    /** QStash next signing key (for key rotation) */
    qstashNextSigningKey?: string;
}
