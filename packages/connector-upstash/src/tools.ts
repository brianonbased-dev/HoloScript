import { Tool } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP tool definitions for UpstashConnector.
 * Organized by subsystem: Redis, Vector, QStash.
 */

// ============================================================================
// Redis Subsystem Tools
// ============================================================================

export const upstashRedisCacheGet: Tool = {
    name: 'upstash_redis_cache_get',
    description: 'Retrieve cached scene from Upstash Redis',
    inputSchema: {
        type: 'object',
        properties: {
            key: {
                type: 'string',
                description: 'Cache key (e.g., "scene:my-vr-world")'
            }
        },
        required: ['key']
    }
};

export const upstashRedisCacheSet: Tool = {
    name: 'upstash_redis_cache_set',
    description: 'Store compiled scene in Upstash Redis with TTL',
    inputSchema: {
        type: 'object',
        properties: {
            key: {
                type: 'string',
                description: 'Cache key'
            },
            value: {
                type: 'object',
                description: 'Scene data (will be JSON serialized)'
            },
            ttl: {
                type: 'number',
                description: 'Time to live in seconds (default 86400 = 24h)',
                default: 86400
            }
        },
        required: ['key', 'value']
    }
};

export const upstashRedisCacheDelete: Tool = {
    name: 'upstash_redis_cache_delete',
    description: 'Delete cached scene from Upstash Redis',
    inputSchema: {
        type: 'object',
        properties: {
            key: {
                type: 'string',
                description: 'Cache key to delete'
            }
        },
        required: ['key']
    }
};

export const upstashRedisSessionGet: Tool = {
    name: 'upstash_redis_session_get',
    description: 'Load session state from Upstash Redis',
    inputSchema: {
        type: 'object',
        properties: {
            sessionId: {
                type: 'string',
                description: 'Unique session identifier'
            }
        },
        required: ['sessionId']
    }
};

export const upstashRedisSessionSet: Tool = {
    name: 'upstash_redis_session_set',
    description: 'Save session state to Upstash Redis with automatic expiration',
    inputSchema: {
        type: 'object',
        properties: {
            sessionId: {
                type: 'string',
                description: 'Unique session identifier'
            },
            state: {
                type: 'object',
                description: 'Session state object'
            },
            ttl: {
                type: 'number',
                description: 'Time to live in seconds (default 3600 = 1h)',
                default: 3600
            }
        },
        required: ['sessionId', 'state']
    }
};

export const upstashRedisPrefsGet: Tool = {
    name: 'upstash_redis_prefs_get',
    description: 'Get user preferences from Upstash Redis',
    inputSchema: {
        type: 'object',
        properties: {
            userId: {
                type: 'string',
                description: 'Unique user identifier'
            }
        },
        required: ['userId']
    }
};

export const upstashRedisPrefsSet: Tool = {
    name: 'upstash_redis_prefs_set',
    description: 'Update user preferences in Upstash Redis',
    inputSchema: {
        type: 'object',
        properties: {
            userId: {
                type: 'string',
                description: 'Unique user identifier'
            },
            preferences: {
                type: 'object',
                description: 'User preferences object'
            }
        },
        required: ['userId', 'preferences']
    }
};

// ============================================================================
// Vector Subsystem Tools
// ============================================================================

export const upstashVectorUpsert: Tool = {
    name: 'upstash_vector_upsert',
    description: 'Add or update composition embedding in Upstash Vector',
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'Unique composition identifier'
            },
            vector: {
                type: 'array',
                items: { type: 'number' },
                description: 'Embedding vector (e.g., from OpenAI, Xenova)'
            },
            snippet: {
                type: 'string',
                description: 'HoloScript code snippet (first 500 chars)'
            },
            traits: {
                type: 'array',
                items: { type: 'string' },
                description: 'Traits used in composition'
            },
            targets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Compiler targets (unity, unreal, threejs, etc.)',
                default: []
            },
            tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'User-defined tags',
                default: []
            },
            namespace: {
                type: 'string',
                description: 'Namespace for multi-tenancy (e.g., "user123")',
                default: 'default'
            }
        },
        required: ['id', 'vector', 'snippet', 'traits']
    }
};

