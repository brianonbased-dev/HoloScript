#!/usr/bin/env node
/**
 * Published-tree install audit.
 *
 * Crawls the PUBLISHED npm runtime dependency graph from one or more root
 * packages (default @holoscript/cli@latest) and fails if any reachable
 * published package.json:
 *   1. contains a `workspace:` spec in any dependency field (the
 *      EUNSUPPORTEDPROTOCOL leak — workspace protocol not resolved at publish),
 *   2. pins an @holoscript/* runtime dependency to a version that does not
 *      exist on the registry (the ETARGET / 404 phantom-pin failure mode),
 *   3. forces two or more MAJORS of the same @holoscript/* package into one
 *      tree (the silent-duplicate failure mode).
 *
 * Check 3 exists because checks 1 and 2 are both "does it resolve?" questions,
 * and the worst failure mode answers yes. A pin like runtime@6.1.1 ->
 * core@^6.1.2 is valid and resolves to a real published version. It just
 * resolves to a SECOND copy, because something else in the tree already
 * required core@^8. npm installs both, exits 0, and prints no warning. The
 * consumer gets two parsers and two trait registries; anything crossing between
 * them fails instanceof with nothing pointing at the cause. Measured 2026-08-11:
 * `npm i @holoscript/engine@6.1.6 @holoscript/runtime@6.1.1` in an empty
 * directory yielded five copies of @holoscript/core across three majors.
 *
 * A loud failure is kinder than that, which is what this turns it into.
 *
 * Note: peerDependencies are scanned for workspace leaks but are not crawled as
 * independent install branches. npm satisfies peers against already-installed
 * ancestors; resolving broad peer ranges independently can walk stale major
 * branches that public installs never reach.
 *
 * This is the guard that source-side checks (check-workspace-deps.js,
 * verify-internal-workspace-protocol.mjs) CANNOT provide: those validate the
 * monorepo source, but a manual/npm publish path or an internal dep that
 * bypassed `pnpm publish`'s workspace→semver rewrite still ships a broken
 * tree. This audits what the public actually downloads.
 *
 * Reproduces and would have caught the cli@7.0.0 incident (board task
 * task_1780122553060_ag5c): core@6.0.4 published with 39 raw workspace:*
 * specs, plus core@7.0.0 pinning ~23 unpublished plugin versions.
 *
 * No auth required for public packages; reads NPM_TOKEN from env if present
 * so private/pre-release dist-tags resolve identically to a real install.
 *
 * Usage:
 *   node scripts/audit-published-install-tree.mjs
 *   node scripts/audit-published-install-tree.mjs @holoscript/cli@7.0.0
 *   node scripts/audit-published-install-tree.mjs @holoscript/core@latest --json
 *
 * Exit codes: 0 clean, 1 leaks/phantoms found, 2 usage/network error.
 */

const REGISTRY = process.env.npm_config_registry || 'https://registry.npmjs.org';
const TOKEN = process.env.NPM_TOKEN || process.env.npm_token || '';
const JSON_OUT = process.argv.includes('--json');
const SELF_TEST = process.argv.includes('--self-test');

/**
 * Severity of the multi-major finding. Defaults to `fail`.
 *
 * `warn` exists for ONE position: the pre-publish audit inside `release:publish`.
 * That call inspects the ALREADY-PUBLISHED tree, so a multi-major finding there
 * is pre-existing — and the release being gated is frequently the thing that
 * fixes it. Blocking there deadlocks: you cannot publish the fix because the
 * unfixed state blocks the publish.
 *
 * The post-publish call keeps the default `fail`. That one inspects what was
 * just shipped, where a multi-major finding is a regression you caused and there
 * is no deadlock, because the fix is already on the registry.
 *
 * Leaks and phantom pins are unaffected and block in both positions.
 */
const MULTI_MAJOR_SEVERITY = (() => {
  const arg = process.argv.find((a) => a.startsWith('--multi-major='));
  const value = arg ? arg.slice('--multi-major='.length) : 'fail';
  if (value !== 'warn' && value !== 'fail') {
    console.error(`[audit-published-install-tree] --multi-major must be warn|fail, got "${value}"`);
    process.exit(2);
  }
  return value;
})();
// Every non-flag positional is a root. Multiple roots matter: a package can be
// unreachable from @holoscript/cli and still be a public entry point that
// carries the defect — @holoscript/runtime is exactly that case.
const ROOT_SPECS = (() => {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  return positional.length ? positional : ['@holoscript/cli@latest'];
})();

const DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const CRAWL_FIELDS = new Set(['dependencies']);

function headers() {
  const h = { Accept: 'application/json' };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

// How long to wait between retries for packages that returned 404 (npm CDN
// propagation lag — a package published seconds ago may not be visible yet).
const PROPAGATION_RETRY_DELAY_MS = parseInt(process.env.AUDIT_RETRY_DELAY_MS || '20000', 10);
const PROPAGATION_RETRY_COUNT = parseInt(process.env.AUDIT_RETRY_COUNT || '3', 10);

const packumentCache = new Map();
async function packument(name) {
  if (packumentCache.has(name)) return packumentCache.get(name);
  const url = `${REGISTRY.replace(/\/$/, '')}/${name.replace('/', '%2f')}`;
  let pk = null;
  for (let attempt = 0; attempt <= PROPAGATION_RETRY_COUNT; attempt++) {
    if (attempt > 0) {
      if (!JSON_OUT)
        process.stderr.write(
          `[audit-published-install-tree] ${name} not yet visible; retrying in ${PROPAGATION_RETRY_DELAY_MS / 1000}s (attempt ${attempt}/${PROPAGATION_RETRY_COUNT})...\n`
        );
      await new Promise((r) => setTimeout(r, PROPAGATION_RETRY_DELAY_MS));
    }
    try {
      const r = await fetch(url, { headers: headers() });
      if (r.ok) {
        pk = await r.json();
        break;
      }
      if (r.status !== 404) break; // non-404 error — don't retry
    } catch {
      break; // network error — treated as unresolvable below
    }
  }
  packumentCache.set(name, pk);
  return pk;
}

function parseSemver(value) {
  const match = String(value)
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] || '',
  };
}

function compareIdentifiers(a, b) {
  const aNum = /^\d+$/.test(a) ? Number(a) : null;
  const bNum = /^\d+$/.test(b) ? Number(b) : null;
  if (aNum !== null && bNum !== null) return aNum - bNum;
  if (aNum !== null) return -1;
  if (bNum !== null) return 1;
  return a.localeCompare(b);
}

function compareSemver(aValue, bValue) {
  const a = typeof aValue === 'string' ? parseSemver(aValue) : aValue;
  const b = typeof bValue === 'string' ? parseSemver(bValue) : bValue;
  if (!a || !b) return 0;
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && !b.prerelease) return 0;
  const aParts = a.prerelease.split('.');
  const bParts = b.prerelease.split('.');
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    if (aParts[i] === undefined) return -1;
    if (bParts[i] === undefined) return 1;
    const cmp = compareIdentifiers(aParts[i], bParts[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

function satisfiesComparator(version, operator, base) {
  const cmp = compareSemver(version, base);
  switch (operator || '=') {
    case '>':
      return cmp > 0;
    case '>=':
      return cmp >= 0;
    case '<':
      return cmp < 0;
    case '<=':
      return cmp <= 0;
    case '=':
      return cmp === 0;
    default:
      return false;
  }
}

function satisfiesCaret(version, base) {
  const lower = satisfiesComparator(version, '>=', base);
  if (!lower) return false;
  let upper;
  if (base.major > 0) {
    upper = { major: base.major + 1, minor: 0, patch: 0, prerelease: '' };
  } else if (base.minor > 0) {
    upper = { major: 0, minor: base.minor + 1, patch: 0, prerelease: '' };
  } else {
    upper = { major: 0, minor: 0, patch: base.patch + 1, prerelease: '' };
  }
  return satisfiesComparator(version, '<', upper);
}

function satisfiesTilde(version, base) {
  return (
    satisfiesComparator(version, '>=', base) &&
    satisfiesComparator(version, '<', {
      major: base.major,
      minor: base.minor + 1,
      patch: 0,
      prerelease: '',
    })
  );
}

function satisfiesRange(version, spec) {
  const specStr = String(spec).trim();
  if (!specStr || specStr === '*' || specStr.toLowerCase() === 'x') return true;
  if (specStr.includes('||')) {
    return specStr.split('||').some((part) => satisfiesRange(version, part.trim()));
  }
  const versionInfo = parseSemver(version);
  if (!versionInfo) return false;

  if (specStr.startsWith('^')) {
    const base = parseSemver(specStr.slice(1).trim());
    return base ? satisfiesCaret(versionInfo, base) : false;
  }
  if (specStr.startsWith('~')) {
    const base = parseSemver(specStr.slice(1).trim());
    return base ? satisfiesTilde(versionInfo, base) : false;
  }

  const parts = specStr.split(/\s+/).filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) => {
    const match = part.match(
      /^(>=|>|<=|<|=)?v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/
    );
    if (!match) return false;
    const base = parseSemver(match[2]);
    return base ? satisfiesComparator(versionInfo, match[1] || '=', base) : false;
  });
}

