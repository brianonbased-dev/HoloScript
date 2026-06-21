/**
 * HoloKey <-> Railway deploy-plane bridge helpers.
 *
 * This is intentionally value-blind. The helpers plan the one bootstrap
 * variable each Railway service needs and validate reference-shaped registry
 * credentials without ever carrying or printing secret material.
 */

export const HOLOKEY_RAILWAY_BOOTSTRAP_VAR = 'HOLOKEY_SERVICE_IDENTITY_TOKEN';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME_RE = /^[a-z0-9][a-z0-9._-]{0,80}$/i;

export function redactSecret(value) {
  if (typeof value !== 'string' || value.length === 0) return '****';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...(${value.length})`;
}

export function isRailwayReference(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return (
    /^\$\{\{[A-Za-z0-9_.-]+(?:\.[A-Za-z0-9_.-]+)*\}\}$/.test(trimmed) ||
    /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(trimmed)
  );
}

export function isRailwaySealedValue(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}');
}

export function registryCredentialPasswordFinding(registryCredentials, scope = 'unknown') {
  if (!registryCredentials?.password) return null;
  const password = String(registryCredentials.password);
  if (isRailwayReference(password) || isRailwaySealedValue(password)) return null;
  return {
    scope,
    field: 'registryCredentials.password',
    reason: 'registry credential password must be a Railway reference or sealed value',
    pass: redactSecret(password),
  };
}

function requireServiceTarget(target) {
  const name = String(target?.name ?? target?.service ?? '').trim();
  const serviceId = String(target?.serviceId ?? target?.id ?? '').trim();
  const projectId = String(target?.projectId ?? '').trim();
  const environmentId = String(target?.environmentId ?? '').trim();
  if (!NAME_RE.test(name)) throw new Error(`invalid Railway service name: ${name || '(missing)'}`);
  if (!UUID_RE.test(serviceId))
    throw new Error(`invalid Railway service id for ${name}: ${serviceId}`);
  if (projectId && !UUID_RE.test(projectId)) {
    throw new Error(`invalid Railway project id for ${name}: ${projectId}`);
  }
  if (environmentId && !UUID_RE.test(environmentId)) {
    throw new Error(`invalid Railway environment id for ${name}: ${environmentId}`);
  }
  return { name, serviceId, projectId, environmentId };
}

export function railwayServiceOwnerId(target) {
  const { serviceId } = requireServiceTarget(target);
  return `infra://service/${encodeURIComponent(serviceId)}`;
}

export function buildRailwayBootstrapSyncPlan(targets, opts = {}) {
  const variableName = opts.variableName || HOLOKEY_RAILWAY_BOOTSTRAP_VAR;
  if (!/^[A-Z][A-Z0-9_]*$/.test(variableName)) {
    throw new Error(`bootstrap variable name must be UPPER_SNAKE: ${variableName}`);
  }
  return targets.map((target) => {
    const normalized = requireServiceTarget(target);
    const ownerId = railwayServiceOwnerId(normalized);
    return {
      serviceName: normalized.name,
      serviceId: normalized.serviceId,
      projectId: normalized.projectId,
      environmentId: normalized.environmentId,
      ownerId,
      holokeyRef: `vault:${variableName}`,
      railwayVariableName: variableName,
      railwayReference: `\${${variableName}}`,
    };
  });
}

export function variableUpsertMutation() {
  return `mutation UpsertVariable($projectId: String!, $environmentId: String!, $serviceId: String!, $name: String!, $value: String!) {
    variableUpsert(input: {projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, name: $name, value: $value})
  }`;
}

export function buildVariableUpsertVariables(planRow, value) {
  if (!planRow?.projectId || !planRow?.environmentId || !planRow?.serviceId) {
    throw new Error(
      `cannot sync ${planRow?.serviceName ?? '(unknown)'}: projectId/environmentId/serviceId required`
    );
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`cannot sync ${planRow.serviceName}: bootstrap token is empty`);
  }
  return {
    projectId: planRow.projectId,
    environmentId: planRow.environmentId,
    serviceId: planRow.serviceId,
    name: planRow.railwayVariableName,
    value,
  };
}

export function syncReceipt(planRow, value) {
  return {
    serviceName: planRow.serviceName,
    serviceId: planRow.serviceId,
    ownerId: planRow.ownerId,
    railwayVariableName: planRow.railwayVariableName,
    holokeyRef: planRow.holokeyRef,
    syncedValue: redactSecret(value),
  };
}
