export const HOLOSYSTEM_CONFIG_SCHEMA = 'holoscript.holosystem.consumer.v1';
export const HOLOSYSTEM_INSPECTION_SCHEMA = 'holoscript.holosystem.inspection.v1';

export {
  HOLOSYSTEM_REBUILD_ATTESTATION_SCHEMA,
  HOLOSYSTEM_SUBSTRATE_SCHEMA,
  buildSubstrateClosure,
  createRebuildAttestationPayload,
} from './substrate.mjs';

export { HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA, importNpmPackageLock } from './substrate-import.mjs';
export { importDebianPackageSnapshot } from './substrate-import-debian.mjs';
export {
  HOLOSYSTEM_DEBIAN_RELEASE_AUTH_SCHEMA,
  verifyDebianRepositoryRelease,
} from './substrate-debian-release.mjs';
export {
  HOLOSYSTEM_NATIVE_BUILD_PLAN_SCHEMA,
  HOLOSYSTEM_NATIVE_BUILD_RECEIPT_SCHEMA,
  HOLOSYSTEM_NATIVE_BUILD_SOURCE_SCHEMA,
  createNativeRebuildAttestationPayload,
  inspectNativeBuildPlan,
  inspectNativeBuildSource,
  runNativeBuild,
} from './native-build.mjs';

export {
  HOLOSYSTEM_CATALOG_SCHEMA,
  HOLOSYSTEM_CONSUMER_INPUT_SCHEMA,
  HOLOSYSTEM_LINEAGE_SCHEMA,
  HOLOSYSTEM_NEXT_WORK_SCHEMA,
  buildConsumptionSurfaceCatalog,
  buildSourceLineageReceipt,
  discoverConsumptionSurfaceCatalog,
  discoverSourceLineage,
  hashConsumerInput,
  inspectPublicDependencySpecs,
  normalizeRepositoryUrl,
  selectNextConsumptionWork,
} from './catalog.mjs';

const REQUIRED_CONTRACTS = [
  { registry: 'npm', role: 'agent-runtime' },
  { registry: 'npm', role: 'memory' },
  { registry: 'npm', role: 'repo-custody' },
  { registry: 'pypi', role: 'repo-custody' },
];

const REQUIRED_BINDINGS = ['storage', 'memory', 'knowledge', 'authority'];
const REQUIRED_STOP_CONDITIONS = ['authority-required', 'validation-failed', 'lease-expired'];
const KNOWN_TOP_LEVEL_KEYS = new Set(['schema', 'consumer', 'contracts', 'bindings', 'operations']);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export const DEFAULT_PUBLIC_PACKAGE_CONTRACTS = deepFreeze([
  {
    registry: 'npm',
    name: '@holoscript/agent-runtime',
    version: '0.6.1',
    role: 'agent-runtime',
  },
  {
    registry: 'npm',
    name: '@holoscript/memory',
    version: '0.3.0',
    role: 'memory',
  },
  {
    registry: 'npm',
    name: '@holoscript/holorepo',
    version: '0.3.7',
    role: 'repo-custody',
  },
  {
    registry: 'pypi',
    name: 'holoscript-holorepo',
    version: '0.3.7',
    role: 'repo-custody',
  },
]);

export const DEFAULT_CALLER_BINDINGS = deepFreeze({
  storage: { owner: 'caller', env: 'HOLOREPO_DATABASE_URL' },
  memory: { owner: 'caller', env: 'MEMORY_DATABASE_URL' },
  knowledge: { owner: 'caller', env: 'HOLOREPO_DATABASE_URL' },
  authority: { owner: 'caller', env: 'HOLOSYSTEM_AUTHORITY_REF' },
});

const DEFAULT_OPERATIONS = deepFreeze({
  autonomy: {
    mode: 'bounded',
    maxAttempts: 3,
    leaseSeconds: 300,
    stopConditions: REQUIRED_STOP_CONDITIONS,
  },
  receipts: {
    directory: '.holosystem/receipts',
    format: 'json',
    maxAgeSeconds: 900,
  },
});

function issue(list, check, code, path, message) {
  list.push({ check, code, path, message });
}

function checkKnownKeys(value, allowed, path, check, errors) {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      issue(
        errors,
        check,
        'unknown-field',
        path ? `${path}.${key}` : key,
        `Field ${key} is not part of the v1 consumer contract.`
      );
    }
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validId(value) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,63}$/iu.test(value);
}

