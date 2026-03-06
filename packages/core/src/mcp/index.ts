/**
 * MCP (Model Context Protocol) Integration
 *
 * Provides MCP-compatible tool definitions, handlers, orchestration,
 * and orchestrator registration for HoloScript core capabilities.
 *
 * @module mcp
 */

// MCP Orchestrator (multi-agent coordination)
export {
  MCPOrchestrator,
  createMCPOrchestrator,
  AgentType,
  type MCPAgent,
  type MCPTool,
  type OrchestrationTask,
  type OrchestrationStep,
  type TaskResult,
  type MCPOrchestrationConfig,
} from './MCPOrchestrator';

// MCP Tool Adapter (5 HoloScript core tools)
export {
  HOLOSCRIPT_MCP_TOOLS,
  TOOL_HANDLERS,
  handleHoloScriptTool,
  handleCompileNIR,
  handleCompileWGSL,
  handleGenerateSpatialTraining,
  handleSparsityCheck,
  handleAgentCreate,
  type MCPToolDefinition,
  type MCPToolResult,
  type MCPToolHandler,
} from './HoloScriptMCPAdapter';

// Orchestrator Registration
export {
  registerWithOrchestrator,
  unregisterFromOrchestrator,
  buildRegistrationPayload,
  type RegistrationConfig,
  type RegistrationResult,
} from './registerWithOrchestrator';
