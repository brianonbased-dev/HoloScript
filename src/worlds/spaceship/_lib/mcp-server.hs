/**
 * MCP Server - HoloScript Definition
 *
 * Declarative definition of Model Context Protocol servers.
 * Defines tools, resources, prompts, and orchestration patterns.
 *
 * Pattern: P.MCP.SERVER.01
 * Wisdom: W.MCP.01 - "Tools are the language of action"
 */

@meta {
  id: "MCP_SERVER_DEFINITION"
  name: "MCP Server Protocol"
  version: "1.0.0"
  author: "HoloScript Core"
  protocol: "mcp/1.0"
}

// =============================================================================
// SERVER CONFIGURATION
// =============================================================================

@server_config {
  // Server identification
  identity: {
    name: string
    version: string
    vendor: string
    description: string
  }

  // Transport options
  transport: {
    type: "stdio" | "sse" | "websocket"
    port?: number
    path?: string
  }

  // Capabilities
  capabilities: {
    tools: boolean
    resources: boolean
    prompts: boolean
    sampling: boolean
    logging: boolean
  }

  // Rate limiting
  rate_limits: {
    requests_per_minute: number
    tokens_per_minute: number
    concurrent_requests: number
  }

  // Health monitoring
  health: {
    heartbeat_interval_ms: number
    timeout_ms: number
    auto_restart: boolean
  }
}

// =============================================================================
// TOOL DEFINITION SYNTAX
// =============================================================================

@tool_schema {
  /**
   * Define an MCP tool with typed parameters
   */
  @tool(name: string) {
    description: string

    @input {
      // JSON Schema for parameters
      type: "object"
      properties: Record<string, JsonSchema>
      required?: string[]
    }

    @output {
      // Return type definition
      type: "text" | "json" | "binary"
      schema?: JsonSchema
    }

    @handler {
      // Implementation reference
      module: string
      function: string
    }

    @metadata {
      category?: string
      authority_level?: 0 | 1 | 2 | 3  // L0-L3 authority
      cacheable?: boolean
      cache_ttl_ms?: number
      idempotent?: boolean
    }
  }
}

// =============================================================================
// CORE TOOL CATEGORIES
// =============================================================================

@tool_categories {
  // Knowledge & Analysis
  knowledge: {
    prefix: "uaa2_"
    tools: [
      "search_knowledge"
      "get_patterns"
      "get_wisdom"
      "get_gotchas"
    ]
    authority_level: 0  // Auto-approved
  }

  // Memory Operations
  memory: {
    prefix: "uaa2_memory_"
    tools: [
      "read"
      "write"
      "append"
      "clear"
    ]
    authority_level: 1  // Self-approved
  }

  // Decision & Coordination
  decision: {
    prefix: "uaa2_"
    tools: [
      "decision_classify"
      "approval_request"
      "coordination_request"
      "authority_check"
    ]
    authority_level: 2  // Requires approval
  }

  // System Operations
  system: {
    prefix: "master_portal_"
    tools: [
      "get_system_health"
      "get_agent_status"
      "execute_agent_command"
    ]
    authority_level: 1
  }

  // Protocol Execution
  protocol: {
    prefix: "uaa2_"
    tools: [
      "execute_cycle"
      "intake"
      "reflect"
      "compress"
    ]
    authority_level: 1
  }

  // Mesh Operations
  mesh: {
    prefix: "uaa2_mesh_"
    tools: [
      "get_status"
      "run_orchestration"
      "configure"
    ]
    authority_level: 2
  }
}

// =============================================================================
// SERVER TEMPLATES
// =============================================================================

@server_templates {
  /**
   * Minimal server with core tools only
   */
  @template minimal {
    tools: ["uaa2_test", "uaa2_search_knowledge", "uaa2_memory_read"]
    transport: "stdio"

    @config {
      rate_limits: {
        requests_per_minute: 60
        tokens_per_minute: 100000
        concurrent_requests: 5
      }
    }
  }

  /**
   * Expanded server with full tool set
   */
  @template expanded {
    tools: @tool_categories.*.tools.flatten()
    transport: "sse"

    @config {
      rate_limits: {
        requests_per_minute: 120
        tokens_per_minute: 500000
        concurrent_requests: 10
      }
    }
  }

  /**
   * HoloScript compiler server
   */
  @template holoscript {
    tools: [
      "parse_hs"
      "compile_hs"
      "validate_syntax"
      "generate_scene"
      "generate_object"
      "semantic_expand"
    ]
    transport: "stdio"

    @config {
      capabilities: {
        tools: true
        resources: true  // HoloScript files as resources
        prompts: true    // Code generation prompts
      }
    }
  }

  /**
   * VR integration server
   */
  @template vr {
    tools: [
      "vr_spawn_entity"
      "vr_update_transform"
      "vr_trigger_animation"
      "vr_spatial_audio"
    ]
    transport: "websocket"

    @config {
      rate_limits: {
        requests_per_minute: 1000  // High-frequency updates
        concurrent_requests: 50
      }
    }
  }
}

// =============================================================================
// ORCHESTRATION PATTERNS
// =============================================================================

