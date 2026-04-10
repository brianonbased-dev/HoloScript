/**
 * MCP Orchestrator Registration Script
 *
 * Registers the five HoloScript MCP tools with the central MCP Mesh Orchestrator
 * running at mcp-orchestrator-production-45f9.up.railway.app. The orchestrator provides
 * cross-workspace tool discovery and knowledge federation.
 *
 * The HoloScript MCP server itself is hosted at https://mcp.holoscript.net (37+ tools).
 *
 * Usage:
 *   npx tsx packages/core/src/mcp/registerWithOrchestrator.ts
 *
 * Environment variables:
 *   MCP_ORCHESTRATOR_URL  - Orchestrator base URL (default: https://mcp-orchestrator-production-45f9.up.railway.app)
 *   MCP_API_KEY           - API key for orchestrator auth (REQUIRED — no fallback)
 *   MCP_SERVER_NAME       - Server name to register as (default: holoscript-tools)
 *
 * @module mcp/registerWithOrchestrator
 * @version 1.0.0
 */

import { HOLOSCRIPT_MCP_TOOLS, type MCPToolDefinition } from './HoloScriptMCPAdapter';

// =============================================================================
// TYPES
// =============================================================================

export interface RegistrationConfig {
  /** Orchestrator base URL */
  orchestratorUrl: string;
  /** API key for authentication */
  apiKey: string;
  /** Server name to register under */
  serverName: string;
  /** Server description */
  serverDescription: string;
  /** Server version */
  serverVersion: string;
}

