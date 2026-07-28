#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../..');
const pilotRoot = resolve(repoRoot, 'research/paradox-to-proof/pp003');
const corpusPath = resolve(pilotRoot, 'fixture-corpus.json');
const receiptPath = resolve(pilotRoot, 'pp003-receipt.json');
const guardPath = resolve(
  repoRoot,
  'packages/plugins/holonews-plugin/src/traits/proof-adjacency-guard.mjs'
);

const corpus = JSON.parse(await readFile(corpusPath, 'utf8'));
const { buildKioskDisplayModel } = await import(pathToFileURL(guardPath).href);

function fixtureById(id) {
  const fixture = corpus.targetForms.find((candidate) => candidate.id === id);
  assert.ok(fixture, `fixture ${id} must exist`);
  return fixture;
}

function makeReceipt(fixture) {
  return {
    receiptId: `pp003-${fixture.id}`,
    traceId: `pp003-${fixture.paperId.toLowerCase()}`,
    verifyUrl: fixture.proof.verifyUrl,
    verdict: 'proven',
    hashChainValid: true,
    replayValid: true,
    claimText: fixture.proof.claim,
    notProvenWall: fixture.boundary.text,
  };
}

function displayModelFor(fixture) {
  const model = buildKioskDisplayModel(makeReceipt(fixture), true);
  assert.equal(model.policy, 'badge-with-wall');
  assert.equal(model.showBadge, true);
  assert.equal(model.wallText, fixture.boundary.text);
  return model;
}

