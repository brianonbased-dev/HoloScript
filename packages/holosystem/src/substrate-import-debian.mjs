import { createHash } from 'node:crypto';

import {
  HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA,
  _substrateImportInternals,
} from './substrate-import.mjs';
import { verifyDebianRepositoryRelease } from './substrate-debian-release.mjs';

const {
  compareText,
  hashJson,
  hashReceipt,
  isRecord,
  issue,
  pinnedRevision,
  portableSource,
  sanitizeVerificationPolicy,
  validId,
} = _substrateImportInternals;

const MAX_CONTROL_BYTES = 128 * 1024 * 1024;
const PACKAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9+.-]{1,127}$/u;
const ARCHITECTURE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u;
const FIELD_NAME_PATTERN = /^[!"$-),-9;-~]+$/u;
const DIGEST_PATTERN = /^(?:sha256:[a-f0-9]{64}|sha512:[a-f0-9]{128})$/u;
const MAINTAINER_SCRIPT_NAMES = new Set(['config', 'postinst', 'postrm', 'preinst', 'prerm']);

function validPackageName(value) {
  return typeof value === 'string' && PACKAGE_NAME_PATTERN.test(value);
}

function validArchitecture(value) {
  return typeof value === 'string' && ARCHITECTURE_PATTERN.test(value);
}

function validDebianVersion(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 160) return false;
  const colon = value.indexOf(':');
  const hasEpoch = colon !== -1;
  if (hasEpoch && (!/^\d+$/u.test(value.slice(0, colon)) || value.indexOf(':', colon + 1) !== -1)) {
    return false;
  }
  const remainder = hasEpoch ? value.slice(colon + 1) : value;
  const hyphen = remainder.lastIndexOf('-');
  const upstream = hyphen === -1 ? remainder : remainder.slice(0, hyphen);
  const revision = hyphen === -1 ? null : remainder.slice(hyphen + 1);
  return (
    /^[0-9][A-Za-z0-9.+~:-]*$/u.test(upstream) &&
    (hasEpoch || !upstream.includes(':')) &&
    (revision == null || /^[A-Za-z0-9+.~]+$/u.test(revision))
  );
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function digestText(value, algorithm) {
  return `${algorithm}:${createHash(algorithm).update(value, 'utf8').digest('hex')}`;
}

function verifyTextDigest(value, expected) {
  if (!validDigest(expected)) return false;
  const separator = expected.indexOf(':');
  return digestText(value, expected.slice(0, separator)) === expected;
}

function parseControl(text, label, issues) {
  if (typeof text !== 'string') {
    issue(issues, 'control-input-invalid', label, 'Debian control input must be UTF-8 text.');
    return [];
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_CONTROL_BYTES) {
    issue(issues, 'control-input-too-large', label, 'Debian control input exceeds 128 MiB.');
    return [];
  }
  if (text.includes('\0')) {
    issue(issues, 'control-input-nul', label, 'Debian control input must not contain NUL bytes.');
    return [];
  }

  const paragraphs = [];
  let paragraph = {};
  let currentField = null;
  const flush = () => {
    if (Object.keys(paragraph).length > 0) paragraphs.push(paragraph);
    paragraph = {};
    currentField = null;
  };

  for (const [lineIndex, rawLine] of text.replaceAll('\r\n', '\n').split('\n').entries()) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (/^[\t ]*$/u.test(line)) {
      flush();
      continue;
    }
    if (/^[\t ]/u.test(line)) {
      if (!currentField) {
        issue(
          issues,
          'control-continuation-orphan',
          `${label}.line-${lineIndex + 1}`,
          'Continuation line has no preceding field.'
        );
      } else {
        paragraph[currentField] += `\n${line.slice(1)}`;
      }
      continue;
    }

    const separator = line.indexOf(':');
    const fieldName = separator === -1 ? '' : line.slice(0, separator);
    if (
      separator <= 0 ||
      fieldName.startsWith('#') ||
      fieldName.startsWith('-') ||
      !FIELD_NAME_PATTERN.test(fieldName)
    ) {
      issue(
        issues,
        'control-field-malformed',
        `${label}.line-${lineIndex + 1}`,
        'Control line must contain a valid field name followed by a colon.'
      );
      currentField = null;
      continue;
    }
    currentField = fieldName.toLowerCase();
    if (Object.hasOwn(paragraph, currentField)) {
      issue(
        issues,
        'control-field-duplicate',
        `${label}.line-${lineIndex + 1}`,
        'Control stanza contains a duplicate field.'
      );
      currentField = null;
      continue;
    }
    paragraph[currentField] = line.slice(separator + 1).trim();
  }
  flush();
  return paragraphs;
}

