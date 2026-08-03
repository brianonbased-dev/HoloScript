#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { types as utilTypes } from 'node:util';

const CHECK_SCHEMA = 'holokey.repository-identity-native-publication-check.v1';
const EXPECTED_TRANSITION_TABLE_BITMASK = 16_833;
const EXPECTED_ROW_MASKS = [1, 14, 16];
const EXPECTED_AUTHORITY_EXPORTS = Object.freeze([
  'HOLOKEY_REPOSITORY_APPROVAL_SCHEMA',
  'HOLOKEY_REPOSITORY_AUTHORITY_INTENT_SCHEMA',
  'HOLOKEY_REPOSITORY_CHECKPOINT_SCHEMA',
  'HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_RESULT_SCHEMA',
  'HOLOKEY_REPOSITORY_COMPARE_AND_COMMIT_SCHEMA',
  'HOLOKEY_REPOSITORY_IDENTITY_EVIDENCE_SCHEMA',
  'HOLOKEY_REPOSITORY_IDENTITY_SCHEMA',
  'HOLOKEY_REPOSITORY_IDENTITY_VERIFICATION_SCHEMA',
  'HOLOKEY_REPOSITORY_TRANSITION_RECEIPT_SCHEMA',
  'HOLOKEY_SIGNATURE_SCHEME',
  'MAX_APPROVALS',
  'REPOSITORY_AUTHORITY_APPROVAL_SCHEMA',
  'REPOSITORY_AUTHORITY_ENVELOPE_SCHEMA',
  'REPOSITORY_DETACHED_SIGNATURE_SCHEMA',
  'REPOSITORY_IDENTITY_ACTIONS',
  'REPOSITORY_IDENTITY_CHECKPOINT_SCHEMA',
  'REPOSITORY_IDENTITY_LEDGER_SCHEMA',
  'REPOSITORY_IDENTITY_SCHEMA',
  'REPOSITORY_IDENTITY_TRANSITION_RECEIPT_SCHEMA',
  'RepositoryIdentityAuthorityError',
  'buildProvisionalRepositoryIdentity',
  'buildRepositoryAuthorityIntent',
  'canonicalizeRepositoryIdentityValue',
  'hashRepositoryIdentityValue',
  'parseRepositoryIdentity',
  'projectHoloKeyIdentityEvidence',
  'projectLegacyRepositoryIdentity',
  'repositoryIdentityNativeTransitionTableMask',
  'transitionRepositoryIdentity',
  'validateRepositoryIdentity',
  'verifyHoloKeyIdentityEvidence',
]);
const EXPECTED_ROOT_EXPORTS = Object.freeze([
  'AuthRequiredError',
  'CapabilityTokenError',
  'CapabilityTokenRegistry',
  'DEFAULT_CAPABILITY_BY_TRUST',
  'DEFAULT_TRUST_BY_SURFACE',
  'DEFAULT_TTL_SECONDS',
  'DecryptError',
  'EnvKekConfigError',
  'FILE_SECRET_STORE_SCHEMA',
  'HOLOKEY_STORE_PATH_ENV',
  'InsecureKekError',
  'KEK_CURRENT_ENV',
  'KmsKekError',
  'MAX_TTL_SECONDS',
  'MIN_TTL_SECONDS',
  'OwnerMismatchError',
  'PROD_KEK_CURRENT_ENV',
  'PolicyDeniedError',
  'QEC_DECODE_PAYLOAD_FIELDS',
  'SECRETS_VAULT_STORE_PATH_ENV',
  'SECRET_LEASES_DDL',
  'SECRET_STORE_DDL',
  'ScopedSecretKeyringError',
  'SecretGrantPolicyError',
  'SecretNotFoundError',
  'SecretsManifestError',
  'allowAgentForRef',
  'allowOnly',
  'assertHandle',
  'checkSecretAccess',
  'checkSecretGrantPolicy',
  'compileSecretsManifest',
  'createDeviceFlowChallenge',
  'createEnvKekProvider',
  'createFileSecretBackend',
  'createHoloKeyVault',
  'createInMemorySecretBackend',
  'createKmsKekProvider',
  'createMemoryLeaseAdapter',
  'createNeedsKeyHandler',
  'createNoOpLeaseAdapter',
  'createPolicyGatedSecretGrant',
  'createPostgresLeaseAdapter',
  'createPostgresSecretBackend',
  'createReceiptChainSink',
  'createResolveReceiptSink',
  'createScopedSecretKeyring',
  'createSecretGrant',
  'createSecretResolver',
  'createSecretStore',
  'createServiceSecretResolver',
  'denyAll',
  'fromHoloDoorPolicy',
  'generateKekBase64',
  'infraSecretRef',
  'kekEnvVar',
  'localFileProvisionAdapter',
  'mintCapabilityToken',
  'normalizeServiceSecretRef',
  'parseHandle',
  'provisionBrokeredSession',
  'registerNeedsKeyTrait',
  'resolveServiceIdentity',
  'revokeCapabilityToken',
  'sealDecodeReceipt',
  'sealDecodeReceiptChain',
  'sealHash',
  'sealResolveReceipt',
  'storeCapabilityToken',
  'validateCapabilityToken',
  'verifyDecodeReceiptChain',
  'verifyReceiptChain',
  'verifyResolveReceiptChain',
]);
const EXPECTED_WINDOWS_TOOLCHAIN_DIRECTORIES = Object.freeze({
  SystemRoot: 'C:\\WINDOWS',
  WINDIR: 'C:\\WINDOWS',
  ProgramData: 'C:\\ProgramData',
});
const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), '..');
const repositoryRoot = resolve(packageRoot, '..', '..');
const systemsRoot = resolve(repositoryRoot, 'distributions', 'systems');
const sourcePath = resolve(packageRoot, 'src', 'repository_identity.hsplus');
const manifestPath = resolve(packageRoot, 'package.json');
const releaseManifestPath = resolve(systemsRoot, 'release-manifest.json');
const sha256SumsPath = resolve(systemsRoot, 'SHA256SUMS');
const distEsmPath = resolve(packageRoot, 'dist', 'repository-identity.js');
const distCjsPath = resolve(packageRoot, 'dist', 'repository-identity.cjs');
const rootDistEsmPath = resolve(packageRoot, 'dist', 'index.js');
const rootDistCjsPath = resolve(packageRoot, 'dist', 'index.cjs');
const platformKey = `${process.platform}-${process.arch}`;
const compilerName = process.platform === 'win32' ? 'holoscriptc.exe' : 'holoscriptc';
const compilerPath = resolve(systemsRoot, 'native', platformKey, compilerName);
const TRUSTED_RELEASE_MANIFEST_SHA256 =
    'sha256:5469cf10b6278415f0ed2361750d02befa34c2b238fd000181df080a17c405da';
const TRUSTED_SHA256_SUMS_SHA256 =
    'sha256:0fcc1c065b4058dfe3c7d7bb835a3a1a73a35c88f497c5ed7b16c2a380995cb2';
const TRUSTED_COMPILER_SHA256 =
    'sha256:11e2af81a33cf3f678cf8236793ccbbacc43dd1a76cc89b2a6daaa7c54577508';
const TRUSTED_SOURCE_COMMIT = 'a5b2072fcce24946f7ea476e5bc72c3f6f22a7cb';
const TRUSTED_RELEASE_MACHINE_CONTRACT = 'hs-machine-v32';
const EXPECTED_ROW_MACHINE_CONTRACT = 'hs-machine-v45';
const TRUSTED_LINKERS = {
  'win32-x64': {
    path: 'C:\\Program Files\\LLVM\\bin\\clang.exe',
    sha256: 'sha256:812f6a0e80a5541108c0f4ae31121bcd5b692707041ac83a86e595f4729f5c8a',
  },
};
const trustedLinker = TRUSTED_LINKERS[platformKey];
const linkerPath = trustedLinker?.path ?? null;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const NATIVE_SHA256_FIXTURE_TEXT = '{"authority":"HoloKey","state":1}';
const NATIVE_SHA256_FIXTURE_BYTES = Buffer.from(NATIVE_SHA256_FIXTURE_TEXT, 'utf8');
const NATIVE_SHA256_EXPECTED_HEX =
  'defc35bec5e0abb739f1f23da5d319956af5144ae854fd28dc8bd5c39b11f700';
const MODULE_PROBE_SCHEMA = 'holokey.repository-identity-module-probe.v1';
const REFLECT_OWN_KEYS = Reflect.ownKeys;
const REFLECT_APPLY = Reflect.apply;
const OBJECT_DEFINE_PROPERTY = Object.defineProperty;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const OBJECT_HAS_OWN = Object.hasOwn;
const OBJECT_IS = Object.is;
const OBJECT_IS_EXTENSIBLE = Object.isExtensible;
const OBJECT_PREVENT_EXTENSIONS = Object.preventExtensions;
const PRISTINE_OBJECT_PROTOTYPE = Object.prototype;
const PRISTINE_ARRAY_PROTOTYPE = Array.prototype;
const ARRAY_SORT = Array.prototype.sort;
const JSON_STRINGIFY = JSON.stringify;
const SET_CONSTRUCTOR = Set;
const SET_HAS = Set.prototype.has;
const IS_PROXY = utilTypes.isProxy;

function sha256File(path) {
  return `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`;
}

function sha256Text(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function intrinsicJsonStringify(value) {
  return REFLECT_APPLY(JSON_STRINGIFY, JSON, [value]);
}

function sortedCopy(values, compare = undefined) {
  const copy = [];
  for (let index = 0; index < values.length; index += 1) copy[index] = values[index];
  REFLECT_APPLY(ARRAY_SORT, copy, compare === undefined ? [] : [compare]);
  return copy;
}

function stringCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function exactJsonEqual(left, right) {
  return intrinsicJsonStringify(left) === intrinsicJsonStringify(right);
}

function capturedSet(values) {
  return new SET_CONSTRUCTOR(values);
}

function capturedSetHas(set, value) {
  return REFLECT_APPLY(SET_HAS, set, [value]);
}

function isInside(root, candidate) {
  const rel = relative(root, candidate);
  const parentPrefix = `..${process.platform === 'win32' ? '\\' : '/'}`;
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(parentPrefix));
}

function ownedRegularFile(path, allowedRoot) {
  if (!existsSync(path)) return false;
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) return false;
  return isInside(realpathSync(allowedRoot), realpathSync(path));
}

function regularNonLinkFile(path) {
  if (!existsSync(path)) return false;
  const stat = lstatSync(path);
  return stat.isFile() && !stat.isSymbolicLink();
}

function boundedOutput(value) {
  const text = value ?? '';
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) return '<output-over-limit>';
  return text;
}

function safeJson(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function strictObjectKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function parseSha256Sums(text) {
  if (Buffer.byteLength(text, 'utf8') > MAX_OUTPUT_BYTES) return null;
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === '') lines.pop();
  const entries = new Map();
  for (const line of lines) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9][A-Za-z0-9._/-]*)$/u.exec(line);
    if (!match || match[2].includes('..') || entries.has(match[2])) return null;
    entries.set(match[2], `sha256:${match[1]}`);
  }
  return entries;
}

function hostEnvironmentValue(name) {
  const entry = Object.entries(process.env).find(
    ([candidate]) => candidate.toLowerCase() === name.toLowerCase()
  );
  return entry?.[1];
}

function canonicalNonLinkDirectory(path) {
  if (typeof path !== 'string' || path.length === 0 || !isAbsolute(path) || !existsSync(path)) {
    return null;
  }
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return null;
  const canonical = realpathSync(path);
  const canonicalStat = lstatSync(canonical);
  return canonicalStat.isDirectory() && !canonicalStat.isSymbolicLink() ? canonical : null;
}

function comparableCanonicalPath(path) {
  return process.platform === 'win32' ? path.toLowerCase() : path;
}

function strictToolchainEnvironment(scratch) {
  const env = {};
  const missing = [];
  const invalid = [];
  const expectedPairs = [];
  const actualPairs = [];
  if (process.platform === 'win32') {
    for (const [name, expectedPath] of Object.entries(EXPECTED_WINDOWS_TOOLCHAIN_DIRECTORIES)) {
      const hostValue = hostEnvironmentValue(name);
      if (!hostValue) {
        missing.push(name);
        continue;
      }
      const expectedCanonical = canonicalNonLinkDirectory(expectedPath);
      const actualCanonical = canonicalNonLinkDirectory(hostValue);
      const expectedComparable = expectedCanonical
        ? comparableCanonicalPath(expectedCanonical)
        : comparableCanonicalPath(expectedPath);
      const actualComparable = actualCanonical
        ? comparableCanonicalPath(actualCanonical)
        : '<invalid-directory>';
      expectedPairs.push([name, expectedComparable]);
      actualPairs.push([name, actualComparable]);
      if (!expectedCanonical || !actualCanonical || actualComparable !== expectedComparable) {
        invalid.push(name);
        continue;
      }
      env[name] = expectedCanonical;
    }
  }

  const canonicalScratch = canonicalNonLinkDirectory(scratch);
  const canonicalTempRoot = canonicalNonLinkDirectory(tmpdir());
  const validScratch =
    canonicalScratch !== null &&
    canonicalTempRoot !== null &&
    canonicalScratch !== canonicalTempRoot &&
    isInside(canonicalTempRoot, canonicalScratch);
  const scratchValue = validScratch ? canonicalScratch : '<invalid-scratch-directory>';
  for (const name of process.platform === 'win32' ? ['TEMP', 'TMP'] : ['TEMP', 'TMP', 'TMPDIR']) {
    expectedPairs.push([name, scratchValue]);
    actualPairs.push([name, scratchValue]);
    if (validScratch) env[name] = canonicalScratch;
    else invalid.push(name);
  }
  const names = Object.keys(env).sort();
  expectedPairs.sort(([left], [right]) => left.localeCompare(right));
  actualPairs.sort(([left], [right]) => left.localeCompare(right));
  const expectedNameValueSha256 = sha256Text(JSON.stringify(expectedPairs));
  const actualNameValueSha256 = sha256Text(JSON.stringify(actualPairs));
  const verified =
    missing.length === 0 &&
    invalid.length === 0 &&
    expectedNameValueSha256 === actualNameValueSha256;
  return {
    env,
    missing,
    invalid,
    receipt: {
      names,
      expectedNameValueSha256,
      actualNameValueSha256,
      valuesRedacted: true,
      verified,
    },
  };
}

function symbolKeyLabel(key) {
  if (key === Symbol.toStringTag) return 'Symbol.toStringTag';
  const globalKey = Symbol.keyFor(key);
  return globalKey === undefined
    ? `Symbol(${intrinsicJsonStringify(key.description ?? '')})`
    : `Symbol.for(${intrinsicJsonStringify(globalKey)})`;
}

function descriptorReceipt(key, descriptor) {
  const data = OBJECT_HAS_OWN(descriptor, 'value');
  const meta = key === '__esModule' || key === Symbol.toStringTag;
  return {
    keyType: typeof key,
    key: typeof key === 'symbol' ? symbolKeyLabel(key) : key,
    kind: data ? 'data' : 'accessor',
    enumerable: descriptor.enumerable === true,
    configurable: descriptor.configurable === true,
    writable: data ? descriptor.writable === true : null,
    getter: data ? false : typeof descriptor.get === 'function',
    setter: data ? false : typeof descriptor.set === 'function',
    valueType: data ? typeof descriptor.value : null,
    metaValue: meta ? descriptor.value : null,
  };
}

function exactEsmPublicDescriptor(descriptor) {
  return (
    descriptor !== undefined &&
    OBJECT_HAS_OWN(descriptor, 'value') &&
    descriptor.enumerable === true &&
    descriptor.configurable === false &&
    descriptor.writable === true &&
    descriptor.get === undefined &&
    descriptor.set === undefined
  );
}

function exactCjsPublicDescriptor(descriptor) {
  if (descriptor === undefined || descriptor.enumerable !== true || descriptor.configurable !== false) {
    return false;
  }
  if (OBJECT_HAS_OWN(descriptor, 'value')) {
    return (
      descriptor.writable === false &&
      descriptor.get === undefined &&
      descriptor.set === undefined
    );
  }
  return typeof descriptor.get === 'function' && descriptor.set === undefined;
}

function emptyNamespaceReceipt(expectedKeys, format, proxyDetected = false) {
  const reviewedKeys = sortedCopy(expectedKeys, stringCompare);
  const reviewedOwnStringKeys =
    format === 'cjs' ? sortedCopy([...reviewedKeys, '__esModule'], stringCompare) : reviewedKeys;
  const reviewedOwnSymbolKeys = format === 'esm' ? ['Symbol.toStringTag'] : [];
  return {
    format,
    descriptorPolicy:
      format === 'esm'
        ? 'native-esm-module-namespace-descriptors.v1'
        : 'tsup-cjs-module-namespace-descriptors.v1',
    proxyDetected,
    introspectionAttempted: false,
    keys: [],
    count: 0,
    sha256: null,
    reviewedKeys,
    reviewedCount: reviewedKeys.length,
    reviewedSha256: sha256Text(intrinsicJsonStringify(reviewedKeys)),
    ownStringKeys: [],
    ownSymbolKeys: [],
    reviewedOwnStringKeys,
    reviewedOwnSymbolKeys,
    ownKeysSha256: null,
    reviewedOwnKeysSha256: sha256Text(
      intrinsicJsonStringify({ strings: reviewedOwnStringKeys, symbols: reviewedOwnSymbolKeys })
    ),
    descriptorRows: [],
    descriptorSha256: null,
    prototype: null,
    extensible: null,
    publicKeysExact: false,
    ownStringKeysExact: false,
    ownSymbolKeysExact: false,
    publicDescriptorsVerified: false,
    metaDescriptorVerified: false,
    prototypeVerified: false,
    extensibilityVerified: false,
    exact: false,
  };
}

