#!/usr/bin/env node
/**
 * cd-railway.mjs — HoloCI/CD token-driven Railway deploys (GitHub-independent).
 *
 * WHY THIS EXISTS
 * ---------------
 * Railway services have auto-deployed via the Railway GitHub App watching
 * `brianonbased-dev/HoloScript`. That couples continuous-deploy to GitHub repo
 * OWNERSHIP: transferring the repo to the `holoscript-foundation` org breaks
 * Railway auto-deploy until the App is re-authorized (CRIT-2 in
 * research/2026-06-15_holoscript-org-migration-audit.md).
 *
 * This makes Railway CD token-driven instead. `railway up` uploads the local
 * checkout and Railway builds it with the service's existing Dockerfile +
 * railway.toml — no GitHub source required. That mirrors how the FLEET CD
 * already works (scripts/mesh-deploy clones + runs), so the founder directive
 * "HoloCI/CD should be both Railway and fleet" (2026-06-15) becomes literally
 * true: one token-driven pipeline, two targets, zero GitHub-App dependency.
 *
 * TOKEN: RAILWAY_TOKEN is a PROJECT token scoped to project HoloScript
 * (45da3535-...) + the production environment (9cccd9a6-...). The railway CLI
 * reads it from the env; no account token, no GitHub App. Verified 2026-06-15.
 *
 * SCOPE: the SERVICES map below holds ONLY the services currently GitHub-repo-
 * sourced (the only ones that break on transfer). The rest of the project is
 * already image-based (Postgres/marketplace-db) or source-upload (absorb-service,
 * registry, holoscript-store, visualizer-client — already token-driven) and
 * needs nothing here.
 *
 * USAGE
 *   node scripts/holo-ci/cd-railway.mjs --list             # live service sources (API, read-only)
 *   node scripts/holo-ci/cd-railway.mjs --dry-run          # validate token + IDs + CLI, print plan (DEFAULT)
 *   node scripts/holo-ci/cd-railway.mjs --service mcp-server  # railway up one service
 *   node scripts/holo-ci/cd-railway.mjs --all              # railway up every mapped service
 *   node scripts/holo-ci/cd-railway.mjs --changed-from HEAD~1  # only services whose watchPatterns matched the diff
 *
 * Live deploys require the railway CLI (`npm i -g @railway/cli`) and a valid
 * RAILWAY_TOKEN in the environment. --list / --dry-run only need the token.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  isRailwayReference,
  isRailwaySealedValue,
  redactSecret,
  registryCredentialPasswordFinding,
} from '../lib/holokey-railway-bridge.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';
const PROJECT_ID = '45da3535-e14d-4022-a57e-1e5a96ee48d0'; // HoloScript
const ENV_ID = '9cccd9a6-12e3-483f-b382-dba1efbb229d'; // production

const RAW_SECRET_PATTERNS = [
  ['GitHub PAT (fine)', /github_pat_[A-Za-z0-9_]{50,}/],
  ['GitHub PAT (classic)', /ghp_[A-Za-z0-9]{36}/],
  ['OpenAI/Anthropic key', /sk-(proj-|ant-api)?[A-Za-z0-9_-]{20,}/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  ['Private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['npm token', /npm_[A-Za-z0-9]{20,}/],
  ['Slack token', /xox[bpas]-[A-Za-z0-9-]{10,}/],
  ['HoloMesh/HoloScript key', /(holomesh_sk_|hs_sk_)[A-Za-z0-9_-]{16,}/],
];
const TOKEN_SHAPED = /^[A-Za-z0-9_\-./+=]{24,}$/;

function classifyPlaintextSecret(
  value,
  { includeTokenShape = false, includePlaintext = false } = {}
) {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (isRailwayReference(value) || isRailwaySealedValue(value)) return null;
  for (const [type, re] of RAW_SECRET_PATTERNS) {
    if (re.test(value)) return type;
  }
  if (includeTokenShape && TOKEN_SHAPED.test(value.trim())) return 'raw token-shaped';
  if (includePlaintext) return 'plaintext registry credential';
  return null;
}

function collectPlaintextRegistryCredentialFindings(
  projectName,
  serviceEdges,
  targetServiceIds = null
) {
  const findings = [];
  for (const edge of serviceEdges ?? []) {
    const svc = edge?.node;
    if (!svc || (targetServiceIds && !targetServiceIds.has(svc.id))) continue;
    const deploymentEdges = svc.deployments?.edges ?? [];
    const meta = deploymentEdges[0]?.node?.meta ?? {};
    const registryCredentials = meta?.serviceManifest?.deploy?.registryCredentials;
    if (!registryCredentials) continue;
    const password = registryCredentials.password;
    const referenceFinding = registryCredentialPasswordFinding(
      registryCredentials,
      `${projectName}/${svc.name}`
    );
    const type = classifyPlaintextSecret(password, {
      includeTokenShape: true,
      includePlaintext: true,
    });
    if (referenceFinding || type) {
      findings.push({
        scope: `${projectName}/${svc.name}`,
        type: type ?? referenceFinding.reason,
        user: redactSecret(registryCredentials.username ?? ''),
        pass: referenceFinding?.pass ?? redactSecret(password),
      });
    }
  }
  return findings;
}

/**
 * Services currently sourced from the GitHub repo (verified via Railway API
 * 2026-06-15). These are the cutover targets. `config` is the railway.toml/json
 * whose watchPatterns drive selective deploys; if a service has no watchPatterns
 * we fall back to its package/service directory.
 */
