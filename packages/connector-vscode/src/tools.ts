import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const vscodeTools: Tool[] = [
  {
    name: 'vscode_extension_status',
    description: 'Check if the HoloScript VSCode extension is running and connected',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'vscode_file_open',
    description: 'Open a file in the VSCode editor',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path to open (relative to workspace root)' },
        line: { type: 'number', description: 'Optional line number to scroll to' },
      },
      required: ['path'],
    },
  },
  {
    name: 'vscode_preview_open',
    description: 'Open the HoloScript live preview panel for a composition file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to .holo or .hsplus file to preview' },
      },
      required: ['path'],
    },
  },
  {
    name: 'vscode_sync_push',
    description: 'Push a composition from Studio to the VSCode workspace',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Destination path in workspace' },
        content: { type: 'string', description: 'File content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'vscode_sync_pull',
    description: 'Pull a file from VSCode workspace to Studio',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path in workspace to pull' },
      },
      required: ['path'],
    },
  },
  {
    name: 'vscode_terminal_run',
    description: 'Execute a command in the VSCode integrated terminal',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Optional working directory' },
      },
      required: ['command'],
    },
  },
  {
    name: 'vscode_mcp_status',
    description: 'Check the MCP server connection status in the VSCode extension',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'vscode_workspace_info',
    description: 'Get information about the open VSCode workspace',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];
