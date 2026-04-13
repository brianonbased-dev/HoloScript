import { ServiceConnector, McpRegistrar } from '@holoscript/connector-core';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { railwayTools } from './tools.js';

export class RailwayConnector extends ServiceConnector {
  private apiKey: string | null = null;
  private readonly apiUrl = 'https://backboard.railway.app/graphql/v2';
  private registrar = new McpRegistrar();

  constructor() {
    super();
  }

  private isProjectToken = false;

  async connect(): Promise<void> {
    // Authenticate via token
    // Priority: Account token (broadest) → Project token (CI/CD scoped)
    // Account/workspace tokens use: Authorization: Bearer <token>
    // Project tokens use: Project-Access-Token: <token>
    if (process.env.RAILWAY_API_TOKEN) {
      this.apiKey = process.env.RAILWAY_API_TOKEN;
      this.isProjectToken = false;
    } else if (process.env.RAILWAY_TOKEN) {
      this.apiKey = process.env.RAILWAY_TOKEN;
      this.isProjectToken = true;
    } else {
      this.apiKey = null;
    }
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
      case 'railway_redeploy':
        query = `mutation Redeploy($serviceId: String!, $environmentId: String!) { serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId) }`;
        variables = { serviceId: args.serviceId, environmentId: args.environmentId };
        break;
      case 'railway_service_restart':
        query = `mutation Restart($serviceId: String!, $environmentId: String!) { serviceInstanceRestart(input: {serviceId: $serviceId, environmentId: $environmentId}) }`;
        variables = { serviceId: args.serviceId, environmentId: args.environmentId };
        break;
      case 'railway_deployment_logs':
        query = `query DeploymentLogs($deploymentId: String!, $limit: Int) { deploymentLogs(deploymentId: $deploymentId, limit: $limit) { message timestamp severity } }`;
        variables = { deploymentId: args.deploymentId, limit: (args.limit as number) || 100 };
        break;
      case 'railway_build_logs':
        query = `query BuildLogs($deploymentId: String!, $limit: Int) { buildLogs(deploymentId: $deploymentId, limit: $limit) { message timestamp } }`;
        variables = { deploymentId: args.deploymentId, limit: (args.limit as number) || 100 };
        break;
      case 'railway_latest_deployment':
        query = `query LatestDeploy($projectId: String!) { project(id: $projectId) { services { edges { node { id name serviceInstances { edges { node { latestDeployment { id status createdAt } } } } } } } } }`;
        variables = { projectId: args.projectId };
        // Post-process: filter to the requested serviceId
        return this.executeGraphQLWithBackoff(query, variables).then((result: unknown) => {
          const data = result as { data?: { project?: { services?: { edges?: Array<{ node: { id: string; name: string; serviceInstances?: { edges?: Array<{ node: { latestDeployment?: { id: string; status: string; createdAt: string } } }> } } }> } } } };
          const services = data?.data?.project?.services?.edges || [];
          const match = services.find(s => s.node.id === args.serviceId);
          if (!match) {
            return { data: { error: `Service ${args.serviceId} not found in project` } };
          }
          const instances = match.node.serviceInstances?.edges || [];
          const dep = instances[0]?.node?.latestDeployment;
          return {
            data: {
              service: match.node.name,
              serviceId: match.node.id,
              latestDeployment: dep || null,
            },
          };
        });
      case 'railway_variable_list':
        query = `query Variables($projectId: String!, $environmentId: String!, $serviceId: String!) { variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) }`;
        variables = { projectId: args.projectId, environmentId: args.environmentId, serviceId: args.serviceId };
        break;
      case 'railway_volume_list':
        query = `query Volumes($projectId: String!) { project(id: $projectId) { volumes { edges { node { id name mountPath sizeGB } } } } }`;
        variables = { projectId: args.projectId };
        break;
      case 'railway_tcp_proxy':
        query = `mutation TcpProxy($serviceId: String!, $environmentId: String!, $applicationPort: Int!) { tcpProxyCreate(input: {serviceId: $serviceId, environmentId: $environmentId, applicationPort: $applicationPort}) { id proxyPort domain } }`;
        variables = { serviceId: args.serviceId, environmentId: args.environmentId, applicationPort: args.applicationPort };
        break;
      case 'railway_service_list':
        query = `query Services($projectId: String!) { project(id: $projectId) { services { edges { node { id name } } } } }`;
        variables = { projectId: args.projectId };
        break;
      case 'railway_project_list':
        query = `query { projects { edges { node { id name } } } }`;
        variables = {};
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
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // Account/workspace tokens use Authorization: Bearer
      // Project tokens use Project-Access-Token header
      if (this.isProjectToken) {
        headers['Project-Access-Token'] = this.apiKey!;
      } else {
        headers['Authorization'] = `Bearer ${this.apiKey}`;
      }
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers,
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