export const upstashVectorSearch: Tool = {
    name: 'upstash_vector_search',
    description: 'Find similar compositions by embedding vector',
    inputSchema: {
        type: 'object',
        properties: {
            vector: {
                type: 'array',
                items: { type: 'number' },
                description: 'Query embedding vector'
            },
            topK: {
                type: 'number',
                description: 'Number of results to return',
                default: 10
            },
            filter: {
                type: 'string',
                description: 'Metadata filter string (e.g., "namespace = \\"user123\\" AND traits INCLUDES \\"@physics\\"")'
            },
            includeMetadata: {
                type: 'boolean',
                description: 'Include metadata in results',
                default: true
            }
        },
        required: ['vector']
    }
};

export const upstashVectorSearchText: Tool = {
    name: 'upstash_vector_search_text',
    description: 'Find similar compositions by natural language query (generates embedding automatically)',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Natural language query (e.g., "physics simulation with rigidbody")'
            },
            topK: {
                type: 'number',
                description: 'Number of results to return',
                default: 10
            },
            filter: {
                type: 'string',
                description: 'Metadata filter string'
            }
        },
        required: ['query']
    }
};

export const upstashVectorFetch: Tool = {
    name: 'upstash_vector_fetch',
    description: 'Fetch composition by ID from Upstash Vector',
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'Composition identifier'
            }
        },
        required: ['id']
    }
};

export const upstashVectorDelete: Tool = {
    name: 'upstash_vector_delete',
    description: 'Delete composition embedding from Upstash Vector',
    inputSchema: {
        type: 'object',
        properties: {
            id: {
                type: 'string',
                description: 'Composition identifier to delete'
            }
        },
        required: ['id']
    }
};

export const upstashVectorInfo: Tool = {
    name: 'upstash_vector_info',
    description: 'Get Upstash Vector index information (dimensions, count, etc.)',
    inputSchema: {
        type: 'object',
        properties: {},
        required: []
    }
};

// ============================================================================
// QStash Subsystem Tools
// ============================================================================

export const upstashQStashSchedule: Tool = {
    name: 'upstash_qstash_schedule',
    description: 'Create cron schedule for compilation triggers, health monitoring, or deployments',
    inputSchema: {
        type: 'object',
        properties: {
            cron: {
                type: 'string',
                description: 'Cron expression (e.g., "0 2 * * *" for 2 AM daily)'
            },
            url: {
                type: 'string',
                description: 'Webhook URL to call'
            },
            body: {
                type: 'object',
                description: 'Request body (JSON)',
                default: {}
            },
            headers: {
                type: 'object',
                description: 'HTTP headers',
                default: {}
            },
            retries: {
                type: 'number',
                description: 'Number of retries on failure',
                default: 3
            },
            callback: {
                type: 'string',
                description: 'Callback URL for success/failure notifications'
            }
        },
        required: ['cron', 'url']
    }
};

export const upstashQStashPublish: Tool = {
    name: 'upstash_qstash_publish',
    description: 'Publish one-time message with optional delay',
    inputSchema: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'Webhook URL to call'
            },
            body: {
                type: 'object',
                description: 'Request body (JSON)',
                default: {}
            },
            headers: {
                type: 'object',
                description: 'HTTP headers',
                default: {}
            },
            delay: {
                type: 'number',
                description: 'Delay in seconds before delivery',
                default: 0
            },
            retries: {
                type: 'number',
                description: 'Number of retries on failure',
                default: 3
            }
        },
        required: ['url']
    }
};

export const upstashQStashList: Tool = {
    name: 'upstash_qstash_list',
    description: 'List all scheduled jobs',
    inputSchema: {
        type: 'object',
        properties: {},
        required: []
    }
};

export const upstashQStashGet: Tool = {
    name: 'upstash_qstash_get',
    description: 'Get schedule details by ID',
    inputSchema: {
        type: 'object',
        properties: {
            scheduleId: {
                type: 'string',
                description: 'Schedule identifier'
            }
        },
        required: ['scheduleId']
    }
};