function namespaceReceipt(value, expectedKeys, format) {
  const empty = emptyNamespaceReceipt(expectedKeys, format, IS_PROXY(value));
  if (
    empty.proxyDetected ||
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function')
  ) {
    return empty;
  }

  try {
    const ownKeys = REFLECT_OWN_KEYS(value);
    const ownStringKeys = [];
    const ownSymbols = [];
    for (const key of ownKeys) {
      if (typeof key === 'string') ownStringKeys[ownStringKeys.length] = key;
      else if (typeof key === 'symbol') ownSymbols[ownSymbols.length] = key;
    }
    REFLECT_APPLY(ARRAY_SORT, ownStringKeys, [stringCompare]);
    const ownSymbolKeys = [];
    for (const key of ownSymbols) ownSymbolKeys[ownSymbolKeys.length] = symbolKeyLabel(key);
    REFLECT_APPLY(ARRAY_SORT, ownSymbolKeys, [stringCompare]);
    const keys = [];
    for (const key of ownStringKeys) {
      if (key !== '__esModule') keys[keys.length] = key;
    }
    const reviewedKeys = sortedCopy(expectedKeys, stringCompare);
    const sha256 = sha256Text(intrinsicJsonStringify(keys));
    const reviewedSha256 = sha256Text(intrinsicJsonStringify(reviewedKeys));
    const reviewedOwnStringKeys =
      format === 'cjs' ? sortedCopy([...reviewedKeys, '__esModule'], stringCompare) : reviewedKeys;
    const reviewedOwnSymbolKeys = format === 'esm' ? ['Symbol.toStringTag'] : [];
    const descriptors = new Map();
    for (const key of ownKeys) {
      descriptors.set(key, OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key));
    }
    const descriptorRows = [];
    for (const key of ownStringKeys) {
      descriptorRows[descriptorRows.length] = descriptorReceipt(key, descriptors.get(key));
    }
    const symbolDescriptorRows = [];
    for (const key of ownSymbols) {
      symbolDescriptorRows[symbolDescriptorRows.length] = descriptorReceipt(
        key,
        descriptors.get(key)
      );
    }
    REFLECT_APPLY(ARRAY_SORT, symbolDescriptorRows, [
      (left, right) => stringCompare(left.key, right.key),
    ]);
    for (const row of symbolDescriptorRows) descriptorRows[descriptorRows.length] = row;
    const publicDescriptorCheck =
      format === 'esm' ? exactEsmPublicDescriptor : exactCjsPublicDescriptor;
    let publicDescriptorsVerified = true;
    for (const key of reviewedKeys) {
      if (!publicDescriptorCheck(descriptors.get(key))) {
        publicDescriptorsVerified = false;
        break;
      }
    }
    const metaDescriptor =
      format === 'esm' ? descriptors.get(Symbol.toStringTag) : descriptors.get('__esModule');
    const metaDescriptorVerified =
      format === 'esm'
        ? metaDescriptor !== undefined &&
          OBJECT_HAS_OWN(metaDescriptor, 'value') &&
          metaDescriptor.value === 'Module' &&
          metaDescriptor.writable === false &&
          metaDescriptor.enumerable === false &&
          metaDescriptor.configurable === false &&
          metaDescriptor.get === undefined &&
          metaDescriptor.set === undefined
        : metaDescriptor !== undefined &&
          OBJECT_HAS_OWN(metaDescriptor, 'value') &&
          metaDescriptor.value === true &&
          metaDescriptor.writable === false &&
          metaDescriptor.enumerable === false &&
          metaDescriptor.configurable === false &&
          metaDescriptor.get === undefined &&
          metaDescriptor.set === undefined;
    const prototype = OBJECT_GET_PROTOTYPE_OF(value);
    const prototypeVerified =
      format === 'esm' ? prototype === null : prototype === PRISTINE_OBJECT_PROTOTYPE;
    const extensible = OBJECT_IS_EXTENSIBLE(value);
    const extensibilityVerified = format === 'esm' ? !extensible : extensible;
    const publicKeysExact = sha256 === reviewedSha256 && keys.length === reviewedKeys.length;
    const ownStringKeysExact =
      exactJsonEqual(ownStringKeys, reviewedOwnStringKeys);
    const ownSymbolKeysExact =
      format === 'esm'
        ? ownSymbols.length === 1 && ownSymbols[0] === Symbol.toStringTag
        : ownSymbols.length === 0;
    const ownKeysSha256 = sha256Text(
      intrinsicJsonStringify({ strings: ownStringKeys, symbols: ownSymbolKeys })
    );
    const reviewedOwnKeysSha256 = sha256Text(
      intrinsicJsonStringify({ strings: reviewedOwnStringKeys, symbols: reviewedOwnSymbolKeys })
    );
    return {
      ...empty,
      introspectionAttempted: true,
      keys,
      count: keys.length,
      sha256,
      reviewedSha256,
      ownStringKeys,
      ownSymbolKeys,
      ownKeysSha256,
      reviewedOwnKeysSha256,
      descriptorRows,
      descriptorSha256: sha256Text(intrinsicJsonStringify(descriptorRows)),
      prototype:
        prototype === null
          ? 'null'
          : prototype === PRISTINE_OBJECT_PROTOTYPE
            ? 'pristine-Object.prototype'
            : 'other',
      extensible,
      publicKeysExact,
      ownStringKeysExact,
      ownSymbolKeysExact,
      publicDescriptorsVerified,
      metaDescriptorVerified,
      prototypeVerified,
      extensibilityVerified,
      exact:
        publicKeysExact &&
        ownStringKeysExact &&
        ownSymbolKeysExact &&
        publicDescriptorsVerified &&
        metaDescriptorVerified &&
        prototypeVerified &&
        extensibilityVerified,
    };
  } catch {
    return { ...empty, introspectionAttempted: true };
  }
}

