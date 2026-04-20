import type { ServiceConnector } from './ServiceConnector.js';
import { ResilientOrchestratorFetch } from './ResilientOrchestratorFetch.js';

export interface OrchestratorRegistration {
  name: string;
  url: string;
  tools: string[];
}

export class McpRegistrar {
  private resilientFetch = new ResilientOrchestratorFetch();

  /**
   * Discover tool names from a {@link ServiceConnector} and register with the MCP orchestrator.
   * Connect the connector first if your implementation requires an active session for {@link ServiceConnector.listTools}.
   */
  async registerFromServiceConnector(
    connector: ServiceConnector,
    meta: Pick<OrchestratorRegistration, 'name' | 'url'>
  ): Promise<boolean> {
    const tools = await connector.listTools();
    const names = tools.map((t) => t.name).filter((n): n is string => Boolean(n && n.length > 0));
    return this.register({ name: meta.name, url: meta.url, tools: names });
  }

  /**
   * Auto-register the initialized service connector with the existing Quantum MCP Mesh Orchestrator.
   */
  async register(payload: OrchestratorRegistration): Promise<boolean> {
    try {
      const { response } = await this.resilientFetch.fetchWithFailover('/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        return false;
      }
      return true;
    } catch (error) {
      console.error(
        '[McpRegistrar] Failed to auto-register connector to the mesh orchestrator:',
        error
      );
      return false;
    }
  }
}