function packageIdentity(name, architecture) {
  return `${name}:${architecture}`;
}

function componentId(identity) {
  const readable = identity
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
  const suffix = createHash('sha256').update(identity).digest('hex').slice(0, 12);
  return `deb-${readable || 'package'}-${suffix}`;
}

function missingComponentId(fromIdentity, relation) {
  const suffix = createHash('sha256')
    .update(`${fromIdentity}\0${relation}`)
    .digest('hex')
    .slice(0, 12);
  return `deb-missing-${suffix}`;
}

function normalizeInstalledPackages(paragraphs, issues) {
  const installed = [];
  const identities = new Set();
  for (const [index, fields] of paragraphs.entries()) {
    const status = String(fields.status || '')
      .trim()
      .split(/\s+/u);
    if (status.length !== 3 || status[1] !== 'ok' || status[2] !== 'installed') continue;
    const path = `status.stanzas[${index}]`;
    const name = validPackageName(fields.package) ? fields.package : null;
    const architecture = validArchitecture(fields.architecture) ? fields.architecture : null;
    const version = validDebianVersion(fields.version) ? fields.version : null;
    if (!name) {
      issue(
        issues,
        'installed-package-name-invalid',
        `${path}.Package`,
        'Installed package name is invalid.'
      );
    }
    if (!architecture) {
      issue(
        issues,
        'installed-package-architecture-invalid',
        `${path}.Architecture`,
        'Installed package architecture is invalid.'
      );
    }
    if (!version) {
      issue(
        issues,
        'installed-package-version-invalid',
        `${path}.Version`,
        'Installed package version is not an exact Debian version.'
      );
    }
    const identity = name && architecture ? packageIdentity(name, architecture) : null;
    if (identity && identities.has(identity)) {
      issue(
        issues,
        'installed-package-duplicate',
        path,
        'Installed package identity occurs more than once.'
      );
    }
    if (identity) identities.add(identity);
    installed.push({
      architecture,
      depends: fields.depends || '',
      fields,
      id: identity ? componentId(identity) : null,
      identity,
      multiArch: fields['multi-arch'] || null,
      name,
      preDepends: fields['pre-depends'] || '',
      provides: fields.provides || '',
      version,
    });
  }
  installed.sort((left, right) => compareText(left.identity, right.identity));
  if (installed.length === 0) {
    issue(
      issues,
      'installed-packages-missing',
      'status',
      'Status input contains no fully installed packages.'
    );
  }
  return installed;
}

function normalizeCustody(value, path, issues) {
  const owner = validId(value?.owner) ? value.owner : null;
  const trustDomain = validId(value?.trustDomain) ? value.trustDomain : null;
  if (!owner || !trustDomain) {
    issue(
      issues,
      'external-custody-invalid',
      path,
      'External Debian archive custody owner and trust domain must be portable identifiers.'
    );
  }
  return { mode: 'external', owner, trustDomain };
}

