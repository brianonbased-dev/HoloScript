import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { _substrateImportInternals } from './substrate-import.mjs';

const { compareText, hashReceipt, issue } = _substrateImportInternals;

export const HOLOSYSTEM_DEBIAN_RELEASE_AUTH_SCHEMA = 'holoscript.holosystem.debian-release-auth.v1';

const MAX_PATH_LENGTH = 4096;
const MAX_RELEASE_BYTES = 16 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const MAX_KEYRING_BYTES = 64 * 1024 * 1024;
const MAX_VERIFIER_BYTES = 128 * 1024 * 1024;
const DIGEST_PATTERN = /^(?:sha256:[a-f0-9]{64}|sha512:[a-f0-9]{128})$/u;
const FINGERPRINT_PATTERN = /^(?:[A-F0-9]{40}|[A-F0-9]{64})!?$/u;
const RELEASE_TOKEN_PATTERN = /^[a-z0-9][a-z0-9+._/-]{0,127}$/u;
const FIELD_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;
const STRONG_OPENPGP_HASH_ALGORITHMS = new Set([8, 9, 10, 11]);
const FAILURE_STATUSES = new Set([
  'BADSIG',
  'ERRSIG',
  'EXPKEYSIG',
  'EXPSIG',
  'KEYEXPIRED',
  'KEYREVOKED',
  'NO_PUBKEY',
  'REVKEYSIG',
  'SIGEXPIRED',
]);

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function digestBytes(value, algorithm = 'sha256') {
  return `${algorithm}:${createHash(algorithm).update(value).digest('hex')}`;
}

function validPath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PATH_LENGTH &&
    !value.includes('\0')
  );
}

function verifierArgumentPath(path, style) {
  if (style === 'msys' && /^[A-Za-z]:[\\/]/u.test(path)) {
    return `/${path[0].toLowerCase()}${path.slice(2).replaceAll('\\', '/')}`;
  }
  return path;
}

function portableReleasePath(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.includes('%') &&
    !value.includes('?') &&
    !value.includes('#') &&
    !value.split('/').some((part) => part === '' || part === '.' || part === '..')
  );
}

function readBoundedFile(runtime, path, maximumBytes, issuePath, issues) {
  if (!validPath(path)) {
    issue(issues, 'authentication-path-invalid', issuePath, 'File path is missing or malformed.');
    return null;
  }
  try {
    const value = runtime.readFile(resolve(path));
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (bytes.length > maximumBytes) {
      issue(
        issues,
        'authentication-file-too-large',
        issuePath,
        'File exceeds its verification limit.'
      );
      return null;
    }
    return bytes;
  } catch {
    issue(issues, 'authentication-file-unreadable', issuePath, 'Cannot read verification input.');
    return null;
  }
}

function verifyPinnedFile(runtime, descriptor, maximumBytes, path, issues) {
  const expected = validDigest(descriptor?.digest) ? descriptor.digest : null;
  if (!expected) {
    issue(
      issues,
      'authentication-file-digest-invalid',
      `${path}.digest`,
      'Verifier and keyring files require a sha256 or sha512 digest.'
    );
  }
  const bytes = readBoundedFile(runtime, descriptor?.path, maximumBytes, `${path}.path`, issues);
  const algorithm = expected?.slice(0, expected.indexOf(':')) || 'sha256';
  const actual = bytes ? digestBytes(bytes, algorithm) : null;
  if (expected && actual && expected !== actual) {
    issue(
      issues,
      'authentication-file-digest-mismatch',
      path,
      'Verification file does not match its caller-provided digest.'
    );
  }
  return {
    digest: actual,
    path: validPath(descriptor?.path) ? resolve(descriptor.path) : null,
    verified: Boolean(expected && actual === expected),
  };
}