const SERVICES = [
  {
    name: 'mcp-server',
    id: '098119b1-7832-4788-9ab2-3ced6c1cd2ab',
    config: 'packages/mcp-server/railway.toml',
    fallbackGlob: 'packages/mcp-server/',
  },
  {
    name: 'studio',
    id: '55a18466-6702-4497-ad22-5856f4f196f3',
    config: 'packages/studio/railway.toml',
    fallbackGlob: 'packages/studio/',
  },
  {
    name: 'marketplace-api',
    id: '64a114f9-c992-425b-8934-f287a68afd8b',
    config: 'packages/marketplace-api/railway.toml',
    fallbackGlob: 'packages/marketplace-api/',
  },
  {
    name: 'holoscript-net-v2',
    id: '8f1cb924-5baa-4de6-914a-2e7d7360dc0f',
    config: 'services/holoscript-net-v2/railway.json',
    fallbackGlob: 'services/holoscript-net-v2/',
  },
  {
    name: 'llm-service',
    id: 'a4f847f4-2793-43f2-92d9-570a34f625cd',
    config: 'services/llm-service/railway.toml',
    fallbackGlob: 'services/llm-service/',
  },
];

function token() {
  const t = process.env.RAILWAY_TOKEN?.trim();
  if (!t) {
    throw new Error(
      'RAILWAY_TOKEN not set. It is a project-scoped Railway token (see HoloScript/.env or the repo secret).'
    );
  }
  return t;
}

async function gql(query, variables = {}) {
  const res = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Project-Access-Token': token() },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Railway API ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(`Railway API: ${JSON.stringify(json.errors)}`);
  return json.data;
}

/** Confirm the token is bound to the project + env we expect. */
async function validateToken() {
  const d = await gql('query { projectToken { projectId environmentId } }');
  const pt = d?.projectToken;
  if (!pt) throw new Error('RAILWAY_TOKEN is not a project token (no projectToken in response).');
  if (pt.projectId !== PROJECT_ID)
    throw new Error(`Token bound to project ${pt.projectId}, expected HoloScript ${PROJECT_ID}.`);
  if (pt.environmentId !== ENV_ID)
    console.warn(`WARN: token env ${pt.environmentId} != expected prod ${ENV_ID}.`);
  return pt;
}

/** Fetch live services + their source (repo/image) for the project. */
async function liveServices() {
  const d = await gql(
    `query($id:String!){ project(id:$id){ name services{ edges{ node{ id name serviceInstances{ edges{ node{ source{ repo image } } } } } } } } }`,
    { id: PROJECT_ID }
  );
  const edges = d?.project?.services?.edges ?? [];
  return edges.map((e) => {
    const src = e.node.serviceInstances?.edges?.[0]?.node?.source ?? {};
    return { id: e.node.id, name: e.node.name, repo: src.repo ?? null, image: src.image ?? null };
  });
}

async function assertNoPlaintextRegistryCredentials(targets) {
  const targetServiceIds = new Set(targets.map((svc) => svc.id));
  const data = await gql(
    `query RegistryCreds($id: String!) { project(id: $id) {
       name
       services { edges { node {
         id
         name
         deployments(first: 1) { edges { node { meta } } }
       } } }
     } }`,
    { id: PROJECT_ID }
  );
  const projectName = data?.project?.name ?? 'HoloScript';
  const serviceEdges = data?.project?.services?.edges ?? [];
  const findings = collectPlaintextRegistryCredentialFindings(
    projectName,
    serviceEdges,
    targetServiceIds
  );
  if (findings.length) {
    const lines = findings.map((f) => `  - ${f.scope} [${f.type}] user=${f.user} pass=${f.pass}`);
    throw new Error(
      `REFUSING DEPLOY: plaintext registryCredentials detected before railway up.\n` +
        lines.join('\n') +
        `\nMove registry auth to a Railway managed/sealed variable reference before deploying (F.106).`
    );
  }
  console.log(`OK registryCredentials preflight clean for ${targets.length} target service(s).`);
}