/** Resolve a semver-ish spec to the highest concrete published version npm can use. */
function resolveVersion(pk, spec) {
  if (!pk || !pk.versions) return null;
  const versions = Object.keys(pk.versions);
  const tags = pk['dist-tags'] || {};
  if (tags[spec]) return tags[spec]; // dist-tag (latest, alpha, ...)
  if (pk.versions[spec]) return spec; // exact
  // Bare exact version spec (no ^ / ~ / >= operator): npm resolves EXACT only.
  // If the exact version isn't published, treat as not-found (ETARGET).
  // Do NOT fall through to range resolution for bare exact specs — that would
  // silently pick 2.0.1 for a pin of 1.0.0, masking the phantom-pin failure.
  const specStr = String(spec).trim();
  if (/^\d+\.\d+\.\d+/.test(specStr) && !/^[\^~>=<]/.test(specStr)) {
    return null; // bare exact version not present → phantom
  }
  const candidates = versions
    .filter((v) => parseSemver(v) && satisfiesRange(v, specStr))
    .sort((a, b) => compareSemver(b, a));
  return candidates.length ? candidates[0] : null;
}

function isInternal(name) {
  return name.startsWith('@holoscript/') || name.startsWith('holoscript-');
}

function majorOf(version) {
  const parsed = parseSemver(version);
  return parsed ? String(parsed.major) : null;
}

/**
 * Group every internal package that resolved to two or more distinct majors.
 *
 * `resolved` is name -> Map(version -> via-path). Two majors in this map means
 * the tree cannot be satisfied by a single copy: npm must install both, and it
 * does so silently. Prerelease majors count as their own major, which is
 * intended — a 7.0.0-rc alongside 8.x is the same hazard.
 */
function findMultiMajor(resolved) {
  const out = [];
  for (const [name, versions] of resolved) {
    if (!isInternal(name)) continue;
    const byMajor = new Map();
    for (const [version, via] of versions) {
      const major = majorOf(version);
      if (major === null) continue;
      if (!byMajor.has(major)) byMajor.set(major, { major, versions: [], via });
      byMajor.get(major).versions.push(version);
    }
    if (byMajor.size > 1) {
      out.push({
        pkg: name,
        majors: [...byMajor.values()]
          .sort((a, b) => Number(a.major) - Number(b.major))
          .map((m) => ({ major: m.major, versions: m.versions.sort(), via: m.via })),
      });
    }
  }
  return out.sort((a, b) => a.pkg.localeCompare(b.pkg));
}

function assertSelf(condition, name) {
  if (!condition) throw new Error(`self-test failed: ${name}`);
}

