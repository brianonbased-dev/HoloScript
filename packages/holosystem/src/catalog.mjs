import { createHash } from 'node:crypto';

export const HOLOSYSTEM_CATALOG_SCHEMA = 'holoscript.holosystem.consumption-catalog.v1';
export const HOLOSYSTEM_LINEAGE_SCHEMA = 'holoscript.holosystem.source-lineage.v1';
export const HOLOSYSTEM_NEXT_WORK_SCHEMA = 'holoscript.holosystem.next-consumption-work.v1';
export const HOLOSYSTEM_CONSUMER_INPUT_SCHEMA = 'holoscript.holosystem.consumer-input.v1';

const STOP_CONDITIONS = [
  'authority-required',
  'validation-failed',
  'lease-expired',
  'spend-limit-reached',
];

function list(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hashReceipt(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function exactPublicVersion(value) {
  return typeof value === 'string'
    && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)
    && !/^(?:file|workspace|link|portal|git|https?):/iu.test(value);
}

export function inspectPublicDependencySpecs(dependencies = {}) {
  const packages = Object.entries(dependencies)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => ({
      name,
      version,
      exactPublicVersion: exactPublicVersion(version),
    }));
  const issues = packages
    .filter((item) => !item.exactPublicVersion)
    .map((item) => ({
      code: 'dependency-not-exact-public-version',
      name: item.name,
      version: item.version,
    }));
  return {
    schema: HOLOSYSTEM_CONSUMER_INPUT_SCHEMA,
    ready: issues.length === 0,
    packages,
    issues,
  };
}

export function hashConsumerInput({ dependencies = {}, manifest = {}, requirements = [] }) {
  const dependencyInspection = inspectPublicDependencySpecs(dependencies);
  const normalized = {
    dependencies: dependencyInspection.packages.map(({ name, version }) => ({ name, version })),
    npm: list(manifest?.npm)
      .map((item) => ({
        name: item?.name || null,
        version: item?.version || null,
        integrity: item?.integrity || null,
        probeKind: item?.probe?.kind || 'import',
      }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name))),
    pypi: list(manifest?.pypi)
      .map((item) => ({
        name: item?.name || null,
        version: item?.version || null,
        hashes: list(item?.hashes).slice().sort(),
      }))
      .sort((left, right) => String(left.name).localeCompare(String(right.name))),
    requirements: list(requirements).map(String).sort(),
  };
  return {
    schema: HOLOSYSTEM_CONSUMER_INPUT_SCHEMA,
    ready: dependencyInspection.ready,
    hash: hashReceipt(normalized),
    normalized,
    issues: dependencyInspection.issues,
  };
}

function artifactKey(ecosystem, name) {
  return `${String(ecosystem || '').toLowerCase()}:${String(name || '').toLowerCase()}`;
}

function portableDirectory(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//u, '');
  if (/^(?:[A-Za-z]:|\/|~\/)/u.test(normalized) || /(?:^|\/)\.\.(?:\/|$)/u.test(normalized)) {
    return null;
  }
  return normalized.replace(/\/$/u, '') || null;
}

