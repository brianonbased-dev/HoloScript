function appendTargets(value, field, targets) {
  if (typeof value === 'string') {
    targets.push({ field, target: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => appendTargets(entry, `${field}[${index}]`, targets));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    appendTargets(entry, `${field}[${JSON.stringify(key)}]`, targets);
  }
}

export function declaredPackTargets(manifest) {
  const targets = [];
  for (const field of ['main', 'module', 'types', 'typings']) {
    appendTargets(manifest?.[field], field, targets);
  }
  appendTargets(manifest?.bin, 'bin', targets);
  appendTargets(manifest?.exports, 'exports', targets);
  appendTargets(manifest?.holoscript?.entrypoint, 'holoscript.entrypoint', targets);
  appendTargets(manifest?.holoscript?.exports, 'holoscript.exports', targets);
  return targets;
}

function targetPattern(target) {
  const raw = target.trim().replaceAll('\\', '/');
  if (
    !raw ||
    raw.startsWith('/') ||
    /^[A-Za-z]:\//u.test(raw) ||
    /^[A-Za-z][A-Za-z\d+.-]*:/u.test(raw)
  ) {
    return { invalid: true, normalized: raw };
  }

  const normalized = raw.replace(/^\.\//u, '');
  if (!normalized || normalized.split('/').includes('..')) {
    return { invalid: true, normalized };
  }
  if (normalized.endsWith('/')) {
    return { invalid: false, normalized, matches: (file) => file.startsWith(normalized) };
  }
  if (!normalized.includes('*')) {
    return { invalid: false, normalized, matches: (file) => file === normalized };
  }

  const expression = normalized
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.*');
  const regex = new RegExp(`^${expression}$`, 'u');
  return { invalid: false, normalized, matches: (file) => regex.test(file) };
}

export function findPackedTargetFindings(manifest, packedFilePaths) {
  const packed = [...new Set(packedFilePaths.map((file) => String(file).replaceAll('\\', '/')))];
  const findings = [];
  const seen = new Set();

  for (const { field, target } of declaredPackTargets(manifest)) {
    const key = `${field}\u0000${target}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pattern = targetPattern(target);
    if (pattern.invalid) {
      findings.push({
        level: 'BLOCKER',
        kind: 'packed-target-invalid',
        file: 'package.json',
        note: `${field} declares non-package target ${JSON.stringify(target)}`,
      });
      continue;
    }
    if (!packed.some(pattern.matches)) {
      findings.push({
        level: 'BLOCKER',
        kind: 'packed-target-missing',
        file: 'package.json',
        note: `${field} declares ${JSON.stringify(target)}, absent from npm pack files`,
      });
    }
  }

  return findings;
}
