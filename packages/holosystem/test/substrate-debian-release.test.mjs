import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';

import {
  HOLOSYSTEM_DEBIAN_RELEASE_AUTH_SCHEMA,
  _debianReleaseInternals,
} from '../src/substrate-debian-release.mjs';

const { digestBytes, verifierArgumentPath, verifyWithRuntime } = _debianReleaseInternals;
const NOW = new Date('2026-07-16T12:00:00.000Z');
const SIGNER = '0123456789ABCDEF0123456789ABCDEF01234567';
const OTHER_SIGNER = '89ABCDEF0123456789ABCDEF0123456789ABCDEF';
const ROOT = resolve('test-fixture-debian-release');
const PATHS = {
  verifier: resolve(ROOT, 'gpgv'),
  keyring: resolve(ROOT, 'archive-keyring.gpg'),
  inRelease: resolve(ROOT, 'InRelease'),
  release: resolve(ROOT, 'Release'),
  signature: resolve(ROOT, 'Release.gpg'),
};

function releaseText(packagesIndex, overrides = {}) {
  const digest = digestBytes(Buffer.from(packagesIndex, 'utf8'));
  return [
    `Suite: ${overrides.suite || 'stable'}`,
    `Codename: ${overrides.codename || 'trixie'}`,
    `Date: ${overrides.date || 'Thu, 16 Jul 2026 11:00:00 UTC'}`,
    `Valid-Until: ${overrides.validUntil || 'Thu, 23 Jul 2026 11:00:00 UTC'}`,
    'Architectures: amd64 arm64',
    'Components: main contrib',
    'SHA256:',
    ` ${digest.slice('sha256:'.length)} ${Buffer.byteLength(packagesIndex, 'utf8')} main/binary-amd64/Packages`,
    '',
  ].join('\n');
}

function validStatus(fingerprint = SIGNER) {
  const timestamp = Math.floor(NOW.getTime() / 1000) - 60;
  return [
    `[GNUPG:] GOODSIG ${fingerprint} Debian Archive`,
    `[GNUPG:] VALIDSIG ${fingerprint} 2026-07-16 ${timestamp} 0 4 0 22 10 01 ${fingerprint}`,
    '',
  ].join('\n');
}

function inRelease(release) {
  return [
    '-----BEGIN PGP SIGNED MESSAGE-----',
    'Hash: SHA256',
    '',
    release.replace(/\n$/u, ''),
    '-----BEGIN PGP SIGNATURE-----',
    '',
    'fixture-signature',
    '-----END PGP SIGNATURE-----',
    '',
  ].join('\n');
}

function fixture({
  packagesIndex = 'Package: demo\nVersion: 1.0\n',
  release = null,
  status = null,
} = {}) {
  const verifierBytes = Buffer.from('pinned-gpgv-binary');
  const keyringBytes = Buffer.from('pinned-openpgp-keyring');
  const signedRelease = release || releaseText(packagesIndex);
  const files = new Map([
    [PATHS.verifier, verifierBytes],
    [PATHS.keyring, keyringBytes],
    [PATHS.inRelease, Buffer.from(inRelease(signedRelease))],
    [PATHS.release, Buffer.from(signedRelease)],
    [PATHS.signature, Buffer.from('detached-signature')],
  ]);
  const calls = [];
  const runtime = {
    readFile(path) {
      if (!files.has(path)) throw new Error(`missing fixture ${path}`);
      return files.get(path);
    },
    spawn(command, args, options) {
      calls.push({ command, args, options });
      return {
        error: null,
        output: [null, status || validStatus(), ''],
        status: 0,
        stderr: '',
        stdout: status || validStatus(),
      };
    },
  };
  const options = {
    inReleasePath: PATHS.inRelease,
    verifier: { path: PATHS.verifier, digest: digestBytes(verifierBytes) },
    keyrings: [{ path: PATHS.keyring, digest: digestBytes(keyringBytes) }],
    trustedFingerprints: [SIGNER],
    expected: { suite: 'stable', codename: 'trixie', architecture: 'amd64', component: 'main' },
    packagesIndex,
    packagesIndexDigest: digestBytes(Buffer.from(packagesIndex, 'utf8')),
    packagesIndexPath: 'main/binary-amd64/Packages',
    maxReleaseAgeSeconds: 7 * 24 * 60 * 60,
    now: NOW,
  };
  return { calls, options, runtime, signedRelease };
}

function codes(receipt) {
  return new Set(receipt.issues.map((entry) => entry.code));
}

test('verifies an InRelease signature and binds the exact Packages index', () => {
  const { calls, options, runtime } = fixture();
  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.schema, HOLOSYSTEM_DEBIAN_RELEASE_AUTH_SCHEMA);
  assert.equal(receipt.verified, true, JSON.stringify(receipt.issues));
  assert.equal(receipt.mode, 'inrelease');
  assert.equal(receipt.signers[0].fingerprint, SIGNER);
  assert.equal(receipt.release.index.path, 'main/binary-amd64/Packages');
  assert.equal(receipt.packagesIndexDigest, options.packagesIndexDigest);
  assert.match(receipt.receiptHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(0, 4), ['--status-fd', '1', '--keyring', PATHS.keyring]);
  assert.equal(calls[0].args.at(-1), PATHS.inRelease);
  assert.equal(calls[0].options.timeout, 15_000);
});