export function normalizeRepositoryUrl(value) {
  const raw = typeof value === 'string' ? value : value?.url;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let normalized = raw.trim();
  normalized = normalized.replace(/^git\+/u, '');
  normalized = normalized.replace(/^git:\/\/github\.com\//u, 'https://github.com/');
  normalized = normalized.replace(/^git@github\.com:/u, 'https://github.com/');
  normalized = normalized.replace(/\.git\/?$/u, '');
  normalized = normalized.replace(/\/$/u, '');
  return /^https?:\/\//u.test(normalized) ? normalized : null;
}

function packageRail(portfolio, manifest, ecosystem, evidence) {
  const records = list(portfolio?.packages).filter((row) => row.ecosystem === ecosystem);
  const dogfoodNames = new Set(list(manifest?.[ecosystem]).map((row) => row.name));
  return {
    published: records.length,
    consumerReady: records.filter((row) => row.classification === 'passing').length,
    dogfooded: records.filter((row) => dogfoodNames.has(row.name)).length,
    gaps: records.filter((row) => row.classification !== 'passing').length,
    evidence,
  };
}

function countRail(items) {
  return {
    published: items.filter((item) => item.published).length,
    consumerReady: items.filter((item) => item.contractReady).length,
    gaps: items.filter((item) => item.published && !item.contractReady).length,
  };
}

function packageFailureCategories(portfolio) {
  const gaps = list(portfolio?.packages).filter((row) => row.classification !== 'passing');
  const issueCount = (prefix) => gaps.filter((row) => list(row.issues).some((issue) => issue.startsWith(prefix))).length;
  return {
    total: gaps.length,
    missing: gaps.filter((row) => row.classification === 'missing').length,
    stale: gaps.filter((row) => row.classification === 'stale').length,
    failed: gaps.filter((row) => row.classification === 'failed').length,
    exactVersion: issueCount('exactVersion-'),
    integrity: issueCount('integrity-'),
    import: issueCount('import-'),
    readback: issueCount('readback-'),
  };
}

function projectProofBatches(value) {
  return list(value).slice(-25).map((batch) => ({
    id: typeof batch?.id === 'string' ? batch.id : null,
    status: typeof batch?.status === 'string' ? batch.status : 'unknown',
    generatedAt: typeof batch?.generatedAt === 'string' ? batch.generatedAt : null,
    packages: list(batch?.packages).slice(0, 100).map((item) => (
      typeof item === 'string'
        ? item
        : { ecosystem: item?.ecosystem || null, name: item?.name || null }
    )),
    summary: {
      total: Number(batch?.summary?.total ?? batch?.packageCount) || 0,
      passing: Number(batch?.summary?.passing ?? batch?.passing) || 0,
      failed: Number(batch?.summary?.failed ?? batch?.failed) || 0,
    },
    receiptHash: typeof batch?.receiptHash === 'string' ? batch.receiptHash : null,
  }));
}

function projectPromotionHistory(value) {
  return list(value).slice(-25).map((attempt) => ({
    id: typeof attempt?.id === 'string' ? attempt.id : null,
    status: typeof attempt?.status === 'string' ? attempt.status : 'unknown',
    eligible: attempt?.eligible === true,
    generatedAt: typeof attempt?.generatedAt === 'string' ? attempt.generatedAt : null,
    receiptHash: typeof attempt?.receiptHash === 'string' ? attempt.receiptHash : null,
  }));
}

export function buildSourceLineageReceipt({ portfolio, metadata = [], now = new Date() }) {
  const metadataByArtifact = new Map(
    list(metadata).map((item) => [artifactKey(item.ecosystem, item.name), item])
  );
  const artifacts = list(portfolio?.packages).map((row) => {
    const source = metadataByArtifact.get(artifactKey(row.ecosystem, row.name)) || {};
    const sourceRepository = normalizeRepositoryUrl(source.sourceRepository || source.repository);
    return {
      ecosystem: row.ecosystem,
      name: row.name,
      version: row.expectedVersion || row.observedVersion || source.version || null,
      sourceRepository,
      sourceDirectory: portableDirectory(source.sourceDirectory || source.directory),
      registryStatus: Number.isInteger(source.registryStatus) ? source.registryStatus : null,
      registryError: source.registryError ? String(source.registryError).slice(0, 240) : null,
      integrity: typeof source.integrity === 'string' ? source.integrity : null,
      sourceRevision: typeof source.sourceRevision === 'string' ? source.sourceRevision : null,
      mapped: Boolean(sourceRepository),
    };
  });
  const mapped = artifacts.filter((artifact) => artifact.mapped).length;
  const receipt = {
    schema: HOLOSYSTEM_LINEAGE_SCHEMA,
    generatedAt: now.toISOString(),
    status: mapped === artifacts.length ? 'complete' : 'partial',
    summary: {
      total: artifacts.length,
      mapped,
      gaps: artifacts.length - mapped,
    },
    artifacts,
    boundaries: {
      registryMetadataIsEvidence: true,
      localPathsForbidden: true,
      unknownLineageBlocksSourceClaims: true,
    },
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}

function activeArtifactKeys(activeProofBatches) {
  const keys = new Set();
  for (const batch of list(activeProofBatches)) {
    if (!['running', 'claimed', 'queued'].includes(batch?.status)) continue;
    for (const item of list(batch.packages)) {
      if (typeof item === 'string') keys.add(item.toLowerCase());
      else keys.add(artifactKey(item?.ecosystem, item?.name));
    }
  }
  return keys;
}

export function selectNextConsumptionWork({
  portfolio,
  lineage,
  activeProofBatches = [],
  maxCandidates = 20,
  now = new Date(),
}) {
  const active = activeArtifactKeys(activeProofBatches);
  const sourceByArtifact = new Map(
    list(lineage?.artifacts).map((item) => [artifactKey(item.ecosystem, item.name), item])
  );
  const candidates = list(portfolio?.packages)
    .filter((row) => row.classification !== 'passing')
    .filter((row) => !active.has(artifactKey(row.ecosystem, row.name)))
    .map((row) => {
      const source = sourceByArtifact.get(artifactKey(row.ecosystem, row.name));
      const basePriority = row.classification === 'failed' ? 400 : row.classification === 'stale' ? 300 : 200;
      const priority = basePriority + (source?.mapped ? 0 : 25);
      return {
        ecosystem: row.ecosystem,
        name: row.name,
        version: row.expectedVersion || row.observedVersion || null,
        classification: row.classification,
        action: row.classification === 'failed'
          ? 'repair-consumer-contract'
          : row.classification === 'stale'
            ? 'refresh-cold-consumption'
            : 'prove-cold-consumption',
        priority,
        sourceRepository: source?.sourceRepository || null,
        reasons: [
          `classification:${row.classification}`,
          ...(source?.mapped ? [] : ['source-lineage-missing']),
          ...list(row.issues),
        ],
      };
    })
    .sort((left, right) => right.priority - left.priority || artifactKey(left.ecosystem, left.name).localeCompare(artifactKey(right.ecosystem, right.name)))
    .slice(0, Math.max(1, Math.min(Number(maxCandidates) || 20, 100)));

  const receipt = {
    schema: HOLOSYSTEM_NEXT_WORK_SCHEMA,
    generatedAt: now.toISOString(),
    status: candidates.length > 0 ? 'action-ready' : 'idle',
    selected: candidates[0] || null,
    candidates,
    policy: {
      mode: 'bounded',
      maxCandidates: Math.max(1, Math.min(Number(maxCandidates) || 20, 100)),
      excludesActiveBatches: true,
      publishRequiresAuthority: true,
    },
    stopConditions: [...STOP_CONDITIONS],
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}

export function buildConsumptionSurfaceCatalog({
  seeds = {},
  manifest = {},
  portfolio = {},
  github = [],
  services = [],
  containers = [],
  mcpHealth = {},
  skills = { ok: false, count: 0 },
  lineage = null,
  activeProofBatches = [],
  promotionHistory = [],
  evidence = {},
  now = new Date(),
}) {
  const evidenceRefs = {
    operatingSet: evidence.operatingSet || 'package-manifest.json',
    packageAdmission: evidence.packageAdmission || 'portfolio-consumer.json',
    sourceLineage: evidence.sourceLineage || 'source-lineage.json',
  };
  const npm = packageRail(portfolio, manifest, 'npm', evidenceRefs.packageAdmission);
  const pypi = packageRail(portfolio, manifest, 'pypi', evidenceRefs.packageAdmission);
  const githubRail = countRail(github);
  const serviceRail = countRail(services);
  const containerRail = countRail(containers);
  const sourceAudit = seeds?.mcp?.sourceAudit || {};
  const deployedTools = Number(mcpHealth?.tools) || 0;
  const expectedProducts = list(seeds?.github?.products);
  const discoveryCurrent = portfolio?.scope?.registries?.npm?.declaredComplete === true
    && portfolio?.scope?.registries?.pypi?.declaredComplete === true
    && github.length === expectedProducts.length
    && github.every((item) => item.published)
    && skills.ok === true
    && deployedTools > 0;
  const lineageSummary = lineage?.summary || {
    total: list(portfolio?.packages).length,
    mapped: 0,
    gaps: list(portfolio?.packages).length,
  };
  const findings = [];
  if (npm.gaps || pypi.gaps) findings.push({
    id: 'package-cold-consumption-gaps',
    severity: 'blocking',
    count: npm.gaps + pypi.gaps,
    evidence: evidenceRefs.packageAdmission,
  });
  if (lineageSummary.gaps) findings.push({
    id: 'package-source-lineage-gaps',
    severity: 'attention',
    count: lineageSummary.gaps,
    evidence: evidenceRefs.sourceLineage,
  });
  if (deployedTools !== Number(sourceAudit.tools || 0)) findings.push({
    id: 'mcp-deploy-source-count-drift',
    severity: 'attention',
    deployedTools,
    sourceTools: Number(sourceAudit.tools || 0),
  });
  if (Number(sourceAudit.orphanTools || 0)) findings.push({
    id: 'agent-tool-surface-gaps',
    severity: 'attention',
    orphanTools: Number(sourceAudit.orphanTools || 0),
    unbackedCoveredTools: Number(sourceAudit.unbackedCoveredTools || 0),
  });
  const nextWork = selectNextConsumptionWork({ portfolio, lineage, activeProofBatches, now });
  const projectedProofBatches = projectProofBatches(activeProofBatches);
  const projectedPromotionHistory = projectPromotionHistory(promotionHistory);
  const receipt = {
    schema: HOLOSYSTEM_CATALOG_SCHEMA,
    generatedAt: now.toISOString(),
    status: discoveryCurrent ? 'current' : 'incomplete-discovery',
    rule: 'Never collapse unlike artifacts into one total. Published, consumer-ready, and dogfooded are separate states on every rail.',
    rails: {
      npm,
      pypi,
      github: { ...githubRail, dogfooded: 0, evidence: 'public GitHub repository metadata plus README' },
      services: { ...serviceRail, dogfooded: null, evidence: 'public health endpoints' },
      containers: { ...containerRail, dogfooded: null, evidence: 'public container package pages' },
    },
    packageFailures: packageFailureCategories(portfolio),
    lineage: {
      ...lineageSummary,
      status: lineage?.status || 'unproven',
      evidence: evidenceRefs.sourceLineage,
    },
    agentSurface: {
      deployedMcpTools: deployedTools,
      sourceMappedTools: Number(sourceAudit.tools || 0),
      sourceCoveredTools: Number(sourceAudit.coveredTools || 0),
      orphanTools: Number(sourceAudit.orphanTools || 0),
      unbackedCoveredTools: Number(sourceAudit.unbackedCoveredTools || 0),
      publicRoutes: Number(sourceAudit.routes || 0),
      publicSkills: Number(skills.count || 0),
      mcpVersion: mcpHealth?.version || null,
      evidence: 'public MCP health plus public repository tree and capability audit',
    },
    activity: {
      activeProofBatches: projectedProofBatches,
      promotionHistory: projectedPromotionHistory,
      nextWork,
    },
    items: { github: clone(github), services: clone(services), containers: clone(containers) },
    findings,
    boundaries: {
      ...evidenceRefs,
      noGrandTotal: true,
      privateSourceFoldersAreNotPublishedArtifacts: true,
      callerOwnsCredentialsAndPolicy: true,
    },
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}

async function request(fetchImpl, url, { json = true } = {}) {
  try {
    const response = await fetchImpl(url, {
      headers: {
        accept: json ? 'application/json' : 'text/html,application/xhtml+xml',
        'user-agent': 'holoscript-holosystem-consumer/1',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    let body = null;
    if (response.ok && json) {
      try {
        body = await response.json();
      } catch {
        body = null;
      }
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: null,
      error: String(error?.message || error).slice(0, 240),
    };
  }
}

async function mapConcurrent(items, concurrency, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function runWorker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  const count = Math.max(1, Math.min(Number(concurrency) || 6, 12, items.length || 1));
  await Promise.all(Array.from({ length: count }, () => runWorker()));
  return results;
}

function pypiRepository(info) {
  const urls = info?.project_urls || {};
  for (const key of ['Source', 'Source Code', 'Repository', 'Code', 'Homepage']) {
    const value = normalizeRepositoryUrl(urls[key]);
    if (value) return value;
  }
  return normalizeRepositoryUrl(info?.home_page);
}

export async function discoverSourceLineage({
  portfolio,
  fetchImpl = globalThis.fetch,
  concurrency = 6,
  now = new Date(),
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const metadata = await mapConcurrent(list(portfolio?.packages), concurrency, async (artifact) => {
    const version = artifact.expectedVersion || artifact.observedVersion;
    if (artifact.ecosystem === 'npm') {
      const target = version ? `${encodeURIComponent(artifact.name)}/${encodeURIComponent(version)}` : encodeURIComponent(artifact.name);
      const response = await request(fetchImpl, `https://registry.npmjs.org/${target}`);
      return {
        ecosystem: 'npm',
        name: artifact.name,
        version: response.body?.version || version || null,
        sourceRepository: normalizeRepositoryUrl(response.body?.repository),
        sourceDirectory: portableDirectory(response.body?.repository?.directory),
        registryStatus: response.status,
        registryError: response.error || null,
        integrity: response.body?.dist?.integrity || null,
        sourceRevision: response.body?.gitHead || null,
      };
    }
    const suffix = version ? `/${encodeURIComponent(version)}` : '';
    const response = await request(fetchImpl, `https://pypi.org/pypi/${encodeURIComponent(artifact.name)}${suffix}/json`);
    const files = list(response.body?.urls);
    const digest = files.map((file) => file?.digests?.sha256).find(Boolean);
    return {
      ecosystem: 'pypi',
      name: artifact.name,
      version: response.body?.info?.version || version || null,
      sourceRepository: pypiRepository(response.body?.info),
      sourceDirectory: null,
      registryStatus: response.status,
      registryError: response.error || null,
      integrity: digest ? `sha256:${digest}` : null,
      sourceRevision: null,
    };
  });
  return buildSourceLineageReceipt({ portfolio, metadata, now });
}

export async function discoverConsumptionSurfaceCatalog({
  seeds,
  manifest,
  portfolio,
  lineage = null,
  activeProofBatches = [],
  promotionHistory = [],
  evidence = {},
  fetchImpl = globalThis.fetch,
  now = new Date(),
}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  const github = await Promise.all(list(seeds?.github?.products).map(async (fullName) => {
    const [metadata, readme] = await Promise.all([
      request(fetchImpl, `https://api.github.com/repos/${fullName}`),
      request(fetchImpl, `https://api.github.com/repos/${fullName}/readme`),
    ]);
    const repository = metadata.body || {};
    const published = metadata.ok && repository.private === false;
    return {
      name: fullName,
      published,
      contractReady: published
        && repository.archived !== true
        && repository.fork !== true
        && Boolean(repository.description)
        && Boolean(repository.license?.spdx_id)
        && readme.ok,
      defaultBranch: repository.default_branch || null,
      license: repository.license?.spdx_id || null,
      readme: readme.ok,
      archived: repository.archived === true,
      fork: repository.fork === true,
      url: repository.html_url || `https://github.com/${fullName}`,
    };
  }));
  const services = await Promise.all(list(seeds?.services).map(async (service) => {
    const probe = await request(fetchImpl, `${service.url}${service.health}`);
    return {
      name: service.name,
      url: service.url,
      health: service.health,
      published: true,
      contractReady: probe.ok,
      status: probe.status,
    };
  }));
  const containers = await Promise.all(list(seeds?.containers).map(async (container) => {
    const page = await request(
      fetchImpl,
      `https://github.com/users/${container.owner}/packages/container/package/${container.name}`,
      { json: false }
    );
    return {
      name: container.name,
      image: container.image,
      published: page.ok,
      contractReady: page.ok,
      status: page.status,
    };
  }));
  const [mcp, repository] = await Promise.all([
    request(fetchImpl, seeds?.mcp?.healthUrl),
    request(fetchImpl, `https://api.github.com/repos/${seeds?.mcp?.publicRepository}`),
  ]);
  const branch = repository.body?.default_branch || 'main';
  const tree = await request(
    fetchImpl,
    `https://api.github.com/repos/${seeds?.mcp?.publicRepository}/git/trees/${branch}?recursive=1`
  );
  const paths = list(tree.body?.tree).map((item) => item.path);
  const skills = {
    ok: repository.ok && tree.ok && tree.body?.truncated !== true,
    count: paths.filter((path) => /(?:^|\/)SKILL\.md$/u.test(path)).length,
    treeTruncated: tree.body?.truncated === true,
  };
  return buildConsumptionSurfaceCatalog({
    seeds,
    manifest,
    portfolio,
    github,
    services,
    containers,
    mcpHealth: mcp.body,
    skills,
    lineage,
    activeProofBatches,
    promotionHistory,
    evidence,
    now,
  });
}
