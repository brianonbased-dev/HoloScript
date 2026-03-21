import { Tool } from '@modelcontextprotocol/sdk/types.js';

export abstract class ServiceConnector {
    protected isConnected: boolean = false;

    /**
     * Establish connection to the underlying external service api.
     */
    abstract connect(): Promise<void>;

    /**
     * Disconnect and cleanup external resources.
     */
    abstract disconnect(): Promise<void>;

    /**
     * Retrieve the health status of the connection.
     * @returns boolean true if fully healthy and operational.
     */
    abstract health(): Promise<boolean>;

    /**
     * Enumerate the MCP tools exposed by this service wrapper.
     */
    abstract listTools(): Promise<Tool[]>;

    /**
     * Route a contextual tool request to the specific service API operation
     */
    abstract executeTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}