/** Run the railway CLI. No shell (keeps the holo-ci security gate green and avoids
 *  DEP0190). CD runs on Linux where `railway` is a normal binary; on Windows local
 *  dev, run this under git-bash/WSL or with the railway exe on PATH. --list/--dry-run
 *  don't need the CLI at all (Railway API only). */
function runRailway(args, opts = {}) {
  return spawnSync('railway', args, { ...opts, shell: false });
}

function railwayCliPresent() {
  const r = runRailway(['--version'], { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

/** Parse watchPatterns from a railway.toml/json; [] if none. */
function watchPatterns(svc) {
  const p = join(REPO_ROOT, svc.config);
  if (!existsSync(p)) return [];
  const raw = readFileSync(p, 'utf8');
  if (svc.config.endsWith('.json')) {
    try {
      const j = JSON.parse(raw);
      return j.build?.watchPatterns ?? j.watchPatterns ?? [];
    } catch {
      return [];
    }
  }
  // .toml: grab the watchPatterns = [ ... ] array (single or multi-line)
  const m = raw.match(/watchPatterns\s*=\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

function changedFiles(ref) {
  const r = spawnSync('git', ['diff', '--name-only', `${ref}...HEAD`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    // fall back to working-tree changes
    const r2 = spawnSync('git', ['diff', '--name-only', ref], { cwd: REPO_ROOT, encoding: 'utf8' });
    return (r2.stdout || '').split('\n').filter(Boolean);
  }
  return (r.stdout || '').split('\n').filter(Boolean);
}

function globMatch(pattern, file) {
  // minimal glob: ** -> any, * -> any-but-slash, trailing '/' -> prefix dir
  if (pattern.endsWith('/')) return file.startsWith(pattern);
  const rx = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, ' ')
        .replace(/\*/g, '[^/]*')
        .replace(/ /g, '.*') +
      '$'
  );
  return rx.test(file);
}

function servicesForChange(ref) {
  const files = changedFiles(ref);
  if (!files.length) return [];
  return SERVICES.filter((svc) => {
    const pats = watchPatterns(svc);
    const globs = pats.length ? pats : [svc.fallbackGlob];
    return files.some((f) => globs.some((g) => globMatch(g, f)));
  });
}

/** Step-0 gate (premortem 2026-06-15): `railway up` uploads the .railwayignore-filtered
 *  tree. If the multi-GB agent/bench dirs aren't excluded, buildkit OOM-crashes
 *  (.dockerignore:11-15 / P.002). Refuse any live deploy until .railwayignore excludes them. */
const REQUIRED_IGNORES = ['.scratch', '.bench-logs', 'quantum_receipts', 'target', 'datasets'];
function assertRailwayignoreSane() {
  const p = join(REPO_ROOT, '.railwayignore');
  if (!existsSync(p)) {
    throw new Error(
      'REFUSING DEPLOY: no .railwayignore — `railway up` would upload the entire tree (incl. multi-GB .scratch/.bench-logs) and OOM buildkit. Add one first.'
    );
  }
  const body = readFileSync(p, 'utf8');
  const missing = REQUIRED_IGNORES.filter(
    (d) => !new RegExp(`^${d.replace(/\./g, '\\.')}/?\\s*$`, 'm').test(body)
  );
  if (missing.length) {
    throw new Error(
      `REFUSING DEPLOY: .railwayignore does not exclude [${missing.join(', ')}] — ` +
        `railway up would upload multi-GB dirs and OOM buildkit (.dockerignore:11-15 / P.002). Fix .railwayignore first.`
    );
  }
}

function deploy(svc) {
  console.log(`\n→ railway up: ${svc.name} (${svc.id})`);
  const r = runRailway(['up', '--ci', '--service', svc.id, '--environment', ENV_ID], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`✗ ${svc.name} deploy failed (exit ${r.status})`);
    return false;
  }
  console.log(`✓ ${svc.name} upload submitted`);
  return true;
}

function selfTest() {
  const target = SERVICES[0];
  const fakePlaintextPat = `github_pat_${'A'.repeat(52)}`;
  const fixture = [
    {
      node: {
        id: target.id,
        name: target.name,
        deployments: {
          edges: [
            {
              node: {
                meta: {
                  serviceManifest: {
                    deploy: {
                      registryCredentials: {
                        username: 'x-access-token',
                        password: fakePlaintextPat,
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
    {
      node: {
        id: SERVICES[1].id,
        name: SERVICES[1].name,
        deployments: {
          edges: [
            {
              node: {
                meta: {
                  serviceManifest: {
                    deploy: {
                      registryCredentials: {
                        username: '${{shared.REGISTRY_USER}}',
                        password: '${{shared.REGISTRY_TOKEN}}',
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
    {
      node: {
        id: SERVICES[2].id,
        name: SERVICES[2].name,
        deployments: {
          edges: [
            {
              node: {
                meta: {
                  serviceManifest: {
                    deploy: {
                      registryCredentials: {
                        username: 'sealed-user',
                        password: '{"sealed":"railway-managed"}',
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
    {
      node: {
        id: SERVICES[3].id,
        name: SERVICES[3].name,
        deployments: {
          edges: [
            {
              node: {
                meta: {
                  serviceManifest: {
                    deploy: {
                      registryCredentials: {
                        username: 'registry-user',
                        password: 'plain-password',
                      },
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  ];

  const findings = collectPlaintextRegistryCredentialFindings(
    'HoloScript',
    fixture,
    new Set(SERVICES.slice(0, 4).map((svc) => svc.id))
  );
  if (
    findings.length !== 2 ||
    findings[0].scope !== `HoloScript/${target.name}` ||
    findings[1].type !== 'plaintext registry credential'
  ) {
    throw new Error(`registryCredentials self-test failed: ${JSON.stringify(findings)}`);
  }
  const scopedOut = collectPlaintextRegistryCredentialFindings(
    'HoloScript',
    fixture,
    new Set([SERVICES[4].id])
  );
  if (scopedOut.length !== 0) {
    throw new Error(`registryCredentials target scoping failed: ${JSON.stringify(scopedOut)}`);
  }
  console.log('OK cd-railway registryCredentials gate self-test passed.');
}

async function main() {
  const argv = process.argv.slice(2);
  const has = (f) => argv.includes(f);
  const valOf = (f) => {
    const i = argv.indexOf(f);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  if (has('--self-test')) {
    selfTest();
    return;
  }

  if (has('--list')) {
    await validateToken();
    const live = await liveServices();
    console.log(`Project HoloScript — ${live.length} services:`);
    for (const s of live.sort((a, b) => a.name.localeCompare(b.name))) {
      const src = s.repo
        ? `repo:${s.repo}`
        : s.image
          ? `image:${s.image}`
          : 'upload/none (token-driven or empty)';
      const flag = s.repo ? '  ⚠ GitHub-coupled' : '';
      console.log(`  ${s.name.padEnd(22)} ${src}${flag}`);
    }
    return;
  }

  const serviceName = valOf('--service');
  const changedFrom = valOf('--changed-from');
  const all = has('--all');
  const live = !has('--dry-run') && (serviceName || changedFrom || all);

  // Always validate token first.
  const pt = await validateToken();
  console.log(`✓ RAILWAY_TOKEN valid — project ${pt.projectId} env ${pt.environmentId}`);

  // Resolve target services.
  let targets;
  if (serviceName) {
    targets = SERVICES.filter((s) => s.name === serviceName);
    if (!targets.length) {
      throw new Error(
        `Unknown service "${serviceName}". Known: ${SERVICES.map((s) => s.name).join(', ')}`
      );
    }
  } else if (changedFrom) {
    targets = servicesForChange(changedFrom);
    console.log(
      `Changed-from ${changedFrom}: ${targets.length ? targets.map((s) => s.name).join(', ') : '(no mapped service touched)'}`
    );
  } else {
    targets = SERVICES;
  }

  const cli = railwayCliPresent();
  console.log(
    cli
      ? `✓ railway CLI ${cli}`
      : '⚠ railway CLI NOT installed (needed for live deploy: npm i -g @railway/cli)'
  );

  if (!live) {
    console.log('\n[dry-run] would deploy via `railway up`:');
    for (const s of targets)
      console.log(
        `  - ${s.name} (${s.id})  watch=${(watchPatterns(s).length ? watchPatterns(s) : [s.fallbackGlob]).join(', ')}`
      );
    console.log('\nRe-run with --service <name> / --all (and no --dry-run) to deploy.');
    return;
  }

  await assertNoPlaintextRegistryCredentials(targets);

  // Step-0 gate: never upload the multi-GB tree.
  assertRailwayignoreSane();

  if (!cli) {
    throw new Error('Cannot deploy: railway CLI missing. Install with `npm i -g @railway/cli`.');
  }

  let ok = true;
  for (const s of targets) ok = deploy(s) && ok;
  process.exitCode = ok ? 0 : 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exitCode = 1;
});