function syntheticNamespace(format, { hidden = false, straySymbol = false } = {}) {
  const value = format === 'esm' ? Object.create(null) : {};
  OBJECT_DEFINE_PROPERTY(value, 'safe',
    format === 'esm'
      ? { value: () => true, writable: true, enumerable: true, configurable: false }
      : { get: () => true, enumerable: true, configurable: false }
  );
  if (format === 'esm') {
    OBJECT_DEFINE_PROPERTY(value, Symbol.toStringTag, {
      value: 'Module',
      writable: false,
      enumerable: false,
      configurable: false,
    });
  } else {
    OBJECT_DEFINE_PROPERTY(value, '__esModule', {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
  if (hidden) {
    OBJECT_DEFINE_PROPERTY(value, 'unsafeIssueIdentity', {
      value: () => true,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
  if (straySymbol) {
    OBJECT_DEFINE_PROPERTY(value, Symbol('unsafeIssueIdentity'), {
      value: true,
      writable: false,
      enumerable: false,
      configurable: false,
    });
  }
  if (format === 'esm') OBJECT_PREVENT_EXTENSIONS(value);
  return value;
}

function runNamespacePolicySelfTest() {
  const expected = ['safe'];
  const esmBaselineAccepted = namespaceReceipt(syntheticNamespace('esm'), expected, 'esm').exact;
  const cjsBaselineAccepted = namespaceReceipt(syntheticNamespace('cjs'), expected, 'cjs').exact;
  const proxy = new Proxy(syntheticNamespace('cjs'), {
    ownKeys() {
      throw new Error('namespace policy touched a rejected Proxy');
    },
  });
  const proxyReceipt = namespaceReceipt(proxy, expected, 'cjs');
  const proxyRejectedBeforeIntrospection =
    proxyReceipt.proxyDetected && !proxyReceipt.introspectionAttempted && !proxyReceipt.exact;
  const hiddenReceipt = namespaceReceipt(
    syntheticNamespace('cjs', { hidden: true }),
    expected,
    'cjs'
  );
  const hiddenPropertyRejected = !hiddenReceipt.exact;
  const straySymbolReceipt = namespaceReceipt(
    syntheticNamespace('cjs', { straySymbol: true }),
    expected,
    'cjs'
  );
  const straySymbolRejected = !straySymbolReceipt.exact;
  const syntheticPrototype = {};
  const syntheticPrototypeSnapshot = capturePrototypeSurface(syntheticPrototype);
  OBJECT_DEFINE_PROPERTY(syntheticPrototype, 'unsafeIssueIdentity', {
    value: () => true,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  const inheritedPrototypeReceipt = verifyPrototypeSurface(
    syntheticPrototype,
    syntheticPrototypeSnapshot
  );
  const inheritedPrototypePollutionRejected = !inheritedPrototypeReceipt.verified;
  return {
    esmBaselineAccepted,
    cjsBaselineAccepted,
    proxyRejectedBeforeIntrospection,
    hiddenPropertyRejected,
    straySymbolRejected,
    inheritedPrototypePollutionRejected,
    generatedImplementationCountAtCheck: 0,
    negativeCases: {
      proxy: {
        rejected: proxyRejectedBeforeIntrospection,
        proxyDetected: proxyReceipt.proxyDetected,
        introspectionAttempted: proxyReceipt.introspectionAttempted,
      },
      hiddenNonEnumerable: {
        rejected: hiddenPropertyRejected,
        ownStringKeys: hiddenReceipt.ownStringKeys,
        ownStringKeysExact: hiddenReceipt.ownStringKeysExact,
      },
      straySymbol: {
        rejected: straySymbolRejected,
        ownSymbolKeys: straySymbolReceipt.ownSymbolKeys,
        ownSymbolKeysExact: straySymbolReceipt.ownSymbolKeysExact,
      },
      inheritedPrototypePollution: {
        rejected: inheritedPrototypePollutionRejected,
        identityVerified: inheritedPrototypeReceipt.identityVerified,
        expectedOwnKeysSha256: inheritedPrototypeReceipt.expected.ownKeysSha256,
        actualOwnKeysSha256: inheritedPrototypeReceipt.actual.ownKeysSha256,
      },
    },
    passed:
      esmBaselineAccepted &&
      cjsBaselineAccepted &&
      proxyRejectedBeforeIntrospection &&
      hiddenPropertyRejected &&
      straySymbolRejected &&
      inheritedPrototypePollutionRejected,
  };
}

function prototypeSurfaceReceipt(value) {
  const ownKeys = REFLECT_OWN_KEYS(value);
  const ownStringKeys = [];
  const ownSymbols = [];
  for (const key of ownKeys) {
    if (typeof key === 'string') ownStringKeys[ownStringKeys.length] = key;
    else if (typeof key === 'symbol') ownSymbols[ownSymbols.length] = key;
  }
  REFLECT_APPLY(ARRAY_SORT, ownStringKeys, [stringCompare]);
  const ownSymbolKeys = [];
  for (const key of ownSymbols) ownSymbolKeys[ownSymbolKeys.length] = symbolKeyLabel(key);
  REFLECT_APPLY(ARRAY_SORT, ownSymbolKeys, [stringCompare]);
  const descriptorRows = [];
  for (const key of ownStringKeys) {
    descriptorRows[descriptorRows.length] = descriptorReceipt(
      key,
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key)
    );
  }
  const symbolDescriptorRows = [];
  for (const key of ownSymbols) {
    symbolDescriptorRows[symbolDescriptorRows.length] = descriptorReceipt(
      key,
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key)
    );
  }
  REFLECT_APPLY(ARRAY_SORT, symbolDescriptorRows, [
    (left, right) => stringCompare(left.key, right.key),
  ]);
  for (const row of symbolDescriptorRows) descriptorRows[descriptorRows.length] = row;
  return {
    ownStringKeys,
    ownSymbolKeys,
    ownKeysSha256: sha256Text(
      intrinsicJsonStringify({ strings: ownStringKeys, symbols: ownSymbolKeys })
    ),
    descriptorRows,
    descriptorSha256: sha256Text(intrinsicJsonStringify(descriptorRows)),
    prototype: OBJECT_GET_PROTOTYPE_OF(value) === null ? 'null' : 'non-null',
  };
}

function capturePrototypeSurface(value) {
  const keys = REFLECT_OWN_KEYS(value);
  const descriptors = [];
  for (const key of keys) {
    descriptors[descriptors.length] = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
  }
  return {
    keys,
    descriptors,
    prototype: OBJECT_GET_PROTOTYPE_OF(value),
    receipt: prototypeSurfaceReceipt(value),
  };
}

function exactDescriptorIdentity(left, right) {
  if (
    left === undefined ||
    right === undefined ||
    left.enumerable !== right.enumerable ||
    left.configurable !== right.configurable
  ) {
    return false;
  }
  const leftData = OBJECT_HAS_OWN(left, 'value');
  const rightData = OBJECT_HAS_OWN(right, 'value');
  if (leftData !== rightData) return false;
  return leftData
    ? left.writable === right.writable && OBJECT_IS(left.value, right.value)
    : OBJECT_IS(left.get, right.get) && OBJECT_IS(left.set, right.set);
}

function verifyPrototypeSurface(value, snapshot) {
  const actualKeys = REFLECT_OWN_KEYS(value);
  let identityVerified =
    actualKeys.length === snapshot.keys.length &&
    OBJECT_GET_PROTOTYPE_OF(value) === snapshot.prototype;
  if (identityVerified) {
    for (let index = 0; index < actualKeys.length; index += 1) {
      const key = actualKeys[index];
      if (
        !OBJECT_IS(key, snapshot.keys[index]) ||
        !exactDescriptorIdentity(
          OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key),
          snapshot.descriptors[index]
        )
      ) {
        identityVerified = false;
        break;
      }
    }
  }
  const actual = prototypeSurfaceReceipt(value);
  return {
    expected: snapshot.receipt,
    actual,
    identityVerified,
    verified:
      identityVerified &&
      actual.ownKeysSha256 === snapshot.receipt.ownKeysSha256 &&
      actual.descriptorSha256 === snapshot.receipt.descriptorSha256,
  };
}

const PRISTINE_OBJECT_PROTOTYPE_SNAPSHOT = capturePrototypeSurface(PRISTINE_OBJECT_PROTOTYPE);
const PRISTINE_ARRAY_PROTOTYPE_SNAPSHOT = capturePrototypeSurface(PRISTINE_ARRAY_PROTOTYPE);
const NAMESPACE_POLICY_SELF_TEST = runNamespacePolicySelfTest();

function captureFileAnchors(specifications) {
  const files = {};
  let verified = true;
  for (const [name, specification] of Object.entries(specifications)) {
    let actualSha256 = null;
    let regular = false;
    try {
      regular = regularNonLinkFile(specification.path);
      if (regular) actualSha256 = sha256File(specification.path);
    } catch {
      regular = false;
      actualSha256 = null;
    }
    const entryVerified = regular && actualSha256 === specification.expectedSha256;
    files[name] = {
      path: specification.label,
      expectedSha256: specification.expectedSha256,
      actualSha256,
      regularNonLink: regular,
      verified: entryVerified,
    };
    verified = verified && entryVerified;
  }
  return { files, verified };
}

function executionPhaseReceipt(state, before, after) {
  return {
    state,
    before,
    after,
    verified: before.verified && after.verified,
  };
}

function runToolCustodyPolicySelfTest() {
  const expected = 'sha256:' + 'a'.repeat(64);
  const drifted = 'sha256:' + 'b'.repeat(64);
  const names = [
    'source',
    'sha256Sums',
    'releaseManifest',
    'compiler',
    'linker',
    'compilerSnapshot',
  ];
  const anchor = (driftedName = null) => {
    const files = {};
    let verified = true;
    for (const name of names) {
      const actualSha256 = name === driftedName ? drifted : expected;
      const entryVerified = actualSha256 === expected;
      files[name] = {
        expectedSha256: expected,
        actualSha256,
        regularNonLink: true,
        verified: entryVerified,
      };
      verified = verified && entryVerified;
    }
    return { files, verified };
  };
  const baseline = executionPhaseReceipt('baseline', anchor(), anchor()).verified;
  const compilerBeforeDriftRejected = !executionPhaseReceipt(
    'compiler-before-drift',
    anchor('compiler'),
    anchor()
  ).verified;
  const linkerAfterDriftRejected = !executionPhaseReceipt(
    'linker-after-drift',
    anchor(),
    anchor('linker')
  ).verified;
  const snapshotAfterDriftRejected = !executionPhaseReceipt(
    'snapshot-after-drift',
    anchor(),
    anchor('compilerSnapshot')
  ).verified;
  const sourceBeforeDriftRejected = !executionPhaseReceipt(
    'source-before-drift',
    anchor('source'),
    anchor()
  ).verified;
  return {
    baselineAccepted: baseline,
    compilerBeforeSpawnDriftRejected: compilerBeforeDriftRejected,
    linkerAfterSpawnDriftRejected: linkerAfterDriftRejected,
    snapshotAfterSpawnDriftRejected: snapshotAfterDriftRejected,
    sourceBeforeSpawnDriftRejected: sourceBeforeDriftRejected,
    generatedImplementationCountAtCheck: 0,
    passed:
      baseline &&
      compilerBeforeDriftRejected &&
      linkerAfterDriftRejected &&
      snapshotAfterDriftRejected &&
      sourceBeforeDriftRejected,
  };
}

const TOOL_CUSTODY_POLICY_SELF_TEST = runToolCustodyPolicySelfTest();

const MODULE_PROBE_SOURCE = String.raw`import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { types as utilTypes } from 'node:util';

const SCHEMA = 'holokey.repository-identity-module-probe.v1';
const GLOBAL_THIS = globalThis;
const REFLECT_OBJECT = Reflect;
const OBJECT_CONSTRUCTOR = Object;
const ARRAY_CONSTRUCTOR = Array;
const FUNCTION_CONSTRUCTOR = Function;
const JSON_OBJECT = JSON;
const NUMBER_CONSTRUCTOR = Number;
const SET_CONSTRUCTOR = Set;
const SYMBOL_CONSTRUCTOR = Symbol;
const STRING_CONSTRUCTOR = String;
const ERROR_CONSTRUCTOR = Error;
const UTIL_TYPES_OBJECT = utilTypes;
const PRISTINE_OBJECT_PROTOTYPE = OBJECT_CONSTRUCTOR.prototype;
const PRISTINE_ARRAY_PROTOTYPE = ARRAY_CONSTRUCTOR.prototype;
const PRISTINE_FUNCTION_PROTOTYPE = FUNCTION_CONSTRUCTOR.prototype;
const PRISTINE_SET_PROTOTYPE = SET_CONSTRUCTOR.prototype;
const PRISTINE_SYMBOL_PROTOTYPE = SYMBOL_CONSTRUCTOR.prototype;
const PRISTINE_STRING_PROTOTYPE = STRING_CONSTRUCTOR.prototype;
const REFLECT_APPLY = REFLECT_OBJECT.apply;
const REFLECT_OWN_KEYS = REFLECT_OBJECT.ownKeys;
const OBJECT_CREATE = OBJECT_CONSTRUCTOR.create;
const OBJECT_DEFINE_PROPERTY = OBJECT_CONSTRUCTOR.defineProperty;
const OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = OBJECT_CONSTRUCTOR.getOwnPropertyDescriptor;
const OBJECT_GET_PROTOTYPE_OF = OBJECT_CONSTRUCTOR.getPrototypeOf;
const OBJECT_HAS_OWN = OBJECT_CONSTRUCTOR.hasOwn;
const OBJECT_IS = OBJECT_CONSTRUCTOR.is;
const OBJECT_IS_EXTENSIBLE = OBJECT_CONSTRUCTOR.isExtensible;
const OBJECT_SET_PROTOTYPE_OF = OBJECT_CONSTRUCTOR.setPrototypeOf;
const ARRAY_IS_ARRAY = ARRAY_CONSTRUCTOR.isArray;
const ARRAY_SORT = PRISTINE_ARRAY_PROTOTYPE.sort;
const NUMBER_IS_FINITE = NUMBER_CONSTRUCTOR.isFinite;
const FUNCTION_CALL = PRISTINE_FUNCTION_PROTOTYPE.call;
const JSON_STRINGIFY = JSON_OBJECT.stringify;
const SET_ADD = PRISTINE_SET_PROTOTYPE.add;
const SET_HAS = PRISTINE_SET_PROTOTYPE.has;
const SYMBOL_TO_STRING_TAG = SYMBOL_CONSTRUCTOR.toStringTag;
const SYMBOL_KEY_FOR = SYMBOL_CONSTRUCTOR.keyFor;
const SYMBOL_DESCRIPTION_GETTER = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(
  PRISTINE_SYMBOL_PROTOTYPE,
  'description'
).get;
const STRING_INDEX_OF = PRISTINE_STRING_PROTOTYPE.indexOf;
const IS_PROXY = UTIL_TYPES_OBJECT.isProxy;
const WRITE_FILE_SYNC = writeFileSync;
const READ_FILE_SYNC = readFileSync;
const PATH_TO_FILE_URL = pathToFileURL;

function requiredDescriptor(owner, key) {
  const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(owner, key);
  if (descriptor === undefined) {
    throw new ERROR_CONSTRUCTOR('module probe intrinsic descriptor is unavailable');
  }
  return descriptor;
}

const INTRINSIC_DESCRIPTOR_SNAPSHOTS = {
  globalReflect: requiredDescriptor(GLOBAL_THIS, 'Reflect'),
  globalObject: requiredDescriptor(GLOBAL_THIS, 'Object'),
  globalArray: requiredDescriptor(GLOBAL_THIS, 'Array'),
  globalFunction: requiredDescriptor(GLOBAL_THIS, 'Function'),
  globalJson: requiredDescriptor(GLOBAL_THIS, 'JSON'),
  globalNumber: requiredDescriptor(GLOBAL_THIS, 'Number'),
  globalSet: requiredDescriptor(GLOBAL_THIS, 'Set'),
  globalSymbol: requiredDescriptor(GLOBAL_THIS, 'Symbol'),
  globalString: requiredDescriptor(GLOBAL_THIS, 'String'),
  globalError: requiredDescriptor(GLOBAL_THIS, 'Error'),
  reflectApply: requiredDescriptor(REFLECT_OBJECT, 'apply'),
  reflectOwnKeys: requiredDescriptor(REFLECT_OBJECT, 'ownKeys'),
  objectCreate: requiredDescriptor(OBJECT_CONSTRUCTOR, 'create'),
  objectDefineProperty: requiredDescriptor(OBJECT_CONSTRUCTOR, 'defineProperty'),
  objectGetOwnPropertyDescriptor: requiredDescriptor(
    OBJECT_CONSTRUCTOR,
    'getOwnPropertyDescriptor'
  ),
  objectGetPrototypeOf: requiredDescriptor(OBJECT_CONSTRUCTOR, 'getPrototypeOf'),
  objectHasOwn: requiredDescriptor(OBJECT_CONSTRUCTOR, 'hasOwn'),
  objectIs: requiredDescriptor(OBJECT_CONSTRUCTOR, 'is'),
  objectIsExtensible: requiredDescriptor(OBJECT_CONSTRUCTOR, 'isExtensible'),
  objectSetPrototypeOf: requiredDescriptor(OBJECT_CONSTRUCTOR, 'setPrototypeOf'),
  objectPrototypeBinding: requiredDescriptor(OBJECT_CONSTRUCTOR, 'prototype'),
  arrayIsArray: requiredDescriptor(ARRAY_CONSTRUCTOR, 'isArray'),
  arrayPrototypeBinding: requiredDescriptor(ARRAY_CONSTRUCTOR, 'prototype'),
  arraySort: requiredDescriptor(PRISTINE_ARRAY_PROTOTYPE, 'sort'),
  functionPrototypeBinding: requiredDescriptor(FUNCTION_CONSTRUCTOR, 'prototype'),
  functionCall: requiredDescriptor(PRISTINE_FUNCTION_PROTOTYPE, 'call'),
  jsonStringify: requiredDescriptor(JSON_OBJECT, 'stringify'),
  numberIsFinite: requiredDescriptor(NUMBER_CONSTRUCTOR, 'isFinite'),
  setPrototypeBinding: requiredDescriptor(SET_CONSTRUCTOR, 'prototype'),
  setAdd: requiredDescriptor(PRISTINE_SET_PROTOTYPE, 'add'),
  setHas: requiredDescriptor(PRISTINE_SET_PROTOTYPE, 'has'),
  symbolPrototypeBinding: requiredDescriptor(SYMBOL_CONSTRUCTOR, 'prototype'),
  symbolToStringTag: requiredDescriptor(SYMBOL_CONSTRUCTOR, 'toStringTag'),
  symbolKeyFor: requiredDescriptor(SYMBOL_CONSTRUCTOR, 'keyFor'),
  symbolDescription: requiredDescriptor(PRISTINE_SYMBOL_PROTOTYPE, 'description'),
  stringPrototypeBinding: requiredDescriptor(STRING_CONSTRUCTOR, 'prototype'),
  stringIndexOf: requiredDescriptor(PRISTINE_STRING_PROTOTYPE, 'indexOf'),
  isProxy: requiredDescriptor(UTIL_TYPES_OBJECT, 'isProxy'),
};
const challengeInput = READ_FILE_SYNC(0, 'utf8');
if (!/^[a-f0-9]{64}\n$/u.test(challengeInput)) {
  throw new ERROR_CONSTRUCTOR('module probe requires one 256-bit stdin challenge');
}
const RECEIPT_CHALLENGE = challengeInput.slice(0, -1);

function compareStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortRows(rows, compare) {
  REFLECT_APPLY(ARRAY_SORT, rows, [compare]);
  return rows;
}

function json(value) {
  return REFLECT_APPLY(JSON_STRINGIFY, JSON_OBJECT, [value]);
}

function hardenForJson(value, depth = 0) {
  if (depth > 32) {
    throw new ERROR_CONSTRUCTOR('module probe receipt exceeds serialization depth');
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && REFLECT_APPLY(NUMBER_IS_FINITE, undefined, [value]))
  ) {
    return value;
  }
  if (ARRAY_IS_ARRAY(value)) {
    const output = [];
    OBJECT_SET_PROTOTYPE_OF(output, null);
    for (let index = 0; index < value.length; index += 1) {
      const indexKey = REFLECT_APPLY(STRING_CONSTRUCTOR, undefined, [index]);
      const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, indexKey);
      if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) {
        throw new ERROR_CONSTRUCTOR('module probe receipt array contains a hole or accessor');
      }
      output[index] = hardenForJson(descriptor.value, depth + 1);
    }
    return output;
  }
  if (typeof value === 'object') {
    const output = OBJECT_CREATE(null);
    const keys = REFLECT_OWN_KEYS(value);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== 'string') {
        throw new ERROR_CONSTRUCTOR('module probe receipt object contains a symbol key');
      }
      const descriptor = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key);
      if (!descriptor || !OBJECT_HAS_OWN(descriptor, 'value')) {
        throw new ERROR_CONSTRUCTOR('module probe receipt object contains an accessor');
      }
      OBJECT_DEFINE_PROPERTY(output, key, {
        value: hardenForJson(descriptor.value, depth + 1),
        writable: false,
        enumerable: true,
        configurable: false,
      });
    }
    return output;
  }
  throw new ERROR_CONSTRUCTOR('module probe receipt contains a non-JSON value');
}

function symbolLabel(key) {
  if (key === SYMBOL_TO_STRING_TAG) return 'Symbol.toStringTag';
  const globalKey = REFLECT_APPLY(SYMBOL_KEY_FOR, SYMBOL_CONSTRUCTOR, [key]);
  const description = REFLECT_APPLY(SYMBOL_DESCRIPTION_GETTER, key, []);
  return globalKey === undefined
    ? 'Symbol(' + json(description === undefined ? '' : description) + ')'
    : 'Symbol.for(' + json(globalKey) + ')';
}

function descriptorRow(key, descriptor) {
  const data = descriptor !== undefined && OBJECT_HAS_OWN(descriptor, 'value');
  const meta = key === '__esModule' || key === SYMBOL_TO_STRING_TAG;
  return {
    keyType: typeof key,
    key: typeof key === 'symbol' ? symbolLabel(key) : key,
    kind: data ? 'data' : 'accessor',
    enumerable: descriptor?.enumerable === true,
    configurable: descriptor?.configurable === true,
    writable: data ? descriptor.writable === true : null,
    getter: data ? false : typeof descriptor?.get === 'function',
    setter: data ? false : typeof descriptor?.set === 'function',
    valueType: data ? typeof descriptor.value : null,
    metaValue: meta ? descriptor?.value ?? null : null,
  };
}

function surfaceReceipt(value) {
  const ownKeys = REFLECT_OWN_KEYS(value);
  const strings = [];
  const symbols = [];
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index];
    if (typeof key === 'string') strings[strings.length] = key;
    else if (typeof key === 'symbol') symbols[symbols.length] = key;
  }
  sortRows(strings, compareStrings);
  const symbolLabels = [];
  for (let index = 0; index < symbols.length; index += 1) {
    symbolLabels[symbolLabels.length] = symbolLabel(symbols[index]);
  }
  sortRows(symbolLabels, compareStrings);
  const descriptors = [];
  for (let index = 0; index < strings.length; index += 1) {
    const key = strings[index];
    descriptors[descriptors.length] = descriptorRow(
      key,
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key)
    );
  }
  const symbolDescriptors = [];
  for (let index = 0; index < symbols.length; index += 1) {
    const key = symbols[index];
    symbolDescriptors[symbolDescriptors.length] = descriptorRow(
      key,
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, key)
    );
  }
  sortRows(symbolDescriptors, (left, right) => compareStrings(left.key, right.key));
  for (let index = 0; index < symbolDescriptors.length; index += 1) {
    descriptors[descriptors.length] = symbolDescriptors[index];
  }
  return {
    ownStringKeys: strings,
    ownSymbolKeys: symbolLabels,
    descriptorRows: descriptors,
    prototype: OBJECT_GET_PROTOTYPE_OF(value) === null ? 'null' : 'non-null',
  };
}

function captureSurface(value) {
  const keys = REFLECT_OWN_KEYS(value);
  const descriptors = [];
  for (let index = 0; index < keys.length; index += 1) {
    descriptors[descriptors.length] = OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, keys[index]);
  }
  return { keys, descriptors, prototype: OBJECT_GET_PROTOTYPE_OF(value), receipt: surfaceReceipt(value) };
}

function exactDescriptorIdentity(left, right) {
  if (
    left === undefined ||
    right === undefined ||
    left.enumerable !== right.enumerable ||
    left.configurable !== right.configurable
  ) return false;
  const leftData = OBJECT_HAS_OWN(left, 'value');
  const rightData = OBJECT_HAS_OWN(right, 'value');
  if (leftData !== rightData) return false;
  return leftData
    ? left.writable === right.writable && OBJECT_IS(left.value, right.value)
    : OBJECT_IS(left.get, right.get) && OBJECT_IS(left.set, right.set);
}

function verifySurface(value, snapshot) {
  const actualKeys = REFLECT_OWN_KEYS(value);
  let identityVerified =
    actualKeys.length === snapshot.keys.length &&
    OBJECT_GET_PROTOTYPE_OF(value) === snapshot.prototype;
  if (identityVerified) {
    for (let index = 0; index < actualKeys.length; index += 1) {
      if (
        !OBJECT_IS(actualKeys[index], snapshot.keys[index]) ||
        !exactDescriptorIdentity(
          OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, actualKeys[index]),
          snapshot.descriptors[index]
        )
      ) {
        identityVerified = false;
        break;
      }
    }
  }
  return { expected: snapshot.receipt, actual: surfaceReceipt(value), identityVerified };
}

function intrinsicCustody() {
  return {
    globalReflect: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'Reflect'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalReflect
    ),
    globalObject: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'Object'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalObject
    ),
    globalArray: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'Array'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalArray
    ),
    globalFunction: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'Function'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalFunction
    ),
    jsonObject: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'JSON'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalJson
    ),
    globalNumber: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'Number'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalNumber
    ),
    setConstructor: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'Set'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalSet
    ),
    globalSymbol: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'Symbol'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalSymbol
    ),
    globalString: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'String'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalString
    ),
    globalError: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(GLOBAL_THIS, 'Error'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalError
    ),
    reflectApply: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(REFLECT_OBJECT, 'apply'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.reflectApply
    ),
    reflectOwnKeys: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(REFLECT_OBJECT, 'ownKeys'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.reflectOwnKeys
    ),
    objectCreate: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'create'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectCreate
    ),
    objectDefineProperty: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'defineProperty'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectDefineProperty
    ),
    objectGetOwnPropertyDescriptor: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'getOwnPropertyDescriptor'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectGetOwnPropertyDescriptor
    ),
    objectGetPrototypeOf: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'getPrototypeOf'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectGetPrototypeOf
    ),
    objectHasOwn: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'hasOwn'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectHasOwn
    ),
    objectIs: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'is'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectIs
    ),
    objectIsExtensible: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'isExtensible'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectIsExtensible
    ),
    objectSetPrototypeOf: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'setPrototypeOf'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectSetPrototypeOf
    ),
    objectPrototypeBinding: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(OBJECT_CONSTRUCTOR, 'prototype'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.objectPrototypeBinding
    ),
    arrayIsArray: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(ARRAY_CONSTRUCTOR, 'isArray'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.arrayIsArray
    ),
    arrayPrototypeBinding: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(ARRAY_CONSTRUCTOR, 'prototype'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.arrayPrototypeBinding
    ),
    arraySort: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PRISTINE_ARRAY_PROTOTYPE, 'sort'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.arraySort
    ),
    functionPrototypeBinding: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(FUNCTION_CONSTRUCTOR, 'prototype'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.functionPrototypeBinding
    ),
    functionCall: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PRISTINE_FUNCTION_PROTOTYPE, 'call'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.functionCall
    ),
    jsonStringify: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(JSON_OBJECT, 'stringify'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.jsonStringify
    ),
    numberIsFinite: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(NUMBER_CONSTRUCTOR, 'isFinite'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.numberIsFinite
    ),
    setPrototypeBinding: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(SET_CONSTRUCTOR, 'prototype'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.setPrototypeBinding
    ),
    setAdd: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PRISTINE_SET_PROTOTYPE, 'add'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.setAdd
    ),
    setHas: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PRISTINE_SET_PROTOTYPE, 'has'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.setHas
    ),
    symbolPrototypeBinding: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(SYMBOL_CONSTRUCTOR, 'prototype'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.symbolPrototypeBinding
    ),
    symbolToStringTag: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(SYMBOL_CONSTRUCTOR, 'toStringTag'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.symbolToStringTag
    ),
    symbolKeyFor: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(SYMBOL_CONSTRUCTOR, 'keyFor'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.symbolKeyFor
    ),
    symbolDescription: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PRISTINE_SYMBOL_PROTOTYPE, 'description'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.symbolDescription
    ),
    stringPrototypeBinding: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(STRING_CONSTRUCTOR, 'prototype'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.stringPrototypeBinding
    ),
    stringIndexOf: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(PRISTINE_STRING_PROTOTYPE, 'indexOf'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.stringIndexOf
    ),
    isProxy: exactDescriptorIdentity(
      OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(UTIL_TYPES_OBJECT, 'isProxy'),
      INTRINSIC_DESCRIPTOR_SNAPSHOTS.isProxy
    ),
  };
}

function namespaceReceipt(value) {
  const proxyDetected = IS_PROXY(value);
  if (proxyDetected || value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return {
      proxyDetected,
      introspectionAttempted: false,
      ownStringKeys: [],
      ownSymbolKeys: [],
      descriptorRows: [],
      prototype: null,
      extensible: null,
    };
  }
  const receipt = surfaceReceipt(value);
  const prototype = OBJECT_GET_PROTOTYPE_OF(value);
  return {
    proxyDetected: false,
    introspectionAttempted: true,
    ownStringKeys: receipt.ownStringKeys,
    ownSymbolKeys: receipt.ownSymbolKeys,
    descriptorRows: receipt.descriptorRows,
    prototype:
      prototype === null
        ? 'null'
        : prototype === PRISTINE_OBJECT_PROTOTYPE
          ? 'pristine-Object.prototype'
          : 'other',
    extensible: OBJECT_IS_EXTENSIBLE(value),
  };
}

function crossProjectionRejected(project, value) {
  try {
    project(value);
    return false;
  } catch (error) {
    const message = error && typeof error === 'object' ? error.message : '';
    return (
      error &&
      typeof error === 'object' &&
      error.code === 'INVALID_CAPABILITY' &&
      REFLECT_APPLY(
        STRING_INDEX_OF,
        REFLECT_APPLY(STRING_CONSTRUCTOR, undefined, [message ?? '']),
        ['same-module HoloKey contract result']
      ) >= 0
    );
  }
}

const objectSnapshot = captureSurface(PRISTINE_OBJECT_PROTOTYPE);
const arraySnapshot = captureSurface(PRISTINE_ARRAY_PROTOTYPE);
const authorityEsmPath = process.argv[2];
const authorityCjsPath = process.argv[3];
const rootEsmPath = process.argv[4];
const rootCjsPath = process.argv[5];
const mode = process.argv[6];
if (!authorityEsmPath || !authorityCjsPath || !rootEsmPath || !rootCjsPath) {
  throw new ERROR_CONSTRUCTOR('module probe requires four absolute package entry paths');
}

const require = createRequire(import.meta.url);
const resolvedAuthorityCjsPath = require.resolve(authorityCjsPath);
const resolvedRootCjsPath = require.resolve(rootCjsPath);
const authorityEsmUrl = PATH_TO_FILE_URL(authorityEsmPath).href + '?holokey-gate=authority';
const rootEsmUrl = PATH_TO_FILE_URL(rootEsmPath).href + '?holokey-gate=root';
delete require.cache[resolvedAuthorityCjsPath];
delete require.cache[resolvedRootCjsPath];
const esmAuthority = await import(authorityEsmUrl);
const esmRoot = await import(rootEsmUrl);
const cjsAuthority = require(resolvedAuthorityCjsPath);
const cjsRoot = require(resolvedRootCjsPath);

const afterImportIntrinsicCustody = intrinsicCustody();
const afterImportObjectPrototypeCustody = verifySurface(
  PRISTINE_OBJECT_PROTOTYPE,
  objectSnapshot
);
const afterImportArrayPrototypeCustody = verifySurface(
  PRISTINE_ARRAY_PROTOTYPE,
  arraySnapshot
);
const afterImports = {
  objectPrototype: afterImportObjectPrototypeCustody,
  arrayPrototype: afterImportArrayPrototypeCustody,
  intrinsics: afterImportIntrinsicCustody,
};

const fixedClock = { now: () => '2026-08-02T00:00:00.000Z' };
const provisionalInput = {
  repository: {
    repoId: 'gate/repository-identity',
    source: 'https://example.invalid/gate/repository-identity.git',
    canonicalRef: 'main',
  },
  custody: {
    mode: 'caller-owned',
    bootstrapKeyRef: 'holokey:gate-bootstrap',
    recoveryKeyRefs: ['holokey:gate-recovery-a'],
    recoveryThreshold: 1,
  },
  soulRef: {
    schema: 'holorepo.repository-soul.v1',
    soulHash: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    sourceDigest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  },
};
const esmIdentity = esmAuthority.buildProvisionalRepositoryIdentity(provisionalInput, {
  clock: fixedClock,
});
const cjsIdentity = cjsAuthority.buildProvisionalRepositoryIdentity(provisionalInput, {
  clock: fixedClock,
});
const esmProjection = esmAuthority.projectLegacyRepositoryIdentity(esmIdentity);
const cjsProjection = cjsAuthority.projectLegacyRepositoryIdentity(cjsIdentity);
const esmAuthorityNamespace = namespaceReceipt(esmAuthority);
const cjsAuthorityNamespace = namespaceReceipt(cjsAuthority);
const esmRootNamespace = namespaceReceipt(esmRoot);
const cjsRootNamespace = namespaceReceipt(cjsRoot);
const authorityKeys = new SET_CONSTRUCTOR();
const authorityOwnStringKeys = esmAuthorityNamespace.ownStringKeys;
for (let index = 0; index < authorityOwnStringKeys.length; index += 1) {
  REFLECT_APPLY(SET_ADD, authorityKeys, [authorityOwnStringKeys[index]]);
}
const esmRootIntersection = [];
const esmRootOwnStringKeys = esmRootNamespace.ownStringKeys;
for (let index = 0; index < esmRootOwnStringKeys.length; index += 1) {
  const key = esmRootOwnStringKeys[index];
  if (REFLECT_APPLY(SET_HAS, authorityKeys, [key])) esmRootIntersection[esmRootIntersection.length] = key;
}
const cjsRootIntersection = [];
const cjsRootOwnStringKeys = cjsRootNamespace.ownStringKeys;
for (let index = 0; index < cjsRootOwnStringKeys.length; index += 1) {
  const key = cjsRootOwnStringKeys[index];
  if (REFLECT_APPLY(SET_HAS, authorityKeys, [key])) cjsRootIntersection[cjsRootIntersection.length] = key;
}

let esmProjectionForReceipt = esmProjection;
if (mode === 'poison-late-projection-getter') {
  const latePoisonProjection = OBJECT_CREATE(null);
  const authorityBoundary = esmProjection.authorityBoundary;
  OBJECT_DEFINE_PROPERTY(latePoisonProjection, 'ok', {
    get() {
      OBJECT_DEFINE_PROPERTY(PRISTINE_OBJECT_PROTOTYPE, '__holokey_late_projection_poison__', {
        value: true,
        writable: false,
        enumerable: false,
        configurable: true,
      });
      return true;
    },
    enumerable: true,
    configurable: false,
  });
  OBJECT_DEFINE_PROPERTY(latePoisonProjection, 'authorityBoundary', {
    value: authorityBoundary,
    writable: false,
    enumerable: true,
    configurable: false,
  });
  esmProjectionForReceipt = latePoisonProjection;
}

const dedicatedContractCallable =
  typeof esmAuthority.buildProvisionalRepositoryIdentity === 'function' &&
  typeof cjsAuthority.buildProvisionalRepositoryIdentity === 'function' &&
  typeof esmAuthority.projectLegacyRepositoryIdentity === 'function' &&
  typeof cjsAuthority.projectLegacyRepositoryIdentity === 'function' &&
  typeof esmAuthority.repositoryIdentityNativeTransitionTableMask === 'function' &&
  typeof cjsAuthority.repositoryIdentityNativeTransitionTableMask === 'function';
const esmSelfProjection = esmProjectionForReceipt.ok === true;
const cjsSelfProjection = cjsProjection.ok === true;
const crossInstanceProjectionRejected =
  crossProjectionRejected(esmAuthority.projectLegacyRepositoryIdentity, cjsIdentity) &&
  crossProjectionRejected(cjsAuthority.projectLegacyRepositoryIdentity, esmIdentity);
const authenticatedDurableReadbackClaimed =
  esmProjectionForReceipt.authorityBoundary?.authenticatedDurableReadback !== false ||
  cjsProjection.authorityBoundary?.authenticatedDurableReadback !== false;
const bootstrapTransitionTableBitmask =
  esmAuthority.repositoryIdentityNativeTransitionTableMask();

if (mode === 'poison-intrinsics-after-probes') {
  OBJECT_DEFINE_PROPERTY(REFLECT_OBJECT, 'ownKeys', {
    value: () => [],
    writable: true,
    enumerable: false,
    configurable: true,
  });
  OBJECT_DEFINE_PROPERTY(JSON_OBJECT, 'stringify', {
    value: () => 'forged',
    writable: true,
    enumerable: false,
    configurable: true,
  });
  OBJECT_DEFINE_PROPERTY(GLOBAL_THIS, 'Set', {
    value: class PoisonedSet {},
    writable: true,
    enumerable: false,
    configurable: true,
  });
}

if (mode === 'poison-global-number-accessor') {
  OBJECT_DEFINE_PROPERTY(GLOBAL_THIS, 'Number', {
    get() {
      OBJECT_DEFINE_PROPERTY(PRISTINE_OBJECT_PROTOTYPE, '__holokey_number_getter_poison__', {
        value: true,
        writable: false,
        enumerable: false,
        configurable: true,
      });
      return NUMBER_CONSTRUCTOR;
    },
    set: undefined,
    enumerable: INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalNumber.enumerable,
    configurable: INTRINSIC_DESCRIPTOR_SNAPSHOTS.globalNumber.configurable,
  });
}

// Detach every candidate-derived namespace and contract value before the final
// custody snapshot. Everything after this clone operates only on trusted data.
const trustedCandidateReceiptMaterial = hardenForJson({
  namespaces: {
    esmAuthority: esmAuthorityNamespace,
    cjsAuthority: cjsAuthorityNamespace,
    esmRoot: esmRootNamespace,
    cjsRoot: cjsRootNamespace,
  },
  contract: {
    dedicatedContractCallable,
    esmSelfProjection,
    cjsSelfProjection,
    crossInstanceProjectionRejected,
    authenticatedDurableReadbackClaimed,
    bootstrapTransitionTableBitmask,
    esmRootIntersection,
    cjsRootIntersection,
  },
});

const finalIntrinsicCustody = intrinsicCustody();
const finalObjectPrototypeCustody = verifySurface(
  PRISTINE_OBJECT_PROTOTYPE,
  objectSnapshot
);
const finalArrayPrototypeCustody = verifySurface(PRISTINE_ARRAY_PROTOTYPE, arraySnapshot);
const afterCalls = {
  objectPrototype: finalObjectPrototypeCustody,
  arrayPrototype: finalArrayPrototypeCustody,
  intrinsics: finalIntrinsicCustody,
};

// The final snapshot above is the last candidate-sensitive operation. Receipt
// assembly and serialization below touch only detached, null-prototype data.
const receipt = hardenForJson({
  schema: SCHEMA,
  challenge: RECEIPT_CHALLENGE,
  namespaces: trustedCandidateReceiptMaterial.namespaces,
  contract: trustedCandidateReceiptMaterial.contract,
  custody: { afterImports, afterCalls },
});

WRITE_FILE_SYNC(1, json(receipt) + '\n', 'utf8');
`;

const EARLY_EXIT_PROBE_SOURCE = "process.exit(0);\n";
const FORGED_RECEIPT_IMPORT_SOURCE = String.raw`import { readFileSync, writeFileSync } from 'node:fs';
const stdinAfterTrustedProbeRead = readFileSync(0, 'utf8');
writeFileSync(1, JSON.stringify({
  schema: 'holokey.repository-identity-module-probe.v1',
  challenge: '0000000000000000000000000000000000000000000000000000000000000000',
  namespaces: {},
  contract: {},
  custody: {},
}) + '\n');
process.exit(stdinAfterTrustedProbeRead === '' ? 0 : 23);
`;

function parseExactSingleLineJson(stdout) {
  if (
    typeof stdout !== 'string' ||
    stdout.length < 3 ||
    Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES ||
    !/^[^\r\n]+\n$/u.test(stdout)
  ) {
    return null;
  }
  return safeJson(stdout.slice(0, -1));
}

function moduleDescriptorRowValid(row, key, format, meta = false) {
  if (
    !strictObjectKeys(row, [
      'keyType',
      'key',
      'kind',
      'enumerable',
      'configurable',
      'writable',
      'getter',
      'setter',
      'valueType',
      'metaValue',
    ]) ||
    row.key !== key
  ) {
    return false;
  }
  if (meta && format === 'esm') {
    return (
      row.keyType === 'symbol' &&
      row.kind === 'data' &&
      row.enumerable === false &&
      row.configurable === false &&
      row.writable === false &&
      row.getter === false &&
      row.setter === false &&
      row.valueType === 'string' &&
      row.metaValue === 'Module'
    );
  }
  if (meta && format === 'cjs') {
    return (
      row.keyType === 'string' &&
      row.kind === 'data' &&
      row.enumerable === false &&
      row.configurable === false &&
      row.writable === false &&
      row.getter === false &&
      row.setter === false &&
      row.valueType === 'boolean' &&
      row.metaValue === true
    );
  }
  if (
    row.keyType !== 'string' ||
    row.enumerable !== true ||
    row.configurable !== false ||
    row.setter !== false ||
    row.metaValue !== null
  ) {
    return false;
  }
  if (format === 'esm') {
    return row.kind === 'data' && row.writable === true && row.getter === false;
  }
  return (
    (row.kind === 'accessor' &&
      row.writable === null &&
      row.getter === true &&
      row.valueType === null) ||
    (row.kind === 'data' && row.writable === false && row.getter === false)
  );
}

function validateModuleNamespaceReceipt(receipt, expectedKeys, format) {
  const reviewedKeys = sortedCopy(expectedKeys, stringCompare);
  const reviewedOwnStringKeys =
    format === 'cjs' ? sortedCopy([...reviewedKeys, '__esModule'], stringCompare) : reviewedKeys;
  const reviewedOwnSymbolKeys = format === 'esm' ? ['Symbol.toStringTag'] : [];
  const expectedDescriptorKeys =
    format === 'esm'
      ? [...reviewedOwnStringKeys, 'Symbol.toStringTag']
      : reviewedOwnStringKeys;
  let exact =
    strictObjectKeys(receipt, [
      'proxyDetected',
      'introspectionAttempted',
      'ownStringKeys',
      'ownSymbolKeys',
      'descriptorRows',
      'prototype',
      'extensible',
    ]) &&
    receipt.proxyDetected === false &&
    receipt.introspectionAttempted === true &&
    Array.isArray(receipt.ownStringKeys) &&
    Array.isArray(receipt.ownSymbolKeys) &&
    Array.isArray(receipt.descriptorRows) &&
    exactJsonEqual(receipt.ownStringKeys, reviewedOwnStringKeys) &&
    exactJsonEqual(receipt.ownSymbolKeys, reviewedOwnSymbolKeys) &&
    receipt.descriptorRows.length === expectedDescriptorKeys.length &&
    receipt.prototype === (format === 'esm' ? 'null' : 'pristine-Object.prototype') &&
    receipt.extensible === (format === 'cjs');
  if (exact) {
    for (let index = 0; index < expectedDescriptorKeys.length; index += 1) {
      const key = expectedDescriptorKeys[index];
      const meta = key === '__esModule' || key === 'Symbol.toStringTag';
      if (!moduleDescriptorRowValid(receipt.descriptorRows[index], key, format, meta)) {
        exact = false;
        break;
      }
    }
  }
  const keys = [];
  if (Array.isArray(receipt?.ownStringKeys)) {
    for (const key of receipt.ownStringKeys) {
      if (key !== '__esModule') keys[keys.length] = key;
    }
  }
  return {
    exact,
    keys,
    count: keys.length,
    sha256: sha256Text(intrinsicJsonStringify(keys)),
    reviewedSha256: sha256Text(intrinsicJsonStringify(reviewedKeys)),
    ownStringKeys: Array.isArray(receipt?.ownStringKeys) ? receipt.ownStringKeys : [],
    ownSymbolKeys: Array.isArray(receipt?.ownSymbolKeys) ? receipt.ownSymbolKeys : [],
    descriptorRows: Array.isArray(receipt?.descriptorRows) ? receipt.descriptorRows : [],
    descriptorSha256: Array.isArray(receipt?.descriptorRows)
      ? sha256Text(intrinsicJsonStringify(receipt.descriptorRows))
      : null,
    prototype: receipt?.prototype ?? null,
    extensible: receipt?.extensible ?? null,
  };
}

function prototypeProbeReceiptValid(receipt, expectedSnapshot) {
  return (
    strictObjectKeys(receipt, ['expected', 'actual', 'identityVerified']) &&
    receipt.identityVerified === true &&
    strictObjectKeys(receipt.expected, [
      'ownStringKeys',
      'ownSymbolKeys',
      'descriptorRows',
      'prototype',
    ]) &&
    strictObjectKeys(receipt.actual, [
      'ownStringKeys',
      'ownSymbolKeys',
      'descriptorRows',
      'prototype',
    ]) &&
    exactJsonEqual(receipt.expected.ownStringKeys, expectedSnapshot.receipt.ownStringKeys) &&
    exactJsonEqual(receipt.expected.ownSymbolKeys, expectedSnapshot.receipt.ownSymbolKeys) &&
    exactJsonEqual(receipt.expected.descriptorRows, expectedSnapshot.receipt.descriptorRows) &&
    receipt.expected.prototype === expectedSnapshot.receipt.prototype &&
    exactJsonEqual(receipt.actual, receipt.expected)
  );
}

const EXPECTED_INTRINSIC_CUSTODY_KEYS = Object.freeze([
  'arrayIsArray',
  'arrayPrototypeBinding',
  'arraySort',
  'functionCall',
  'functionPrototypeBinding',
  'globalArray',
  'globalError',
  'globalFunction',
  'globalNumber',
  'globalObject',
  'globalReflect',
  'globalString',
  'globalSymbol',
  'isProxy',
  'jsonObject',
  'jsonStringify',
  'numberIsFinite',
  'objectCreate',
  'objectDefineProperty',
  'objectGetOwnPropertyDescriptor',
  'objectGetPrototypeOf',
  'objectHasOwn',
  'objectIs',
  'objectIsExtensible',
  'objectPrototypeBinding',
  'objectSetPrototypeOf',
  'reflectApply',
  'reflectOwnKeys',
  'setAdd',
  'setConstructor',
  'setHas',
  'setPrototypeBinding',
  'stringIndexOf',
  'stringPrototypeBinding',
  'symbolDescription',
  'symbolKeyFor',
  'symbolPrototypeBinding',
  'symbolToStringTag',
]);

function intrinsicProbeReceiptValid(receipt) {
  if (!strictObjectKeys(receipt, EXPECTED_INTRINSIC_CUSTODY_KEYS)) return false;
  for (const key of EXPECTED_INTRINSIC_CUSTODY_KEYS) {
    if (receipt[key] !== true) return false;
  }
  return true;
}

function custodyPhaseProbeReceiptValid(receipt) {
  return (
    strictObjectKeys(receipt, ['objectPrototype', 'arrayPrototype', 'intrinsics']) &&
    prototypeProbeReceiptValid(receipt.objectPrototype, PRISTINE_OBJECT_PROTOTYPE_SNAPSHOT) &&
    prototypeProbeReceiptValid(receipt.arrayPrototype, PRISTINE_ARRAY_PROTOTYPE_SNAPSHOT) &&
    intrinsicProbeReceiptValid(receipt.intrinsics)
  );
}

function validateModuleProbeReceipt(receipt, expectedChallenge) {
  const emptyResult = {
    valid: false,
    challengeVerified: false,
    namespaces: null,
    contract: null,
    custody: null,
  };
  if (
    !strictObjectKeys(receipt, ['schema', 'challenge', 'namespaces', 'contract', 'custody']) ||
    receipt.schema !== MODULE_PROBE_SCHEMA ||
    receipt.challenge !== expectedChallenge ||
    !strictObjectKeys(receipt.namespaces, [
      'esmAuthority',
      'cjsAuthority',
      'esmRoot',
      'cjsRoot',
    ]) ||
    !strictObjectKeys(receipt.contract, [
      'dedicatedContractCallable',
      'esmSelfProjection',
      'cjsSelfProjection',
      'crossInstanceProjectionRejected',
      'authenticatedDurableReadbackClaimed',
      'bootstrapTransitionTableBitmask',
      'esmRootIntersection',
      'cjsRootIntersection',
    ]) ||
    !strictObjectKeys(receipt.custody, ['afterImports', 'afterCalls'])
  ) {
    return emptyResult;
  }
  const namespaces = {
    esmAuthority: validateModuleNamespaceReceipt(
      receipt.namespaces.esmAuthority,
      EXPECTED_AUTHORITY_EXPORTS,
      'esm'
    ),
    cjsAuthority: validateModuleNamespaceReceipt(
      receipt.namespaces.cjsAuthority,
      EXPECTED_AUTHORITY_EXPORTS,
      'cjs'
    ),
    esmRoot: validateModuleNamespaceReceipt(receipt.namespaces.esmRoot, EXPECTED_ROOT_EXPORTS, 'esm'),
    cjsRoot: validateModuleNamespaceReceipt(receipt.namespaces.cjsRoot, EXPECTED_ROOT_EXPORTS, 'cjs'),
  };
  const contractValid =
    receipt.contract.dedicatedContractCallable === true &&
    receipt.contract.esmSelfProjection === true &&
    receipt.contract.cjsSelfProjection === true &&
    receipt.contract.crossInstanceProjectionRejected === true &&
    receipt.contract.authenticatedDurableReadbackClaimed === false &&
    receipt.contract.bootstrapTransitionTableBitmask === EXPECTED_TRANSITION_TABLE_BITMASK &&
    Array.isArray(receipt.contract.esmRootIntersection) &&
    receipt.contract.esmRootIntersection.length === 0 &&
    Array.isArray(receipt.contract.cjsRootIntersection) &&
    receipt.contract.cjsRootIntersection.length === 0;
  const custodyValid =
    custodyPhaseProbeReceiptValid(receipt.custody.afterImports) &&
    custodyPhaseProbeReceiptValid(receipt.custody.afterCalls);
  return {
    valid:
      namespaces.esmAuthority.exact &&
      namespaces.cjsAuthority.exact &&
      namespaces.esmRoot.exact &&
      namespaces.cjsRoot.exact &&
      namespaces.esmAuthority.sha256 === namespaces.cjsAuthority.sha256 &&
      namespaces.esmRoot.sha256 === namespaces.cjsRoot.sha256 &&
      contractValid &&
      custodyValid,
    challengeVerified: receipt.challenge === expectedChallenge,
    namespaces,
    contract: receipt.contract,
    custody: {
      afterImportsValid: custodyPhaseProbeReceiptValid(receipt.custody.afterImports),
      afterCallsValid: custodyPhaseProbeReceiptValid(receipt.custody.afterCalls),
      receipt: receipt.custody,
    },
  };
}

function childProbeExecutionReceipt(execution, expectedChallenge) {
  const stdout = execution.stdout ?? '';
  const stderr = execution.stderr ?? '';
  const parsedReceipt = parseExactSingleLineJson(stdout);
  const validation = parsedReceipt
    ? validateModuleProbeReceipt(parsedReceipt, expectedChallenge)
    : null;
  const transportVerified =
    !execution.error &&
    execution.status === 0 &&
    !execution.signal &&
    stderr === '' &&
    parsedReceipt !== null;
  return {
    status: execution.status,
    signal: execution.signal ?? null,
    error: execution.error?.code ?? null,
    stderrEmpty: stderr === '',
    stdoutBytes: Buffer.byteLength(stdout, 'utf8'),
    stdoutSha256: sha256Text(stdout),
    exactSingleJsonReceipt: parsedReceipt !== null,
    challengeSha256: sha256Text(expectedChallenge),
    challengeVerified: validation?.challengeVerified === true,
    transportVerified,
    receiptValidated: validation?.valid === true,
    accepted: transportVerified && validation?.valid === true,
    validation,
  };
}

function crossInstanceProjectionRejected(project, value) {
  try {
    project(value);
    return false;
  } catch (error) {
    return (
      error &&
      typeof error === 'object' &&
      error.code === 'INVALID_CAPABILITY' &&
      /same-module HoloKey contract result/u.test(String(error.message ?? ''))
    );
  }
}

const report = {
  schema: CHECK_SCHEMA,
  ok: false,
  publicationEligible: false,
  package: '@holoscript/secrets-broker',
  authorityContract: 'HoloKey',
  expectedTransitionTableBitmask: EXPECTED_TRANSITION_TABLE_BITMASK,
  source: {
    relativePath: 'src/repository_identity.hsplus',
    sha256: null,
    copiedSourceSha256: null,
    compilerInputBaseSha256: null,
    visibilityKeywordsRemoved: null,
  },
  compiler: {
    ownedPath: relative(repositoryRoot, compilerPath).replaceAll('\\', '/'),
    sha256: null,
    machineContracts: [],
    provenance: {
      sha256SumsPath: 'distributions/systems/SHA256SUMS',
      sha256SumsSha256: null,
      expectedSha256SumsSha256: TRUSTED_SHA256_SUMS_SHA256,
      releaseManifestPath: 'distributions/systems/release-manifest.json',
      releaseManifestSha256: null,
      releaseMachineContract: null,
      sourceCommit: null,
      compilerDigestMatches: false,
      verified: false,
    },
    linker: {
      path: linkerPath,
      sha256: null,
      expectedSha256: trustedLinker?.sha256 ?? null,
      verified: false,
    },
    environment: {
      names: [],
      expectedNameValueSha256: null,
      actualNameValueSha256: null,
      valuesRedacted: true,
      verified: false,
    },
    snapshot: {
      relativePath: null,
      sha256: null,
      verified: false,
    },
    executionPhases: [],
    nativeExecutionPhases: [],
    nativeContentBindingPhases: [],
    nativeExecutionIsolation: 'fresh-generated-executable-without-descendant-containment-claim',
    custodyPolicySelfTest: TOOL_CUSTODY_POLICY_SELF_TEST,
  },
  anchorCustody: {
    afterNativeRows: null,
    afterNativeContentBinding: null,
    beforeModuleProbe: null,
    afterEarlyExitSelfTest: null,
    beforeMissingChallengeFixture: null,
    afterMissingChallengeFixture: null,
    beforeExtraChallengeFixture: null,
    afterExtraChallengeFixture: null,
    beforeForgedReceiptFixture: null,
    afterForgedReceiptFixture: null,
    beforePrimaryProbe: null,
    afterModuleProbe: null,
    beforeIntrinsicPoisonFixture: null,
    afterIntrinsicPoisonFixture: null,
    beforeLateProjectionPoisonFixture: null,
    afterLateProjectionPoisonFixture: null,
    beforeGlobalNumberAccessorFixture: null,
    afterGlobalNumberAccessorFixture: null,
    verified: false,
  },
  generatedImplementations: [],
  nativeContentBinding: {
    schema: 'holokey.repository-identity-native-sha256-binding.v1',
    scope: 'single-sha256-block-borrowed-u8-max-55-bytes',
    fixtureUtf8: NATIVE_SHA256_FIXTURE_TEXT,
    fixtureByteLength: NATIVE_SHA256_FIXTURE_BYTES.length,
    fixtureSha256: null,
    expectedDigestHex: NATIVE_SHA256_EXPECTED_HEX,
    actualDigestHex: null,
    machineContract: null,
    implementations: [],
    passed: false,
  },
  equivalence: {
    scope: 'complete-15-cell-state-action-transition-table',
    expectedRowMasks: EXPECTED_ROW_MASKS,
    nativeRowMasks: [],
    nativeTransitionTableBitmask: null,
    bootstrapTransitionTableBitmask: null,
    matchesReviewedExpected: false,
  },
  moduleBoundary: {
    manifestDedicatedSubpath: false,
    namespacePolicySelfTest: NAMESPACE_POLICY_SELF_TEST,
    objectPrototypeCustody: {
      expected: PRISTINE_OBJECT_PROTOTYPE_SNAPSHOT.receipt,
      actual: null,
      identityVerified: false,
      verified: false,
    },
    probe: {
      isolation: 'fresh-child-process-without-containment-claim',
      challengeTransport: '256-bit-random-stdin-consumed-before-candidate-import',
      receiptSerialization: 'captured-json-stringify-over-deep-null-prototype-data-clone',
      nodePath: process.execPath,
      nodeSha256: null,
      scriptRelativePath: null,
      scriptSha256: null,
      primary: null,
      earlyExitSelfTest: null,
      missingChallengeSelfTest: null,
      extraChallengeSelfTest: null,
      forgedReceiptSelfTest: null,
      wrongChallengeMutationSelfTest: null,
      intrinsicPoisonSelfTest: null,
      lateProjectionPoisonSelfTest: null,
      globalNumberAccessorSelfTest: null,
      passed: false,
    },
    esmAuthority: emptyNamespaceReceipt(EXPECTED_AUTHORITY_EXPORTS, 'esm'),
    cjsAuthority: emptyNamespaceReceipt(EXPECTED_AUTHORITY_EXPORTS, 'cjs'),
    esmRoot: emptyNamespaceReceipt(EXPECTED_ROOT_EXPORTS, 'esm'),
    cjsRoot: emptyNamespaceReceipt(EXPECTED_ROOT_EXPORTS, 'cjs'),
    dedicatedExportParity: false,
    rootExportParity: false,
    dedicatedContractCallable: false,
    esmRootIntersection: [],
    cjsRootIntersection: [],
    rootExportsAbsent: false,
    esmSelfProjection: false,
    cjsSelfProjection: false,
    crossInstanceProjectionRejected: false,
    authenticatedDurableReadbackClaimed: true,
    passed: false,
  },
  uncoveredSemantics: [
    'bounded-own-data-canonical-json',
    'sha256-content-binding',
    'detached-signature-verifier-capability',
    'atomic-compare-and-commit-capability',
    'authenticated-durable-holokey-authority-root-and-readback',
    'compiler-produced-importable-esm-cjs-package',
    'holorepo-mutator-to-verifier-facade-migration',
  ],
  blockers: [],
};

let scratchRoot = null;
try {
  if (!ownedRegularFile(sourcePath, packageRoot)) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_SOURCE_MISSING_OR_UNOWNED',
      message:
        'The repository identity HoloScript source is missing or is not a regular package-owned file.',
    });
    throw new Error('source-unavailable');
  }
  report.source.sha256 = sha256File(sourcePath);

  if (
    !ownedRegularFile(sha256SumsPath, systemsRoot) ||
    !ownedRegularFile(releaseManifestPath, systemsRoot) ||
    !ownedRegularFile(compilerPath, systemsRoot)
  ) {
    report.blockers.push({
      code: 'HOLOKEY_COMPILER_PROVENANCE_ANCHOR_UNAVAILABLE',
      message: `The compiler, release manifest, or SHA256SUMS anchor is unavailable for ${platformKey}.`,
    });
    throw new Error('compiler-provenance-anchor-unavailable');
  }
  report.compiler.provenance.sha256SumsSha256 = sha256File(sha256SumsPath);
  report.compiler.provenance.releaseManifestSha256 = sha256File(releaseManifestPath);
  report.compiler.sha256 = sha256File(compilerPath);
  const sha256Sums = parseSha256Sums(readFileSync(sha256SumsPath, 'utf8'));
  const releaseManifest = safeJson(readFileSync(releaseManifestPath, 'utf8'));
  const expectedManifestKeys = [
    'schema',
    'releaseManifestSchema',
    'canonicalManifestSha256',
    'distributionId',
    'version',
    'channel',
    'machineContract',
    'hostPlatform',
    'sourceCommit',
    'components',
    'embeddedArtifactDigests',
    'conformanceCorpus',
  ];
  const compilerRelativePath = `native/${platformKey}/${compilerName}`;
  const manifestCompilerDigest = releaseManifest?.embeddedArtifactDigests?.[compilerRelativePath];
  report.compiler.provenance.releaseMachineContract = releaseManifest?.machineContract ?? null;
  report.compiler.provenance.sourceCommit = releaseManifest?.sourceCommit ?? null;
  report.compiler.provenance.compilerDigestMatches =
    report.compiler.sha256 === TRUSTED_COMPILER_SHA256 &&
    manifestCompilerDigest === TRUSTED_COMPILER_SHA256.slice('sha256:'.length) &&
    sha256Sums?.get(compilerRelativePath) === TRUSTED_COMPILER_SHA256;
  report.compiler.provenance.verified =
    strictObjectKeys(releaseManifest, expectedManifestKeys) &&
    report.compiler.provenance.sha256SumsSha256 === TRUSTED_SHA256_SUMS_SHA256 &&
    report.compiler.provenance.releaseManifestSha256 === TRUSTED_RELEASE_MANIFEST_SHA256 &&
    sha256Sums?.get('release-manifest.json') === TRUSTED_RELEASE_MANIFEST_SHA256 &&
    releaseManifest.schema === 'holoscript.systems-artifact-envelope/v1' &&
    releaseManifest.releaseManifestSchema === 'holoscript.systems-preview-release/v1' &&
    releaseManifest.distributionId === 'holoscript-systems-toolchain' &&
    releaseManifest.hostPlatform === platformKey &&
    releaseManifest.machineContract === TRUSTED_RELEASE_MACHINE_CONTRACT &&
    releaseManifest.sourceCommit === TRUSTED_SOURCE_COMMIT &&
    report.compiler.provenance.compilerDigestMatches;
  if (!report.compiler.provenance.verified) {
    report.blockers.push({
      code: 'HOLOKEY_COMPILER_PROVENANCE_INVALID',
      message:
        'The compiler did not reproduce the unchanged canon SHA256SUMS and release-manifest trust chain.',
    });
    throw new Error('compiler-provenance-invalid');
  }

  if (!trustedLinker || !linkerPath || !regularNonLinkFile(linkerPath)) {
    report.blockers.push({
      code: 'HOLOKEY_TRUSTED_NATIVE_LINKER_UNAVAILABLE',
      message: `No reviewed regular host linker is available for ${platformKey}.`,
    });
    throw new Error('linker-unavailable');
  }
  report.compiler.linker.sha256 = sha256File(linkerPath);
  report.compiler.linker.verified =
    report.compiler.linker.sha256 === report.compiler.linker.expectedSha256;
  if (!report.compiler.linker.verified) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_LINKER_PROVENANCE_INVALID',
      message: 'The canonical linker digest does not match the reviewed host toolchain anchor.',
    });
    throw new Error('linker-provenance-invalid');
  }

  scratchRoot = mkdtempSync(join(tmpdir(), 'holokey-repository-identity-'));
  const copiedSourcePath = resolve(scratchRoot, 'repository_identity.hs');
  const sourceBytes = readFileSync(sourcePath);
  writeFileSync(copiedSourcePath, sourceBytes);
  report.source.copiedSourceSha256 = sha256File(copiedSourcePath);
  if (report.source.copiedSourceSha256 !== report.source.sha256) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_SOURCE_COPY_DRIFT',
      message: 'The compiler input copy does not match the reviewed package source.',
    });
    throw new Error('source-copy-drift');
  }
  const sourceText = sourceBytes.toString('utf8');
  const exportDeclarations = sourceText.match(/^export function /gmu) ?? [];
    if (exportDeclarations.length !== 4 || /(?:^|\n)function main\s*\(/u.test(sourceText)) {
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_SOURCE_DERIVATION_UNSAFE',
        message:
          'The reviewed source no longer matches the bounded four-export/no-entry derivation contract.',
    });
    throw new Error('source-derivation-unsafe');
  }
  const compilerInputBase = sourceText.replace(/^export function /gmu, 'function ');
  const compilerInputBasePath = resolve(scratchRoot, 'compiler-input-base.hs');
  writeFileSync(compilerInputBasePath, compilerInputBase, 'utf8');
  report.source.compilerInputBaseSha256 = sha256File(compilerInputBasePath);
  report.source.visibilityKeywordsRemoved = exportDeclarations.length;
  const compilerSnapshotPath = resolve(scratchRoot, compilerName);
  writeFileSync(compilerSnapshotPath, readFileSync(compilerPath));
  if (process.platform !== 'win32') chmodSync(compilerSnapshotPath, 0o500);
  report.compiler.snapshot.relativePath = relative(scratchRoot, compilerSnapshotPath).replaceAll(
    '\\',
    '/'
  );
  report.compiler.snapshot.sha256 = sha256File(compilerSnapshotPath);
  report.compiler.snapshot.verified =
    regularNonLinkFile(compilerSnapshotPath) &&
    report.compiler.snapshot.sha256 === TRUSTED_COMPILER_SHA256;
  if (!report.compiler.snapshot.verified) {
    report.blockers.push({
      code: 'HOLOKEY_COMPILER_SNAPSHOT_INVALID',
      message: 'The fresh scratch compiler snapshot does not match the reviewed compiler digest.',
    });
    throw new Error('compiler-snapshot-invalid');
  }

  const toolchain = strictToolchainEnvironment(scratchRoot);
  report.compiler.environment = toolchain.receipt;
  if (toolchain.missing.length > 0) {
    report.blockers.push({
      code: 'HOLOKEY_TOOLCHAIN_ENVIRONMENT_UNAVAILABLE',
      message: `Required reviewed host environment names are unavailable: ${toolchain.missing.join(', ')}.`,
    });
    throw new Error('toolchain-environment-unavailable');
  }
  if (!toolchain.receipt.verified) {
    report.blockers.push({
      code: 'HOLOKEY_TOOLCHAIN_ENVIRONMENT_INVALID',
      message: `The compiler environment did not resolve to the reviewed non-link canonical directories: ${toolchain.invalid.join(', ')}.`,
    });
    throw new Error('toolchain-environment-invalid');
  }

  if (!report.compiler.custodyPolicySelfTest.passed) {
    report.blockers.push({
      code: 'HOLOKEY_TOOL_CUSTODY_POLICY_SELF_TEST_FAILED',
      message: 'The pure phase policy did not reject before-spawn and after-spawn digest drift.',
    });
    throw new Error('tool-custody-policy-self-test-failed');
  }

  const coreAnchorSpecifications = {
    source: {
      path: sourcePath,
      label: 'packages/secrets-broker/src/repository_identity.hsplus',
      expectedSha256: report.source.sha256,
    },
    sha256Sums: {
      path: sha256SumsPath,
      label: 'distributions/systems/SHA256SUMS',
      expectedSha256: TRUSTED_SHA256_SUMS_SHA256,
    },
    releaseManifest: {
      path: releaseManifestPath,
      label: 'distributions/systems/release-manifest.json',
      expectedSha256: TRUSTED_RELEASE_MANIFEST_SHA256,
    },
    compiler: {
      path: compilerPath,
      label: `distributions/systems/native/${platformKey}/${compilerName}`,
      expectedSha256: TRUSTED_COMPILER_SHA256,
    },
    linker: {
      path: linkerPath,
      label: linkerPath,
      expectedSha256: trustedLinker.sha256,
    },
    compilerSnapshot: {
      path: compilerSnapshotPath,
      label: `scratch/${compilerName}`,
      expectedSha256: TRUSTED_COMPILER_SHA256,
    },
  };

  for (let state = 0; state < 3; state += 1) {
    const entryPath = resolve(scratchRoot, `row-${state}.hs`);
    const executablePath = resolve(
      scratchRoot,
      process.platform === 'win32' ? `row-${state}.exe` : `row-${state}`
    );
    writeFileSync(
      entryPath,
      `${compilerInputBase}\nfunction main(): i32 {\n  return repository_transition_row_mask(${state})\n}\n`,
      'utf8'
    );
    const beforeCompile = captureFileAnchors(coreAnchorSpecifications);
    if (!beforeCompile.verified) {
      report.compiler.executionPhases.push(
        executionPhaseReceipt(state, beforeCompile, captureFileAnchors(coreAnchorSpecifications))
      );
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_TOOLCHAIN_CUSTODY_DRIFT',
        message: `A source or toolchain anchor drifted immediately before transition row ${state}.`,
        state,
        phase: 'before-spawn',
      });
      throw new Error(`native-row-${state}-before-spawn-custody-drift`);
    }
    const compile = spawnSync(
      compilerSnapshotPath,
      [entryPath, '-o', executablePath, '--linker', linkerPath],
      {
        cwd: scratchRoot,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60_000,
        maxBuffer: MAX_OUTPUT_BYTES,
        env: toolchain.env,
      }
    );
    const afterCompile = captureFileAnchors(coreAnchorSpecifications);
    const phaseReceipt = executionPhaseReceipt(state, beforeCompile, afterCompile);
    report.compiler.executionPhases.push(phaseReceipt);
    if (!phaseReceipt.verified) {
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_TOOLCHAIN_CUSTODY_DRIFT',
        message: `A source or toolchain anchor drifted immediately after transition row ${state}.`,
        state,
        phase: 'after-spawn',
      });
      throw new Error(`native-row-${state}-after-spawn-custody-drift`);
    }
    const compileReceipt = safeJson(compile.stdout ?? '');
    if (
      compile.error ||
      compile.status !== 0 ||
      (compile.stderr ?? '') !== '' ||
      !compileReceipt ||
      !strictObjectKeys(compileReceipt, [
        'machine_contract',
        'object_bytes',
        'object_sha256',
        'executable',
      ]) ||
      compileReceipt.machine_contract !== EXPECTED_ROW_MACHINE_CONTRACT ||
      !Number.isSafeInteger(compileReceipt.object_bytes) ||
      compileReceipt.object_bytes < 1 ||
      !/^[a-f0-9]{64}$/u.test(String(compileReceipt.object_sha256 ?? '')) ||
      typeof compileReceipt.executable !== 'string' ||
      resolve(compileReceipt.executable) !== executablePath ||
      !ownedRegularFile(executablePath, scratchRoot)
    ) {
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_MATERIALIZATION_FAILED',
        message: `The owned compiler did not materialize transition row ${state}.`,
        state,
        compilerExitCode: compile.status,
        compilerError: compile.error?.code ?? null,
        compilerStdout: boundedOutput(compile.stdout),
        compilerStderr: boundedOutput(compile.stderr),
      });
      throw new Error(`native-row-${state}-materialization-failed`);
    }

    report.compiler.machineContracts.push(compileReceipt.machine_contract);
    const entrySha256 = sha256File(entryPath);
    const executableSha256 = sha256File(executablePath);
    const nativeExecutionAnchorSpecifications = {
      ...coreAnchorSpecifications,
      entry: {
        path: entryPath,
        label: `scratch/row-${state}.hs`,
        expectedSha256: entrySha256,
      },
      executable: {
        path: executablePath,
        label: `scratch/${process.platform === 'win32' ? `row-${state}.exe` : `row-${state}`}`,
        expectedSha256: executableSha256,
      },
    };
    const beforeNativeExecution = captureFileAnchors(nativeExecutionAnchorSpecifications);
    if (!beforeNativeExecution.verified) {
      report.compiler.nativeExecutionPhases.push(
        executionPhaseReceipt(
          state,
          beforeNativeExecution,
          captureFileAnchors(nativeExecutionAnchorSpecifications)
        )
      );
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_EXECUTABLE_CUSTODY_DRIFT',
        message: `An anchor, row source, or generated executable drifted before row ${state} execution.`,
        state,
        phase: 'before-native-spawn',
      });
      throw new Error(`native-row-${state}-before-execution-custody-drift`);
    }
    const native = spawnSync(executablePath, [], {
      cwd: scratchRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 16 * 1024,
      env: {},
    });
    const afterNativeExecution = captureFileAnchors(nativeExecutionAnchorSpecifications);
    const nativeExecutionPhase = executionPhaseReceipt(
      state,
      beforeNativeExecution,
      afterNativeExecution
    );
    report.compiler.nativeExecutionPhases.push(nativeExecutionPhase);
    if (!nativeExecutionPhase.verified) {
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_EXECUTABLE_CUSTODY_DRIFT',
        message: `An anchor, row source, or generated executable drifted after row ${state} execution.`,
        state,
        phase: 'after-native-spawn',
      });
      throw new Error(`native-row-${state}-after-execution-custody-drift`);
    }
    if (
      native.error ||
      native.signal ||
      (native.stdout ?? '') !== '' ||
      (native.stderr ?? '') !== '' ||
      !Number.isInteger(native.status) ||
      native.status < 0 ||
      native.status > 31
    ) {
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_EXECUTION_FAILED',
        message: `Compiler-generated transition row ${state} was not a silent five-bit program.`,
        state,
        nativeExitCode: native.status,
        nativeSignal: native.signal,
      });
      throw new Error(`native-row-${state}-execution-failed`);
    }
    report.generatedImplementations.push({
      state,
      entrySha256,
      executableSha256,
      objectSha256: `sha256:${compileReceipt.object_sha256}`,
      rowMask: native.status,
    });
    report.equivalence.nativeRowMasks.push(native.status);
  }

  report.compiler.machineContracts = [...new Set(report.compiler.machineContracts)];
  report.equivalence.nativeTransitionTableBitmask =
    report.equivalence.nativeRowMasks[0] +
    report.equivalence.nativeRowMasks[1] * 32 +
    report.equivalence.nativeRowMasks[2] * 1024;
  const nativeRowsMatchReviewedExpected =
    report.equivalence.nativeRowMasks.every(
      (rowMask, state) => rowMask === EXPECTED_ROW_MASKS[state]
    ) &&
    report.equivalence.nativeTransitionTableBitmask === EXPECTED_TRANSITION_TABLE_BITMASK;
  if (!nativeRowsMatchReviewedExpected) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_TRANSITION_TABLE_DRIFT',
      message:
        'The three native row masks do not reproduce the reviewed 16833 transition-table bitmask.',
    });
    throw new Error('transition-table-drift');
  }

  report.anchorCustody.afterNativeRows = captureFileAnchors(coreAnchorSpecifications);
  if (!report.anchorCustody.afterNativeRows.verified) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_ANCHOR_CUSTODY_DRIFT',
      message:
        'Source, SHA256SUMS, release manifest, original compiler, linker, or compiler snapshot drifted across native execution.',
    });
    throw new Error('native-anchor-custody-drift');
  }

  report.nativeContentBinding.fixtureSha256 = sha256Text(NATIVE_SHA256_FIXTURE_TEXT);
  const fixtureLiteral = [...NATIVE_SHA256_FIXTURE_BYTES].join(', ');
  const actualDigestBytes = [];
  for (let byteIndex = 0; byteIndex < 32; byteIndex += 1) {
    const entryPath = resolve(scratchRoot, `sha256-byte-${byteIndex}.hs`);
    const executablePath = resolve(
      scratchRoot,
      process.platform === 'win32' ? `sha256-byte-${byteIndex}.exe` : `sha256-byte-${byteIndex}`
    );
    writeFileSync(
      entryPath,
      `${compilerInputBase}\nfunction main(): i32 {\n  slot bytes: [u8; ${NATIVE_SHA256_FIXTURE_BYTES.length}] = [${fixtureLiteral}]\n  return repository_identity_sha256_byte(&bytes[0..${NATIVE_SHA256_FIXTURE_BYTES.length}], ${byteIndex})\n}\n`,
      'utf8'
    );
    const beforeCompile = captureFileAnchors(coreAnchorSpecifications);
    if (!beforeCompile.verified) {
      report.compiler.nativeContentBindingPhases.push({
        byteIndex,
        phase: 'before-spawn',
        before: beforeCompile,
        after: captureFileAnchors(coreAnchorSpecifications),
        verified: false,
      });
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_TOOLCHAIN_CUSTODY_DRIFT',
        message: `A source or toolchain anchor drifted immediately before SHA-256 byte ${byteIndex}.`,
        byteIndex,
        phase: 'before-spawn',
      });
      throw new Error(`native-sha256-byte-${byteIndex}-before-spawn-custody-drift`);
    }
    const compile = spawnSync(
      compilerSnapshotPath,
      [entryPath, '-o', executablePath, '--linker', linkerPath],
      {
        cwd: scratchRoot,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60_000,
        maxBuffer: MAX_OUTPUT_BYTES,
        env: toolchain.env,
      }
    );
    const afterCompile = captureFileAnchors(coreAnchorSpecifications);
    const compilePhase = executionPhaseReceipt(byteIndex, beforeCompile, afterCompile);
    if (!compilePhase.verified) {
      report.compiler.nativeContentBindingPhases.push({
        byteIndex,
        phase: 'after-spawn',
        before: beforeCompile,
        after: afterCompile,
        verified: false,
      });
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_TOOLCHAIN_CUSTODY_DRIFT',
        message: `A source or toolchain anchor drifted immediately after SHA-256 byte ${byteIndex} compilation.`,
        byteIndex,
        phase: 'after-spawn',
      });
      throw new Error(`native-sha256-byte-${byteIndex}-after-spawn-custody-drift`);
    }
    const compileReceipt = safeJson(compile.stdout ?? '');
    if (
      compile.error ||
      compile.status !== 0 ||
      (compile.stderr ?? '') !== '' ||
      !compileReceipt ||
      !strictObjectKeys(compileReceipt, [
        'machine_contract',
        'object_bytes',
        'object_sha256',
        'executable',
      ]) ||
      compileReceipt.machine_contract !== EXPECTED_ROW_MACHINE_CONTRACT ||
      !Number.isSafeInteger(compileReceipt.object_bytes) ||
      compileReceipt.object_bytes < 1 ||
      !/^[a-f0-9]{64}$/u.test(String(compileReceipt.object_sha256 ?? '')) ||
      typeof compileReceipt.executable !== 'string' ||
      resolve(compileReceipt.executable) !== executablePath ||
      !ownedRegularFile(executablePath, scratchRoot)
    ) {
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_SHA256_MATERIALIZATION_FAILED',
        message: `The owned compiler did not materialize SHA-256 digest byte ${byteIndex}.`,
        byteIndex,
        compilerExitCode: compile.status,
        compilerError: compile.error?.code ?? null,
        compilerStdout: boundedOutput(compile.stdout),
        compilerStderr: boundedOutput(compile.stderr),
      });
      throw new Error(`native-sha256-byte-${byteIndex}-materialization-failed`);
    }
    report.compiler.machineContracts.push(compileReceipt.machine_contract);
    report.nativeContentBinding.machineContract = compileReceipt.machine_contract;
    const entrySha256 = sha256File(entryPath);
    const executableSha256 = sha256File(executablePath);
    const nativeAnchorSpecifications = {
      ...coreAnchorSpecifications,
      entry: {
        path: entryPath,
        label: `scratch/sha256-byte-${byteIndex}.hs`,
        expectedSha256: entrySha256,
      },
      executable: {
        path: executablePath,
        label: `scratch/${process.platform === 'win32' ? `sha256-byte-${byteIndex}.exe` : `sha256-byte-${byteIndex}`}`,
        expectedSha256: executableSha256,
      },
    };
    const beforeNative = captureFileAnchors(nativeAnchorSpecifications);
    const expectedByte = Buffer.from(NATIVE_SHA256_EXPECTED_HEX, 'hex')[byteIndex];
    const native = spawnSync(executablePath, [], {
      cwd: scratchRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 16 * 1024,
      env: {},
    });
    const afterNative = captureFileAnchors(nativeAnchorSpecifications);
    const nativePhase = executionPhaseReceipt(byteIndex, beforeNative, afterNative);
    report.compiler.nativeContentBindingPhases.push({
      byteIndex,
      before: beforeCompile,
      after: afterCompile,
      nativeBefore: beforeNative,
      nativeAfter: afterNative,
      verified: compilePhase.verified && nativePhase.verified,
    });
    if (!beforeNative.verified || !nativePhase.verified) {
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_SHA256_EXECUTABLE_CUSTODY_DRIFT',
        message: `An anchor, SHA-256 byte source, or generated executable drifted around byte ${byteIndex} execution.`,
        byteIndex,
      });
      throw new Error(`native-sha256-byte-${byteIndex}-execution-custody-drift`);
    }
    if (
      native.error ||
      native.signal ||
      (native.stdout ?? '') !== '' ||
      (native.stderr ?? '') !== '' ||
      native.status !== expectedByte
    ) {
      report.blockers.push({
        code: 'HOLOKEY_NATIVE_SHA256_BINDING_FAILED',
        message: `Compiler-generated SHA-256 byte ${byteIndex} did not match the reviewed fixture digest.`,
        byteIndex,
        expectedByte,
        nativeExitCode: native.status,
        nativeSignal: native.signal,
      });
      throw new Error(`native-sha256-byte-${byteIndex}-binding-failed`);
    }
    actualDigestBytes.push(native.status);
    report.nativeContentBinding.implementations.push({
      byteIndex,
      expectedByte,
      entrySha256,
      executableSha256,
      objectSha256: `sha256:${compileReceipt.object_sha256}`,
    });
  }
  report.nativeContentBinding.actualDigestHex = Buffer.from(actualDigestBytes).toString('hex');
  report.nativeContentBinding.passed =
    report.nativeContentBinding.fixtureSha256 === `sha256:${NATIVE_SHA256_EXPECTED_HEX}` &&
    report.nativeContentBinding.actualDigestHex === NATIVE_SHA256_EXPECTED_HEX &&
    report.nativeContentBinding.implementations.length === 32 &&
    report.compiler.nativeContentBindingPhases.length === 32;
  report.anchorCustody.afterNativeContentBinding = captureFileAnchors(coreAnchorSpecifications);
  if (!report.anchorCustody.afterNativeContentBinding.verified) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_ANCHOR_CUSTODY_DRIFT',
      message: 'A source or toolchain anchor drifted after native SHA-256 content binding.',
    });
    throw new Error('native-content-binding-anchor-custody-drift');
  }
  if (!report.nativeContentBinding.passed) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_SHA256_BINDING_FAILED',
      message: 'The compiler-native bounded SHA-256 fixture did not reproduce the reviewed digest.',
    });
    throw new Error('native-sha256-binding-failed');
  }
  report.uncoveredSemantics = report.uncoveredSemantics.filter(
    (semantic) => semantic !== 'sha256-content-binding'
  );

  const requiredBuildFiles = [
    manifestPath,
    distEsmPath,
    distCjsPath,
    rootDistEsmPath,
    rootDistCjsPath,
  ];
  if (!requiredBuildFiles.every((path) => ownedRegularFile(path, packageRoot))) {
    report.blockers.push({
      code: 'HOLOKEY_BOOTSTRAP_BUILD_MISSING',
      message: 'Build all ESM/CJS package entries before running the native publication check.',
    });
    throw new Error('bootstrap-build-missing');
  }
  if (!regularNonLinkFile(process.execPath)) {
    report.blockers.push({
      code: 'HOLOKEY_NODE_RUNTIME_UNAVAILABLE',
      message: 'The fresh module probe requires the current regular non-link Node executable.',
    });
    throw new Error('node-runtime-unavailable');
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const manifestSubpath = manifest.exports?.['./repository-identity'];
  report.moduleBoundary.manifestDedicatedSubpath =
    manifest.exports?.['.']?.import === './dist/index.js' &&
    manifest.exports?.['.']?.require === './dist/index.cjs' &&
    manifestSubpath?.import === './dist/repository-identity.js' &&
    manifestSubpath?.require === './dist/repository-identity.cjs';
  if (!report.moduleBoundary.namespacePolicySelfTest.passed) {
    report.blockers.push({
      code: 'HOLOKEY_NAMESPACE_POLICY_SELF_TEST_FAILED',
      message:
        'The pure namespace policy did not reject a Proxy, hidden own property, stray symbol, or inherited prototype pollution.',
    });
    throw new Error('namespace-policy-self-test-failed');
  }

  const moduleProbePath = resolve(scratchRoot, 'module-probe.mjs');
  const earlyExitProbePath = resolve(scratchRoot, 'early-exit-probe.mjs');
  const forgedReceiptImportPath = resolve(scratchRoot, 'forged-receipt-import.mjs');
  writeFileSync(moduleProbePath, MODULE_PROBE_SOURCE, 'utf8');
  writeFileSync(earlyExitProbePath, EARLY_EXIT_PROBE_SOURCE, 'utf8');
  writeFileSync(forgedReceiptImportPath, FORGED_RECEIPT_IMPORT_SOURCE, 'utf8');
  report.moduleBoundary.probe.nodeSha256 = sha256File(process.execPath);
  report.moduleBoundary.probe.scriptRelativePath = relative(scratchRoot, moduleProbePath).replaceAll(
    '\\',
    '/'
  );
  report.moduleBoundary.probe.scriptSha256 = sha256File(moduleProbePath);

  const moduleAnchorSpecifications = {
    ...coreAnchorSpecifications,
    packageManifest: {
      path: manifestPath,
      label: 'packages/secrets-broker/package.json',
      expectedSha256: sha256File(manifestPath),
    },
    authorityEsm: {
      path: distEsmPath,
      label: 'packages/secrets-broker/dist/repository-identity.js',
      expectedSha256: sha256File(distEsmPath),
    },
    authorityCjs: {
      path: distCjsPath,
      label: 'packages/secrets-broker/dist/repository-identity.cjs',
      expectedSha256: sha256File(distCjsPath),
    },
    rootEsm: {
      path: rootDistEsmPath,
      label: 'packages/secrets-broker/dist/index.js',
      expectedSha256: sha256File(rootDistEsmPath),
    },
    rootCjs: {
      path: rootDistCjsPath,
      label: 'packages/secrets-broker/dist/index.cjs',
      expectedSha256: sha256File(rootDistCjsPath),
    },
    node: {
      path: process.execPath,
      label: process.execPath,
      expectedSha256: report.moduleBoundary.probe.nodeSha256,
    },
    moduleProbe: {
      path: moduleProbePath,
      label: 'scratch/module-probe.mjs',
      expectedSha256: report.moduleBoundary.probe.scriptSha256,
    },
    earlyExitProbe: {
      path: earlyExitProbePath,
      label: 'scratch/early-exit-probe.mjs',
      expectedSha256: sha256File(earlyExitProbePath),
    },
    forgedReceiptImport: {
      path: forgedReceiptImportPath,
      label: 'scratch/forged-receipt-import.mjs',
      expectedSha256: sha256File(forgedReceiptImportPath),
    },
  };
  report.anchorCustody.beforeModuleProbe = captureFileAnchors(moduleAnchorSpecifications);
  if (!report.anchorCustody.beforeModuleProbe.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_INVALID',
      message: 'A module-probe input or executable did not match its pre-execution digest.',
    });
    throw new Error('module-probe-anchor-invalid');
  }

  const earlyExitChallenge = randomBytes(32).toString('hex');
  const earlyExit = spawnSync(process.execPath, [earlyExitProbePath], {
    cwd: scratchRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: MAX_OUTPUT_BYTES,
    env: toolchain.env,
    input: `${earlyExitChallenge}\n`,
  });
  const earlyExitOutcome = childProbeExecutionReceipt(earlyExit, earlyExitChallenge);
  report.moduleBoundary.probe.earlyExitSelfTest = {
    scriptSha256: sha256File(earlyExitProbePath),
    ...earlyExitOutcome,
    rejected:
      earlyExitOutcome.status === 0 &&
      earlyExitOutcome.stdoutBytes === 0 &&
      !earlyExitOutcome.exactSingleJsonReceipt &&
      !earlyExitOutcome.accepted,
  };
  if (!report.moduleBoundary.probe.earlyExitSelfTest.rejected) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_EARLY_EXIT_SELF_TEST_FAILED',
      message: 'The parent phase policy did not reject an exit-zero child with no receipt.',
    });
    throw new Error('module-probe-early-exit-self-test-failed');
  }

  report.anchorCustody.afterEarlyExitSelfTest = captureFileAnchors(
    moduleAnchorSpecifications
  );
  if (!report.anchorCustody.afterEarlyExitSelfTest.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message: 'An anchored file drifted across the early-exit child fixture.',
      phase: 'after-early-exit-fixture',
    });
    throw new Error('after-early-exit-anchor-drift');
  }

  function runChallengeTransportSelfTest({
    name,
    input,
    expectedChallenge,
    beforeAnchorField,
    afterAnchorField,
  }) {
    report.anchorCustody[beforeAnchorField] = captureFileAnchors(moduleAnchorSpecifications);
    if (!report.anchorCustody[beforeAnchorField].verified) {
      report.blockers.push({
        code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
        message: `An anchored file drifted immediately before the ${name} fixture.`,
        phase: `before-${name}-fixture`,
      });
      throw new Error(`before-${name}-anchor-drift`);
    }
    const execution = spawnSync(
      process.execPath,
      [
        moduleProbePath,
        distEsmPath,
        distCjsPath,
        rootDistEsmPath,
        rootDistCjsPath,
        'normal',
      ],
      {
        cwd: scratchRoot,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: MAX_OUTPUT_BYTES,
        env: toolchain.env,
        input,
      }
    );
    report.anchorCustody[afterAnchorField] = captureFileAnchors(moduleAnchorSpecifications);
    if (!report.anchorCustody[afterAnchorField].verified) {
      report.blockers.push({
        code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
        message: `An anchored file drifted across the ${name} fixture.`,
        phase: `after-${name}-fixture`,
      });
      throw new Error(`after-${name}-anchor-drift`);
    }
    const outcome = childProbeExecutionReceipt(execution, expectedChallenge);
    const selfTest = {
      policy: 'exactly-64-lowercase-hex-bytes-followed-by-one-newline',
      ...outcome,
      rejected:
        outcome.error === null &&
        outcome.status !== null &&
        outcome.status !== 0 &&
        outcome.signal === null &&
        outcome.stdoutBytes === 0 &&
        !outcome.exactSingleJsonReceipt &&
        !outcome.accepted,
    };
    if (!selfTest.rejected) {
      report.blockers.push({
        code: `HOLOKEY_MODULE_PROBE_${name.toUpperCase().replaceAll('-', '_')}_SELF_TEST_FAILED`,
        message: `The trusted child did not reject the ${name} stdin challenge shape before candidate import.`,
      });
      throw new Error(`module-probe-${name}-self-test-failed`);
    }
    return selfTest;
  }

  const missingChallenge = randomBytes(32).toString('hex');
  report.moduleBoundary.probe.missingChallengeSelfTest = runChallengeTransportSelfTest({
    name: 'missing-challenge',
    input: '',
    expectedChallenge: missingChallenge,
    beforeAnchorField: 'beforeMissingChallengeFixture',
    afterAnchorField: 'afterMissingChallengeFixture',
  });
  const extraChallenge = randomBytes(32).toString('hex');
  report.moduleBoundary.probe.extraChallengeSelfTest = runChallengeTransportSelfTest({
    name: 'extra-challenge-bytes',
    input: `${extraChallenge}\n0`,
    expectedChallenge: extraChallenge,
    beforeAnchorField: 'beforeExtraChallengeFixture',
    afterAnchorField: 'afterExtraChallengeFixture',
  });

  const forgedReceiptChallenge = randomBytes(32).toString('hex');
  report.anchorCustody.beforeForgedReceiptFixture = captureFileAnchors(
    moduleAnchorSpecifications
  );
  if (!report.anchorCustody.beforeForgedReceiptFixture.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message: 'An anchored file drifted immediately before the imported forged-receipt fixture.',
      phase: 'before-forged-receipt-fixture',
    });
    throw new Error('before-forged-receipt-anchor-drift');
  }
  const forgedReceiptExit = spawnSync(
    process.execPath,
    [
      moduleProbePath,
      forgedReceiptImportPath,
      distCjsPath,
      rootDistEsmPath,
      rootDistCjsPath,
      'normal',
    ],
    {
      cwd: scratchRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: toolchain.env,
      input: `${forgedReceiptChallenge}\n`,
    }
  );
  const forgedReceiptOutcome = childProbeExecutionReceipt(
    forgedReceiptExit,
    forgedReceiptChallenge
  );
  report.anchorCustody.afterForgedReceiptFixture = captureFileAnchors(
    moduleAnchorSpecifications
  );
  if (!report.anchorCustody.afterForgedReceiptFixture.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message: 'An anchored file drifted across the imported forged-receipt fixture.',
      phase: 'after-forged-receipt-fixture',
    });
    throw new Error('after-forged-receipt-anchor-drift');
  }
  report.moduleBoundary.probe.forgedReceiptSelfTest = {
    importedModuleSha256: sha256File(forgedReceiptImportPath),
    trustedProbeSha256: sha256File(moduleProbePath),
    ...forgedReceiptOutcome,
    stdinReReadEofVerifiedByExitZero: forgedReceiptOutcome.status === 0,
    rejected:
      forgedReceiptOutcome.transportVerified &&
      forgedReceiptOutcome.exactSingleJsonReceipt &&
      !forgedReceiptOutcome.challengeVerified &&
      !forgedReceiptOutcome.receiptValidated &&
      !forgedReceiptOutcome.accepted,
  };
  if (!report.moduleBoundary.probe.forgedReceiptSelfTest.rejected) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_FORGED_RECEIPT_SELF_TEST_FAILED',
      message:
        'The parent phase policy did not reject an imported module that re-read EOF, forged an exact-schema receipt without the secret stdin challenge, and exited zero.',
    });
    throw new Error('module-probe-forged-receipt-self-test-failed');
  }

  const beforePrimaryProbe = captureFileAnchors(moduleAnchorSpecifications);
  report.anchorCustody.beforePrimaryProbe = beforePrimaryProbe;
  if (!beforePrimaryProbe.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message: 'An anchored file drifted immediately before the primary child probe.',
      phase: 'before-primary-probe',
    });
    throw new Error('before-primary-probe-anchor-drift');
  }
  const primaryChallenge = randomBytes(32).toString('hex');
  const primaryProbe = spawnSync(
    process.execPath,
    [
      moduleProbePath,
      distEsmPath,
      distCjsPath,
      rootDistEsmPath,
      rootDistCjsPath,
      'normal',
    ],
    {
      cwd: scratchRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: toolchain.env,
      input: `${primaryChallenge}\n`,
    }
  );
  const primaryOutcome = childProbeExecutionReceipt(primaryProbe, primaryChallenge);
  report.moduleBoundary.probe.primary = primaryOutcome;
  report.anchorCustody.afterModuleProbe = captureFileAnchors(moduleAnchorSpecifications);
  if (!report.anchorCustody.afterModuleProbe.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message:
        'Source, manifests, compiler, linker, compiler snapshot, Node, probe, or dist entry drifted across the primary child probe.',
      phase: 'after-primary-probe',
    });
    throw new Error('after-primary-probe-anchor-drift');
  }
  if (!primaryOutcome.accepted || !primaryOutcome.validation) {
    report.blockers.push({
      code: 'HOLOKEY_PACKAGE_MODULE_PROBE_INVALID',
      message:
        'The fresh child did not return exactly one fully recomputed namespace, descriptor, contract, projection, and intrinsic-custody receipt.',
      childStatus: primaryOutcome.status,
      childSignal: primaryOutcome.signal,
      childError: primaryOutcome.error,
      childStdoutBytes: primaryOutcome.stdoutBytes,
      childStdoutSha256: primaryOutcome.stdoutSha256,
      childStderr: boundedOutput(primaryProbe.stderr),
    });
    throw new Error('package-module-probe-invalid');
  }

  const primaryReceipt = parseExactSingleLineJson(primaryProbe.stdout ?? '');
  const wrongChallengeReceipt = primaryReceipt
    ? safeJson(intrinsicJsonStringify(primaryReceipt))
    : null;
  const wrongChallenge = `${primaryChallenge[0] === '0' ? '1' : '0'}${primaryChallenge.slice(1)}`;
  if (!wrongChallengeReceipt) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_WRONG_CHALLENGE_SELF_TEST_FAILED',
      message: 'The accepted primary receipt could not be cloned for challenge-only mutation.',
    });
    throw new Error('module-probe-wrong-challenge-clone-failed');
  }
  wrongChallengeReceipt.challenge = wrongChallenge;
  const mutationAcceptedWithMutatedChallenge = validateModuleProbeReceipt(
    wrongChallengeReceipt,
    wrongChallenge
  );
  const mutationRejectedWithActualChallenge = validateModuleProbeReceipt(
    wrongChallengeReceipt,
    primaryChallenge
  );
  report.moduleBoundary.probe.wrongChallengeMutationSelfTest = {
    mutation: 'accepted-primary-receipt-challenge-field-only',
    expectedChallengeSha256: sha256Text(primaryChallenge),
    mutatedChallengeSha256: sha256Text(wrongChallenge),
    allOtherFieldsParentValid: mutationAcceptedWithMutatedChallenge.valid,
    mutatedChallengeVerified: mutationAcceptedWithMutatedChallenge.challengeVerified,
    actualChallengeVerified: mutationRejectedWithActualChallenge.challengeVerified,
    rejected:
      mutationAcceptedWithMutatedChallenge.valid &&
      mutationAcceptedWithMutatedChallenge.challengeVerified &&
      !mutationRejectedWithActualChallenge.valid &&
      !mutationRejectedWithActualChallenge.challengeVerified,
  };
  if (!report.moduleBoundary.probe.wrongChallengeMutationSelfTest.rejected) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_WRONG_CHALLENGE_SELF_TEST_FAILED',
      message:
        'The parent did not reject an otherwise fully valid accepted receipt whose only mutated field was the secret stdin challenge.',
    });
    throw new Error('module-probe-wrong-challenge-self-test-failed');
  }

  const beforePoisonProbe = captureFileAnchors(moduleAnchorSpecifications);
  report.anchorCustody.beforeIntrinsicPoisonFixture = beforePoisonProbe;
  if (!beforePoisonProbe.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message: 'An anchored file drifted immediately before the intrinsic-poison child fixture.',
      phase: 'before-intrinsic-poison-fixture',
    });
    throw new Error('before-intrinsic-poison-anchor-drift');
  }
  const intrinsicPoisonChallenge = randomBytes(32).toString('hex');
  const intrinsicPoisonProbe = spawnSync(
    process.execPath,
    [
      moduleProbePath,
      distEsmPath,
      distCjsPath,
      rootDistEsmPath,
      rootDistCjsPath,
      'poison-intrinsics-after-probes',
    ],
    {
      cwd: scratchRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: toolchain.env,
      input: `${intrinsicPoisonChallenge}\n`,
    }
  );
  const intrinsicPoisonOutcome = childProbeExecutionReceipt(
    intrinsicPoisonProbe,
    intrinsicPoisonChallenge
  );
  report.moduleBoundary.probe.intrinsicPoisonSelfTest = {
    ...intrinsicPoisonOutcome,
    rejected:
      intrinsicPoisonOutcome.transportVerified &&
      intrinsicPoisonOutcome.exactSingleJsonReceipt &&
      !intrinsicPoisonOutcome.receiptValidated &&
      !intrinsicPoisonOutcome.accepted,
  };
  report.anchorCustody.afterIntrinsicPoisonFixture = captureFileAnchors(
    moduleAnchorSpecifications
  );
  if (!report.anchorCustody.afterIntrinsicPoisonFixture.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message: 'An anchored file drifted across the intrinsic-poison child fixture.',
      phase: 'after-intrinsic-poison-fixture',
    });
    throw new Error('after-intrinsic-poison-anchor-drift');
  }
  if (!report.moduleBoundary.probe.intrinsicPoisonSelfTest.rejected) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_INTRINSIC_POISON_SELF_TEST_FAILED',
      message: 'The parent phase policy did not reject a child receipt with poisoned intrinsics.',
    });
    throw new Error('module-probe-intrinsic-poison-self-test-failed');
  }

  report.anchorCustody.beforeLateProjectionPoisonFixture = captureFileAnchors(
    moduleAnchorSpecifications
  );
  if (!report.anchorCustody.beforeLateProjectionPoisonFixture.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message:
        'An anchored file drifted immediately before the late-projection-poison child fixture.',
      phase: 'before-late-projection-poison-fixture',
    });
    throw new Error('before-late-projection-poison-anchor-drift');
  }
  const lateProjectionPoisonChallenge = randomBytes(32).toString('hex');
  const lateProjectionPoisonProbe = spawnSync(
    process.execPath,
    [
      moduleProbePath,
      distEsmPath,
      distCjsPath,
      rootDistEsmPath,
      rootDistCjsPath,
      'poison-late-projection-getter',
    ],
    {
      cwd: scratchRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: toolchain.env,
      input: `${lateProjectionPoisonChallenge}\n`,
    }
  );
  report.anchorCustody.afterLateProjectionPoisonFixture = captureFileAnchors(
    moduleAnchorSpecifications
  );
  if (!report.anchorCustody.afterLateProjectionPoisonFixture.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message: 'An anchored file drifted across the late-projection-poison child fixture.',
      phase: 'after-late-projection-poison-fixture',
    });
    throw new Error('after-late-projection-poison-anchor-drift');
  }
  const lateProjectionPoisonOutcome = childProbeExecutionReceipt(
    lateProjectionPoisonProbe,
    lateProjectionPoisonChallenge
  );
  const lateProjectionValidation = lateProjectionPoisonOutcome.validation;
  const candidateMaterialMatchesPrimary =
    lateProjectionValidation !== null &&
    exactJsonEqual(
      lateProjectionValidation.namespaces,
      primaryOutcome.validation.namespaces
    ) &&
    exactJsonEqual(lateProjectionValidation.contract, primaryOutcome.validation.contract);
  report.moduleBoundary.probe.lateProjectionPoisonSelfTest = {
    ...lateProjectionPoisonOutcome,
    poisonTrigger: 'candidate-derived-projection-ok-getter-after-all-namespace-probes',
    candidateMaterialMatchesPrimary,
    afterImportsCustodyValid: lateProjectionValidation?.custody?.afterImportsValid === true,
    finalCustodyRejected: lateProjectionValidation?.custody?.afterCallsValid === false,
    finalObjectPrototypeIdentityRejected:
      lateProjectionValidation?.custody?.receipt?.afterCalls?.objectPrototype
        ?.identityVerified === false,
    rejected:
      lateProjectionPoisonOutcome.transportVerified &&
      lateProjectionPoisonOutcome.exactSingleJsonReceipt &&
      lateProjectionPoisonOutcome.challengeVerified &&
      candidateMaterialMatchesPrimary &&
      lateProjectionValidation?.custody?.afterImportsValid === true &&
      lateProjectionValidation?.custody?.afterCallsValid === false &&
      lateProjectionValidation?.custody?.receipt?.afterCalls?.objectPrototype
        ?.identityVerified === false &&
      !lateProjectionPoisonOutcome.receiptValidated &&
      !lateProjectionPoisonOutcome.accepted,
  };
  if (!report.moduleBoundary.probe.lateProjectionPoisonSelfTest.rejected) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_LATE_PROJECTION_POISON_SELF_TEST_FAILED',
      message:
        'The final custody snapshot did not isolate and reject prototype poisoning triggered by a late candidate-derived projection getter.',
    });
    throw new Error('module-probe-late-projection-poison-self-test-failed');
  }

  report.anchorCustody.beforeGlobalNumberAccessorFixture = captureFileAnchors(
    moduleAnchorSpecifications
  );
  if (!report.anchorCustody.beforeGlobalNumberAccessorFixture.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message:
        'An anchored file drifted immediately before the global-Number-accessor child fixture.',
      phase: 'before-global-number-accessor-fixture',
    });
    throw new Error('before-global-number-accessor-anchor-drift');
  }
  const globalNumberAccessorChallenge = randomBytes(32).toString('hex');
  const globalNumberAccessorProbe = spawnSync(
    process.execPath,
    [
      moduleProbePath,
      distEsmPath,
      distCjsPath,
      rootDistEsmPath,
      rootDistCjsPath,
      'poison-global-number-accessor',
    ],
    {
      cwd: scratchRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: toolchain.env,
      input: `${globalNumberAccessorChallenge}\n`,
    }
  );
  report.anchorCustody.afterGlobalNumberAccessorFixture = captureFileAnchors(
    moduleAnchorSpecifications
  );
  if (!report.anchorCustody.afterGlobalNumberAccessorFixture.verified) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_ANCHOR_DRIFT',
      message: 'An anchored file drifted across the global-Number-accessor child fixture.',
      phase: 'after-global-number-accessor-fixture',
    });
    throw new Error('after-global-number-accessor-anchor-drift');
  }
  const globalNumberAccessorOutcome = childProbeExecutionReceipt(
    globalNumberAccessorProbe,
    globalNumberAccessorChallenge
  );
  const globalNumberAccessorValidation = globalNumberAccessorOutcome.validation;
  const globalNumberAccessorCandidateMaterialMatchesPrimary =
    globalNumberAccessorValidation !== null &&
    exactJsonEqual(
      globalNumberAccessorValidation.namespaces,
      primaryOutcome.validation.namespaces
    ) &&
    exactJsonEqual(
      globalNumberAccessorValidation.contract,
      primaryOutcome.validation.contract
    );
  const globalNumberAccessorFinalCustody =
    globalNumberAccessorValidation?.custody?.receipt?.afterCalls ?? null;
  const globalNumberAccessorIntrinsics =
    globalNumberAccessorFinalCustody?.intrinsics ?? null;
  const onlyGlobalNumberDescriptorRejected =
    strictObjectKeys(globalNumberAccessorIntrinsics, EXPECTED_INTRINSIC_CUSTODY_KEYS) &&
    globalNumberAccessorIntrinsics.globalNumber === false &&
    EXPECTED_INTRINSIC_CUSTODY_KEYS.every(
      (key) => key === 'globalNumber' || globalNumberAccessorIntrinsics[key] === true
    );
  const globalNumberGetterNotInvoked =
    prototypeProbeReceiptValid(
      globalNumberAccessorFinalCustody?.objectPrototype,
      PRISTINE_OBJECT_PROTOTYPE_SNAPSHOT
    ) &&
    prototypeProbeReceiptValid(
      globalNumberAccessorFinalCustody?.arrayPrototype,
      PRISTINE_ARRAY_PROTOTYPE_SNAPSHOT
    );
  report.moduleBoundary.probe.globalNumberAccessorSelfTest = {
    ...globalNumberAccessorOutcome,
    poisonTrigger:
      'global-Number-accessor-returns-original-and-poisons-Object-prototype-on-any-read',
    candidateMaterialMatchesPrimary: globalNumberAccessorCandidateMaterialMatchesPrimary,
    afterImportsCustodyValid:
      globalNumberAccessorValidation?.custody?.afterImportsValid === true,
    onlyGlobalNumberDescriptorRejected,
    accessorNotInvokedBeforeOrDuringSerialization: globalNumberGetterNotInvoked,
    rejected:
      globalNumberAccessorOutcome.transportVerified &&
      globalNumberAccessorOutcome.exactSingleJsonReceipt &&
      globalNumberAccessorOutcome.challengeVerified &&
      globalNumberAccessorCandidateMaterialMatchesPrimary &&
      globalNumberAccessorValidation?.custody?.afterImportsValid === true &&
      globalNumberAccessorValidation?.custody?.afterCallsValid === false &&
      onlyGlobalNumberDescriptorRejected &&
      globalNumberGetterNotInvoked &&
      !globalNumberAccessorOutcome.receiptValidated &&
      !globalNumberAccessorOutcome.accepted,
  };
  if (!report.moduleBoundary.probe.globalNumberAccessorSelfTest.rejected) {
    report.blockers.push({
      code: 'HOLOKEY_MODULE_PROBE_GLOBAL_NUMBER_ACCESSOR_SELF_TEST_FAILED',
      message:
        'The terminal descriptor audit did not reject a delayed global Number accessor without invoking its prototype-poisoning getter during custody or serialization.',
    });
    throw new Error('module-probe-global-number-accessor-self-test-failed');
  }

  report.anchorCustody.verified =
    report.anchorCustody.afterNativeRows.verified &&
    report.anchorCustody.afterNativeContentBinding.verified &&
    report.anchorCustody.beforeModuleProbe.verified &&
    report.anchorCustody.afterEarlyExitSelfTest.verified &&
    report.anchorCustody.beforeMissingChallengeFixture.verified &&
    report.anchorCustody.afterMissingChallengeFixture.verified &&
    report.anchorCustody.beforeExtraChallengeFixture.verified &&
    report.anchorCustody.afterExtraChallengeFixture.verified &&
    report.anchorCustody.beforeForgedReceiptFixture.verified &&
    report.anchorCustody.afterForgedReceiptFixture.verified &&
    report.anchorCustody.beforePrimaryProbe.verified &&
    report.anchorCustody.afterModuleProbe.verified &&
    report.anchorCustody.beforeIntrinsicPoisonFixture.verified &&
    report.anchorCustody.afterIntrinsicPoisonFixture.verified &&
    report.anchorCustody.beforeLateProjectionPoisonFixture.verified &&
    report.anchorCustody.afterLateProjectionPoisonFixture.verified &&
    report.anchorCustody.beforeGlobalNumberAccessorFixture.verified &&
    report.anchorCustody.afterGlobalNumberAccessorFixture.verified;
  const moduleValidation = primaryOutcome.validation;
  report.moduleBoundary.esmAuthority = moduleValidation.namespaces.esmAuthority;
  report.moduleBoundary.cjsAuthority = moduleValidation.namespaces.cjsAuthority;
  report.moduleBoundary.esmRoot = moduleValidation.namespaces.esmRoot;
  report.moduleBoundary.cjsRoot = moduleValidation.namespaces.cjsRoot;
  report.moduleBoundary.dedicatedExportParity =
    report.moduleBoundary.esmAuthority.exact &&
    report.moduleBoundary.cjsAuthority.exact &&
    report.moduleBoundary.esmAuthority.sha256 === report.moduleBoundary.cjsAuthority.sha256 &&
    report.moduleBoundary.esmAuthority.count > 0;
  report.moduleBoundary.rootExportParity =
    report.moduleBoundary.esmRoot.exact &&
    report.moduleBoundary.cjsRoot.exact &&
    report.moduleBoundary.esmRoot.sha256 === report.moduleBoundary.cjsRoot.sha256 &&
    report.moduleBoundary.esmRoot.count > 0;
  report.moduleBoundary.dedicatedContractCallable =
    moduleValidation.contract.dedicatedContractCallable;
  report.moduleBoundary.esmRootIntersection = moduleValidation.contract.esmRootIntersection;
  report.moduleBoundary.cjsRootIntersection = moduleValidation.contract.cjsRootIntersection;
  report.moduleBoundary.rootExportsAbsent =
    report.moduleBoundary.esmRootIntersection.length === 0 &&
    report.moduleBoundary.cjsRootIntersection.length === 0;
  report.moduleBoundary.esmSelfProjection = moduleValidation.contract.esmSelfProjection;
  report.moduleBoundary.cjsSelfProjection = moduleValidation.contract.cjsSelfProjection;
  report.moduleBoundary.crossInstanceProjectionRejected =
    moduleValidation.contract.crossInstanceProjectionRejected;
  report.moduleBoundary.authenticatedDurableReadbackClaimed =
    moduleValidation.contract.authenticatedDurableReadbackClaimed;
  report.moduleBoundary.objectPrototypeCustody = {
    expected: PRISTINE_OBJECT_PROTOTYPE_SNAPSHOT.receipt,
    actual: moduleValidation.custody.receipt.afterCalls.objectPrototype.actual,
    identityVerified:
      moduleValidation.custody.receipt.afterCalls.objectPrototype.identityVerified,
    afterImportsVerified: moduleValidation.custody.afterImportsValid,
    afterCallsVerified: moduleValidation.custody.afterCallsValid,
    verified:
      moduleValidation.custody.afterImportsValid && moduleValidation.custody.afterCallsValid,
  };
  report.moduleBoundary.probe.passed =
    primaryOutcome.accepted &&
    report.moduleBoundary.probe.earlyExitSelfTest.rejected &&
    report.moduleBoundary.probe.missingChallengeSelfTest.rejected &&
    report.moduleBoundary.probe.extraChallengeSelfTest.rejected &&
    report.moduleBoundary.probe.forgedReceiptSelfTest.rejected &&
    report.moduleBoundary.probe.wrongChallengeMutationSelfTest.rejected &&
    report.moduleBoundary.probe.intrinsicPoisonSelfTest.rejected &&
    report.moduleBoundary.probe.lateProjectionPoisonSelfTest.rejected &&
    report.moduleBoundary.probe.globalNumberAccessorSelfTest.rejected;
  report.moduleBoundary.passed =
    report.moduleBoundary.manifestDedicatedSubpath &&
    report.moduleBoundary.namespacePolicySelfTest.passed &&
    report.moduleBoundary.objectPrototypeCustody.verified &&
    report.moduleBoundary.probe.passed &&
    report.moduleBoundary.dedicatedExportParity &&
    report.moduleBoundary.rootExportParity &&
    report.moduleBoundary.dedicatedContractCallable &&
    report.moduleBoundary.rootExportsAbsent &&
    report.moduleBoundary.esmSelfProjection &&
    report.moduleBoundary.cjsSelfProjection &&
    report.moduleBoundary.crossInstanceProjectionRejected &&
    !report.moduleBoundary.authenticatedDurableReadbackClaimed &&
    report.anchorCustody.verified;
  if (!report.moduleBoundary.passed) {
    report.blockers.push({
      code: 'HOLOKEY_PACKAGE_MODULE_BOUNDARY_INVALID',
      message:
        'The isolated built-package probe did not preserve exact ESM/CJS namespaces, descriptors, prototypes, captured intrinsics, root isolation, callable contract, local module brand, cross-instance rejection, bootstrap-only claims, and anchored-file custody.',
    });
    throw new Error('package-module-boundary-invalid');
  }

  const bootstrapMask = moduleValidation.contract.bootstrapTransitionTableBitmask;
  report.equivalence.bootstrapTransitionTableBitmask = bootstrapMask;
  report.equivalence.matchesReviewedExpected =
    Number.isSafeInteger(bootstrapMask) &&
    nativeRowsMatchReviewedExpected &&
    bootstrapMask === EXPECTED_TRANSITION_TABLE_BITMASK;
  if (!report.equivalence.matchesReviewedExpected) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_TRANSITION_TABLE_DRIFT',
      message:
        'The three native row masks and isolated bootstrap adapter do not reproduce the reviewed 16833 transition-table bitmask.',
    });
    throw new Error('transition-table-bootstrap-drift');
  }

  report.blockers.push({
    code: 'HOLOKEY_NATIVE_AUTHORITY_SURFACE_INCOMPLETE',
    message:
      'The canon-manifest-bound compiler proves the complete state/action table and a bounded one-block SHA-256 byte binding; it does not materialize arbitrary bounded canonical JSON, detached signature verification, atomic compare-and-commit, an authenticated durable HoloKey authority root/readback, or the importable ESM/CJS package implementation.',
  });
  report.blockers.push({
    code: 'HOLOREPO_IDENTITY_MUTATOR_MIGRATION_INCOMPLETE',
    message:
      'The current packed HoloRepo still exposes legacy repository-identity mutators; production ownership is blocked until verifier-facade migration removes that competing mutation surface.',
  });
} catch (error) {
  if (report.blockers.length === 0) {
    report.blockers.push({
      code: 'HOLOKEY_NATIVE_CHECK_INTERNAL_FAILURE',
      message: error instanceof Error ? error.message : 'unknown native check failure',
    });
  }
} finally {
  if (scratchRoot && existsSync(scratchRoot)) {
    const resolvedTmp = realpathSync(tmpdir());
    const resolvedScratch = realpathSync(scratchRoot);
    if (resolvedScratch !== resolvedTmp && isInside(resolvedTmp, resolvedScratch)) {
      rmSync(resolvedScratch, { recursive: true, force: true });
    }
  }
}

process.stdout.write(`${JSON.stringify(report)}\n`);
process.exitCode = report.publicationEligible ? 0 : 1;
