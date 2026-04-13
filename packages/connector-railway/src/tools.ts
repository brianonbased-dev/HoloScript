import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const railwayTools: Tool[] = [
  {
    name: 'railway_project_create',
    description: 'Create a new Railway project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the project' },
        description: { type: 'string', description: 'Optional description' },
      },
      required: ['name'],
    },
  },
  {
    name: 'railway_service_create',
    description: 'Create a service inside a Railway project',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['projectId', 'name'],
    },
  },
  {
    name: 'railway_deploy',
    description: 'Trigger a deployment in a regular service',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        environmentId: { type: 'string' },
      },
      required: ['serviceId', 'environmentId'],
    },
  },
  {
    name: 'railway_variable_set',
    description: 'Set an environment variable for a service',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        environmentId: { type: 'string' },
        serviceId: { type: 'string' },
        name: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['projectId', 'environmentId', 'serviceId', 'name', 'value'],
    },
  },
  {
    name: 'railway_domain_add',
    description: 'Attach a domain to a service deployment',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        environmentId: { type: 'string' },
        domain: { type: 'string' },
      },
      required: ['serviceId', 'environmentId', 'domain'],
    },
  },
  {
    name: 'railway_deployment_status',
    description: 'Check the status of a specific deployment',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string' },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'railway_redeploy',
    description: 'Redeploy a service instance from the latest commit. Use this after pushing code to trigger a fresh build and deploy without needing GitHub Actions.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID (find via railway_service_list)' },
        environmentId: { type: 'string', description: 'Environment ID (usually production)' },
      },
      required: ['serviceId', 'environmentId'],
    },
  },
  {
    name: 'railway_service_restart',
    description: 'Restart a service instance without redeploying. Useful for clearing in-memory state or recovering from crashes.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        environmentId: { type: 'string' },
      },
      required: ['serviceId', 'environmentId'],
    },
  },
  {
    name: 'railway_deployment_logs',
    description: 'Fetch runtime logs from a deployment (stdout/stderr after the container starts). Use railway_build_logs for build-phase output.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string', description: 'Deployment ID (use railway_latest_deployment to find it)' },
        limit: { type: 'number', description: 'Max log lines to return (default: 100)' },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'railway_build_logs',
    description: 'Fetch build logs from a deployment (Dockerfile/Nixpacks output, compile errors, healthcheck results). Use this to debug failed deploys.',
    inputSchema: {
      type: 'object',
      properties: {
        deploymentId: { type: 'string', description: 'Deployment ID (use railway_latest_deployment to find it)' },
        limit: { type: 'number', description: 'Max log lines to return (default: 100)' },
      },
      required: ['deploymentId'],
    },
  },
  {
    name: 'railway_latest_deployment',
    description: 'Get the latest deployment for a service — returns deployment ID, status, and creation time. Essential for feeding into railway_build_logs and railway_deployment_logs.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Service ID' },
        projectId: { type: 'string', description: 'Project ID' },
      },
      required: ['serviceId', 'projectId'],
    },
  },
  {
    name: 'railway_variable_list',
    description: 'List all environment variables for a service in a specific environment. Values are included — do NOT log or expose them.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        environmentId: { type: 'string' },
        serviceId: { type: 'string' },
      },
      required: ['projectId', 'environmentId', 'serviceId'],
    },
  },
  {
    name: 'railway_volume_list',
    description: 'List all volumes attached to a project.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'railway_tcp_proxy',
    description: 'Create a TCP proxy for a service (expose a port to the internet). Useful for database access or custom protocols.',
    inputSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        environmentId: { type: 'string' },
        applicationPort: { type: 'number', description: 'Internal port the service listens on' },
      },
      required: ['serviceId', 'environmentId', 'applicationPort'],
    },
  },
  {
    name: 'railway_service_list',
    description: 'List all services in a project with their IDs and names. Essential for finding the serviceId needed by other tools.',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Project ID (see GOLD vault w_gold_034 for registry)' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'railway_project_list',
    description: 'List all Railway projects accessible to the current token.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
