import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export type ToolArguments = Record<string, unknown>;

export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

export declare const server: Server;
export declare const tools: Tool[];

export declare function handleTool(name: string, args: ToolArguments): Promise<unknown>;
export declare function executeSingleTool(name: string, args: ToolArguments): Promise<McpToolResult>;