function runSelfTest() {
  const pk = {
    'dist-tags': { latest: '7.0.0' },
    versions: {
      '6.1.2': {},
      '6.1.3': {},
      '7.0.0': {},
      '8.0.6': {},
    },
  };
  assertSelf(resolveVersion(pk, '6.1.9') === null, 'missing bare exact stays phantom');
  assertSelf(resolveVersion(pk, '^6.1.2') === '6.1.3', 'caret range stays in major');
  assertSelf(resolveVersion(pk, '~6.1.2') === '6.1.3', 'tilde range stays in minor');
  assertSelf(resolveVersion(pk, '>=6.1.0') === '8.0.6', 'gte range picks highest satisfier');
  assertSelf(CRAWL_FIELDS.has('dependencies'), 'dependencies are crawled');
  assertSelf(!CRAWL_FIELDS.has('peerDependencies'), 'peerDependencies are not crawled');
  assertSelf(!CRAWL_FIELDS.has('optionalDependencies'), 'optionalDependencies are not crawled');

  // ── multi-major detection ────────────────────────────────────────────────
  const oneMajor = new Map([
    ['@holoscript/core', new Map([['8.0.20', ['root']], ['8.0.6', ['root', 'a']]])],
  ]);
  assertSelf(findMultiMajor(oneMajor).length === 0, 'two minors of one major are not a finding');

  const twoMajors = new Map([
    [
      '@holoscript/core',
      new Map([
        ['8.0.20', ['@holoscript/cli@8.0.18']],
        ['6.1.4', ['@holoscript/cli@8.0.18', '@holoscript/sdk@6.1.1 dependencies.@holoscript/core=^6.1.2']],
      ]),
    ],
  ]);
  const found = findMultiMajor(twoMajors);
  assertSelf(found.length === 1, 'two majors of one package IS a finding');
  assertSelf(found[0].pkg === '@holoscript/core', 'finding names the duplicated package');
  assertSelf(found[0].majors.length === 2, 'finding lists both majors');
  assertSelf(found[0].majors[0].major === '6', 'majors are sorted ascending');
  // The v6 edge is the one reached through sdk, so it carries the longer path.
  // That path is the whole point of the report: it names who to republish.
  assertSelf(found[0].majors[0].via.length === 2, 'finding carries the path that required it');
  assertSelf(found[0].majors[1].major === '8', 'the newer major is reported too');

  const externalDupe = new Map([['three', new Map([['0.170.0', ['root']], ['0.150.0', ['root']]])]]);
  assertSelf(
    findMultiMajor(externalDupe).length === 0,
    'external packages are out of scope — we do not control their versioning'
  );

  assertSelf(majorOf('8.0.20') === '8', 'majorOf reads the major');
  assertSelf(majorOf('not-a-version') === null, 'majorOf rejects garbage rather than guessing');

  console.log('[audit-published-install-tree] self-test PASS');
}

function splitSpec(rootSpec) {
  const at = rootSpec.lastIndexOf('@');
  return at > 0
    ? { name: rootSpec.slice(0, at), spec: rootSpec.slice(at + 1) }
    : { name: rootSpec, spec: 'latest' };
}

