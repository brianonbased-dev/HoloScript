#!/usr/bin/env node
/**
 * Sync the one HoloKey bootstrap credential each Railway service needs.
 *
 * Default mode is a value-free plan. Live sync is opt-in with --execute and
 * requires a configured HoloKey vault plus RAILWAY_TOKEN. The script never
 * prints the token value; receipts redact it.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HOLOKEY_RAILWAY_BOOTSTRAP_VAR,
  buildRailwayBootstrapSyncPlan,
  buildVariableUpsertVariables,
  redactSecret,
  syncReceipt,
  variableUpsertMutation,
} from './lib/holokey-railway-bridge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const TARGETS_FILE = resolve(REPO_ROOT, 'scripts', 'data', 'railway-ecosystem.targets.json');
const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    execute: false,
    selfTest: false,
    json: false,
    service: '',
    targetsFile: TARGETS_FILE,
    variableName: HOLOKEY_RAILWAY_BOOTSTRAP_VAR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--execute') args.execute = true;
    else if (arg === '--self-test') args.selfTest = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--service') {
      args.service = next || '';
      i += 1;
    } else if (arg.startsWith('--service=')) args.service = arg.slice('--service='.length);
    else if (arg === '--targets') {
      args.targetsFile = resolve(next || '');
      i += 1;
    } else if (arg.startsWith('--targets='))
      args.targetsFile = resolve(arg.slice('--targets='.length));
    else if (arg === '--variable-name') {
      args.variableName = next || '';
      i += 1;
    } else if (arg.startsWith('--variable-name=')) {
      args.variableName = arg.slice('--variable-name='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/holokey-railway-sync.mjs [--json] [--service NAME]
  node scripts/holokey-railway-sync.mjs --execute [--service NAME]
  node scripts/holokey-railway-sync.mjs --self-test

Plan mode prints the one-bootstrap-var plan with no secret values.
Execute mode resolves vault:<VAR> for owner infra://service/<RAILWAY_SERVICE_ID>
and upserts exactly that Railway variable for each selected service.`);
}

function loadTargets(file) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(json.targets)) throw new Error(`targets file missing targets[]: ${file}`);
  return json.targets.map((t) => ({
    name: t.name || t.service,
    serviceId: t.serviceId,
    projectId: t.projectId,
    environmentId: t.environmentId,
  }));
}

async function loadVaultPackage() {
  const pkg = await import('@holoscript/secrets-broker').catch(() => null);
  if (!pkg?.createHoloKeyVault) {
    throw new Error(
      'HoloKey package is not built. Run: pnpm --filter @holoscript/secrets-broker build'
    );
  }
  return pkg;
}

async function buildVault() {
  const pkg = await loadVaultPackage();
  const dbUrl = process.env.HOLOKEY_DATABASE_URL || process.env.DATABASE_URL;
  let pool = null;
  let query;
  if (dbUrl) {
    const pg = (await import('pg')).default;
    pool = new pg.Pool({ connectionString: dbUrl, max: 2 });
    await pool.query(pkg.SECRET_STORE_DDL);
    query = (sql, params) => pool.query(sql, params);
  }
  const vault = pkg.createHoloKeyVault({ env: process.env, query });
  if (!vault) {
    if (pool) await pool.end().catch(() => {});
    throw new Error('HoloKey vault is OFF. Set HOLOKEY_PROD_KEK_* or SECRETS_VAULT_KEK_* first.');
  }
  return { vault, close: () => (pool ? pool.end() : Promise.resolve()) };
}

async function railwayGql(query, variables, fetchImpl = fetch) {
  const token = process.env.RAILWAY_TOKEN?.trim();
  if (!token) throw new Error('RAILWAY_TOKEN not set.');
  const res = await fetchImpl(RAILWAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Project-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Railway API ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Railway API: ${JSON.stringify(json.errors)}`);
  return json.data;
}

async function executeSync(plan, deps = {}) {
  const build = deps.buildVault || buildVault;
  const gql = deps.railwayGql || railwayGql;
  const receipts = [];
  const { vault, close } = await build();
  try {
    for (const row of plan) {
      const resolved = await vault.resolver.resolve({
        authenticatedOwnerId: row.ownerId,
        ref: row.holokeyRef,
        purpose: 'railway-bootstrap-sync',
      });
      const variables = buildVariableUpsertVariables(row, resolved.value);
      await gql(variableUpsertMutation(), variables);
      receipts.push(syncReceipt(row, resolved.value));
    }
  } finally {
    await close();
  }
  return receipts;
}

async function selfTest() {
  const target = {
    name: 'mcp-server',
    serviceId: '098119b1-7832-4788-9ab2-3ced6c1cd2ab',
    projectId: '45da3535-e14d-4022-a57e-1e5a96ee48d0',
    environmentId: '9cccd9a6-12e3-483f-b382-dba1efbb229d',
  };
  const plan = buildRailwayBootstrapSyncPlan([target]);
  if (plan[0].ownerId !== 'infra://service/098119b1-7832-4788-9ab2-3ced6c1cd2ab') {
    throw new Error(`owner mismatch: ${plan[0].ownerId}`);
  }
  if (plan[0].railwayVariableName !== HOLOKEY_RAILWAY_BOOTSTRAP_VAR) {
    throw new Error(`variable mismatch: ${plan[0].railwayVariableName}`);
  }

  const calls = [];
  const receipts = await executeSync(plan, {
    buildVault: async () => ({
      vault: {
        resolver: {
          resolve: async ({ authenticatedOwnerId, ref, purpose }) => {
            if (authenticatedOwnerId !== plan[0].ownerId) throw new Error('bad owner');
            if (ref !== `vault:${HOLOKEY_RAILWAY_BOOTSTRAP_VAR}`) throw new Error('bad ref');
            if (purpose !== 'railway-bootstrap-sync') throw new Error('bad purpose');
            return { value: 'boot-token-super-secret' };
          },
        },
      },
      close: async () => {},
    }),
    railwayGql: async (query, variables) => {
      calls.push({ query, variables });
      return { variableUpsert: true };
    },
  });

  if (calls.length !== 1) throw new Error(`expected one Railway call, got ${calls.length}`);
  if (calls[0].variables.name !== HOLOKEY_RAILWAY_BOOTSTRAP_VAR) {
    throw new Error(`wrong variable name: ${calls[0].variables.name}`);
  }
  if (calls[0].variables.value !== 'boot-token-super-secret') {
    throw new Error('Railway call did not carry the bootstrap token value');
  }
  if (JSON.stringify(receipts).includes('boot-token-super-secret')) {
    throw new Error('receipt leaked the bootstrap token');
  }
  if (!JSON.stringify(receipts).includes(redactSecret('boot-token-super-secret'))) {
    throw new Error('receipt did not include redacted token evidence');
  }
  console.log('OK holokey railway sync self-test passed.');
}

async function main() {
  const args = parseArgs();
  if (args.selfTest) {
    await selfTest();
    return;
  }
  let targets = loadTargets(args.targetsFile);
  if (args.service) targets = targets.filter((t) => t.name === args.service);
  if (!targets.length)
    throw new Error(args.service ? `no target named ${args.service}` : 'no targets');
  const plan = buildRailwayBootstrapSyncPlan(targets, { variableName: args.variableName });

  if (!args.execute) {
    const out = {
      mode: 'plan',
      execute: false,
      secretValuesIncluded: false,
      count: plan.length,
      plan,
    };
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(
        `HoloKey -> Railway bootstrap sync plan (${plan.length} service(s)); no values printed.`
      );
      for (const row of plan) {
        console.log(
          `  - ${row.serviceName}: ${row.railwayVariableName} <= ${row.holokeyRef} owner=${row.ownerId}`
        );
      }
      console.log('Re-run with --execute to apply.');
    }
    return;
  }

  const receipts = await executeSync(plan);
  console.log(JSON.stringify({ mode: 'execute', synced: receipts.length, receipts }, null, 2));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exitCode = 1;
});