function renderApiArtifact(fixture) {
  const model = displayModelFor(fixture);
  const artifact = {
    schemaVersion: 'holoscript-proof-scope-composite-v0-pilot',
    target: 'api-json',
    composite: {
      id: fixture.compositeId,
      type: 'proof-with-scope-boundary',
      proofMarker: {
        compositeId: fixture.compositeId,
        role: 'proof-marker',
        label: fixture.proof.marker,
        claim: model.claimText,
        proofId: fixture.proof.proofId,
        prominence: fixture.presentation.proofProminence,
      },
      scopeBoundary: {
        compositeId: fixture.compositeId,
        role: 'scope-boundary',
        label: fixture.boundary.marker,
        text: model.wallText,
        prominence: fixture.presentation.boundaryProminence,
      },
      verification: { url: model.verifyUrl },
      binding: 'same-object',
    },
  };
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

function xmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderTspans(lines, x, lineHeight) {
  return lines
    .map(
      (line, index) =>
        `      <tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${xmlEscape(line)}</tspan>`
    )
    .join('\n');
}

function renderSvgArtifact(fixture) {
  const model = displayModelFor(fixture);
  const p = fixture.presentation;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.width} ${p.height}" role="img" aria-labelledby="pp003-title pp003-desc">`,
    '  <title id="pp003-title">P42 proof-scope social card</title>',
    '  <desc id="pp003-desc">A proof marker and equally prominent not-proven boundary bound in one social-card group.</desc>',
    `  <rect width="${p.width}" height="${p.height}" fill="#10151f" />`,
    `  <g data-role="proof-scope-composite" data-composite-id="${fixture.compositeId}">`,
    `    <text data-role="proof-marker" data-label="${fixture.proof.marker}" data-composite-id="${fixture.compositeId}" x="${p.proofX}" y="${p.proofY}" font-size="${p.proofFontSize}" font-weight="${p.proofFontWeight}" opacity="1" fill="#6ee7a8">${fixture.proof.marker}</text>`,
    `    <text data-role="proof-claim" data-composite-id="${fixture.compositeId}" x="${p.proofX}" y="${p.claimY}" font-size="${p.claimFontSize}" font-weight="500" opacity="1" fill="#ffffff">`,
    renderTspans(fixture.proof.claimLines, p.proofX, p.lineHeight),
    '    </text>',
    `    <text data-role="scope-boundary" data-label="${fixture.boundary.marker}" data-composite-id="${fixture.compositeId}" x="${p.boundaryX}" y="${p.boundaryY}" font-size="${p.boundaryFontSize}" font-weight="${p.boundaryFontWeight}" opacity="1" fill="#ffb4a2">${fixture.boundary.marker}</text>`,
    `    <text data-role="scope-text" data-composite-id="${fixture.compositeId}" x="${p.boundaryX}" y="${p.boundaryTextY}" font-size="${p.boundaryTextFontSize}" font-weight="500" opacity="1" fill="#ffffff">`,
    renderTspans(fixture.boundary.textLines, p.boundaryX, p.lineHeight),
    '    </text>',
    `    <a data-role="verify-link" href="${xmlEscape(model.verifyUrl)}">`,
    '      <text x="64" y="568" font-size="22" font-weight="500" fill="#8ec5ff">Re-run the scoped receipt</text>',
    '    </a>',
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

function violation(code, message) {
  return { code, message };
}

function verifyApiArtifact(serialized) {
  const violations = [];
  let artifact;
  try {
    artifact = JSON.parse(serialized);
  } catch (error) {
    return { ok: false, violations: [violation('invalid-json', error.message)] };
  }

  const composite = artifact.composite;
  if (!composite || composite.type !== 'proof-with-scope-boundary') {
    violations.push(violation('missing-proof-composite', 'Typed proof composite is absent.'));
    return { ok: false, violations };
  }

  const marker = composite.proofMarker;
  const boundary = composite.scopeBoundary;
  if (!marker || marker.label !== 'PROVEN') {
    violations.push(violation('missing-proof-marker', 'PROVEN marker is absent.'));
  }
  if (!boundary) {
    violations.push(
      violation('missing-scope-boundary', 'Scope boundary is absent from the typed composite.')
    );
  } else {
    if (boundary.label !== 'NOT PROVEN') {
      violations.push(
        violation('invalid-boundary-label', 'Boundary must be explicitly labeled NOT PROVEN.')
      );
    }
    if (typeof boundary.text !== 'string' || boundary.text.trim() === '') {
      violations.push(violation('empty-boundary-text', 'Boundary explanation is empty.'));
    }
    const markerProminence = marker?.prominence;
    const boundaryProminence = boundary.prominence;
    if (
      typeof markerProminence !== 'number' ||
      typeof boundaryProminence !== 'number' ||
      !Number.isFinite(markerProminence) ||
      !Number.isFinite(boundaryProminence) ||
      markerProminence <= 0 ||
      boundaryProminence <= 0
    ) {
      violations.push(
        violation('invalid-prominence', 'Both proof and boundary need finite prominence values.')
      );
    } else if (boundaryProminence < markerProminence) {
      violations.push(
        violation(
          'boundary-less-prominent',
          'Boundary prominence is lower than proof-marker prominence.'
        )
      );
    }
    if (marker && (marker.compositeId !== composite.id || boundary.compositeId !== composite.id)) {
      violations.push(
        violation(
          'composite-binding-mismatch',
          'Proof marker and boundary are not identically bound.'
        )
      );
    }
  }
  if (composite.binding !== 'same-object') {
    violations.push(violation('weak-binding', 'API target must keep both roles in one object.'));
  }
  if (!composite.verification?.url?.startsWith('https://')) {
    violations.push(
      violation('missing-verify-link', 'A portable HTTPS verification link is required.')
    );
  }
  return { ok: violations.length === 0, violations };
}

function elementByRole(container, role) {
  const pattern = new RegExp(`<text\\b(?=[^>]*data-role="${role}")[^>]*>[\\s\\S]*?<\\/text>`);
  return container.match(pattern)?.[0];
}

function attributesOf(element) {
  return element?.match(/^<text\b([^>]*)>/)?.[1] ?? '';
}

function attribute(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return match?.[1];
}

function isHidden(attributes) {
  const style = attribute(attributes, 'style') ?? '';
  const fill = (attribute(attributes, 'fill') ?? '').toLowerCase();
  return (
    attribute(attributes, 'display') === 'none' ||
    attribute(attributes, 'visibility') === 'hidden' ||
    Number(attribute(attributes, 'opacity') ?? '1') <= 0 ||
    Number(attribute(attributes, 'fill-opacity') ?? '1') <= 0 ||
    fill === 'none' ||
    fill === 'transparent' ||
    /^#[0-9a-f]{6}00$/i.test(fill) ||
    /^#[0-9a-f]{3}0$/i.test(fill) ||
    /^rgba\([^,]+,[^,]+,[^,]+,\s*0(?:\.0*)?\s*\)$/i.test(fill) ||
    /(?:display\s*:\s*none|visibility\s*:\s*hidden|(?:fill-)?opacity\s*:\s*0(?:\.0*)?(?:\D|$)|fill\s*:\s*(?:none|transparent))/i.test(
      style
    )
  );
}

function numericPresentationAttribute(attributes, name, allowPx = false) {
  const raw = attribute(attributes, name);
  if (raw === undefined) return Number.NaN;
  const pattern = allowPx
    ? /^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/i
    : /^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  return pattern.test(raw) ? Number.parseFloat(raw) : Number.NaN;
}

function effectiveOpacity(attributes) {
  const opacity = numericPresentationAttribute(attributes, 'opacity');
  const fillOpacityRaw = attribute(attributes, 'fill-opacity');
  const fillOpacity =
    fillOpacityRaw === undefined ? 1 : numericPresentationAttribute(attributes, 'fill-opacity');
  return opacity * fillOpacity;
}

function hasUnsupportedVisualIndirection(attributes) {
  return ['class', 'transform', 'clip-path', 'mask', 'filter'].some(
    (name) => attribute(attributes, name) !== undefined
  );
}

function visibleText(element) {
  return (element ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function verifySvgArtifact(serialized) {
  const violations = [];
  const viewBox = serialized
    .match(/<svg\b[^>]*viewBox="([^"]+)"/)?.[1]
    ?.split(/\s+/)
    .map(Number);
  if (!viewBox || viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) {
    return {
      ok: false,
      violations: [violation('invalid-viewport', 'SVG viewBox is absent or invalid.')],
    };
  }
  const [minX, minY, width, height] = viewBox;
  if (width <= 0 || height <= 0) {
    return {
      ok: false,
      violations: [violation('invalid-viewport', 'SVG viewBox dimensions must be positive.')],
    };
  }
  const group = serialized.match(
    /<g\b([^>]*)data-role="proof-scope-composite"([^>]*)>([\s\S]*?)<\/g>/
  );
  if (!group) {
    return {
      ok: false,
      violations: [violation('missing-proof-composite', 'Bound SVG composite group is absent.')],
    };
  }

  const groupAttributes = `${group[1]} ${group[2]}`;
  const groupBody = group[3];
  const groupId = attribute(groupAttributes, 'data-composite-id');
  const markerElement = elementByRole(groupBody, 'proof-marker');
  const boundaryElement = elementByRole(groupBody, 'scope-boundary');
  const scopeTextElement = elementByRole(groupBody, 'scope-text');

  if (isHidden(groupAttributes)) {
    violations.push(
      violation('composite-hidden', 'The enclosing proof-scope composite is hidden.')
    );
  }
  if (hasUnsupportedVisualIndirection(groupAttributes) || /<style\b/i.test(groupBody)) {
    violations.push(
      violation(
        'unsupported-visual-indirection',
        'Pilot SVGs reject class, transform, clipping, masking, filtering, and style blocks.'
      )
    );
  }

  if (!markerElement) {
    violations.push(violation('missing-proof-marker', 'Visible PROVEN marker is absent.'));
  }
  if (!boundaryElement) {
    violations.push(
      violation('missing-scope-boundary', 'Visible NOT PROVEN marker is absent from the group.')
    );
  }
  if (!scopeTextElement) {
    violations.push(
      violation('missing-boundary-text', 'Boundary explanation is absent from the group.')
    );
  }

  if (markerElement && boundaryElement) {
    const markerAttributes = attributesOf(markerElement);
    const boundaryAttributes = attributesOf(boundaryElement);
    const scopeTextAttributes = attributesOf(scopeTextElement);
    if (attribute(markerAttributes, 'data-label') !== 'PROVEN') {
      violations.push(violation('invalid-proof-label', 'Proof marker must be explicitly PROVEN.'));
    }
    if (attribute(boundaryAttributes, 'data-label') !== 'NOT PROVEN') {
      violations.push(
        violation('invalid-boundary-label', 'Boundary must be explicitly labeled NOT PROVEN.')
      );
    }
    if (visibleText(boundaryElement) !== 'NOT PROVEN') {
      violations.push(
        violation('visible-label-mismatch', 'Visible boundary text must say NOT PROVEN.')
      );
    }
    if (!visibleText(scopeTextElement)) {
      violations.push(violation('empty-boundary-text', 'Visible boundary explanation is empty.'));
    }
    if (isHidden(boundaryAttributes) || isHidden(scopeTextAttributes)) {
      violations.push(
        violation('boundary-hidden', 'Boundary content is hidden by render attributes.')
      );
    }

    const markerSize = numericPresentationAttribute(markerAttributes, 'font-size', true);
    const boundarySize = numericPresentationAttribute(boundaryAttributes, 'font-size', true);
    const markerWeight = numericPresentationAttribute(markerAttributes, 'font-weight');
    const boundaryWeight = numericPresentationAttribute(boundaryAttributes, 'font-weight');
    const markerOpacity = effectiveOpacity(markerAttributes);
    const boundaryOpacity = effectiveOpacity(boundaryAttributes);
    if (
      ![
        markerSize,
        boundarySize,
        markerWeight,
        boundaryWeight,
        markerOpacity,
        boundaryOpacity,
      ].every((value) => Number.isFinite(value) && value > 0)
    ) {
      violations.push(
        violation(
          'invalid-prominence',
          'Proof and boundary prominence must be finite and positive.'
        )
      );
    } else if (
      boundarySize < markerSize ||
      boundaryWeight < markerWeight ||
      boundaryOpacity < markerOpacity
    ) {
      violations.push(
        violation(
          'boundary-less-prominent',
          'Boundary font size, weight, or effective opacity is lower than the proof marker.'
        )
      );
    }

    const boundaryX = Number(attribute(boundaryAttributes, 'x'));
    const boundaryY = Number(attribute(boundaryAttributes, 'y'));
    if (
      !Number.isFinite(boundaryX) ||
      !Number.isFinite(boundaryY) ||
      boundaryX < minX ||
      boundaryX >= minX + width ||
      boundaryY < minY ||
      boundaryY >= minY + height
    ) {
      violations.push(
        violation('boundary-outside-viewport', 'Boundary marker lies outside the SVG viewport.')
      );
    }

    const scopeX = Number(attribute(scopeTextAttributes, 'x'));
    const scopeY = Number(attribute(scopeTextAttributes, 'y'));
    if (
      !Number.isFinite(scopeX) ||
      !Number.isFinite(scopeY) ||
      scopeX < minX ||
      scopeX >= minX + width ||
      scopeY < minY ||
      scopeY >= minY + height
    ) {
      violations.push(
        violation(
          'boundary-text-outside-viewport',
          'Boundary explanation lies outside the SVG viewport.'
        )
      );
    }

    if (
      [markerAttributes, boundaryAttributes, scopeTextAttributes].some(
        hasUnsupportedVisualIndirection
      )
    ) {
      violations.push(
        violation(
          'unsupported-visual-indirection',
          'Pilot roles reject transforms, classes, clipping, masks, and filters.'
        )
      );
    }

    const identities = [
      attribute(markerAttributes, 'data-composite-id'),
      attribute(boundaryAttributes, 'data-composite-id'),
      attribute(scopeTextAttributes, 'data-composite-id'),
    ];
    if (!groupId || identities.some((identity) => identity !== groupId)) {
      violations.push(
        violation('composite-binding-mismatch', 'SVG roles do not share the enclosing identity.')
      );
    }
  }

  if (!/<a\b(?=[^>]*data-role="verify-link")(?=[^>]*href="https:\/\/)[^>]*>/.test(groupBody)) {
    violations.push(
      violation('missing-verify-link', 'Portable HTTPS verification link is absent.')
    );
  }
  return { ok: violations.length === 0, violations };
}

function mutateApi(serialized, attackId) {
  const artifact = JSON.parse(serialized);
  const composite = artifact.composite;
  if (attackId === 'api-delete-boundary') {
    delete composite.scopeBoundary;
  } else if (attackId === 'api-detach-boundary') {
    artifact.detachedScopeBoundary = composite.scopeBoundary;
    delete composite.scopeBoundary;
  } else if (attackId === 'api-demote-boundary') {
    composite.scopeBoundary.prominence = composite.proofMarker.prominence - 1;
  } else if (attackId === 'api-relabel-boundary') {
    composite.scopeBoundary.label = 'CONTEXT';
  } else if (attackId === 'api-break-binding') {
    composite.scopeBoundary.compositeId = 'detached-boundary';
  } else if (attackId === 'api-remove-prominence') {
    delete composite.proofMarker.prominence;
    delete composite.scopeBoundary.prominence;
  } else if (attackId === 'api-string-prominence') {
    composite.proofMarker.prominence = '100';
    composite.scopeBoundary.prominence = '100';
  } else {
    throw new Error(`unknown API attack: ${attackId}`);
  }
  return JSON.stringify(artifact, null, 2);
}

function mutateSvgElement(serialized, role, transform) {
  const pattern = new RegExp(`<text\\b(?=[^>]*data-role="${role}")[^>]*>[\\s\\S]*?<\\/text>`);
  const element = serialized.match(pattern)?.[0];
  assert.ok(element, `SVG role ${role} must exist before mutation`);
  return serialized.replace(element, transform(element));
}

function mutateSvg(serialized, attackId) {
  if (attackId === 'svg-delete-boundary') {
    return mutateSvgElement(serialized, 'scope-boundary', () => '');
  }
  if (attackId === 'svg-hide-boundary') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace('<text ', '<text display="none" ')
    );
  }
  if (attackId === 'svg-demote-boundary') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace(/font-size="[^"]+"/, 'font-size="12"')
    );
  }
  if (attackId === 'svg-crop-boundary') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace(/ y="[^"]+"/, ' y="900"')
    );
  }
  if (attackId === 'svg-break-binding') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace(/data-composite-id="[^"]+"/, 'data-composite-id="detached-boundary"')
    );
  }
  if (attackId === 'svg-hide-composite') {
    return serialized.replace(
      '<g data-role="proof-scope-composite"',
      '<g display="none" data-role="proof-scope-composite"'
    );
  }
  if (attackId === 'svg-shift-viewbox') {
    return serialized.replace('viewBox="0 0 1200 630"', 'viewBox="1000 0 1200 630"');
  }
  if (attackId === 'svg-unit-demote-boundary') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace(/font-size="[^"]+"/, 'font-size="1px"')
    );
  }
  if (attackId === 'svg-transparent-boundary') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace('<text ', '<text fill-opacity="0" ')
    );
  }
  if (attackId === 'svg-visible-relabel') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace('>NOT PROVEN</text>', '>CONTEXT</text>')
    );
  }
  if (attackId === 'svg-opacity-demote') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace('opacity="1"', 'opacity="0.000001"')
    );
  }
  if (attackId === 'svg-empty-scope-text') {
    return mutateSvgElement(serialized, 'scope-text', (element) =>
      element.replace(/>[^]*<\/text>/, '></text>')
    );
  }
  if (attackId === 'svg-transparent-paint') {
    return mutateSvgElement(serialized, 'scope-boundary', (element) =>
      element.replace(/fill="[^"]+"/, 'fill="#00000000"')
    );
  }
  if (attackId === 'svg-transform-composite') {
    return serialized.replace(
      '<g data-role="proof-scope-composite"',
      '<g transform="translate(2000 0)" data-role="proof-scope-composite"'
    );
  }
  if (attackId === 'svg-crop-scope-text') {
    return mutateSvgElement(serialized, 'scope-text', (element) =>
      element.replace(/ y="[^"]+"/, ' y="900"')
    );
  }
  throw new Error(`unknown SVG attack: ${attackId}`);
}