async function main() {
  const roots = ROOT_SPECS.map(splitSpec);

  const seen = new Set();
  const queue = roots.map(({ name, spec }) => ({ name, spec, via: [`${name}@${spec}`] }));
  const leaks = [];
  const phantoms = [];
  // name -> Map(resolvedVersion -> the via-path that first required it)
  const resolved = new Map();
  let scanned = 0;

  while (queue.length) {
    const { name, spec, via } = queue.shift();
    const pk = await packument(name);
    if (!pk) {
      // Unresolvable package itself (404). Only flag internal ones — external
      // 404s would be a different (and louder) failure.
      if (isInternal(name)) phantoms.push({ pkg: `${name}@${spec}`, reason: 'package-404', via });
      continue;
    }
    const ver = resolveVersion(pk, spec);
    if (!ver || !pk.versions[ver]) {
      if (isInternal(name))
        phantoms.push({
          pkg: `${name}@${spec}`,
          reason: 'version-not-published',
          available: Object.keys(pk.versions || {}),
          via,
        });
      continue;
    }
    // Record before the seen-check: the same name@version is commonly reached
    // by several paths, but a DIFFERENT version reached later still needs to
    // land in this map or the multi-major check goes blind.
    if (isInternal(name)) {
      if (!resolved.has(name)) resolved.set(name, new Map());
      const versions = resolved.get(name);
      if (!versions.has(ver)) versions.set(ver, via);
    }

    const key = `${name}@${ver}`;
    if (seen.has(key)) continue;
    seen.add(key);
    scanned++;
    const manifest = pk.versions[ver];

    for (const field of DEP_FIELDS) {
      const block = manifest[field] || {};
      for (const [dep, depSpec] of Object.entries(block)) {
        const depVia = [...via, `${key} ${field}.${dep}=${depSpec}`];
        if (String(depSpec).includes('workspace:')) {
          leaks.push({ pkg: key, field, dep, spec: depSpec, via: depVia });
        }
        if (isInternal(dep) && !String(depSpec).includes('workspace:') && CRAWL_FIELDS.has(field)) {
          queue.push({ name: dep, spec: String(depSpec), via: depVia });
        }
      }
    }
  }

  // Dedupe phantoms (the same unpublished plugin is commonly reached via
  // multiple broken parents — report each missing package once).
  const seenPhantom = new Set();
  const uniquePhantoms = phantoms.filter((p) => {
    if (seenPhantom.has(p.pkg)) return false;
    seenPhantom.add(p.pkg);
    return true;
  });
  phantoms.length = 0;
  phantoms.push(...uniquePhantoms);

  const multiMajor = findMultiMajor(resolved);
  const multiMajorBlocks = multiMajor.length > 0 && MULTI_MAJOR_SEVERITY === 'fail';
  const ok = leaks.length === 0 && phantoms.length === 0 && !multiMajorBlocks;
  const rootLabel = roots.map((r) => `${r.name}@${r.spec}`).join(' ');

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          root: rootLabel,
          roots: roots.map((r) => `${r.name}@${r.spec}`),
          scanned,
          ok,
          leaks,
          phantoms,
          multiMajor,
        },
        null,
        2
      )
    );
  } else {
    console.log(
      `[audit-published-install-tree] roots=${rootLabel} scanned=${scanned} packages`
    );
    if (leaks.length) {
      console.error(
        `\n  WORKSPACE LEAKS (${leaks.length}) — these cause EUNSUPPORTEDPROTOCOL on public install:`
      );
      for (const l of leaks) {
        console.error(`    ${l.pkg}  ${l.field}.${l.dep} = ${l.spec}`);
        if (l.via?.length) console.error(`      via: ${l.via.join(' -> ')}`);
      }
    }
    if (phantoms.length) {
      console.error(
        `\n  PHANTOM PINS (${phantoms.length}) — these cause ETARGET/404 on public install:`
      );
      for (const p of phantoms) {
        console.error(
          `    ${p.pkg}  (${p.reason}${p.available ? `; published: ${p.available.join(', ')}` : ''})`
        );
        if (p.via?.length) console.error(`      via: ${p.via.join(' -> ')}`);
      }
    }
    if (multiMajor.length) {
      console.error(
        `\n  MULTI-MAJOR (${multiMajor.length})${
          multiMajorBlocks ? '' : ' [warn — pre-existing, not blocking this run]'
        } — these install SILENTLY as duplicate copies:`
      );
      for (const m of multiMajor) {
        console.error(
          `    ${m.pkg} resolves to ${m.majors.length} majors: ${m.majors
            .map((x) => `v${x.major} (${x.versions.join(', ')})`)
            .join('  +  ')}`
        );
        for (const x of m.majors) {
          console.error(`      v${x.major} required via: ${x.via.join(' -> ')}`);
        }
      }
      console.error(
        '\n    npm exits 0 for these. The consumer gets one copy per major — duplicate\n' +
          '    parsers, duplicate trait registries, and instanceof failures with no error\n' +
          '    naming the cause. Fix by republishing whichever dependant still pins the\n' +
          '    older major, so every path resolves to one line.'
      );
    }
    console.log(
      ok
        ? '\n[audit-published-install-tree] OK — published tree is installable.'
        : '\n[audit-published-install-tree] FAIL — published tree is broken for public users.'
    );
  }

  process.exitCode = ok ? 0 : 1;
}

if (SELF_TEST) {
  try {
    runSelfTest();
    process.exitCode = 0;
  } catch (e) {
    console.error('[audit-published-install-tree] error:', e.message);
    process.exitCode = 1;
  }
} else {
  main().catch((e) => {
    console.error('[audit-published-install-tree] error:', e.message);
    process.exitCode = 2;
  });
}
