#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

const RAILWAY_GQL = 'https://backboard.railway.app/graphql/v2';
const DEFAULT_CONFIG = path.resolve(__dirname, 'data', 'railway-ecosystem.targets.json');

type RailTarget = {
  name: string;
  project: string;
  projectId?: string;
  environment: string;
  environmentId?: string;
  service: string;
  serviceId?: string;
  healthUrl?: string;
  healthAuthHeader?: string | null;
};

type Config = { targets: RailTarget[] };

type RailNode = { id: string; name: string };
type RailProject = {
  id: string;
  name: string;
  environments: { edges: Array<{ node: RailNode }> };
  services: { edges: Array<{ node: RailNode }> };
};

function loadLocalEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^['\"]|['\"]$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function getToken(): string {
  const token = process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN;
  if (!token) {
    throw new Error('Missing RAILWAY_API_TOKEN/RAILWAY_TOKEN in environment');
  }
  return token;
}

async function gql<T>(
  token: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetch(RAILWAY_GQL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Railway GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  if (!json.data) {
    throw new Error('Railway GraphQL returned no data');
  }
  return json.data;
}

function loadConfig(configPath = DEFAULT_CONFIG): Config {
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw) as Config;
}

function parseArg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function isDataService(serviceName: string): boolean {
  return /(postgres|pgvector|redis|mysql|mongodb)/i.test(serviceName);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchAllProjects(token: string): Promise<RailProject[]> {
  const data = await gql<{ projects: { edges: Array<{ node: RailNode }> } }>(
    token,
    `query { projects(first: 100) { edges { node { id name } } } }`
  );

  const out: RailProject[] = [];
  for (const p of data.projects.edges.map((e) => e.node)) {
    const details = await gql<{ project: RailProject }>(
      token,
      `query($id: String!) {
        project(id: $id) {
          id
          name
          environments { edges { node { id name } } }
          services { edges { node { id name } } }
        }
      }`,
      { id: p.id }
    );
    out.push(details.project);
  }

  return out;
}

async function discover(token: string): Promise<void> {
  const data = await gql<{ projects: { edges: Array<{ node: RailNode }> } }>(
    token,
    `query { projects(first: 100) { edges { node { id name } } } }`
  );

  console.log('\nRailway Projects (token scope):');
  for (const edge of data.projects.edges) {
    console.log(`- ${edge.node.name} (${edge.node.id})`);
  }
}

async function inventory(token: string): Promise<void> {
  const projects = await fetchAllProjects(token);
  console.log('\nRailway Inventory');
  console.log('='.repeat(72));

  for (const p of projects) {
    const envs = p.environments.edges.map((e) => e.node);
    const services = p.services.edges.map((e) => e.node);
    console.log(`\n[${p.name}] (${p.id})`);
    for (const env of envs) {
      console.log(`  env: ${env.name} (${env.id})`);
    }
    for (const s of services) {
      console.log(`  service: ${s.name} (${s.id})`);
    }
  }
}

async function syncTargets(
  token: string,
  configPath: string,
  includeDataServices = false
): Promise<void> {
  const projects = await fetchAllProjects(token);
  const current = loadConfig(configPath);

  const byId = new Map<string, RailTarget>();
  for (const t of current.targets) {
    const key = `${t.projectId ?? ''}|${t.environmentId ?? ''}|${t.serviceId ?? ''}`;
    byId.set(key, t);
  }

  const merged: RailTarget[] = [];
  for (const p of projects) {
    const env = p.environments.edges[0]?.node;
    if (!env) continue;

    for (const s of p.services.edges.map((e) => e.node)) {
      if (!includeDataServices && isDataService(s.name)) continue;

      const key = `${p.id}|${env.id}|${s.id}`;
      const existing = byId.get(key);
      const fallbackName = slugify(`${p.name}-${s.name}`);

      merged.push({
        name: existing?.name ?? fallbackName,
        project: p.name,
        projectId: p.id,
        environment: env.name,
        environmentId: env.id,
        service: s.name,
        serviceId: s.id,
        healthUrl: existing?.healthUrl,
        healthAuthHeader: existing?.healthAuthHeader ?? null,
      });
    }
  }

  merged.sort((a, b) => a.name.localeCompare(b.name));
  const next: Config = { targets: merged };
  fs.writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, 'utf-8');

  console.log(`Synced ${merged.length} targets to ${configPath}`);
  console.log(
    includeDataServices
      ? 'Included data services.'
      : 'Excluded data services (postgres/pgvector/redis/mysql/mongodb).'
  );
}

async function getProject(token: string, projectName: string): Promise<RailNode> {
  const data = await gql<{ projects: { edges: Array<{ node: RailNode }> } }>(
    token,
    `query { projects(first: 100) { edges { node { id name } } } }`
  );
  const match = data.projects.edges
    .map((e) => e.node)
    .find((p) => p.name === projectName || p.id === projectName);
  if (!match) throw new Error(`Project not found in token scope: ${projectName}`);
  return match;
}

