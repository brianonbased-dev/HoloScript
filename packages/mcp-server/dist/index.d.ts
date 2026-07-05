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

export type McpServerSize =
  | 'tiny'
  | 'small'
  | 'standard'
  | 'large'
  | 'xlarge'
  | 'laptop'
  | 'jetson'
  | 'vast'
  | 'fleet';

export type McpServerTransportHint = 'stdio' | 'streamable-http' | 'streamable-http+sse';

export interface McpServerSizing {
  profile: McpServerSize;
  useCase: string;
  recommendedConsumer: string;
  transport: McpServerTransportHint;
  requestBodyMaxBytes: number;
  postgresPoolMax: number;
  oauthRateLimit: number;
  publicAnonRateLimit: number;
  consumerGenRateLimit: number;
  consumerGenDailyQuota: number;
  maxConcurrentToolCalls: number;
  toolTimeoutMs: number;
  cacheMaxEntries: number;
  memoryBudgetMb: number;
}

export declare const MCP_SERVER_SIZING_PROFILES: Record<
  McpServerSize,
  Omit<McpServerSizing, 'profile'>
>;

export declare function getMcpServerSizing(
  env?: Record<string, string | undefined>
): McpServerSizing;

export declare function handleTool(
  name: string,
  args: ToolArguments,
  signingCtx?: import('./src/holomesh/identity/signing-middleware').SigningContext
): Promise<unknown>;
export declare function executeSingleTool(
  name: string,
  args: ToolArguments,
  signingCtx?: import('./src/holomesh/identity/signing-middleware').SigningContext
): Promise<McpToolResult>;