function verifyArtifact(fixture, serialized) {
  return fixture.target === 'api-json'
    ? verifyApiArtifact(serialized)
    : verifySvgArtifact(serialized);
}

function renderArtifact(fixture) {
  return fixture.target === 'api-json' ? renderApiArtifact(fixture) : renderSvgArtifact(fixture);
}

function mutateArtifact(fixture, serialized, attackId) {
  return fixture.target === 'api-json'
    ? mutateApi(serialized, attackId)
    : mutateSvg(serialized, attackId);
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

test('fixture corpus binds P29 and P42 to two distinct target forms', () => {
  assert.deepEqual(
    new Set(corpus.targetForms.map((fixture) => fixture.paperId)),
    new Set(['P29', 'P42'])
  );
  assert.deepEqual(
    new Set(corpus.targetForms.map((fixture) => fixture.target)),
    new Set(['api-json', 'social-card-svg'])
  );
  assert.equal(
    corpus.attacks.filter((attack) => attack.targetFixture === 'p29-api-json').length,
    7
  );
  assert.equal(
    corpus.attacks.filter((attack) => attack.targetFixture === 'p42-social-card-svg').length,
    15
  );
});

for (const fixture of corpus.targetForms) {
  test(`${fixture.id}: committed target artifact is deterministic and passes adjacency`, async () => {
    const emitted = renderArtifact(fixture);
    const committed = await readFile(resolve(repoRoot, fixture.artifactPath), 'utf8');
    assert.equal(committed, emitted, 'committed target artifact drifted from the pilot emitter');
    assert.deepEqual(verifyArtifact(fixture, committed), { ok: true, violations: [] });
  });
}

test('negative control: a safe upstream display model does not certify a mutated target artifact', () => {
  const fixture = fixtureById('p29-api-json');
  const model = displayModelFor(fixture);
  const detached = mutateApi(renderApiArtifact(fixture), 'api-delete-boundary');
  assert.equal(
    model.showBadge,
    true,
    'upstream guard should still believe the target is wall-capable'
  );
  assert.equal(
    verifyApiArtifact(detached).ok,
    false,
    'artifact-level verifier must catch post-model detachment'
  );
});

for (const attack of corpus.attacks) {
  test(`rejects laundering fixture ${attack.id}`, () => {
    const fixture = fixtureById(attack.targetFixture);
    const attacked = mutateArtifact(fixture, renderArtifact(fixture), attack.id);
    const result = verifyArtifact(fixture, attacked);
    assert.equal(result.ok, false, `${attack.id} unexpectedly passed`);
    assert.ok(
      result.violations.some((entry) => entry.code === attack.expectedViolation),
      `${attack.id} expected ${attack.expectedViolation}, got ${JSON.stringify(result.violations)}`
    );
  });
}

test('durable receipt binds the exact pilot inputs, code, and emitted artifacts', async () => {
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  assert.equal(receipt.paradoxCard, 'PP-003');
  assert.equal(receipt.result.stage, 'falsifiable');
  assert.equal(receipt.result.verdict, 'unresolved');
  assert.equal(receipt.result.targetFormsPassed, 2);
  assert.equal(receipt.result.adversarialFixturesRejected, corpus.attacks.length);
  assert.equal(receipt.hashScheme, 'sha256-canonical-json-excluding-payloadHash');
  const { payloadHash, ...hashPayload } = receipt;
  assert.equal(
    payloadHash,
    createHash('sha256').update(canonicalJson(hashPayload)).digest('hex'),
    'receipt payload hash must seal every claim and binding'
  );
  for (const binding of receipt.codeState.sha256Bindings) {
    const actual = await sha256(resolve(repoRoot, binding.path));
    assert.equal(actual, binding.sha256, `receipt hash drifted for ${binding.path}`);
  }
});