@orchestration {
  /**
   * Mesh orchestrator configuration
   */
  @mesh_orchestrator {
    port: 5566

    @registry {
      server_ttl_ms: 300000  // 5 minutes
      heartbeat_interval_ms: 30000
      auto_cleanup: true
    }

    @knowledge_federation {
      sync_interval_ms: 300000
      max_entries_per_workspace: 10000
      deduplication: true
    }

    @agent_messaging {
      max_inbox_size: 1000
      message_ttl_ms: 3600000  // 1 hour
      topic_max_subscribers: 100
    }

    @load_balancing {
      strategy: "round_robin" | "least_connections" | "weighted"
      health_check_interval_ms: 30000
      unhealthy_threshold: 3
    }
  }

  /**
   * Tool routing rules
   */
  @routing {
    @rule priority_routing {
      condition: "tool.authority_level >= 2"
      action: "route_to_primary"
      fallback: "queue_for_approval"
    }

    @rule load_balanced {
      condition: "server.load < 0.8"
      action: "route_to_server"
      fallback: "queue"
    }

    @rule workspace_affinity {
      condition: "request.workspace == server.workspace"
      action: "prefer_local"
      fallback: "route_any"
    }
  }
}

// =============================================================================
// TOOL DEFINITIONS (Examples)
// =============================================================================

@tools {
  @tool uaa2_search_knowledge {
    description: "Semantic search in knowledge base"

    @input {
      type: "object"
      properties: {
        query: { type: "string", description: "Search query" }
        type: { type: "string", enum: ["pattern", "wisdom", "gotcha", "all"] }
        limit: { type: "number", default: 10 }
      }
      required: ["query"]
    }

    @output {
      type: "json"
      schema: {
        type: "object"
        properties: {
          results: { type: "array" }
          count: { type: "number" }
        }
      }
    }

    @metadata {
      category: "knowledge"
      authority_level: 0
      cacheable: true
      cache_ttl_ms: 60000
    }
  }

  @tool uaa2_execute_cycle {
    description: "Execute full uAA2++ protocol cycle (7 phases)"

    @input {
      type: "object"
      properties: {
        context: { type: "object", description: "Cycle context" }
        phases: { type: "array", items: { type: "string" } }
        max_duration_ms: { type: "number", default: 300000 }
      }
    }

    @output {
      type: "json"
      schema: {
        type: "object"
        properties: {
          success: { type: "boolean" }
          cycle_number: { type: "number" }
          phases: { type: "object" }
          learnings: { type: "object" }
          evolution_level: { type: "number" }
        }
      }
    }

    @metadata {
      category: "protocol"
      authority_level: 1
      idempotent: false
    }
  }

  @tool parse_hs {
    description: "Parse HoloScript code into AST"

    @input {
      type: "object"
      properties: {
        code: { type: "string", description: "HoloScript source code" }
        options: {
          type: "object"
          properties: {
            strict: { type: "boolean", default: false }
            emit_ast: { type: "boolean", default: true }
          }
        }
      }
      required: ["code"]
    }

    @output {
      type: "json"
      schema: {
        type: "object"
        properties: {
          success: { type: "boolean" }
          ast: { type: "object" }
          errors: { type: "array" }
          warnings: { type: "array" }
        }
      }
    }

    @metadata {
      category: "holoscript"
      authority_level: 0
      cacheable: true
      cache_ttl_ms: 300000
    }
  }
}

// =============================================================================
// RESOURCE DEFINITIONS
// =============================================================================

@resources {
  @resource holoscript_files {
    uri_template: "holoscript:///{path}"
    mime_types: ["text/x-holoscript", "text/x-holoplus", "text/x-holo"]

    @operations {
      read: true
      write: false
      list: true
    }
  }

  @resource knowledge_base {
    uri_template: "knowledge:///{workspace}/{type}/{id}"
    mime_types: ["application/json"]

    @operations {
      read: true
      write: true
      list: true
      subscribe: true
    }
  }

  @resource agent_state {
    uri_template: "agent:///{agent_id}/state"
    mime_types: ["application/json"]

    @operations {
      read: true
      write: false
      subscribe: true
    }
  }
}

// =============================================================================
// PROMPT DEFINITIONS
// =============================================================================

@prompts {
  @prompt generate_scene {
    description: "Generate a HoloScript scene from description"

    @arguments {
      description: { type: "string", required: true }
      style: { type: "string", default: "default" }
    }

    @template """
      Generate a HoloScript scene based on the following description:

      Description: ${description}
      Style: ${style}

      Requirements:
      1. Use proper @scene syntax
      2. Include entity definitions with components
      3. Add interactions if appropriate
      4. Follow HoloScript best practices

      Output only the HoloScript code, no explanations.
    """
  }

  @prompt analyze_code {
    description: "Analyze HoloScript code and suggest improvements"

    @arguments {
      code: { type: "string", required: true }
      focus: { type: "string", enum: ["performance", "readability", "patterns"] }
    }

    @template """
      Analyze this HoloScript code:

      ```holoscript
      ${code}
      ```

      Focus: ${focus}

      Provide:
      1. Summary of what the code does
      2. Identified patterns used
      3. Suggestions for improvement
      4. Any potential issues
    """
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

@export {
  server_config
  tool_schema
  tool_categories
  server_templates
  orchestration
  tools
  resources
  prompts
}