function validEnvName(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]*$/u.test(value);
}

function validPackageName(registry, value) {
  if (typeof value !== 'string') return false;
  if (registry === 'npm') {
    return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u.test(value);
  }
  return registry === 'pypi' && /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/iu.test(value);
}

function validPinnedVersion(value) {
  return (
    typeof value === 'string' &&
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value) &&
    !/^(?:workspace|file|link|portal|git|https?):/iu.test(value)
  );
}

function isPortablePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !/^[A-Za-z]:[\\/]/u.test(value) &&
    !/^(?:[\\/]{2}|\/|~[\\/])/u.test(value) &&
    !/(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(value)
  );
}

function inspectSensitiveValues(value, path, errors) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => inspectSensitiveValues(child, `${path}[${index}]`, errors));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (/(?:password|secret|token|apiKey|privateKey|connectionString)$/iu.test(key)) {
      issue(
        errors,
        'portable-inputs',
        'embedded-sensitive-field',
        childPath,
        'Credential values are not configuration fields; reference a caller-owned environment key.'
      );
    }
    inspectSensitiveValues(child, childPath, errors);
  }
}

function checkSchema(config, errors) {
  if (config.schema !== HOLOSYSTEM_CONFIG_SCHEMA) {
    issue(errors, 'schema', 'schema-mismatch', 'schema', `Expected ${HOLOSYSTEM_CONFIG_SCHEMA}.`);
  }
}

function checkConsumer(config, errors) {
  if (!isRecord(config.consumer)) {
    issue(errors, 'consumer', 'consumer-missing', 'consumer', 'Consumer identity is required.');
    return;
  }
  checkKnownKeys(config.consumer, new Set(['id', 'workspace']), 'consumer', 'consumer', errors);
  if (!validId(config.consumer.id)) {
    issue(
      errors,
      'consumer',
      'consumer-id-invalid',
      'consumer.id',
      'Consumer id must be a portable identifier of 1 to 64 characters.'
    );
  }
  if (!validId(config.consumer.workspace)) {
    issue(
      errors,
      'consumer',
      'workspace-id-invalid',
      'consumer.workspace',
      'Workspace must be a portable identifier of 1 to 64 characters.'
    );
  }
}

function checkContracts(config, errors) {
  if (!Array.isArray(config.contracts)) {
    issue(
      errors,
      'public-contracts',
      'contracts-missing',
      'contracts',
      'Public package contracts must be an array.'
    );
    return [];
  }

  const contracts = [];
  const identities = new Set();
  config.contracts.forEach((contract, index) => {
    const path = `contracts[${index}]`;
    if (!isRecord(contract)) {
      issue(errors, 'public-contracts', 'contract-invalid', path, 'Contract must be an object.');
      return;
    }
    checkKnownKeys(
      contract,
      new Set(['registry', 'name', 'version', 'role']),
      path,
      'public-contracts',
      errors
    );
    const registry = contract.registry;
    if (registry !== 'npm' && registry !== 'pypi') {
      issue(
        errors,
        'public-contracts',
        'registry-invalid',
        `${path}.registry`,
        'Registry must be npm or pypi.'
      );
    }
    if (!validPackageName(registry, contract.name)) {
      issue(
        errors,
        'public-contracts',
        'package-name-invalid',
        `${path}.name`,
        'Package name is invalid for its public registry.'
      );
    }
    if (!validPinnedVersion(contract.version)) {
      issue(
        errors,
        'public-contracts',
        'version-not-pinned',
        `${path}.version`,
        'Version must be an exact public release, not a local, remote, or floating spec.'
      );
    }
    if (!validId(contract.role)) {
      issue(
        errors,
        'public-contracts',
        'role-invalid',
        `${path}.role`,
        'Role must be a portable identifier.'
      );
    }
    const identity = `${registry}:${String(contract.name).toLowerCase()}`;
    if (identities.has(identity)) {
      issue(
        errors,
        'public-contracts',
        'contract-duplicate',
        path,
        `Duplicate public package contract ${identity}.`
      );
    }
    identities.add(identity);
    contracts.push({
      registry,
      name: typeof contract.name === 'string' ? contract.name : null,
      version: typeof contract.version === 'string' ? contract.version : null,
      role: typeof contract.role === 'string' ? contract.role : null,
    });
  });

  for (const required of REQUIRED_CONTRACTS) {
    if (
      !contracts.some(
        (contract) => contract.registry === required.registry && contract.role === required.role
      )
    ) {
      issue(
        errors,
        'public-contracts',
        'required-contract-missing',
        'contracts',
        `Missing ${required.registry} contract for role ${required.role}.`
      );
    }
  }
  return contracts;
}

