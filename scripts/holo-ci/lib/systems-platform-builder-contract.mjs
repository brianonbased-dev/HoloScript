import { createHash } from 'node:crypto';

export function sha256(input) {
  return createHash('sha256').update(input).digest('hex');
}

function isFullCommit(value) {
  return /^[0-9a-f]{40}$/u.test(String(value || ''));
}

function secretShapedPath(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const result = secretShapedPath(value[index], `${path}[${index}]`);
      if (result) return result;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (/(?:token|password|private.?key|secret|authorization)/iu.test(key)) return childPath;
    const result = secretShapedPath(child, childPath);
    if (result) return result;
  }
  return null;
}

export function validateSystemsPlatformBuilderContract(contract) {
  const errors = [];
  if (contract?.schema !== 'holoscript.systems-compatible-builder-contract/v1') {
    errors.push('builder contract schema mismatch');
  }
  if (contract?.distributionId !== 'holoscript-systems-toolchain') {
    errors.push('builder contract distribution identity mismatch');
  }
  if (!/^\d+\.\d+\.\d+$/u.test(String(contract?.releaseVersion || ''))) {
    errors.push('builder contract releaseVersion must be SemVer');
  }
  const platform = contract?.platform;
  if (
    !platform?.id ||
    platform.id !== `${platform.os}-${platform.cpu}` ||
    platform.builderPolicy !== 'compatible-host-only'
  ) {
    errors.push('builder contract platform must require its exact compatible host');
  }
  if (!platform?.package?.startsWith('@holoscript/systems-')) {
    errors.push('builder contract platform package identity mismatch');
  }
  if (contract?.metaPackage?.name !== '@holoscript/systems') {
    errors.push('builder contract meta package identity mismatch');
  }
  if (contract?.metaPackage?.version !== contract?.releaseVersion) {
    errors.push('builder contract meta package version mismatch');
  }
  if (contract?.metaPackage?.platformNeutral !== true) {
    errors.push('builder contract meta package must remain platform-neutral');
  }
  if (
    contract?.postPublicationGate?.required !== true ||
    contract?.postPublicationGate?.satisfiedByBuilderBundle !== false
  ) {
    errors.push('builder contract must keep the public macOS cold readback as a separate gate');
  }
  if (!Array.isArray(contract?.sourcePaths) || contract.sourcePaths.length === 0) {
    errors.push('builder contract must bind release source paths');
  }
  for (const key of ['metaTarball', 'platformTarball', 'receipt', 'bundle']) {
    if (!contract?.outputs?.[key] || /[\\/]/u.test(contract.outputs[key])) {
      errors.push(`builder contract output ${key} must be a basename`);
    }
  }
  for (const [key, expected] of Object.entries(contract?.requiredProofs || {})) {
    if (expected !== true && expected !== false && expected !== 5) {
      errors.push(`builder contract proof ${key} has an unsupported expectation`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateSystemsPlatformBuilderReceipt(
  receipt,
  { contract, files, expectedSourceCommit } = {}
) {
  const errors = [...validateSystemsPlatformBuilderContract(contract).errors];
  const platform = contract?.platform || {};
  if (receipt?.schema !== 'holoscript.systems-compatible-builder-receipt/v1') {
    errors.push('builder receipt schema mismatch');
  }
  if (receipt?.ok !== true) errors.push('builder receipt must explicitly pass');
  if (receipt?.distributionId !== contract?.distributionId) {
    errors.push('builder receipt distribution identity mismatch');
  }
  if (
    receipt?.releaseVersion !== contract?.releaseVersion ||
    receipt?.channel !== contract?.channel ||
    receipt?.machineContract !== contract?.machineContract
  ) {
    errors.push('builder receipt release identity mismatch');
  }
  if (!isFullCommit(receipt?.sourceCommit)) {
    errors.push('builder receipt sourceCommit must be a full Git commit');
  }
  if (expectedSourceCommit && receipt?.sourceCommit !== expectedSourceCommit) {
    errors.push(`builder receipt sourceCommit does not match ${expectedSourceCommit}`);
  }
  if (receipt?.contractSha256 !== sha256(Buffer.from(`${JSON.stringify(contract, null, 2)}\n`))) {
    errors.push('builder receipt contract digest mismatch');
  }
  if (
    receipt?.platform !== platform.id ||
    receipt?.builder?.os !== platform.os ||
    receipt?.builder?.arch !== platform.cpu ||
    receipt?.builder?.actualHost !== platform.id ||
    receipt?.builder?.rustTarget !== platform.rustTarget ||
    receipt?.builder?.kind !== 'compatible-host'
  ) {
    errors.push('builder receipt does not prove the exact compatible host');
  }
  if (receipt?.source?.cleanAtCommit !== true || receipt?.source?.head !== receipt?.sourceCommit) {
    errors.push('builder receipt does not bind a clean source checkout');
  }
  if (
    receipt?.proofs?.nativeCompile?.entry !== 'examples/native/multi-file-modules/entry.hs' ||
    receipt?.proofs?.nativeCompile?.exitCode !== 5
  ) {
    errors.push('builder receipt native multi-file proof must exit 5');
  }
  if (
    receipt?.proofs?.npmColdConsumer?.repoLess !== true ||
    receipt?.proofs?.npmColdConsumer?.inputOrigin !== 'packaged-conformance' ||
    receipt?.proofs?.npmColdConsumer?.exitCode !== 5
  ) {
    errors.push('builder receipt repo-less npm cold consumer must exit 5');
  }
  if (receipt?.publicStateMutated !== false) {
    errors.push('builder receipt must prove public state was not mutated');
  }
  if (
    receipt?.postPublicationGate?.required !== true ||
    receipt?.postPublicationGate?.satisfiedByBuilderBundle !== false
  ) {
    errors.push('builder receipt must not claim the post-publication macOS cold readback');
  }
  if (
    JSON.stringify(receipt?.baselinePlatformPackages) !==
    JSON.stringify(contract?.baselinePlatformPackages)
  ) {
    errors.push('builder receipt baseline platform pins mismatch');
  }

  const artifactExpectations = [
    ['meta', contract?.outputs?.metaTarball],
    ['platform', contract?.outputs?.platformTarball],
  ];
  for (const [id, fileName] of artifactExpectations) {
    const artifact = receipt?.artifacts?.[id];
    if (!artifact || artifact.file !== fileName) {
      errors.push(`builder receipt ${id} artifact identity mismatch`);
      continue;
    }
    if (artifact.sha256 !== artifact.deterministicRepackSha256) {
      errors.push(`builder receipt ${id} artifact was not reproduced exactly`);
    }
    const bytes = files?.get(fileName);
    if (!bytes) {
      errors.push(`builder bundle is missing ${fileName}`);
      continue;
    }
    if (bytes.length !== artifact.bytes) {
      errors.push(`builder bundle ${fileName} byte-size mismatch`);
    }
    if (sha256(bytes) !== artifact.sha256) {
      errors.push(`builder bundle ${fileName} digest mismatch`);
    }
  }

  const secretPath = secretShapedPath(receipt);
  if (secretPath) errors.push(`builder receipt contains secret-shaped field ${secretPath}`);
  return { ok: errors.length === 0, errors };
}