async function resolveTargetIds(
  token: string,
  target: RailTarget
): Promise<{ projectId: string; environmentId: string; serviceId: string }> {
  // Cache hit: skip all GQL calls
  if (target.projectId && target.environmentId && target.serviceId) {
    return {
      projectId: target.projectId,
      environmentId: target.environmentId,
      serviceId: target.serviceId,
    };
  }

  const project = await getProject(token, target.projectId ?? target.project);
  const details = await gql<{
    project: {
      id: string;
      name: string;
      environments: { edges: Array<{ node: RailNode }> };
      services: { edges: Array<{ node: RailNode }> };
    };
  }>(
    token,
    `query($id: String!) {
      project(id: $id) {
        id
        name
        environments { edges { node { id name } } }
        services { edges { node { id name } } }
      }
    }`,
    { id: project.id }
  );

  const env = details.project.environments.edges
    .map((e) => e.node)
    .find((e) => e.name === target.environment || e.id === target.environment);
  if (!env)
    throw new Error(`Environment '${target.environment}' not found in project '${target.project}'`);

  const service = details.project.services.edges
    .map((e) => e.node)
    .find((s) => s.name === target.service || s.id === target.service);
  if (!service)
    throw new Error(`Service '${target.service}' not found in project '${target.project}'`);

  return { projectId: project.id, environmentId: env.id, serviceId: service.id };
}

async function triggerDeploy(
  token: string,
  environmentId: string,
  serviceId: string,
  latestCommit = true
): Promise<boolean> {
  const data = await gql<{ serviceInstanceDeploy: boolean }>(
    token,
    `mutation($environmentId: String!, $serviceId: String!, $latestCommit: Boolean) {
      serviceInstanceDeploy(environmentId: $environmentId, serviceId: $serviceId, latestCommit: $latestCommit)
    }`,
    { environmentId, serviceId, latestCommit }
  );
  return data.serviceInstanceDeploy;
}

async function latestDeploymentStatus(
  token: string,
  ids: { projectId: string; environmentId: string; serviceId: string }
): Promise<string> {
  const data = await gql<{
    deployments: {
      edges: Array<{
        node: {
          id: string;
          status: string;
          createdAt: string;
          updatedAt: string;
        };
      }>;
    };
  }>(
    token,
    `query($input: DeploymentListInput!) {
      deployments(first: 1, input: $input) {
        edges {
          node {
            id
            status
            createdAt
            updatedAt
          }
        }
      }
    }`,
    { input: ids }
  );

  const latest = data.deployments.edges[0]?.node;
  if (!latest) return 'NO_DEPLOYMENTS';
  return `${latest.status} (${latest.id})`;
}

async function checkHealth(target: RailTarget): Promise<string> {
  if (!target.healthUrl) return 'NO_HEALTH_URL';

  const headers: Record<string, string> = {};
  if (target.healthAuthHeader) {
    const value = process.env[target.healthAuthHeader];
    if (value) headers['x-mcp-api-key'] = value;
  }

  try {
    const response = await fetch(target.healthUrl, { headers });
    return `HTTP_${response.status}`;
  } catch {
    return 'NO_RESPONSE';
  }
}

async function status(token: string, config: Config): Promise<void> {
  console.log('\nRailway Ecosystem Status');
  console.log('='.repeat(72));
  for (const target of config.targets) {
    try {
      const ids = await resolveTargetIds(token, target);
      const deployment = await latestDeploymentStatus(token, ids);
      const health = await checkHealth(target);
      console.log(`\n[${target.name}]`);
      console.log(`  project: ${target.project} (${ids.projectId})`);
      console.log(`  environment: ${target.environment} (${ids.environmentId})`);
      console.log(`  service: ${target.service} (${ids.serviceId})`);
      console.log(`  latest deployment: ${deployment}`);
      console.log(`  health: ${health}`);
    } catch (error) {
      console.log(`\n[${target.name}] ERROR: ${(error as Error).message}`);
    }
  }
}

async function recover(token: string, config: Config, targetName: string): Promise<void> {
  const target = config.targets.find((t) => t.name === targetName);
  if (!target) {
    throw new Error(
      `Unknown target '${targetName}'. Available: ${config.targets.map((t) => t.name).join(', ')}`
    );
  }

  const ids = await resolveTargetIds(token, target);
  const triggered = await triggerDeploy(token, ids.environmentId, ids.serviceId, true);
  if (!triggered) {
    throw new Error(`Railway did not accept deploy trigger for ${target.name}`);
  }

  console.log(`Deploy triggered for ${target.name}. Polling status...`);
  for (let i = 0; i < 24; i++) {
    const dep = await latestDeploymentStatus(token, ids);
    const health = await checkHealth(target);
    console.log(`  poll=${i + 1} deployment=${dep} health=${health}`);
    if (health.startsWith('HTTP_2')) {
      console.log(`Recovery succeeded for ${target.name}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  throw new Error(
    `Recovery timeout for ${target.name} (service still unhealthy after polling window)`
  );
}

async function main() {
  loadLocalEnv();
  const cmd = process.argv[2] || 'status';
  const token = getToken();
  const configPath = parseArg('--config') || DEFAULT_CONFIG;
  const config = loadConfig(configPath);

  switch (cmd) {
    case 'discover':
      await discover(token);
      break;
    case 'inventory':
      await inventory(token);
      break;
    case 'sync': {
      const includeData = hasFlag('--include-data');
      await syncTargets(token, configPath, includeData);
      break;
    }
    case 'status':
      await status(token, config);
      break;
    case 'recover': {
      const target = parseArg('--target') || 'mcp-orchestrator';
      await recover(token, config, target);
      break;
    }
    case 'deploy': {
      const target = parseArg('--target');
      if (!target) throw new Error('deploy requires --target <name>');
      await recover(token, config, target);
      break;
    }
    default:
      throw new Error(
        `Unknown command '${cmd}'. Use: discover | inventory | sync | status | recover | deploy`
      );
  }
}

main().catch((error) => {
  console.error(`[railway-ecosystem] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