function checkBindings(config, errors) {
  if (!isRecord(config.bindings)) {
    issue(
      errors,
      'caller-bindings',
      'bindings-missing',
      'bindings',
      'Caller-owned bindings are required.'
    );
    return [];
  }

  const bindings = [];
  for (const id of REQUIRED_BINDINGS) {
    if (!isRecord(config.bindings[id])) {
      issue(
        errors,
        'caller-bindings',
        'binding-missing',
        `bindings.${id}`,
        `Missing ${id} binding.`
      );
    }
  }

  for (const [id, binding] of Object.entries(config.bindings)) {
    const path = `bindings.${id}`;
    if (!validId(id)) {
      issue(
        errors,
        'caller-bindings',
        'binding-id-invalid',
        path,
        'Binding id must be a portable identifier.'
      );
    }
    if (!isRecord(binding)) {
      issue(errors, 'caller-bindings', 'binding-invalid', path, 'Binding must be an object.');
      continue;
    }
    checkKnownKeys(binding, new Set(['owner', 'env']), path, 'caller-bindings', errors);
    if (binding.owner !== 'caller') {
      issue(
        errors,
        'caller-bindings',
        'binding-owner-invalid',
        `${path}.owner`,
        'Binding ownership must remain with the caller.'
      );
    }
    if (!validEnvName(binding.env)) {
      issue(
        errors,
        'caller-bindings',
        'binding-env-invalid',
        `${path}.env`,
        'Binding must name an environment key without embedding its value.'
      );
    }
    bindings.push({ id, owner: binding.owner, env: binding.env });
  }
  return bindings;
}

function checkOperations(config, errors) {
  const operations = config.operations;
  if (!isRecord(operations)) {
    issue(
      errors,
      'bounded-operations',
      'operations-missing',
      'operations',
      'Bounded autonomy and receipt policy are required.'
    );
    return;
  }
  checkKnownKeys(
    operations,
    new Set(['autonomy', 'receipts']),
    'operations',
    'bounded-operations',
    errors
  );

  const autonomy = operations.autonomy;
  if (!isRecord(autonomy)) {
    issue(
      errors,
      'bounded-operations',
      'autonomy-missing',
      'operations.autonomy',
      'Autonomy policy is required.'
    );
  } else {
    checkKnownKeys(
      autonomy,
      new Set(['mode', 'maxAttempts', 'leaseSeconds', 'stopConditions']),
      'operations.autonomy',
      'bounded-operations',
      errors
    );
    if (autonomy.mode !== 'bounded') {
      issue(
        errors,
        'bounded-operations',
        'autonomy-unbounded',
        'operations.autonomy.mode',
        'Autonomy mode must be bounded.'
      );
    }
    if (!Number.isInteger(autonomy.maxAttempts) || autonomy.maxAttempts < 1) {
      issue(
        errors,
        'bounded-operations',
        'max-attempts-invalid',
        'operations.autonomy.maxAttempts',
        'maxAttempts must be a positive integer.'
      );
    }
    if (!Number.isInteger(autonomy.leaseSeconds) || autonomy.leaseSeconds < 1) {
      issue(
        errors,
        'bounded-operations',
        'lease-invalid',
        'operations.autonomy.leaseSeconds',
        'leaseSeconds must be a positive integer.'
      );
    }
    const stops = Array.isArray(autonomy.stopConditions) ? autonomy.stopConditions : [];
    for (const stop of REQUIRED_STOP_CONDITIONS) {
      if (!stops.includes(stop)) {
        issue(
          errors,
          'bounded-operations',
          'stop-condition-missing',
          'operations.autonomy.stopConditions',
          `Missing stop condition ${stop}.`
        );
      }
    }
  }

  const receipts = operations.receipts;
  if (!isRecord(receipts)) {
    issue(
      errors,
      'bounded-operations',
      'receipts-missing',
      'operations.receipts',
      'Receipt policy is required.'
    );
    return;
  }
  checkKnownKeys(
    receipts,
    new Set(['directory', 'format', 'maxAgeSeconds']),
    'operations.receipts',
    'bounded-operations',
    errors
  );
  if (!isPortablePath(receipts.directory)) {
    issue(
      errors,
      'portable-inputs',
      'receipt-path-not-portable',
      'operations.receipts.directory',
      'Receipt directory must be a relative path without parent traversal.'
    );
  }
  if (receipts.format !== 'json') {
    issue(
      errors,
      'bounded-operations',
      'receipt-format-invalid',
      'operations.receipts.format',
      'Receipt format must be json.'
    );
  }
  if (!Number.isInteger(receipts.maxAgeSeconds) || receipts.maxAgeSeconds < 1) {
    issue(
      errors,
      'bounded-operations',
      'receipt-freshness-invalid',
      'operations.receipts.maxAgeSeconds',
      'maxAgeSeconds must be a positive integer.'
    );
  }
}