function parseReleaseControl(text, issues) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_RELEASE_BYTES) {
    issue(
      issues,
      'release-output-invalid',
      'release',
      'Verified Release output must be bounded UTF-8 text.'
    );
    return {};
  }
  if (text.includes('\0') || text.includes('-----BEGIN PGP SIGNED MESSAGE-----')) {
    issue(
      issues,
      'release-output-not-plaintext',
      'release',
      'Verifier must return the authenticated cleartext Release payload.'
    );
    return {};
  }

  const fields = {};
  let current = null;
  let sawContent = false;
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  for (const [index, rawLine] of lines.entries()) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') {
      if (sawContent && lines.slice(index + 1).some((candidate) => candidate.trim())) {
        issue(
          issues,
          'release-paragraph-count-invalid',
          `release.line-${index + 1}`,
          'Release metadata must contain exactly one control paragraph.'
        );
      }
      current = null;
      continue;
    }
    sawContent = true;
    if (/^[\t ]/u.test(line)) {
      if (!current) {
        issue(
          issues,
          'release-continuation-orphan',
          `release.line-${index + 1}`,
          'Continuation line has no preceding field.'
        );
      } else {
        fields[current] += `\n${line.slice(1)}`;
      }
      continue;
    }
    const separator = line.indexOf(':');
    const name = separator > 0 ? line.slice(0, separator) : '';
    if (!FIELD_NAME_PATTERN.test(name)) {
      issue(
        issues,
        'release-field-malformed',
        `release.line-${index + 1}`,
        'Release line must contain a valid field name followed by a colon.'
      );
      current = null;
      continue;
    }
    current = name.toLowerCase();
    if (Object.hasOwn(fields, current)) {
      issue(
        issues,
        'release-field-duplicate',
        `release.line-${index + 1}`,
        'Release metadata contains a duplicate field.'
      );
      current = null;
      continue;
    }
    fields[current] = line.slice(separator + 1).trim();
  }
  return fields;
}

function parseStatusOutput(value) {
  const records = [];
  for (const line of String(value || '')
    .replaceAll('\r\n', '\n')
    .split('\n')) {
    const match = line.match(/^\[GNUPG:\] ([A-Z_]+)(?: (.*))?$/u);
    if (match)
      records.push({ name: match[1], values: (match[2] || '').split(/\s+/u).filter(Boolean) });
  }
  return records;
}

function extractInReleasePayload(value, issues) {
  const text = String(value || '').replaceAll('\r\n', '\n');
  const header = '-----BEGIN PGP SIGNED MESSAGE-----\n';
  const signature = '\n-----BEGIN PGP SIGNATURE-----\n';
  if (!text.startsWith(header)) {
    issue(
      issues,
      'inrelease-armor-invalid',
      'inReleasePath',
      'InRelease must be one OpenPGP cleartext-signed message.'
    );
    return '';
  }
  const payloadStart = text.indexOf('\n\n', header.length);
  const signatureStart = text.indexOf(signature, payloadStart + 2);
  if (
    payloadStart === -1 ||
    signatureStart === -1 ||
    text.indexOf(signature, signatureStart + 1) !== -1
  ) {
    issue(
      issues,
      'inrelease-armor-invalid',
      'inReleasePath',
      'InRelease cleartext and signature armor boundaries are malformed.'
    );
    return '';
  }
  return text
    .slice(payloadStart + 2, signatureStart + 1)
    .split('\n')
    .map((line) => (line.startsWith('- ') ? line.slice(2) : line))
    .join('\n');
}

function normalizeTrustedFingerprints(value, issues) {
  if (!Array.isArray(value) || value.length === 0) {
    issue(
      issues,
      'trusted-fingerprints-missing',
      'trustedFingerprints',
      'At least one exact OpenPGP fingerprint is required.'
    );
    return [];
  }
  const normalized = [];
  for (const [index, item] of value.entries()) {
    const fingerprint = typeof item === 'string' ? item.toUpperCase() : '';
    if (!FINGERPRINT_PATTERN.test(fingerprint)) {
      issue(
        issues,
        'trusted-fingerprint-invalid',
        `trustedFingerprints[${index}]`,
        'Fingerprint must be 40 or 64 hexadecimal characters; append ! to disallow subkeys.'
      );
      continue;
    }
    normalized.push({ exact: fingerprint.endsWith('!'), value: fingerprint.replace(/!$/u, '') });
  }
  return normalized;
}

function signerAllowed(signer, trusted) {
  return trusted.some((candidate) =>
    candidate.exact
      ? signer.fingerprint === candidate.value
      : signer.fingerprint === candidate.value || signer.primaryFingerprint === candidate.value
  );
}

