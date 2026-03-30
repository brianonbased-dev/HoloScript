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
];