export function inspectHoloSystemConfig(config) {
  const errors = [];
  const warnings = [];
  if (!isRecord(config)) {
    issue(errors, 'schema', 'config-invalid', '$', 'Configuration must be a JSON object.');
    return {
      schema: HOLOSYSTEM_INSPECTION_SCHEMA,
      ready: false,
      portable: false,
      checks: [{ id: 'schema', ok: false, errorCount: 1 }],
      errors,
      warnings,
      summary: { consumer: null, packages: [], bindings: [] },
    };
  }

  checkSchema(config, errors);
  checkConsumer(config, errors);
  const packages = checkContracts(config, errors);
  const bindings = checkBindings(config, errors);
  checkOperations(config, errors);
  inspectSensitiveValues(config, '', errors);
  checkKnownKeys(config, KNOWN_TOP_LEVEL_KEYS, '', 'schema', errors);

  const checkIds = [
    'schema',
    'consumer',
    'public-contracts',
    'caller-bindings',
    'portable-inputs',
    'bounded-operations',
  ];
  const checks = checkIds.map((id) => {
    const errorCount = errors.filter((error) => error.check === id).length;
    return { id, ok: errorCount === 0, errorCount };
  });

  return {
    schema: HOLOSYSTEM_INSPECTION_SCHEMA,
    ready: errors.length === 0,
    portable: errors.every(
      (error) =>
        !['schema', 'consumer', 'public-contracts', 'caller-bindings', 'portable-inputs'].includes(
          error.check
        )
    ),
    checks,
    errors,
    warnings,
    summary: {
      consumer: {
        id: typeof config.consumer?.id === 'string' ? config.consumer.id : null,
        workspace:
          typeof config.consumer?.workspace === 'string' ? config.consumer.workspace : null,
      },
      packages,
      bindings,
    },
  };
}

export function createHoloSystemConfig({
  consumerId = 'external-founder',
  workspace = 'default',
  contracts = DEFAULT_PUBLIC_PACKAGE_CONTRACTS,
  bindings = DEFAULT_CALLER_BINDINGS,
  receiptDirectory = DEFAULT_OPERATIONS.receipts.directory,
  maxAttempts = DEFAULT_OPERATIONS.autonomy.maxAttempts,
  leaseSeconds = DEFAULT_OPERATIONS.autonomy.leaseSeconds,
  receiptMaxAgeSeconds = DEFAULT_OPERATIONS.receipts.maxAgeSeconds,
} = {}) {
  const config = {
    schema: HOLOSYSTEM_CONFIG_SCHEMA,
    consumer: { id: consumerId, workspace },
    contracts: clone(contracts),
    bindings: clone(bindings),
    operations: {
      autonomy: {
        mode: 'bounded',
        maxAttempts,
        leaseSeconds,
        stopConditions: clone(REQUIRED_STOP_CONDITIONS),
      },
      receipts: {
        directory: receiptDirectory,
        format: 'json',
        maxAgeSeconds: receiptMaxAgeSeconds,
      },
    },
  };
  const report = inspectHoloSystemConfig(config);
  if (!report.ready) {
    const error = new TypeError(
      `Cannot create HoloSystem config: ${report.errors.map((item) => item.code).join(', ')}`
    );
    error.report = report;
    throw error;
  }
  return config;
}
