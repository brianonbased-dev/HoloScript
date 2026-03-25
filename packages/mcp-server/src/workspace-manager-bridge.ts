/**
 * Bridge module for WorkspaceManager — re-exports from CLI package.
 *
 * The MCP server needs access to WorkspaceManager but it lives in the CLI package.
 * This bridge provides a self-contained implementation to avoid circular deps.
 */

export { WorkspaceManager } from '../../cli/src/workspace/WorkspaceManager';