function validateGpgvStatus(statusText, trusted, nowSeconds, maxFutureSeconds, issues) {
  const records = parseStatusOutput(statusText);
  for (const record of records) {
    if (FAILURE_STATUSES.has(record.name)) {
      issue(
        issues,
        'openpgp-status-failure',
        'signature',
        `OpenPGP verifier reported ${record.name}.`
      );
    }
  }
  const signers = records
    .filter((record) => record.name === 'VALIDSIG')
    .map((record, index) => {
      const fingerprint = record.values[0]?.toUpperCase() || null;
      const signatureTimestamp = Number(record.values[2]);
      const expiresAt = Number(record.values[3]);
      const hashAlgorithm = Number(record.values[7]);
      const primaryFingerprint = record.values[9]?.toUpperCase() || fingerprint;
      const signer = {
        fingerprint,
        primaryFingerprint,
        signatureTimestamp: Number.isInteger(signatureTimestamp) ? signatureTimestamp : null,
        expiresAt: Number.isInteger(expiresAt) && expiresAt > 0 ? expiresAt : null,
        hashAlgorithm: Number.isInteger(hashAlgorithm) ? hashAlgorithm : null,
      };
      if (!fingerprint || !FINGERPRINT_PATTERN.test(fingerprint)) {
        issue(
          issues,
          'openpgp-fingerprint-invalid',
          `signature.signers[${index}]`,
          'VALIDSIG fingerprint is malformed.'
        );
      }
      if (!STRONG_OPENPGP_HASH_ALGORITHMS.has(hashAlgorithm)) {
        issue(
          issues,
          'openpgp-hash-weak',
          `signature.signers[${index}]`,
          'OpenPGP signature must use a SHA-2 hash algorithm.'
        );
      }
      if (!Number.isInteger(signatureTimestamp) || signatureTimestamp < 1) {
        issue(
          issues,
          'openpgp-timestamp-invalid',
          `signature.signers[${index}]`,
          'OpenPGP signature timestamp is missing or malformed.'
        );
      } else if (signatureTimestamp > nowSeconds + maxFutureSeconds) {
        issue(
          issues,
          'openpgp-timestamp-future',
          `signature.signers[${index}]`,
          'OpenPGP signature timestamp is too far in the future.'
        );
      }
      if (Number.isInteger(expiresAt) && expiresAt > 0 && expiresAt < nowSeconds) {
        issue(
          issues,
          'openpgp-signature-expired',
          `signature.signers[${index}]`,
          'OpenPGP signature has expired.'
        );
      }
      if (!signerAllowed(signer, trusted)) {
        issue(
          issues,
          'openpgp-signer-untrusted',
          `signature.signers[${index}]`,
          'Signature was not made by a configured trusted fingerprint.'
        );
      }
      return signer;
    });
  if (signers.length === 0) {
    issue(
      issues,
      'openpgp-valid-signature-missing',
      'signature',
      'Verifier emitted no VALIDSIG proof.'
    );
  }
  return signers.sort((left, right) => compareText(left.fingerprint, right.fingerprint));
}

function parseChecksumEntry(fields, algorithm, path, issues) {
  const field = fields[algorithm];
  if (typeof field !== 'string') {
    issue(
      issues,
      'release-index-hash-field-missing',
      `release.${algorithm}`,
      `Release metadata does not contain ${algorithm.toUpperCase()}.`
    );
    return null;
  }
  const expectedLength = algorithm === 'sha512' ? 128 : 64;
  const matches = [];
  for (const [index, line] of field.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([a-fA-F0-9]+)\s+([0-9]+)\s+(.+)$/u);
    if (!match || match[1].length !== expectedLength || !portableReleasePath(match[3])) {
      issue(
        issues,
        'release-checksum-entry-malformed',
        `release.${algorithm}.line-${index + 1}`,
        'Release checksum entry must contain a strong digest, byte size, and portable relative path.'
      );
      continue;
    }
    if (match[3] === path) {
      matches.push({
        digest: `${algorithm}:${match[1].toLowerCase()}`,
        size: Number(match[2]),
        path,
      });
    }
  }
  if (matches.length !== 1) {
    issue(
      issues,
      'release-index-entry-count-invalid',
      `release.${algorithm}`,
      'Requested Packages path must occur exactly once in the selected Release hash field.'
    );
    return null;
  }
  return matches[0];
}