function normalizeRepository(repository, packagesIndex, path, issues, now) {
  let uri = null;
  if (portableSource(repository?.uri) && String(repository.uri).startsWith('https://')) {
    const parsed = new URL(repository.uri);
    parsed.pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`;
    uri = parsed.toString();
  } else {
    issue(
      issues,
      'repository-uri-invalid',
      `${path}.uri`,
      'Repository must be a credential-free HTTPS base URI.'
    );
  }
  const packagesIndexDigest = validDigest(repository?.packagesIndexDigest)
    ? repository.packagesIndexDigest
    : null;
  if (!packagesIndexDigest) {
    issue(
      issues,
      'packages-index-digest-invalid',
      `${path}.packagesIndexDigest`,
      'Packages index requires a sha256 or sha512 caller anchor.'
    );
  } else if (
    typeof packagesIndex === 'string' &&
    !verifyTextDigest(packagesIndex, packagesIndexDigest)
  ) {
    issue(
      issues,
      'packages-index-digest-mismatch',
      `${path}.packagesIndex`,
      'Packages index does not match its caller-provided digest.'
    );
  }
  const authentication = repository?.authentication
    ? verifyDebianRepositoryRelease({
        ...repository.authentication,
        packagesIndex,
        packagesIndexDigest,
        now,
      })
    : null;
  for (const finding of authentication?.issues || []) {
    issue(issues, finding.code, `${path}.authentication.${finding.path}`, finding.message);
  }
  return { authentication, packagesIndexDigest, uri };
}

function portableFilename(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('%') &&
    !value.includes('?') &&
    !value.includes('#') &&
    !value.split('/').includes('..')
  );
}

function artifactDigest(fields) {
  if (typeof fields.sha512 === 'string' && /^[a-f0-9]{128}$/u.test(fields.sha512)) {
    return `sha512:${fields.sha512}`;
  }
  if (typeof fields.sha256 === 'string' && /^[a-f0-9]{64}$/u.test(fields.sha256)) {
    return `sha256:${fields.sha256}`;
  }
  return null;
}

function buildPackageIndex(paragraphs, repository, custody, wantedKeys, path, issues) {
  const entries = new Map();
  for (const [index, fields] of paragraphs.entries()) {
    const stanzaPath = `${path}.packagesIndex.stanzas[${index}]`;
    const name = validPackageName(fields.package) ? fields.package : null;
    const architecture = validArchitecture(fields.architecture) ? fields.architecture : null;
    const version = validDebianVersion(fields.version) ? fields.version : null;
    if (!name || !architecture || !version) continue;
    const key = `${packageIdentity(name, architecture)}@${version}`;
    if (!wantedKeys.has(key)) continue;
    const digest = artifactDigest(fields);
    const filename = portableFilename(fields.filename) ? fields.filename : null;
    let sourceUri = null;
    if (repository.uri && filename) {
      const candidate = new URL(filename, repository.uri);
      sourceUri = candidate.origin === new URL(repository.uri).origin ? candidate.toString() : null;
    }
    if (!digest) {
      issue(
        issues,
        'repository-package-digest-invalid',
        `${stanzaPath}.SHA256`,
        'Repository package requires a canonical SHA-256 or SHA-512 digest.'
      );
    }
    if (!filename || !sourceUri) {
      issue(
        issues,
        'repository-package-filename-invalid',
        `${stanzaPath}.Filename`,
        'Repository package filename must remain below the configured HTTPS base.'
      );
    }
    if (entries.has(key)) {
      issue(
        issues,
        'repository-package-duplicate',
        stanzaPath,
        'Packages index contains a duplicate package, architecture, and version tuple.'
      );
      continue;
    }
    entries.set(key, {
      custody,
      digest,
      filename,
      packagesIndexDigest: repository.packagesIndexDigest,
      repositoryUri: repository.uri,
      sourceUri,
    });
  }
  return entries;
}

function buildRepositorySources(
  { sources, packagesIndex, repository, externalCustody },
  installed,
  issues,
  now
) {
  const fallbackCustody = normalizeCustody(externalCustody, 'externalCustody', issues);
  const hasSources = sources != null;
  if (hasSources && (packagesIndex != null || repository != null)) {
    issue(
      issues,
      'repository-sources-conflict',
      'sources',
      'Use either sources or the single packagesIndex and repository inputs, not both.'
    );
  }
  const rawSources = hasSources ? sources : [{ packagesIndex, repository }];
  if (!Array.isArray(rawSources) || rawSources.length === 0) {
    issue(
      issues,
      'repository-sources-missing',
      'sources',
      'At least one digest-anchored repository source is required.'
    );
    return { evidence: [], packageIndex: new Map() };
  }

  const normalizedSources = rawSources.map((source, index) => {
    const path = hasSources ? `sources[${index}]` : 'repository';
    const text = source?.packagesIndex;
    const normalizedRepository = normalizeRepository(source?.repository, text, path, issues, now);
    const custody = source?.custody
      ? normalizeCustody(source.custody, `${path}.custody`, issues)
      : fallbackCustody;
    return {
      custody,
      index,
      paragraphs: parseControl(text, `${path}.packagesIndex`, issues),
      path,
      repository: normalizedRepository,
    };
  });
  normalizedSources.sort(
    (left, right) =>
      compareText(left.repository.uri, right.repository.uri) ||
      compareText(left.repository.packagesIndexDigest, right.repository.packagesIndexDigest)
  );

  const packageIndex = new Map();
  const wantedKeys = new Set(installed.map((item) => `${item.identity}@${item.version}`));
  for (const source of normalizedSources) {
    const entries = buildPackageIndex(
      source.paragraphs,
      source.repository,
      source.custody,
      wantedKeys,
      source.path,
      issues
    );
    for (const [key, entry] of entries) {
      if (packageIndex.has(key)) {
        issue(
          issues,
          'repository-package-source-ambiguous',
          `${source.path}.packagesIndex`,
          'Package, architecture, and version tuple occurs in more than one repository source.'
        );
        continue;
      }
      packageIndex.set(key, entry);
    }
  }

  return {
    evidence: normalizedSources.map((source) => ({
      authentication: source.repository.authentication,
      custody: source.custody,
      packagesIndexDigest: source.repository.packagesIndexDigest,
      uri: source.repository.uri,
    })),
    allAuthenticated: normalizedSources.every(
      (source) => source.repository.authentication?.verified === true
    ),
    packageIndex,
  };
}

function normalizeMaintainerScripts(value, installed, issues) {
  if (!isRecord(value)) {
    issue(
      issues,
      'maintainer-script-manifest-invalid',
      'maintainerScripts',
      'Maintainer script manifest must map every installed package identity to script digests.'
    );
  }
  const manifest = {};
  const installedIdentities = new Set(installed.map((item) => item.identity).filter(Boolean));
  for (const identity of [...installedIdentities].sort(compareText)) {
    const scripts = value?.[identity];
    if (!isRecord(scripts)) {
      issue(
        issues,
        'maintainer-script-package-missing',
        `maintainerScripts.${identity}`,
        'Every installed package needs an explicit maintainer script map; use an empty object for none.'
      );
      manifest[identity] = {};
      continue;
    }
    manifest[identity] = {};
    for (const name of Object.keys(scripts).sort(compareText)) {
      if (!MAINTAINER_SCRIPT_NAMES.has(name)) {
        issue(
          issues,
          'maintainer-script-name-invalid',
          `maintainerScripts.${identity}.${name}`,
          'Maintainer script name must be preinst, postinst, prerm, postrm, or config.'
        );
        continue;
      }
      if (!validDigest(scripts[name])) {
        issue(
          issues,
          'maintainer-script-digest-invalid',
          `maintainerScripts.${identity}.${name}`,
          'Maintainer script digest must be sha256 or sha512.'
        );
        continue;
      }
      manifest[identity][name] = scripts[name];
    }
  }
  for (const identity of Object.keys(isRecord(value) ? value : {}).sort(compareText)) {
    if (!installedIdentities.has(identity)) {
      issue(
        issues,
        'maintainer-script-package-unknown',
        `maintainerScripts.${identity}`,
        'Maintainer script manifest names a package that is not installed.'
      );
    }
  }
  return manifest;
}

function splitDebianVersion(version) {
  const colon = version.indexOf(':');
  const epoch = colon === -1 ? 0n : BigInt(version.slice(0, colon));
  const remainder = colon === -1 ? version : version.slice(colon + 1);
  const hyphen = remainder.lastIndexOf('-');
  return {
    epoch,
    revision: hyphen === -1 ? null : remainder.slice(hyphen + 1),
    upstream: hyphen === -1 ? remainder : remainder.slice(0, hyphen),
  };
}

function orderCharacter(value) {
  if (!value || /[0-9]/u.test(value)) return 0;
  if (value === '~') return -1;
  if (/[A-Za-z]/u.test(value)) return value.codePointAt(0);
  return value.codePointAt(0) + 256;
}

function compareVersionPart(left, right) {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    while (
      (leftIndex < left.length && !/[0-9]/u.test(left[leftIndex])) ||
      (rightIndex < right.length && !/[0-9]/u.test(right[rightIndex]))
    ) {
      const leftOrder = orderCharacter(left[leftIndex]);
      const rightOrder = orderCharacter(right[rightIndex]);
      if (leftOrder !== rightOrder) return leftOrder < rightOrder ? -1 : 1;
      if (leftIndex < left.length && !/[0-9]/u.test(left[leftIndex])) leftIndex += 1;
      if (rightIndex < right.length && !/[0-9]/u.test(right[rightIndex])) rightIndex += 1;
    }

    while (left[leftIndex] === '0') leftIndex += 1;
    while (right[rightIndex] === '0') rightIndex += 1;
    let leftEnd = leftIndex;
    let rightEnd = rightIndex;
    while (/[0-9]/u.test(left[leftEnd] || '')) leftEnd += 1;
    while (/[0-9]/u.test(right[rightEnd] || '')) rightEnd += 1;
    const leftLength = leftEnd - leftIndex;
    const rightLength = rightEnd - rightIndex;
    if (leftLength !== rightLength) return leftLength < rightLength ? -1 : 1;
    const leftDigits = left.slice(leftIndex, leftEnd);
    const rightDigits = right.slice(rightIndex, rightEnd);
    if (leftDigits !== rightDigits) return leftDigits < rightDigits ? -1 : 1;
    leftIndex = leftEnd;
    rightIndex = rightEnd;
  }
  return 0;
}

function compareDebianVersions(left, right) {
  const leftParts = splitDebianVersion(left);
  const rightParts = splitDebianVersion(right);
  if (leftParts.epoch !== rightParts.epoch) return leftParts.epoch < rightParts.epoch ? -1 : 1;
  const upstream = compareVersionPart(leftParts.upstream, rightParts.upstream);
  if (upstream !== 0) return upstream;
  if (leftParts.revision == null || rightParts.revision == null) {
    if (leftParts.revision == null && rightParts.revision == null) return 0;
    return leftParts.revision == null ? -1 : 1;
  }
  return compareVersionPart(leftParts.revision, rightParts.revision);
}

export const _debianImportInternals = Object.freeze({ compareDebianVersions });

function versionSatisfies(version, relation, expected) {
  if (!relation) return true;
  const compared = compareDebianVersions(version, expected);
  return {
    '<<': compared < 0,
    '<=': compared <= 0,
    '=': compared === 0,
    '>=': compared >= 0,
    '>>': compared > 0,
  }[relation];
}

function parseRelationAtom(value) {
  const match = String(value)
    .trim()
    .match(
      /^([a-z0-9][a-z0-9+.-]*)(?::([a-z0-9-]+))?(?:\s*\(\s*(<<|<=|=|>=|>>)\s*([^\s)]+)\s*\))?$/u
    );
  if (!match || !validPackageName(match[1]) || (match[4] && !validDebianVersion(match[4]))) {
    return null;
  }
  return {
    name: match[1],
    qualifier: match[2] || null,
    relation: match[3] || null,
    version: match[4] || null,
  };
}

function parseProvides(installed, issues) {
  const providers = new Map();
  for (const item of installed) {
    if (!item.provides) continue;
    for (const raw of item.provides.replaceAll('\n', ' ').split(',')) {
      const atom = parseRelationAtom(raw);
      if (!atom || atom.qualifier || (atom.relation && atom.relation !== '=')) {
        issue(
          issues,
          'provides-relation-invalid',
          `status.${item.identity}.Provides`,
          'Provides entries must be package names with an optional exact version.'
        );
        continue;
      }
      const values = providers.get(atom.name) || [];
      values.push({ item, version: atom.version });
      providers.set(atom.name, values);
    }
  }
  return providers;
}

function architectureMatches(candidate, qualifier, dependentArchitecture) {
  if (qualifier === 'any') return candidate.multiArch === 'allowed';
  if (qualifier && qualifier !== 'native') return candidate.architecture === qualifier;
  return (
    candidate.architecture === dependentArchitecture ||
    candidate.architecture === 'all' ||
    candidate.multiArch === 'foreign'
  );
}

function relationCandidates(atom, dependent, installedByName, providers) {
  const candidates = [];
  for (const item of installedByName.get(atom.name) || []) {
    if (
      architectureMatches(item, atom.qualifier, dependent.architecture) &&
      versionSatisfies(item.version, atom.relation, atom.version)
    ) {
      candidates.push(item);
    }
  }
  for (const provider of providers.get(atom.name) || []) {
    if (
      architectureMatches(provider.item, atom.qualifier, dependent.architecture) &&
      (!atom.relation ||
        (provider.version && versionSatisfies(provider.version, atom.relation, atom.version)))
    ) {
      candidates.push(provider.item);
    }
  }
  return [...new Map(candidates.map((item) => [item.identity, item])).values()].sort(
    (left, right) => compareText(left.identity, right.identity)
  );
}

function dependencyRequirements(installed, issues) {
  const installedByName = new Map();
  for (const item of installed) {
    const values = installedByName.get(item.name) || [];
    values.push(item);
    installedByName.set(item.name, values);
  }
  const providers = parseProvides(installed, issues);
  const requirements = new Map();

  for (const item of installed) {
    const resolved = [];
    for (const [field, type] of [
      ['preDepends', 'pre-depends'],
      ['depends', 'runtime'],
    ]) {
      if (!item[field]) continue;
      for (const [groupIndex, group] of item[field].replaceAll('\n', ' ').split(',').entries()) {
        const alternatives = group.split('|').map(parseRelationAtom);
        if (alternatives.some((atom) => atom == null)) {
          issue(
            issues,
            'dependency-relation-invalid',
            `status.${item.identity}.${field}[${groupIndex}]`,
            'Dependency relation uses unsupported or malformed binary-package syntax.'
          );
          resolved.push({ id: missingComponentId(item.identity, group), type });
          continue;
        }
        let selected = null;
        for (const atom of alternatives) {
          const candidates = relationCandidates(atom, item, installedByName, providers);
          if (candidates.length > 1) {
            issue(
              issues,
              'dependency-provider-ambiguous',
              `status.${item.identity}.${field}[${groupIndex}]`,
              'Dependency relation resolves to multiple installed providers.'
            );
          }
          if (candidates.length > 0) {
            selected = candidates[0];
            break;
          }
        }
        if (!selected) {
          issue(
            issues,
            'dependency-unsatisfied',
            `status.${item.identity}.${field}[${groupIndex}]`,
            'No installed package satisfies this dependency group.'
          );
          resolved.push({ id: missingComponentId(item.identity, group), type });
        } else {
          resolved.push({ id: selected.id, type });
        }
      }
    }
    requirements.set(
      item.identity,
      [...new Map(resolved.map((entry) => [`${entry.id}\0${entry.type}`, entry])).values()].sort(
        (left, right) => compareText(left.id, right.id) || compareText(left.type, right.type)
      )
    );
  }
  return requirements;
}

function normalizeRoot(root, snapshot, issues) {
  const id = validId(root?.id) ? root.id : null;
  const version = validDebianVersion(root?.version) ? root.version : null;
  const custodyMode = root?.custody?.mode;
  const custodyOwner = validId(root?.custody?.owner) ? root.custody.owner : null;
  const trustDomain = validId(root?.custody?.trustDomain) ? root.custody.trustDomain : null;
  const sourceUri = portableSource(root?.source?.uri) ? root.source.uri : null;
  const sourceRevision = pinnedRevision(root?.source?.revision) ? root.source.revision : null;
  if (!id) issue(issues, 'root-id-invalid', 'root.id', 'Root id must be a portable identifier.');
  if (!version)
    issue(issues, 'root-version-not-pinned', 'root.version', 'Root version must be exact.');
  if (custodyMode !== 'owned' && custodyMode !== 'external') {
    issue(issues, 'root-custody-invalid', 'root.custody.mode', 'Root custody must be explicit.');
  }
  if (!custodyOwner)
    issue(issues, 'root-owner-invalid', 'root.custody.owner', 'Root custody owner is required.');
  if (!trustDomain)
    issue(
      issues,
      'root-trust-domain-invalid',
      'root.custody.trustDomain',
      'Root trust domain is required.'
    );
  if (!sourceUri)
    issue(
      issues,
      'root-source-not-portable',
      'root.source.uri',
      'Root source must be a portable URI.'
    );
  if (!sourceRevision)
    issue(
      issues,
      'root-revision-not-pinned',
      'root.source.revision',
      'Root source revision must be pinned.'
    );
  return {
    id,
    kind: 'debian-system-root',
    version,
    custody: {
      mode: custodyMode === 'owned' || custodyMode === 'external' ? custodyMode : null,
      owner: custodyOwner,
      trustDomain,
    },
    source: { uri: sourceUri, revision: sourceRevision },
    artifact: { digest: hashJson(snapshot) },
    execution: { installScripts: 'none' },
    requires: [],
    verification: { rebuilds: [] },
  };
}

export function importDebianPackageSnapshot({
  status,
  sources = null,
  packagesIndex,
  maintainerScripts,
  repository,
  root,
  verificationPolicy = null,
  externalCustody = { owner: 'debian-archive', trustDomain: 'debian-archive' },
  now = new Date(),
} = {}) {
  const issues = [];
  const sanitizedVerificationPolicy = sanitizeVerificationPolicy(verificationPolicy, issues);
  const statusParagraphs = parseControl(status, 'status', issues);
  const installed = normalizeInstalledPackages(statusParagraphs, issues);
  const repositorySources = buildRepositorySources(
    { sources, packagesIndex, repository, externalCustody },
    installed,
    issues,
    now
  );
  const packageIndex = repositorySources.packageIndex;
  const scripts = normalizeMaintainerScripts(maintainerScripts, installed, issues);
  const requirements = dependencyRequirements(installed, issues);

  const matchedPackages = [];
  for (const item of installed) {
    const key = `${item.identity}@${item.version}`;
    const repositoryEntry = packageIndex.get(key) || null;
    if (!repositoryEntry) {
      issue(
        issues,
        'repository-package-missing',
        `packagesIndex.${item.identity}`,
        'Installed package version and architecture are absent from the Packages index.'
      );
    }
    matchedPackages.push({
      architecture: item.architecture,
      digest: repositoryEntry?.digest || null,
      filename: repositoryEntry?.filename || null,
      identity: item.identity,
      packagesIndexDigest: repositoryEntry?.packagesIndexDigest || null,
      repositoryUri: repositoryEntry?.repositoryUri || null,
      scripts: scripts[item.identity] || {},
      version: item.version,
    });
  }
  matchedPackages.sort((left, right) => compareText(left.identity, right.identity));

  const snapshot = {
    installed: installed.map((item) => ({
      architecture: item.architecture,
      depends: item.depends,
      identity: item.identity,
      multiArch: item.multiArch,
      preDepends: item.preDepends,
      provides: item.provides,
      version: item.version,
    })),
    packages: matchedPackages,
    repositories: repositorySources.evidence,
  };
  const normalizedRoot = normalizeRoot(root, snapshot, issues);
  normalizedRoot.requires = installed
    .filter((item) => item.id)
    .map((item) => ({ id: item.id, type: 'operating-system' }))
    .sort((left, right) => compareText(left.id, right.id));

  const components = [normalizedRoot];
  for (const item of installed) {
    const repositoryEntry = packageIndex.get(`${item.identity}@${item.version}`) || null;
    const packageScripts = scripts[item.identity] || {};
    components.push({
      id: item.id,
      kind: 'debian-package',
      version: item.version,
      custody: repositoryEntry?.custody || {
        mode: 'external',
        owner: null,
        trustDomain: null,
      },
      source: {
        uri: repositoryEntry?.sourceUri || null,
        revision: repositoryEntry?.digest || null,
      },
      artifact: { digest: repositoryEntry?.digest || null },
      execution: {
        installScripts: Object.keys(packageScripts).length > 0 ? 'present' : 'none',
      },
      requires: requirements.get(item.identity) || [],
      verification: { rebuilds: [] },
    });
  }
  components.sort((left, right) => compareText(left.id, right.id));

  if (
    normalizedRoot.id &&
    components.some(
      (component) => component !== normalizedRoot && component.id === normalizedRoot.id
    )
  ) {
    issue(
      issues,
      'component-id-collision',
      'root.id',
      'Root id collides with a generated package component id.'
    );
  }
  issues.sort(
    (left, right) => compareText(left.path, right.path) || compareText(left.code, right.code)
  );

  const dependencies = components.reduce(
    (count, component) => count + component.requires.length,
    0
  );
  const maintainerScriptPackages = components.filter(
    (component) =>
      component.kind === 'debian-package' && component.execution.installScripts === 'present'
  ).length;
  const importable = issues.length === 0;
  const input = {
    root: normalizedRoot.id,
    coverage: {
      includedLayers: repositorySources.allAuthenticated
        ? ['operating-system', 'repository-authentication']
        : ['operating-system'],
      missingLayers: repositorySources.allAuthenticated
        ? ['native-build']
        : ['native-build', 'repository-authentication'],
    },
    verificationPolicy: sanitizedVerificationPolicy,
    components,
  };
  const receipt = {
    schema: HOLOSYSTEM_SUBSTRATE_IMPORT_SCHEMA,
    generatedAt: now.toISOString(),
    status: importable
      ? maintainerScriptPackages > 0
        ? 'execution-policy-required'
        : 'coverage-and-attestation-required'
      : 'blocked',
    importable,
    source: {
      format: 'debian-package-snapshot',
      repositories: repositorySources.evidence,
      statusHash: hashJson(snapshot.installed),
      maintainerScriptManifestHash: hashJson(scripts),
    },
    summary: {
      components: components.length,
      dependencies,
      installedPackages: installed.length,
      matchedRepositoryPackages: matchedPackages.filter((item) => item.digest).length,
      missingAttestations: components.length,
      maintainerScriptPackages,
      issues: issues.length,
    },
    evidence: { maintainerScripts: scripts },
    input,
    issues,
    boundaries: {
      packagesIndexDigestIsCallerAnchorNotReleaseSignatureProof:
        !repositorySources.allAuthenticated,
      releaseSignaturesAndIndexHashChainsVerified: repositorySources.allAuthenticated,
      gpgvBinaryKeyringsAndFingerprintsRemainCallerTrustAnchors: repositorySources.allAuthenticated,
      installedStatusIsNotRuntimeBehaviorProof: true,
      generatedComponentsRequireSignedAttestations: true,
      archiveCustodyRemainsExternal: true,
      maintainerScriptsWereHashedNotExecuted: true,
      maintainerScriptsBlockSubstrateClosure: true,
      dependencyAlternativesResolveOnlyFromInstalledState: true,
      circularDependsMayRequireExplicitBootstrapPolicy: true,
      nativeBuildDependenciesAreNotDerived: true,
    },
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}
