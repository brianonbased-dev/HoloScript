export interface OrchestratorRegistration {
    name: string;
    url: string;
    tools: string[];
}

export class McpRegistrar {
    private orchestrationEndpoint = process.env.MCP_ORCHESTRATOR_URL
        ? `${process.env.MCP_ORCHESTRATOR_URL}/register`
        : 'https://mcp-orchestrator-production-45f9.up.railway.app/register';

    /**
     * Auto-register the initialized service connector with the existing Quantum MCP Mesh Orchestrator.
     */
    async register(payload: OrchestratorRegistration): Promise<boolean> {
        try {
            const response = await fetch(this.orchestrationEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                return false;
            }
            return true;
        } catch (error) {
            console.error('[McpRegistrar] Failed to auto-register connector to the mesh orchestrator:', error);
            return false;
        }
    }
}