function validateReleaseMetadata(
  releaseText,
  {
    expected,
    packagesIndex,
    packagesIndexDigest,
    packagesIndexPath,
    maxReleaseAgeSeconds,
    minimumReleaseDate,
  },
  now,
  maxFutureSeconds,
  issues
) {
  const fields = parseReleaseControl(releaseText, issues);
  const requiredExpected = ['suite', 'codename', 'architecture', 'component'];
  for (const key of requiredExpected) {
    if (typeof expected?.[key] !== 'string' || !RELEASE_TOKEN_PATTERN.test(expected[key])) {
      issue(
        issues,
        'release-expectation-invalid',
        `expected.${key}`,
        `Expected Release ${key} must be an exact portable token.`
      );
    }
  }
  if (fields.suite !== expected?.suite) {
    issue(
      issues,
      'release-suite-mismatch',
      'release.Suite',
      'Signed Release suite changed unexpectedly.'
    );
  }
  if (fields.codename !== expected?.codename) {
    issue(
      issues,
      'release-codename-mismatch',
      'release.Codename',
      'Signed Release codename changed unexpectedly.'
    );
  }
  for (const [field, expectedKey] of [
    ['architectures', 'architecture'],
    ['components', 'component'],
  ]) {
    const values = String(fields[field] || '')
      .split(/\s+/u)
      .filter(Boolean);
    if (!values.includes(expected?.[expectedKey])) {
      issue(
        issues,
        `release-${expectedKey}-missing`,
        `release.${field}`,
        `Signed Release does not include expected ${expectedKey}.`
      );
    }
  }

  const expectedPath = `${expected?.component}/binary-${expected?.architecture}/Packages`;
  if (!portableReleasePath(packagesIndexPath) || packagesIndexPath !== expectedPath) {
    issue(
      issues,
      'release-index-path-invalid',
      'packagesIndexPath',
      `Uncompressed Packages path must be exactly ${expectedPath}.`
    );
  }
  if (!validDigest(packagesIndexDigest)) {
    issue(
      issues,
      'release-index-anchor-invalid',
      'packagesIndexDigest',
      'Packages index requires its existing sha256 or sha512 caller anchor.'
    );
  }
  const algorithm = validDigest(packagesIndexDigest)
    ? packagesIndexDigest.slice(0, packagesIndexDigest.indexOf(':'))
    : 'sha256';
  const entry = parseChecksumEntry(fields, algorithm, packagesIndexPath, issues);
  const actualBytes = typeof packagesIndex === 'string' ? Buffer.from(packagesIndex, 'utf8') : null;
  if (!actualBytes) {
    issue(
      issues,
      'release-index-input-invalid',
      'packagesIndex',
      'Packages index must be UTF-8 text.'
    );
  }
  const actualDigest = actualBytes ? digestBytes(actualBytes, algorithm) : null;
  if (entry && entry.digest !== packagesIndexDigest) {
    issue(
      issues,
      'release-index-anchor-mismatch',
      'packagesIndexDigest',
      'Caller Packages anchor is not the digest certified by the signed Release.'
    );
  }
  if (entry && actualDigest !== entry.digest) {
    issue(
      issues,
      'release-index-digest-mismatch',
      'packagesIndex',
      'Packages bytes do not match the digest certified by the signed Release.'
    );
  }
  if (entry && actualBytes && entry.size !== actualBytes.length) {
    issue(
      issues,
      'release-index-size-mismatch',
      'packagesIndex',
      'Packages byte size does not match the signed Release.'
    );
  }

  const nowMs = now.getTime();
  const releaseDateMs = Date.parse(fields.date || '');
  const validUntilMs = fields['valid-until'] ? Date.parse(fields['valid-until']) : null;
  const minimumReleaseDateMs = minimumReleaseDate == null ? null : Date.parse(minimumReleaseDate);
  if (minimumReleaseDate != null && !Number.isFinite(minimumReleaseDateMs)) {
    issue(
      issues,
      'minimum-release-date-invalid',
      'minimumReleaseDate',
      'Minimum Release date must be an ISO-8601 timestamp from a previously accepted receipt.'
    );
  }
  if (!Number.isFinite(releaseDateMs)) {
    issue(
      issues,
      'release-date-invalid',
      'release.Date',
      'Signed Release Date is missing or malformed.'
    );
  } else if (releaseDateMs > nowMs + maxFutureSeconds * 1000) {
    issue(
      issues,
      'release-date-future',
      'release.Date',
      'Signed Release Date is too far in the future.'
    );
  }
  if (
    Number.isFinite(releaseDateMs) &&
    Number.isFinite(minimumReleaseDateMs) &&
    releaseDateMs < minimumReleaseDateMs
  ) {
    issue(
      issues,
      'release-date-rollback',
      'release.Date',
      'Signed Release predates the caller-owned monotonic checkpoint.'
    );
  }
  if (
    !Number.isInteger(maxReleaseAgeSeconds) ||
    maxReleaseAgeSeconds < 1 ||
    maxReleaseAgeSeconds > 366 * 24 * 60 * 60
  ) {
    issue(
      issues,
      'release-max-age-invalid',
      'maxReleaseAgeSeconds',
      'Replay window must be an integer from 1 second to 366 days even when Valid-Until is absent.'
    );
  } else if (
    Number.isFinite(releaseDateMs) &&
    nowMs > releaseDateMs + maxReleaseAgeSeconds * 1000
  ) {
    issue(
      issues,
      'release-too-old',
      'release.Date',
      'Signed Release exceeds the configured replay window.'
    );
  }
  if (fields['valid-until']) {
    if (!Number.isFinite(validUntilMs)) {
      issue(
        issues,
        'release-valid-until-invalid',
        'release.Valid-Until',
        'Valid-Until is malformed.'
      );
    } else {
      if (Number.isFinite(releaseDateMs) && validUntilMs < releaseDateMs) {
        issue(
          issues,
          'release-valid-until-before-date',
          'release.Valid-Until',
          'Valid-Until precedes Date.'
        );
      }
      if (nowMs > validUntilMs) {
        issue(issues, 'release-expired', 'release.Valid-Until', 'Signed Release has expired.');
      }
    }
  }

  return {
    codename: fields.codename || null,
    date: Number.isFinite(releaseDateMs) ? new Date(releaseDateMs).toISOString() : null,
    digest: typeof releaseText === 'string' ? digestBytes(Buffer.from(releaseText, 'utf8')) : null,
    index: entry,
    minimumAcceptedDate: Number.isFinite(minimumReleaseDateMs)
      ? new Date(minimumReleaseDateMs).toISOString()
      : null,
    suite: fields.suite || null,
    validUntil: Number.isFinite(validUntilMs) ? new Date(validUntilMs).toISOString() : null,
  };
}

