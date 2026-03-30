import { ServiceConnector, McpRegistrar } from '@holoscript/connector-core';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { railwayTools } from './tools.js';

export class RailwayConnector extends ServiceConnector {
  private apiKey: string | null = null;
  private readonly apiUrl = 'https://backboard.railway.com/graphql/v2';
  private registrar = new McpRegistrar();

  constructor() {
    super();
  }

  async connect(): Promise<void> {
    // Authenticate via token
    this.apiKey =
      process.env.RAILWAY_TOKEN ||
      process.env.PROJECT_RAILWAY_TOKEN ||
      process.env.RAILWAY_API_TOKEN ||
      null;
    if (this.apiKey) {
      this.isConnected = true;
      await this.registrar.register({
        name: 'holoscript-railway',
        url: 'http://localhost:0',
        tools: railwayTools.map((t) => t.name),
      });
    }
  }

  async disconnect(): Promise<void> {
    this.apiKey = null;
    this.isConnected = false;
  }

  async health(): Promise<boolean> {
    return this.isConnected && this.apiKey !== null;
  }

  async listTools(): Promise<Tool[]> {
    return railwayTools;
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected) {
      throw new Error('RailwayConnector is not connected.');
    }

    let query = '';
    let variables: Record<string, unknown> = {};

    switch (name) {
      case 'railway_project_create':
        query = `mutation CreateProject($name: String!) { projectCreate(input: {name: $name}) { id name } }`;
        variables = { name: args.name };
        break;
      case 'railway_service_create':
        query = `mutation CreateService($projectId: String!, $name: String!) { serviceCreate(input: {projectId: $projectId, name: $name}) { id name } }`;
        variables = { projectId: args.projectId, name: args.name };
        break;
      case 'railway_deploy':
        query = `mutation CreateDeployment($serviceId: String!, $environmentId: String!) { deploymentCreate(input: {serviceId: $serviceId, environmentId: $environmentId}) { id } }`;
        variables = { serviceId: args.serviceId, environmentId: args.environmentId };
        break;
      case 'railway_variable_set':
        query = `mutation UpsertVariable($projectId: String!, $environmentId: String!, $serviceId: String!, $name: String!, $value: String!) { variableUpsert(input: {projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, name: $name, value: $value}) }`;
        variables = {
          projectId: args.projectId,
          environmentId: args.environmentId,
          serviceId: args.serviceId,
          name: args.name,
          value: args.value,
        };
        break;
      case 'railway_domain_add':
        query = `mutation AddDomain($serviceId: String!, $environmentId: String!, $domain: String!) { customDomainCreate(input: {serviceId: $serviceId, environmentId: $environmentId, domain: $domain}) { id } }`;
        variables = {
          serviceId: args.serviceId,
          environmentId: args.environmentId,
          domain: args.domain,
        };
        break;
      case 'railway_deployment_status':
        query = `query Deployment($id: String!) { deployment(id: $id) { id status } }`;
        variables = { id: args.deploymentId };
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return this.executeGraphQLWithBackoff(query, variables);
  }

  private async executeGraphQLWithBackoff(
    query: string,
    variables: Record<string, unknown>,
    retries: number = 3
  ): Promise<unknown> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
      });

      const remainingHeader = response.headers.get('X-RateLimit-Remaining');
      const remaining = remainingHeader ? Number(remainingHeader) : Infinity;

      if (response.status === 429 || remaining <= 0) {
        if (attempt < retries) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.warn(`[RailwayConnector] Rate limited. Backing off for ${backoffMs}ms`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        throw new Error('Railway API rate limit exceeded.');
      }

      if (!response.ok) {
        throw new Error(`Railway API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    }
  }
}