test('verifies detached Release.gpg without trusting verifier stdout as metadata', () => {
  const { calls, options, runtime, signedRelease } = fixture();
  delete options.inReleasePath;
  options.releasePath = PATHS.release;
  options.releaseSignaturePath = PATHS.signature;
  runtime.spawn = (command, args, invocationOptions) => {
    calls.push({ command, args, options: invocationOptions });
    return {
      error: null,
      output: [null, validStatus(), ''],
      status: 0,
      stdout: validStatus(),
    };
  };

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, true, JSON.stringify(receipt.issues));
  assert.equal(receipt.mode, 'release-gpg');
  assert.equal(receipt.release.digest, digestBytes(Buffer.from(signedRelease, 'utf8')));
  assert.deepEqual(calls[0].args.slice(-2), [PATHS.signature, PATHS.release]);
});

test('blocks a substituted verifier before process execution', () => {
  const { calls, options, runtime } = fixture();
  options.verifier.digest = digestBytes(Buffer.from('different-verifier'));

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.equal(calls.length, 0);
  assert.ok(codes(receipt).has('authentication-file-digest-mismatch'));
});

test('blocks a valid signature from an unpinned signer', () => {
  const { options, runtime } = fixture({ status: validStatus(OTHER_SIGNER) });

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('openpgp-signer-untrusted'));
});

test('blocks forged Packages bytes even when the OpenPGP signature is valid', () => {
  const trustedPackages = 'Package: trusted\nVersion: 1.0\n';
  const { options, runtime } = fixture({
    packagesIndex: 'Package: attacker\nVersion: 9.9\n',
    release: releaseText(trustedPackages),
  });

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('release-index-anchor-mismatch'));
  assert.ok(codes(receipt).has('release-index-digest-mismatch'));
});

test('blocks replayed and expired signed repository metadata', () => {
  const packagesIndex = 'Package: demo\nVersion: 1.0\n';
  const { options, runtime } = fixture({
    packagesIndex,
    release: releaseText(packagesIndex, {
      date: 'Thu, 02 Jul 2026 11:00:00 UTC',
      validUntil: 'Thu, 09 Jul 2026 11:00:00 UTC',
    }),
  });

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('release-too-old'));
  assert.ok(codes(receipt).has('release-expired'));
});

test('blocks a signed distribution identity change', () => {
  const packagesIndex = 'Package: demo\nVersion: 1.0\n';
  const { options, runtime } = fixture({
    packagesIndex,
    release: releaseText(packagesIndex, { suite: 'testing', codename: 'forky' }),
  });

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('release-suite-mismatch'));
  assert.ok(codes(receipt).has('release-codename-mismatch'));
});

test('blocks path traversal instead of searching arbitrary signed entries', () => {
  const { options, runtime } = fixture();
  options.packagesIndexPath = '../main/binary-amd64/Packages';

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('release-index-path-invalid'));
  assert.ok(codes(receipt).has('release-index-entry-count-invalid'));
});

test('blocks weak OpenPGP digest algorithms despite a zero verifier exit', () => {
  const weakStatus = validStatus().replace(' 22 10 01 ', ' 22 2 01 ');
  const { options, runtime } = fixture({ status: weakStatus });

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('openpgp-hash-weak'));
});

test('adapts pinned Git-for-Windows verifier arguments without changing the executable path', () => {
  assert.equal(
    verifierArgumentPath('C:\\Users\\founder\\archive-keyring.gpg', 'msys'),
    '/c/Users/founder/archive-keyring.gpg'
  );
  assert.equal(
    verifierArgumentPath('/usr/share/keyrings/debian-archive-keyring.gpg', 'msys'),
    '/usr/share/keyrings/debian-archive-keyring.gpg'
  );
});

test('rejects a practically unbounded replay window', () => {
  const { options, runtime } = fixture();
  options.maxReleaseAgeSeconds = Number.MAX_SAFE_INTEGER;

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('release-max-age-invalid'));
});

test('returns a redacted failure receipt when the verifier cannot start', () => {
  const { options, runtime } = fixture();
  runtime.spawn = () => {
    throw new Error(`cannot execute ${PATHS.verifier}`);
  };

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('openpgp-verifier-unavailable'));
  assert.equal(JSON.stringify(receipt).includes(PATHS.verifier), false);
});

test('rejects rollback behind a caller-owned Release checkpoint', () => {
  const { options, runtime } = fixture();
  options.minimumReleaseDate = '2026-07-16T11:30:00.000Z';

  const receipt = verifyWithRuntime(options, runtime);

  assert.equal(receipt.verified, false);
  assert.ok(codes(receipt).has('release-date-rollback'));
  assert.equal(receipt.release.minimumAcceptedDate, options.minimumReleaseDate);
  assert.equal(receipt.boundaries.monotonicRollbackProtectionRequiresPriorReleaseState, false);
});