function outputText(value) {
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return '';
}

function verifyWithRuntime(
  {
    inReleasePath,
    releasePath,
    releaseSignaturePath,
    verifier,
    keyrings,
    trustedFingerprints,
    expected,
    packagesIndex,
    packagesIndexDigest,
    packagesIndexPath,
    maxReleaseAgeSeconds,
    minimumReleaseDate = null,
    maxFutureSeconds = 10,
    now = new Date(),
  } = {},
  runtime
) {
  const issues = [];
  const instant =
    now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date(Number.NaN);
  if (!Number.isFinite(instant.getTime())) {
    issue(issues, 'authentication-time-invalid', 'now', 'Verification time must be a valid Date.');
  }
  if (!Number.isInteger(maxFutureSeconds) || maxFutureSeconds < 0 || maxFutureSeconds > 3600) {
    issue(
      issues,
      'authentication-future-window-invalid',
      'maxFutureSeconds',
      'Future clock tolerance must be an integer from 0 to 3600 seconds.'
    );
  }
  const safeFutureSeconds =
    Number.isInteger(maxFutureSeconds) && maxFutureSeconds >= 0 && maxFutureSeconds <= 3600
      ? maxFutureSeconds
      : 0;

  const inline = validPath(inReleasePath);
  const detached = validPath(releasePath) && validPath(releaseSignaturePath);
  if (inline === detached) {
    issue(
      issues,
      'release-signature-input-conflict',
      'signature',
      'Provide exactly one InRelease path or a Release plus Release.gpg path pair.'
    );
  }
  const mode = inline ? 'inrelease' : detached ? 'release-gpg' : null;
  const signedInput = inline
    ? readBoundedFile(runtime, inReleasePath, MAX_RELEASE_BYTES, 'inReleasePath', issues)
    : detached
      ? readBoundedFile(
          runtime,
          releaseSignaturePath,
          MAX_SIGNATURE_BYTES,
          'releaseSignaturePath',
          issues
        )
      : null;
  const detachedRelease = detached
    ? readBoundedFile(runtime, releasePath, MAX_RELEASE_BYTES, 'releasePath', issues)
    : null;

  const pinnedVerifier = verifyPinnedFile(
    runtime,
    verifier,
    MAX_VERIFIER_BYTES,
    'verifier',
    issues
  );
  const verifierPathStyle = verifier?.pathStyle || 'native';
  if (verifierPathStyle !== 'native' && verifierPathStyle !== 'msys') {
    issue(
      issues,
      'verifier-path-style-invalid',
      'verifier.pathStyle',
      'Verifier path style must be native or msys.'
    );
  }
  if (!Array.isArray(keyrings) || keyrings.length === 0) {
    issue(
      issues,
      'keyrings-missing',
      'keyrings',
      'At least one digest-pinned OpenPGP keyring is required.'
    );
  }
  const pinnedKeyrings = (Array.isArray(keyrings) ? keyrings : []).map((keyring, index) =>
    verifyPinnedFile(runtime, keyring, MAX_KEYRING_BYTES, `keyrings[${index}]`, issues)
  );
  const trusted = normalizeTrustedFingerprints(trustedFingerprints, issues);

  let releaseText = detachedRelease?.toString('utf8') || '';
  let signers = [];
  if (
    mode &&
    signedInput &&
    pinnedVerifier.verified &&
    pinnedKeyrings.length > 0 &&
    pinnedKeyrings.every((keyring) => keyring.verified)
  ) {
    const args = ['--status-fd', '1'];
    for (const keyring of pinnedKeyrings) {
      args.push('--keyring', verifierArgumentPath(keyring.path, verifierPathStyle));
    }
    if (inline) {
      args.push(verifierArgumentPath(resolve(inReleasePath), verifierPathStyle));
    } else {
      args.push(
        verifierArgumentPath(resolve(releaseSignaturePath), verifierPathStyle),
        verifierArgumentPath(resolve(releasePath), verifierPathStyle)
      );
    }
    let result;
    try {
      result = runtime.spawn(pinnedVerifier.path, args, {
        encoding: 'utf8',
        maxBuffer: MAX_RELEASE_BYTES,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 15_000,
        windowsHide: true,
      });
    } catch {
      result = { error: new Error('verifier execution failed'), status: null, stdout: '' };
    }
    if (result.error) {
      issue(
        issues,
        'openpgp-verifier-unavailable',
        'verifier',
        'Cannot execute pinned OpenPGP verifier.'
      );
    } else if (result.status !== 0) {
      issue(
        issues,
        'openpgp-verification-failed',
        'signature',
        `Pinned OpenPGP verifier exited with status ${String(result.status)}.`
      );
    }
    const statusText = outputText(result.stdout);
    signers = validateGpgvStatus(
      statusText,
      trusted,
      Number.isFinite(instant.getTime()) ? Math.floor(instant.getTime() / 1000) : 0,
      safeFutureSeconds,
      issues
    );
    if (inline) releaseText = extractInReleasePayload(signedInput.toString('utf8'), issues);
  }

  const release = validateReleaseMetadata(
    releaseText,
    {
      expected,
      packagesIndex,
      packagesIndexDigest,
      packagesIndexPath,
      maxReleaseAgeSeconds,
      minimumReleaseDate,
    },
    instant,
    safeFutureSeconds,
    issues
  );
  issues.sort(
    (left, right) => compareText(left.path, right.path) || compareText(left.code, right.code)
  );
  const verified = issues.length === 0;
  const receipt = {
    schema: HOLOSYSTEM_DEBIAN_RELEASE_AUTH_SCHEMA,
    generatedAt: Number.isFinite(instant.getTime()) ? instant.toISOString() : null,
    verified,
    mode,
    signatureInputDigest: signedInput ? digestBytes(signedInput) : null,
    verifierDigest: pinnedVerifier.digest,
    verifierPathStyle,
    keyringDigests: pinnedKeyrings
      .map((keyring) => keyring.digest)
      .filter(Boolean)
      .sort(compareText),
    signers,
    release,
    packagesIndexDigest: validDigest(packagesIndexDigest) ? packagesIndexDigest : null,
    issues,
    boundaries: {
      verifierAndKeyringDigestsAreCallerTrustAnchors: true,
      exactSignerFingerprintsAreRequired: true,
      releaseFreshnessIsBounded: true,
      monotonicRollbackProtectionRequiresPriorReleaseState: release.minimumAcceptedDate == null,
      trustedClockRemainsCallerOwned: true,
      packagePayloadsAreBoundThroughTheSignedPackagesIndex: true,
      packageContentsAndMaintainerBehaviorAreNotVerified: true,
      keyLifecycleAndTrustBootstrapRemainCallerOwned: true,
    },
  };
  receipt.receiptHash = hashReceipt({ ...receipt, generatedAt: null });
  return receipt;
}

const defaultRuntime = Object.freeze({ readFile: readFileSync, spawn: spawnSync });

export function verifyDebianRepositoryRelease(options) {
  return verifyWithRuntime(options, defaultRuntime);
}

export const _debianReleaseInternals = Object.freeze({
  digestBytes,
  extractInReleasePayload,
  parseReleaseControl,
  parseStatusOutput,
  validateReleaseMetadata,
  verifierArgumentPath,
  verifyWithRuntime,
});