export interface RegistrationResult {
  success: boolean;
  serverName: string;
  toolsRegistered: string[];
  errors: string[];
  orchestratorUrl: string;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

function requireApiKey(): string {
  const key = process.env.MCP_API_KEY;
  if (!key) {
    throw new Error(
      'MCP_API_KEY environment variable is required. ' +
        'Set it in .env or pass --api-key on the command line.'
    );
  }
  return key;
}

const DEFAULT_CONFIG: RegistrationConfig = {
  orchestratorUrl:
    process.env.MCP_ORCHESTRATOR_URL ?? 'https://mcp-orchestrator-production-45f9.up.railway.app',
  apiKey: requireApiKey(),
  serverName: process.env.MCP_SERVER_NAME ?? 'holoscript-tools',
  serverDescription:
    'HoloScript core tools: NIR compiler, WGSL shader generation, spatial training data, ' +
    'SNN sparsity analysis, and agent creation via agent-sdk.',
  serverVersion: '1.0.0',
};

// =============================================================================
// REGISTRATION LOGIC
// =============================================================================

/**
 * Build the server registration payload for the orchestrator.
 */
export function buildRegistrationPayload(
  config: RegistrationConfig,
  tools: MCPToolDefinition[]
): Record<string, unknown> {
  return {
    id: config.serverName,
    name: config.serverDescription.substring(0, 80),
    command: 'npx',
    args: ['tsx', 'packages/core/src/mcp/HoloScriptMCPAdapter.ts'],
    workspace: 'HoloScript',
    tools: tools.map((tool) => tool.name),
    visibility: 'public',
    description: config.serverDescription,
  };
}

/**
 * Register HoloScript MCP tools with the orchestrator via REST API.
 *
 * Attempts to register the server and its tools. If registration fails
 * (e.g., orchestrator not running), returns a result with error details.
 *
 * @param config - Registration configuration (optional, uses defaults)
 * @returns Registration result with success/failure details
 */
export async function registerWithOrchestrator(
  config: Partial<RegistrationConfig> = {}
): Promise<RegistrationResult> {
  const fullConfig: RegistrationConfig = { ...DEFAULT_CONFIG, ...config };
  const result: RegistrationResult = {
    success: false,
    serverName: fullConfig.serverName,
    toolsRegistered: [],
    errors: [],
    orchestratorUrl: fullConfig.orchestratorUrl,
  };

  try {
    // Step 1: Check orchestrator health
    const healthUrl = `${fullConfig.orchestratorUrl}/health`;
    let healthResponse: Response;

    try {
      healthResponse = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Orchestrator health check failed at ${healthUrl}: ${msg}`);
      return result;
    }

    if (!healthResponse.ok) {
      result.errors.push(
        `Orchestrator health check returned ${healthResponse.status}: ${healthResponse.statusText}`
      );
      return result;
    }

    // Step 2: Register the server with its tools
    const payload = buildRegistrationPayload(fullConfig, HOLOSCRIPT_MCP_TOOLS);
    const registerUrl = `${fullConfig.orchestratorUrl}/servers/register`;

    let registerResponse: Response;
    try {
      registerResponse = await fetch(registerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-mcp-api-key': fullConfig.apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`Server registration request failed: ${msg}`);
      return result;
    }

    if (!registerResponse.ok) {
      const body = await registerResponse.text().catch(() => '<no body>');
      result.errors.push(`Server registration failed (${registerResponse.status}): ${body}`);
      return result;
    }

    // Step 3: Verify registration by listing tools
    const verifyUrl = `${fullConfig.orchestratorUrl}/servers/${fullConfig.serverName}/tools`;
    try {
      const verifyResponse = await fetch(verifyUrl, {
        method: 'GET',
        headers: { 'x-mcp-api-key': fullConfig.apiKey },
        signal: AbortSignal.timeout(5000),
      });

      if (verifyResponse.ok) {
        const verifyData = (await verifyResponse.json()) as { tools?: Array<{ name: string }> };
        if (verifyData.tools && Array.isArray(verifyData.tools)) {
          result.toolsRegistered = verifyData.tools.map((t) => t.name);
        }
      }
    } catch {
      // Verification is best-effort; registration may still have succeeded
    }

    // If verification didn't return tools, use the tools we sent
    if (result.toolsRegistered.length === 0) {
      result.toolsRegistered = HOLOSCRIPT_MCP_TOOLS.map((t) => t.name);
    }

    result.success = true;
    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push(`Unexpected error during registration: ${msg}`);
    return result;
  }
}

/**
 * Unregister the HoloScript MCP server from the orchestrator.
 */
export async function unregisterFromOrchestrator(
  config: Partial<RegistrationConfig> = {}
): Promise<{ success: boolean; error?: string }> {
  const fullConfig: RegistrationConfig = { ...DEFAULT_CONFIG, ...config };

  try {
    const url = `${fullConfig.orchestratorUrl}/servers/${fullConfig.serverName}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: { 'x-mcp-api-key': fullConfig.apiKey },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Unregistration failed: ${response.status} ${response.statusText}`,
      };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// =============================================================================
// CLI ENTRY POINT
// =============================================================================

/**
 * Run registration when executed directly via `npx tsx`.
 */
async function main(): Promise<void> {
  console.info('='.repeat(60));
  console.info('HoloScript MCP Tools - Orchestrator Registration');
  console.info('='.repeat(60));
  console.info();

  const config: Partial<RegistrationConfig> = {};

  // Parse CLI args
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      config.orchestratorUrl = args[++i];
    } else if (args[i] === '--api-key' && args[i + 1]) {
      config.apiKey = args[++i];
    } else if (args[i] === '--server-name' && args[i + 1]) {
      config.serverName = args[++i];
    } else if (args[i] === '--unregister') {
      const result = await unregisterFromOrchestrator(config);
      if (result.success) {
        console.info('Successfully unregistered from orchestrator.');
      } else {
        console.error(`Unregistration failed: ${result.error}`);
        process.exit(1);
      }
      return;
    } else if (args[i] === '--help') {
      console.info('Usage: npx tsx registerWithOrchestrator.ts [options]');
      console.info();
      console.info('Options:');
      console.log(
        '  --url <url>            Orchestrator URL (default: https://mcp-orchestrator-production-45f9.up.railway.app)'
      );
      console.info('  --api-key <key>        API key (or set MCP_API_KEY env var)');
      console.info('  --server-name <name>   Server name (default: holoscript-tools)');
      console.info('  --unregister           Remove registration instead of registering');
      console.info('  --help                 Show this help message');
      return;
    }
  }

  console.info('Tools to register:');
  for (const tool of HOLOSCRIPT_MCP_TOOLS) {
    console.info(`  - ${tool.name}: ${tool.description.substring(0, 80)}...`);
  }
  console.info();

  const result = await registerWithOrchestrator(config);

  if (result.success) {
    console.info(`Registration successful!`);
    console.info(`  Server: ${result.serverName}`);
    console.info(`  Orchestrator: ${result.orchestratorUrl}`);
    console.info(`  Tools registered: ${result.toolsRegistered.join(', ')}`);
  } else {
    console.error('Registration failed:');
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }
}

// Run main if this file is the entry point
const isMainModule =
  typeof import.meta.url === 'string' &&
  (process.argv[1]?.endsWith('registerWithOrchestrator.ts') ||
    process.argv[1]?.endsWith('registerWithOrchestrator.js'));

if (isMainModule) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