export const upstashQStashDelete: Tool = {
    name: 'upstash_qstash_delete',
    description: 'Delete a scheduled job',
    inputSchema: {
        type: 'object',
        properties: {
            scheduleId: {
                type: 'string',
                description: 'Schedule ID to delete'
            }
        },
        required: ['scheduleId']
    }
};

export const upstashQStashPause: Tool = {
    name: 'upstash_qstash_pause',
    description: 'Pause a schedule without deleting',
    inputSchema: {
        type: 'object',
        properties: {
            scheduleId: {
                type: 'string',
                description: 'Schedule ID to pause'
            }
        },
        required: ['scheduleId']
    }
};

export const upstashQStashResume: Tool = {
    name: 'upstash_qstash_resume',
    description: 'Resume a paused schedule',
    inputSchema: {
        type: 'object',
        properties: {
            scheduleId: {
                type: 'string',
                description: 'Schedule ID to resume'
            }
        },
        required: ['scheduleId']
    }
};

export const upstashQStashDLQList: Tool = {
    name: 'upstash_qstash_dlq_list',
    description: 'List messages in dead letter queue (failed after all retries)',
    inputSchema: {
        type: 'object',
        properties: {},
        required: []
    }
};

export const upstashQStashDLQDelete: Tool = {
    name: 'upstash_qstash_dlq_delete',
    description: 'Delete message from dead letter queue',
    inputSchema: {
        type: 'object',
        properties: {
            messageId: {
                type: 'string',
                description: 'DLQ message ID to delete'
            }
        },
        required: ['messageId']
    }
};

// ============================================================================
// Convenience Tools (High-Level Operations)
// ============================================================================

export const upstashScheduleNightlyCompilation: Tool = {
    name: 'upstash_schedule_nightly_compilation',
    description: 'Convenience tool to schedule nightly compilation job',
    inputSchema: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'Compilation webhook URL'
            },
            target: {
                type: 'string',
                description: 'Compiler target (unity, unreal, threejs, etc.)'
            },
            scene: {
                type: 'string',
                description: 'Scene file path'
            },
            hour: {
                type: 'number',
                description: 'Hour of day (0-23, default 2 for 2 AM)',
                default: 2
            }
        },
        required: ['url', 'target', 'scene']
    }
};

export const upstashScheduleHealthPing: Tool = {
    name: 'upstash_schedule_health_ping',
    description: 'Convenience tool to schedule health monitoring ping',
    inputSchema: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'Health check endpoint URL'
            },
            intervalMinutes: {
                type: 'number',
                description: 'Ping interval in minutes (default 5)',
                default: 5
            }
        },
        required: ['url']
    }
};

export const upstashTriggerDeployment: Tool = {
    name: 'upstash_trigger_deployment',
    description: 'Trigger deployment after delay (CI/CD integration)',
    inputSchema: {
        type: 'object',
        properties: {
            deploymentUrl: {
                type: 'string',
                description: 'Deployment webhook URL'
            },
            delaySeconds: {
                type: 'number',
                description: 'Delay before deployment in seconds (default 300 = 5 min)',
                default: 300
            },
            metadata: {
                type: 'object',
                description: 'Additional deployment metadata',
                default: {}
            }
        },
        required: ['deploymentUrl']
    }
};

// ============================================================================
// Tool Registry
// ============================================================================

export const upstashTools: Tool[] = [
    // Redis
    upstashRedisCacheGet,
    upstashRedisCacheSet,
    upstashRedisCacheDelete,
    upstashRedisSessionGet,
    upstashRedisSessionSet,
    upstashRedisPrefsGet,
    upstashRedisPrefsSet,

    // Vector
    upstashVectorUpsert,
    upstashVectorSearch,
    upstashVectorSearchText,
    upstashVectorFetch,
    upstashVectorDelete,
    upstashVectorInfo,

    // QStash
    upstashQStashSchedule,
    upstashQStashPublish,
    upstashQStashList,
    upstashQStashGet,
    upstashQStashDelete,
    upstashQStashPause,
    upstashQStashResume,
    upstashQStashDLQList,
    upstashQStashDLQDelete,

    // Convenience
    upstashScheduleNightlyCompilation,
    upstashScheduleHealthPing,
    upstashTriggerDeployment
];
