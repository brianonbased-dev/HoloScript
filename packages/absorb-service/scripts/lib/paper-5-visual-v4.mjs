import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

export const PAPER_5_VISUAL_V4_PROTOCOL_SCHEMA = 'holoscript.paper5.visual-agent-study-protocol.v4';
export const PAPER_5_VISUAL_V4_DATASET_SCHEMA = 'holoscript.paper5.visual-agent-study-dataset.v4';
export const PAPER_5_VISUAL_V4_PACKET_SCHEMA = 'holoscript.paper5.visual-agent-packets.v4';
export const PAPER_5_VISUAL_V4_REQUEST_SCHEMA = 'holoscript.paper5.visual-agent-request.v4';
export const PAPER_5_VISUAL_V4_REQUEST_MANIFEST_SCHEMA =
  'holoscript.paper5.visual-agent-request-manifest.v4';
export const PAPER_5_VISUAL_V4_RESPONSE_SCHEMA = 'holoscript.paper5.visual-agent-response.v4';
export const PAPER_5_VISUAL_V4_RESULT_SCHEMA = 'holoscript.paper5.visual-agent-result.v4';

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/u.test(String(value ?? ''));
}

function normalizePath(value) {
  return String(value ?? '')
    .replace(/\\/gu, '/')
    .replace(/^\.\//u, '');
}

function check(checks, id, pass, detail) {
  checks.push({ id, pass: Boolean(pass), detail });
}

function relevantFilesFor(query) {
  return [...new Set((query?.relevantFiles ?? []).map(normalizePath))].sort();
}

function annotationFiles(annotation) {
  return [...new Set((annotation?.relevantFiles ?? []).map(normalizePath))].sort();
}

function annotationHasEvidence(annotation, file) {
  return (annotation?.evidence ?? []).some(
    (item) =>
      normalizePath(item?.file) === file &&
      (Number.isInteger(Number(item?.line)) ||
        Number.isInteger(Number(item?.lineStart)) ||
        String(item?.symbol ?? '').trim().length > 0)
  );
}

function queryAuditErrors(query, repositoryIds, protocol) {
  const errors = [];
  const relevant = relevantFilesFor(query);
  const candidates = [
    ...new Set((query?.candidates ?? []).map((item) => normalizePath(item.file))),
  ];
  const annotations = Array.isArray(query?.annotations) ? query.annotations : [];
  const minimumAnnotators = Number(
    protocol?.dataset?.annotation?.minimumIndependentAnnotatorsPerQuery ?? 2
  );
  if (!String(query?.id ?? '').trim()) errors.push('missing-id');
  if (!repositoryIds.has(query?.repositoryId)) errors.push('unknown-repository');
  if (!['dependency', 'impact', 'reasoning'].includes(query?.category)) {
    errors.push('invalid-category');
  }
  if (!String(query?.query ?? '').trim()) errors.push('missing-query');
  if (relevant.length < 2) errors.push('multi-relevance-labels-required');
  if (candidates.length !== Number(protocol?.design?.candidateCount ?? 8)) {
    errors.push('candidate-count-mismatch');
  }
  for (const file of relevant) {
    if (!candidates.includes(file)) errors.push(`relevant-file-absent-from-candidates:${file}`);
  }
  const annotatorIds = new Set(annotations.map((item) => item?.annotatorId).filter(Boolean));
  if (annotatorIds.size < minimumAnnotators) errors.push('independent-annotators-below-minimum');
  for (const annotation of annotations) {
    const files = annotationFiles(annotation);
    for (const file of files) {
      if (!annotationHasEvidence(annotation, file)) {
        errors.push(`annotation-evidence-missing:${annotation?.annotatorId ?? 'unknown'}:${file}`);
      }
    }
  }
  const labelSets = new Set(annotations.map((item) => JSON.stringify(annotationFiles(item))));
  if (
    labelSets.size > 1 &&
    (!query?.adjudication ||
      !String(query.adjudication.adjudicatorId ?? '').trim() ||
      JSON.stringify(
        [...new Set((query.adjudication.relevantFiles ?? []).map(normalizePath))].sort()
      ) !== JSON.stringify(relevant))
  ) {
    errors.push('annotation-disagreement-not-adjudicated');
  }
  return errors;
}

export function auditPaper5VisualV4Dataset({ protocol, protocolRaw, dataset }) {
  const checks = [];
  check(
    checks,
    'protocol-schema',
    protocol?.schemaVersion === PAPER_5_VISUAL_V4_PROTOCOL_SCHEMA,
    protocol?.schemaVersion ?? null
  );
  const protocolHash = sha256(protocolRaw ?? JSON.stringify(protocol ?? {}));
  check(
    checks,
    'dataset-present',
    Boolean(dataset),
    dataset ? (dataset.datasetId ?? null) : 'dataset not supplied'
  );
  if (!dataset) {
    return {
      schemaVersion: 'holoscript.paper5.visual-v4-dataset-audit.v1',
      status: 'blocked',
      protocolSha256: protocolHash,
      checks,
      errors: ['dataset-not-supplied'],
      counts: { repositories: 0, queries: 0 },
    };
  }

  check(
    checks,
    'dataset-schema',
    dataset.schemaVersion === PAPER_5_VISUAL_V4_DATASET_SCHEMA,
    dataset.schemaVersion ?? null
  );
  check(
    checks,
    'protocol-binding',
    dataset.protocolId === protocol?.protocolId && dataset.protocolSha256 === protocolHash,
    { protocolId: dataset.protocolId, protocolSha256: dataset.protocolSha256 }
  );
  check(checks, 'dataset-sealed', dataset.sealed === true, dataset.sealed ?? false);
  check(
    checks,
    'annotation-receipt-hash',
    isSha256(dataset.annotation?.receiptSha256),
    dataset.annotation?.receiptSha256 ?? null
  );
  check(
    checks,
    'annotation-blinding',
    dataset.annotation?.annotatorsBlindToModelOutputs === true,
    dataset.annotation?.annotatorsBlindToModelOutputs ?? false
  );
  const minimumAgreement = Number(
    protocol?.dataset?.annotation?.minimumInterAnnotatorAgreement ?? 0.7
  );
  check(
    checks,
    'inter-annotator-agreement',
    Number(dataset.annotation?.krippendorffAlpha) >= minimumAgreement,
    {
      observed: dataset.annotation?.krippendorffAlpha ?? null,
      minimum: minimumAgreement,
      metric: dataset.annotation?.agreementMetric ?? null,
    }
  );

  const repositories = Array.isArray(dataset.repositories) ? dataset.repositories : [];
  const minimumRepositories = Number(protocol?.dataset?.minimumExternalCodebases ?? 3);
  const repositoryIds = new Set(repositories.map((item) => item?.id).filter(Boolean));
  check(
    checks,
    'external-codebase-count',
    repositoryIds.size >= minimumRepositories && repositoryIds.size === repositories.length,
    { observed: repositoryIds.size, minimum: minimumRepositories }
  );
  const ineligibleRepositories = repositories
    .filter(
      (repository) =>
        !/^[a-f0-9]{40}$/u.test(String(repository?.commit ?? '')) ||
        !String(repository?.license ?? '').trim() ||
        Number(repository?.trackedSourceFiles) < 500 ||
        Number(repository?.moduleBoundaries) <= 1 ||
        !isSha256(repository?.corpusSha256) ||
        repository?.usedInV1ThroughV3 === true
    )
    .map((repository) => repository?.id ?? 'unknown');
  check(
    checks,
    'external-codebase-eligibility',
    ineligibleRepositories.length === 0,
    ineligibleRepositories
  );

  const queries = Array.isArray(dataset.queries) ? dataset.queries : [];
  const minimumQueries = Number(protocol?.dataset?.minimumQueries ?? 90);
  const queryIds = new Set(queries.map((item) => item?.id).filter(Boolean));
  check(
    checks,
    'query-count',
    queries.length >= minimumQueries && queryIds.size === queries.length,
    { observed: queries.length, minimum: minimumQueries, unique: queryIds.size }
  );
  const categoryMinimums = protocol?.dataset?.categoriesPerCodebase ?? {
    dependency: 10,
    impact: 10,
    reasoning: 10,
  };
  const categoryGaps = [];
  for (const repositoryId of repositoryIds) {
    for (const [category, minimum] of Object.entries(categoryMinimums)) {
      const observed = queries.filter(
        (query) => query.repositoryId === repositoryId && query.category === category
      ).length;
      if (observed < Number(minimum)) {
        categoryGaps.push({ repositoryId, category, observed, minimum: Number(minimum) });
      }
    }
  }
  check(checks, 'category-balance', categoryGaps.length === 0, categoryGaps);

  const queryErrors = queries.flatMap((query) =>
    queryAuditErrors(query, repositoryIds, protocol).map((error) => ({
      queryId: query?.id ?? null,
      error,
    }))
  );
  check(checks, 'query-annotation-and-candidate-admission', queryErrors.length === 0, queryErrors);

  const calibrationIds = new Set(dataset.split?.calibrationQueryIds ?? []);
  const confirmatoryIds = new Set(dataset.split?.confirmatoryQueryIds ?? []);
  const overlap = [...calibrationIds].filter((id) => confirmatoryIds.has(id));
  const partitionIds = new Set([...calibrationIds, ...confirmatoryIds]);
  const expectedCalibrationFraction = Number(
    protocol?.dataset?.custody?.calibrationFraction ?? 0.2
  );
  const observedCalibrationFraction = queries.length > 0 ? calibrationIds.size / queries.length : 0;
  check(
    checks,
    'sealed-confirmatory-split',
    dataset.split?.sealed === true &&
      overlap.length === 0 &&
      partitionIds.size === queryIds.size &&
      [...queryIds].every((id) => partitionIds.has(id)) &&
      Math.abs(observedCalibrationFraction - expectedCalibrationFraction) <= 0.02,
    {
      sealed: dataset.split?.sealed ?? false,
      overlap,
      partitioned: partitionIds.size,
      expected: queryIds.size,
      observedCalibrationFraction,
      expectedCalibrationFraction,
    }
  );

  const errors = checks.filter((item) => !item.pass).map((item) => item.id);
  return {
    schemaVersion: 'holoscript.paper5.visual-v4-dataset-audit.v1',
    status: errors.length === 0 ? 'pass' : 'blocked',
    protocolSha256: protocolHash,
    datasetSha256: sha256(JSON.stringify(dataset)),
    checks,
    errors,
    counts: {
      repositories: repositories.length,
      queries: queries.length,
      calibrationQueries: calibrationIds.size,
      confirmatoryQueries: confirmatoryIds.size,
    },
  };
}

const FONT = {
  C: ['111', '100', '100', '100', '111'],
  I: ['111', '010', '010', '010', '111'],
  M: ['10001', '11011', '10101', '10101', '10101'],
  O: ['111', '101', '101', '101', '111'],
  P: ['110', '101', '110', '100', '100'],
  R: ['110', '101', '110', '101', '101'],
  S: ['111', '100', '111', '001', '111'],
  T: ['111', '010', '010', '010', '010'],
  1: ['010', '110', '010', '010', '111'],
  2: ['110', '001', '010', '100', '111'],
  3: ['110', '001', '010', '001', '110'],
  4: ['101', '101', '111', '001', '001'],
  5: ['111', '100', '110', '001', '110'],
  6: ['011', '100', '111', '101', '111'],
  7: ['111', '001', '010', '010', '010'],
  8: ['111', '101', '111', '101', '111'],
  9: ['111', '101', '111', '001', '110'],
  0: ['111', '101', '101', '101', '111'],
  ' ': ['0', '0', '0', '0', '0'],
};

function setPixel(pixels, width, height, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= width || py >= height) return;
  const offset = (py * width + px) * 3;
  pixels[offset] = color[0];
  pixels[offset + 1] = color[1];
  pixels[offset + 2] = color[2];
}

function drawLine(pixels, width, height, from, to, color, thickness = 2) {
  let x0 = Math.round(from[0]);
  let y0 = Math.round(from[1]);
  const x1 = Math.round(to[0]);
  const y1 = Math.round(to[1]);
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;
  while (true) {
    for (let ox = -thickness; ox <= thickness; ox += 1) {
      for (let oy = -thickness; oy <= thickness; oy += 1) {
        if (ox * ox + oy * oy <= thickness * thickness) {
          setPixel(pixels, width, height, x0 + ox, y0 + oy, color);
        }
      }
    }
    if (x0 === x1 && y0 === y1) break;
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      error += dx;
      y0 += sy;
    }
  }
}

function drawCircle(pixels, width, height, center, radius, fill, stroke) {
  const [cx, cy] = center;
  for (let y = -radius; y <= radius; y += 1) {
    for (let x = -radius; x <= radius; x += 1) {
      const distance = x * x + y * y;
      if (distance <= radius * radius) {
        const color = distance >= (radius - 3) * (radius - 3) ? stroke : fill;
        setPixel(pixels, width, height, cx + x, cy + y, color);
      }
    }
  }
}

function textWidth(text, scale) {
  return [...text].reduce(
    (total, character) => total + ((FONT[character]?.[0]?.length ?? 3) + 1) * scale,
    0
  );
}

function drawText(pixels, width, height, text, x, y, scale, color) {
  let cursor = x;
  for (const rawCharacter of String(text).toUpperCase()) {
    const glyph = FONT[rawCharacter] ?? FONT[' '];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < glyph[row].length; column += 1) {
        if (glyph[row][column] !== '1') continue;
        for (let sy = 0; sy < scale; sy += 1) {
          for (let sx = 0; sx < scale; sx += 1) {
            setPixel(
              pixels,
              width,
              height,
              cursor + column * scale + sx,
              y + row * scale + sy,
              color
            );
          }
        }
      }
    }
    cursor += (glyph[0].length + 1) * scale;
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function encodeRgbPng(pixels, width, height) {
  const stride = width * 3;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const targetOffset = y * (stride + 1);
    scanlines[targetOffset] = 0;
    pixels.copy(scanlines, targetOffset + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function renderPaper5VisualV4Png({
  candidates,
  relations = [],
  width = 1600,
  height = 900,
}) {
  if (!Array.isArray(candidates) || candidates.length < 2) {
    throw new Error('At least two visual candidates are required');
  }
  const pixels = Buffer.alloc(width * height * 3);
  for (let offset = 0; offset < pixels.length; offset += 3) {
    pixels[offset] = 11;
    pixels[offset + 1] = 16;
    pixels[offset + 2] = 32;
  }
  const center = [width / 2, height / 2 + 10];
  const radiusX = Math.min(width * 0.34, 520);
  const radiusY = Math.min(height * 0.34, 280);
  const positions = new Map();
  candidates.forEach((candidate, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / candidates.length;
    positions.set(candidate.alias, [
      Math.round(center[0] + Math.cos(angle) * radiusX),
      Math.round(center[1] + Math.sin(angle) * radiusY),
    ]);
  });
  for (const relation of relations) {
    const from = positions.get(relation.fromAlias);
    const to = positions.get(relation.toAlias);
    if (!from || !to) continue;
    drawLine(pixels, width, height, from, to, [86, 189, 248], 2);
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
    const tip = [to[0] - Math.cos(angle) * 48, to[1] - Math.sin(angle) * 48];
    drawLine(
      pixels,
      width,
      height,
      tip,
      [tip[0] - Math.cos(angle - 0.55) * 18, tip[1] - Math.sin(angle - 0.55) * 18],
      [86, 189, 248],
      2
    );
    drawLine(
      pixels,
      width,
      height,
      tip,
      [tip[0] - Math.cos(angle + 0.55) * 18, tip[1] - Math.sin(angle + 0.55) * 18],
      [86, 189, 248],
      2
    );
  }
  candidates.forEach((candidate) => {
    const position = positions.get(candidate.alias);
    drawCircle(pixels, width, height, position, 46, [30, 64, 105], [130, 214, 255]);
    const label = String(candidate.alias).toUpperCase();
    const scale = 6;
    drawText(
      pixels,
      width,
      height,
      label,
      position[0] - textWidth(label, scale) / 2,
      position[1] - 15,
      scale,
      [240, 249, 255]
    );
  });
  drawLine(pixels, width, height, [55, 55], [155, 55], [86, 189, 248], 2);
  drawText(pixels, width, height, 'IMPORTS', 175, 42, 4, [204, 232, 255]);
  const png = encodeRgbPng(pixels, width, height);
  return {
    png,
    receipt: {
      schemaVersion: 'holoscript.paper5.visual-v4-render-receipt.v1',
      mimeType: 'image/png',
      width,
      height,
      bytes: png.length,
      sha256: sha256(png),
      renderer: 'holoabsorb-deterministic-rgb-v1',
      nodeLabels: candidates.map((candidate) => candidate.alias),
      relationCount: relations.length,
    },
  };
}

export function buildVerifiedImageContentPart(png, expectedSha256) {
  if (!Buffer.isBuffer(png) || png.length < 8) throw new Error('PNG bytes are required');
  const observedSha256 = sha256(png);
  if (expectedSha256 && observedSha256 !== expectedSha256) {
    throw new Error(`Image digest mismatch: expected ${expectedSha256}, got ${observedSha256}`);
  }
  const url = `data:image/png;base64,${png.toString('base64')}`;
  return {
    contentPart: {
      type: 'image_url',
      image_url: {
        url,
        detail: 'high',
      },
    },
    receipt: {
      schemaVersion: 'holoscript.paper5.visual-v4-image-input-receipt.v1',
      mimeType: 'image/png',
      bytes: png.length,
      sha256: observedSha256,
      contentPartSha256: sha256(JSON.stringify({ type: 'image_url', url })),
      actualImageBytes: true,
    },
  };
}

export function buildPaper5VisualV4CasePacket({ query, protocol }) {
  const armIds = (protocol?.design?.arms ?? []).map((arm) => String(arm.id));
  const ordered = [...query.candidates]
    .map((candidate) => ({
      file: normalizePath(candidate.file),
      symbols: (candidate.symbols ?? []).map(String).slice(0, 4),
      sortKey: sha256(`${query.id}\0${normalizePath(candidate.file)}`),
    }))
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map((candidate, index) => ({
      alias: `c${index + 1}`,
      file: candidate.file,
      symbols: candidate.symbols,
    }));
  const aliasByFile = new Map(ordered.map((candidate) => [candidate.file, candidate.alias]));
  const relations = (query.relations ?? [])
    .map((relation) => ({
      fromAlias: aliasByFile.get(normalizePath(relation.fromFile)),
      toAlias: aliasByFile.get(normalizePath(relation.toFile)),
      type: relation.type ?? 'imports',
    }))
    .filter((relation) => relation.fromAlias && relation.toAlias)
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const orders = Object.fromEntries(
    armIds.map((arm, armIndex) => [
      arm,
      Array.from(
        { length: ordered.length },
        (_, index) => ordered[(index + armIndex) % ordered.length]
      ),
    ])
  );
  const relationalObservation = {
    schemaVersion: 'holoscript.paper5.relational-graph-observation.v2',
    nodes: ordered.map((candidate) => ({ alias: candidate.alias })),
    relations,
    boundary: 'No coordinates, source bodies, or relevance labels are included.',
  };
  return {
    id: query.id,
    repositoryId: query.repositoryId,
    category: query.category,
    query: query.query,
    scoringKey: {
      goldCandidateAliases: relevantFilesFor(query)
        .map((file) => aliasByFile.get(file))
        .sort(),
    },
    visual: {
      candidates: ordered.map((candidate) => ({ alias: candidate.alias })),
      relations,
    },
    arms: Object.fromEntries(
      armIds.map((arm) => [
        arm,
        {
          candidates: orders[arm],
          ...(arm === 'relations' || arm === 'relations-pixels'
            ? { relationalGraphObservation: relationalObservation }
            : {}),
          ...(arm === 'pixels' || arm === 'relations-pixels' ? { literalImageRequired: true } : {}),
        },
      ])
    ),
  };
}

export function auditPaper5VisualV4ExecutionPlan({ protocol, executionPlan }) {
  const minimumFamilies = Number(
    protocol?.agentProtocol?.minimumIndependentVisionCapableAgentFamilies ?? 3
  );
  const families = Array.isArray(executionPlan?.modelFamilies) ? executionPlan.modelFamilies : [];
  const uniqueFamilies = new Set(families.map((item) => item?.family).filter(Boolean));
  const ineligible = families
    .filter(
      (item) =>
        item?.visionCapable !== true ||
        !String(item?.modelVersion ?? '').trim() ||
        !isSha256(item?.providerVersionReceiptSha256)
    )
    .map((item) => item?.family ?? 'unknown');
  const checks = [
    {
      id: 'independent-vision-family-count',
      pass: uniqueFamilies.size >= minimumFamilies && uniqueFamilies.size === families.length,
      detail: { observed: uniqueFamilies.size, minimum: minimumFamilies },
    },
    {
      id: 'vision-and-version-receipts',
      pass: families.length >= minimumFamilies && ineligible.length === 0,
      detail: {
        receiptedFamilies: families.length - ineligible.length,
        minimum: minimumFamilies,
        ineligible,
      },
    },
    {
      id: 'trials-per-arm',
      pass:
        Number(executionPlan?.trialsPerArm) === Number(protocol?.agentProtocol?.trialsPerArm ?? 3),
      detail: executionPlan?.trialsPerArm ?? null,
    },
  ];
  return {
    schemaVersion: 'holoscript.paper5.visual-v4-execution-plan-audit.v1',
    status: checks.every((item) => item.pass) ? 'pass' : 'blocked',
    checks,
    errors: checks.filter((item) => !item.pass).map((item) => item.id),
  };
}

function packetCore(packetManifest) {
  return {
    schemaVersion: packetManifest?.schemaVersion,
    protocolId: packetManifest?.protocolId,
    protocolSha256: packetManifest?.protocolSha256,
    datasetId: packetManifest?.datasetId,
    datasetSha256: packetManifest?.datasetSha256,
    split: packetManifest?.split,
    cases: packetManifest?.cases,
  };
}

function armIds(protocol) {
  return (protocol?.design?.arms ?? []).map((arm) => String(arm?.id ?? '')).filter(Boolean);
}

function candidateAliases(studyCase, arm) {
  return (studyCase?.arms?.[arm]?.candidates ?? []).map((candidate) =>
    String(candidate?.alias ?? '')
  );
}

export function auditPaper5VisualV4PacketManifest({
  protocol,
  protocolRaw,
  packetManifest,
}) {
  const checks = [];
  const cases = Array.isArray(packetManifest?.cases) ? packetManifest.cases : [];
  const expectedArms = armIds(protocol);
  const protocolSha256 = sha256(protocolRaw ?? JSON.stringify(protocol ?? {}));
  const expectedPacketSha256 = sha256(JSON.stringify(packetCore(packetManifest)));
  const repositoryIds = new Set(cases.map((item) => item?.repositoryId).filter(Boolean));
  const minimumRepositories = Number(protocol?.dataset?.minimumExternalCodebases ?? 3);
  const minimumQueries = Number(protocol?.dataset?.minimumQueries ?? 90);
  const candidateCount = Number(protocol?.design?.candidateCount ?? 8);
  const caseErrors = [];

  check(
    checks,
    'packet-schema',
    packetManifest?.schemaVersion === PAPER_5_VISUAL_V4_PACKET_SCHEMA,
    packetManifest?.schemaVersion ?? null
  );
  check(
    checks,
    'protocol-binding',
    packetManifest?.protocolId === protocol?.protocolId &&
      packetManifest?.protocolSha256 === protocolSha256,
    {
      protocolId: packetManifest?.protocolId ?? null,
      protocolSha256: packetManifest?.protocolSha256 ?? null,
    }
  );
  check(
    checks,
    'packet-digest',
    isSha256(packetManifest?.packetSha256) &&
      packetManifest.packetSha256 === expectedPacketSha256,
    {
      observed: packetManifest?.packetSha256 ?? null,
      expected: expectedPacketSha256,
    }
  );
  check(
    checks,
    'query-count',
    cases.length >= minimumQueries,
    { observed: cases.length, minimum: minimumQueries }
  );
  check(
    checks,
    'repository-count',
    repositoryIds.size >= minimumRepositories,
    { observed: repositoryIds.size, minimum: minimumRepositories }
  );
  check(
    checks,
    'sealed-split',
    packetManifest?.split?.sealed === true,
    packetManifest?.split?.sealed ?? false
  );
  check(
    checks,
    'image-custody-summary',
    packetManifest?.custody?.sameImageAcrossPixelArms === true &&
      packetManifest?.custody?.actualImageBytesVerified === true &&
      Number(packetManifest?.custody?.imageCount) === cases.length,
    packetManifest?.custody ?? null
  );

  for (const studyCase of cases) {
    const id = String(studyCase?.id ?? 'unknown');
    const presentArms = Object.keys(studyCase?.arms ?? {});
    if (JSON.stringify(presentArms) !== JSON.stringify(expectedArms)) {
      caseErrors.push(`${id}:arm-order-or-membership-mismatch`);
    }
    const referenceAliases = [...candidateAliases(studyCase, expectedArms[0])].sort();
    if (
      referenceAliases.length !== candidateCount ||
      new Set(referenceAliases).size !== referenceAliases.length
    ) {
      caseErrors.push(`${id}:candidate-count-or-uniqueness-mismatch`);
    }
    for (const arm of expectedArms.slice(1)) {
      if (JSON.stringify([...candidateAliases(studyCase, arm)].sort()) !== JSON.stringify(referenceAliases)) {
        caseErrors.push(`${id}:${arm}:candidate-set-mismatch`);
      }
    }
    const gold = studyCase?.scoringKey?.goldCandidateAliases ?? [];
    if (
      !Array.isArray(gold) ||
      gold.length < 2 ||
      gold.some((alias) => !referenceAliases.includes(alias))
    ) {
      caseErrors.push(`${id}:invalid-scoring-key`);
    }
    for (const arm of expectedArms) {
      if (/scoringKey|goldCandidate|relevantFiles|annotations/iu.test(JSON.stringify(studyCase.arms[arm]))) {
        caseErrors.push(`${id}:${arm}:gold-label-leakage`);
      }
    }
    const pixels = studyCase?.arms?.pixels?.literalImage;
    const relationsPixels = studyCase?.arms?.['relations-pixels']?.literalImage;
    if (
      !pixels ||
      !relationsPixels ||
      pixels.actualImageContentPartRequired !== true ||
      relationsPixels.actualImageContentPartRequired !== true ||
      !isSha256(pixels.sha256) ||
      pixels.sha256 !== relationsPixels.sha256 ||
      pixels.path !== relationsPixels.path ||
      studyCase?.imageReceipt?.sha256 !== pixels.sha256 ||
      studyCase?.imageReceipt?.inputReceipt?.actualImageBytes !== true
    ) {
      caseErrors.push(`${id}:literal-image-custody-mismatch`);
    }
  }
  check(checks, 'case-admission', caseErrors.length === 0, caseErrors);
  const errors = checks.filter((item) => !item.pass).map((item) => item.id);
  return {
    schemaVersion: 'holoscript.paper5.visual-v4-packet-audit.v1',
    status: errors.length === 0 ? 'pass' : 'blocked',
    checks,
    errors,
    counts: {
      repositories: repositoryIds.size,
      queries: cases.length,
      arms: expectedArms.length,
    },
  };
}

function responseJsonSchema(protocol) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['rankedCandidateIds', 'confidence'],
    properties: {
      rankedCandidateIds: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        uniqueItems: true,
        items: { type: 'string' },
        description: protocol?.agentProtocol?.responseSchema?.rankedCandidateIds,
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: protocol?.agentProtocol?.responseSchema?.confidence,
      },
    },
  };
}

function requestText(studyCase, arm, protocol) {
  const armPacket = studyCase.arms[arm];
  const candidateLines = armPacket.candidates.map((candidate) => {
    const symbols = (candidate.symbols ?? []).join(', ') || '(none)';
    return `${candidate.alias} | ${candidate.file} | symbols: ${symbols}`;
  });
  const sections = [
    'You are ranking candidate files for a codebase-intelligence question.',
    'Return only a JSON object matching the supplied schema.',
    `Question: ${studyCase.query}`,
    `Category: ${studyCase.category}`,
    'Candidate files:',
    ...candidateLines,
  ];
  if (armPacket.relationalGraphObservation) {
    sections.push(
      'Label-blind structured relation observation:',
      JSON.stringify(armPacket.relationalGraphObservation)
    );
  }
  if (armPacket.literalImageRequired) {
    sections.push(
      String(
        protocol?.design?.visualProjection?.accessibilityAltText ??
          'A graph image containing candidate aliases is attached.'
      )
    );
  }
  sections.push(
    'Rank one to five unique candidate aliases from most to least relevant. Do not emit paths.'
  );
  return sections.join('\n');
}

export function buildPaper5VisualV4RequestManifest({
  protocol,
  protocolRaw,
  packetManifest,
  executionPlan,
}) {
  const packetAudit = auditPaper5VisualV4PacketManifest({
    protocol,
    protocolRaw,
    packetManifest,
  });
  const executionAudit = auditPaper5VisualV4ExecutionPlan({ protocol, executionPlan });
  if (packetAudit.status !== 'pass' || executionAudit.status !== 'pass') {
    const errors = [...packetAudit.errors, ...executionAudit.errors];
    throw new Error(`v4 request admission blocked: ${errors.join(', ')}`);
  }
  const trialsPerArm = Number(executionPlan.trialsPerArm);
  const arms = armIds(protocol);
  const families = [...executionPlan.modelFamilies].sort((left, right) =>
    String(left.family).localeCompare(String(right.family))
  );
  const cases = [...packetManifest.cases].sort((left, right) =>
    String(left.id).localeCompare(String(right.id))
  );
  const requests = [];
  for (const family of families) {
    for (const studyCase of cases) {
      for (const arm of arms) {
        for (let trial = 1; trial <= trialsPerArm; trial += 1) {
          const literalImage = studyCase.arms[arm].literalImage ?? null;
          const requestIdentity = {
            protocolId: protocol.protocolId,
            packetSha256: packetManifest.packetSha256,
            family: family.family,
            modelVersion: family.modelVersion,
            caseId: studyCase.id,
            arm,
            trial,
          };
          requests.push({
            schemaVersion: PAPER_5_VISUAL_V4_REQUEST_SCHEMA,
            requestId: sha256(JSON.stringify(requestIdentity)),
            ...requestIdentity,
            repositoryId: studyCase.repositoryId,
            category: studyCase.category,
            candidateAliases: candidateAliases(studyCase, arm),
            input: {
              text: requestText(studyCase, arm, protocol),
              literalImage: literalImage
                ? {
                    path: literalImage.path,
                    sha256: literalImage.sha256,
                    mimeType: literalImage.mimeType,
                    bytes: literalImage.bytes,
                    actualImageContentPartRequired: true,
                  }
                : null,
              responseJsonSchema: responseJsonSchema(protocol),
            },
          });
        }
      }
    }
  }
  requests.sort((left, right) =>
    sha256(`${protocol?.metrics?.bootstrapSeed ?? 0}\0${left.requestId}`).localeCompare(
      sha256(`${protocol?.metrics?.bootstrapSeed ?? 0}\0${right.requestId}`)
    )
  );
  const core = {
    schemaVersion: PAPER_5_VISUAL_V4_REQUEST_MANIFEST_SCHEMA,
    protocolId: protocol.protocolId,
    protocolSha256: packetManifest.protocolSha256,
    packetSha256: packetManifest.packetSha256,
    datasetSha256: packetManifest.datasetSha256,
    executionPlanSha256: sha256(JSON.stringify(executionPlan)),
    requests,
  };
  return {
    ...core,
    requestManifestSha256: sha256(JSON.stringify(core)),
    counts: {
      requests: requests.length,
      modelFamilies: families.length,
      queries: cases.length,
      arms: arms.length,
      trialsPerArm,
    },
    responseSchema: PAPER_5_VISUAL_V4_RESPONSE_SCHEMA,
    claimBoundary:
      'The request manifest contains no model responses or scored outcomes. Pixel requests name receipted PNG bytes that an adapter must materialize as an actual image content part.',
  };
}

export function materializePaper5VisualV4Request(request, png) {
  const requiresImage = request?.input?.literalImage?.actualImageContentPartRequired === true;
  let imageInput = null;
  if (requiresImage) {
    imageInput = buildVerifiedImageContentPart(png, request.input.literalImage.sha256);
    if (Number(request.input.literalImage.bytes) !== imageInput.receipt.bytes) {
      throw new Error(
        `Image byte length mismatch: expected ${request.input.literalImage.bytes}, got ${imageInput.receipt.bytes}`
      );
    }
  } else if (png !== undefined && png !== null) {
    throw new Error('Text-only requests must not receive image bytes');
  }
  const content = [{ type: 'text', text: request.input.text }];
  if (imageInput) content.push(imageInput.contentPart);
  const payload = {
    schemaVersion: 'holoscript.paper5.visual-agent-adapter-input.v4',
    requestId: request.requestId,
    modelFamily: request.family,
    modelVersion: request.modelVersion,
    temperature: 0,
    maxTokens: 512,
    messages: [{ role: 'user', content }],
    responseJsonSchema: request.input.responseJsonSchema,
  };
  return {
    payload,
    receipt: {
      requestPayloadSha256: sha256(JSON.stringify(payload)),
      imageInputReceipt: imageInput?.receipt ?? null,
    },
  };
}

function parseAdapterOutput(adapterOutput) {
  let value = adapterOutput?.output ?? adapterOutput?.response ?? adapterOutput;
  if (typeof value === 'string') {
    const text = value
      .replace(/<think>[\s\S]*?<\/think>/giu, '')
      .replace(/```(?:json)?/giu, '')
      .replace(/```/gu, '')
      .trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('missing-json-object');
    value = JSON.parse(text.slice(start, end + 1));
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('response-must-be-an-object');
  }
  return value;
}

export function capturePaper5VisualV4Response({
  request,
  adapterOutput,
  materializationReceipt,
  latencyMs,
}) {
  let parsed = null;
  let error = null;
  try {
    parsed = parseAdapterOutput(adapterOutput);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const rankedCandidateIds = Array.isArray(parsed?.rankedCandidateIds)
    ? parsed.rankedCandidateIds.map(String)
    : [];
  const uniqueRanked = new Set(rankedCandidateIds);
  const unknownCandidateIds = rankedCandidateIds.filter(
    (alias) => !request.candidateAliases.includes(alias)
  );
  const confidence = Number(parsed?.confidence);
  if (!error && (rankedCandidateIds.length < 1 || rankedCandidateIds.length > 5)) {
    error = 'ranked-candidate-count-out-of-range';
  }
  if (!error && uniqueRanked.size !== rankedCandidateIds.length) {
    error = 'ranked-candidates-not-unique';
  }
  if (!error && unknownCandidateIds.length > 0) error = 'unknown-candidate-alias';
  if (!error && (!Number.isFinite(confidence) || confidence < 0 || confidence > 1)) {
    error = 'confidence-out-of-range';
  }
  const requiresImage = request?.input?.literalImage?.actualImageContentPartRequired === true;
  if (
    !error &&
    requiresImage &&
    (materializationReceipt?.imageInputReceipt?.actualImageBytes !== true ||
      materializationReceipt.imageInputReceipt.sha256 !== request.input.literalImage.sha256 ||
      !isSha256(materializationReceipt.imageInputReceipt.contentPartSha256))
  ) {
    error = 'image-input-receipt-mismatch';
  }
  const responseCore = {
    schemaVersion: PAPER_5_VISUAL_V4_RESPONSE_SCHEMA,
    requestId: request.requestId,
    protocolId: request.protocolId,
    packetSha256: request.packetSha256,
    family: request.family,
    modelVersion: request.modelVersion,
    caseId: request.caseId,
    repositoryId: request.repositoryId,
    category: request.category,
    arm: request.arm,
    trial: request.trial,
    valid: error === null,
    error,
    rankedCandidateIds: error ? [] : rankedCandidateIds,
    unknownCandidateIds,
    confidence: error ? null : confidence,
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
    requestPayloadSha256: materializationReceipt?.requestPayloadSha256 ?? null,
    imageInputReceipt: materializationReceipt?.imageInputReceipt ?? null,
    providerResponseSha256: sha256(JSON.stringify(adapterOutput)),
  };
  return {
    ...responseCore,
    responseSha256: sha256(JSON.stringify(responseCore)),
  };
}

function round(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function meanRecords(records) {
  if (records.length === 0) return null;
  return {
    precisionAt5: mean(records.map((item) => item.precisionAt5)),
    reciprocalRank: mean(records.map((item) => item.reciprocalRank)),
    invalid: mean(records.map((item) => (item.valid ? 0 : 1))),
    unknownCandidateRate: mean(
      records.map((item) => (item.unknownCandidateIds?.length ?? 0) / 5)
    ),
    confidence: mean(records.map((item) => item.confidence ?? 0)),
    latencyMs: mean(records.map((item) => item.latencyMs ?? 0)),
    imageReceipt: mean(records.map((item) => (item.imageReceiptValid ? 1 : 0))),
  };
}

function summarizeRecords(records) {
  return {
    precisionAt5: round(mean(records.map((item) => item.precisionAt5))),
    mrr: round(mean(records.map((item) => item.reciprocalRank))),
    invalidResponseRate: round(mean(records.map((item) => item.invalid))),
    unknownCandidateRate: round(mean(records.map((item) => item.unknownCandidateRate))),
    meanConfidence: round(mean(records.map((item) => item.confidence))),
    meanLatencyMs: round(mean(records.map((item) => item.latencyMs))),
    imageInputReceiptRate: round(mean(records.map((item) => item.imageReceipt))),
  };
}

function averageArmRecords(records) {
  return {
    precisionAt5: mean(records.map((item) => item.precisionAt5)),
    reciprocalRank: mean(records.map((item) => item.reciprocalRank)),
    invalid: mean(records.map((item) => item.invalid)),
    unknownCandidateRate: mean(records.map((item) => item.unknownCandidateRate)),
    confidence: mean(records.map((item) => item.confidence)),
    latencyMs: mean(records.map((item) => item.latencyMs)),
    imageReceipt: mean(records.map((item) => item.imageReceipt)),
  };
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clusterBootstrap(rows, key, resamples, seed, confidenceLevel) {
  if (rows.length === 0) {
    return {
      estimate: 0,
      ci: [0, 0],
      confidenceLevel,
      resamples,
      oneSidedPValue: 1,
    };
  }
  const byRepository = new Map();
  for (const row of rows) {
    const list = byRepository.get(row.repositoryId) ?? [];
    list.push(row);
    byRepository.set(row.repositoryId, list);
  }
  const repositories = [...byRepository.keys()].sort();
  const random = mulberry32(seed);
  const samples = [];
  for (let sample = 0; sample < resamples; sample += 1) {
    const values = [];
    for (let repositoryIndex = 0; repositoryIndex < repositories.length; repositoryIndex += 1) {
      const repositoryId = repositories[Math.floor(random() * repositories.length)];
      const repositoryRows = byRepository.get(repositoryId);
      for (let queryIndex = 0; queryIndex < repositoryRows.length; queryIndex += 1) {
        values.push(repositoryRows[Math.floor(random() * repositoryRows.length)][key]);
      }
    }
    samples.push(mean(values));
  }
  samples.sort((left, right) => left - right);
  const alpha = 1 - confidenceLevel;
  const lower = samples[Math.floor(samples.length * (alpha / 2))];
  const upper = samples[
    Math.min(samples.length - 1, Math.floor(samples.length * (1 - alpha / 2)))
  ];
  const nonPositive = samples.filter((value) => value <= 0).length;
  return {
    estimate: round(mean(rows.map((row) => row[key]))),
    ci: [round(lower), round(upper)],
    confidenceLevel,
    resamples,
    oneSidedPValue: round((nonPositive + 1) / (samples.length + 1)),
  };
}

function factorialRows(cases) {
  return cases.map((item) => {
    const text = item.arms.text;
    const relations = item.arms.relations;
    const pixels = item.arms.pixels;
    const relationsPixels = item.arms['relations-pixels'];
    return {
      caseId: item.caseId,
      repositoryId: item.repositoryId,
      pixelPrecision:
        (pixels.precisionAt5 + relationsPixels.precisionAt5 -
          text.precisionAt5 -
          relations.precisionAt5) /
        2,
      pixelMrr:
        (pixels.reciprocalRank + relationsPixels.reciprocalRank -
          text.reciprocalRank -
          relations.reciprocalRank) /
        2,
      relationPrecision:
        (relations.precisionAt5 + relationsPixels.precisionAt5 -
          text.precisionAt5 -
          pixels.precisionAt5) /
        2,
      relationMrr:
        (relations.reciprocalRank + relationsPixels.reciprocalRank -
          text.reciprocalRank -
          pixels.reciprocalRank) /
        2,
      interactionPrecision:
        relationsPixels.precisionAt5 -
        relations.precisionAt5 -
        pixels.precisionAt5 +
        text.precisionAt5,
      interactionMrr:
        relationsPixels.reciprocalRank -
        relations.reciprocalRank -
        pixels.reciprocalRank +
        text.reciprocalRank,
      pixelInvalid:
        (pixels.invalid + relationsPixels.invalid - text.invalid - relations.invalid) / 2,
    };
  });
}

function effectSummary(rows, protocol, seedOffset = 0) {
  const resamples = Number(protocol?.metrics?.bootstrapResamples ?? 10_000);
  const seed = Number(protocol?.metrics?.bootstrapSeed ?? 27_072_704) + seedOffset;
  const confidenceLevel = Number(protocol?.metrics?.confidenceLevel ?? 0.95);
  const metric = (key, offset) =>
    clusterBootstrap(rows, key, resamples, seed + offset, confidenceLevel);
  return {
    literalPixels: {
      precisionAt5: metric('pixelPrecision', 0),
      mrr: metric('pixelMrr', 1),
      invalidResponseRate: round(mean(rows.map((item) => item.pixelInvalid))),
    },
    structuredRelations: {
      precisionAt5: metric('relationPrecision', 2),
      mrr: metric('relationMrr', 3),
    },
    interaction: {
      precisionAt5: metric('interactionPrecision', 4),
      mrr: metric('interactionMrr', 5),
    },
  };
}

function holmBonferroni(primary) {
  const entries = Object.entries(primary).sort(
    (left, right) => left[1].oneSidedPValue - right[1].oneSidedPValue
  );
  let running = 0;
  return Object.fromEntries(
    entries.map(([id, value], index) => {
      running = Math.max(running, Math.min(1, value.oneSidedPValue * (entries.length - index)));
      return [id, { rawPValue: value.oneSidedPValue, adjustedPValue: round(running) }];
    })
  );
}

export function scorePaper5VisualV4Responses({
  protocol,
  packetManifest,
  executionPlan,
  requestManifest,
  responses,
}) {
  const requests = Array.isArray(requestManifest?.requests) ? requestManifest.requests : [];
  const responseList = Array.isArray(responses) ? responses : [];
  const requestById = new Map(requests.map((request) => [request.requestId, request]));
  const responseByRequest = new Map();
  const blockers = [];
  const admittedCaseIds = caseByIdSafe(packetManifest);
  const requestCore = {
    schemaVersion: requestManifest?.schemaVersion,
    protocolId: requestManifest?.protocolId,
    protocolSha256: requestManifest?.protocolSha256,
    packetSha256: requestManifest?.packetSha256,
    datasetSha256: requestManifest?.datasetSha256,
    executionPlanSha256: requestManifest?.executionPlanSha256,
    requests,
  };
  if (
    requestManifest?.schemaVersion !== PAPER_5_VISUAL_V4_REQUEST_MANIFEST_SCHEMA ||
    requestManifest?.protocolId !== protocol?.protocolId ||
    requestManifest?.packetSha256 !== packetManifest?.packetSha256 ||
    requestManifest?.datasetSha256 !== packetManifest?.datasetSha256 ||
    requestManifest?.executionPlanSha256 !== sha256(JSON.stringify(executionPlan)) ||
    requestManifest?.requestManifestSha256 !== sha256(JSON.stringify(requestCore))
  ) {
    blockers.push('request-manifest-binding');
  }
  const duplicateRequestIds = requests.length - requestById.size;
  if (duplicateRequestIds > 0) blockers.push(`duplicate-request-ids:${duplicateRequestIds}`);
  for (const request of requests) {
    const planFamily = executionPlan.modelFamilies.find((item) => item.family === request.family);
    if (
      request?.schemaVersion !== PAPER_5_VISUAL_V4_REQUEST_SCHEMA ||
      request.protocolId !== protocol?.protocolId ||
      request.packetSha256 !== packetManifest?.packetSha256 ||
      !planFamily ||
      request.modelVersion !== planFamily.modelVersion ||
      !admittedCaseIds.has(request.caseId) ||
      !armIds(protocol).includes(request.arm) ||
      !Number.isInteger(Number(request.trial)) ||
      Number(request.trial) < 1 ||
      Number(request.trial) > Number(executionPlan.trialsPerArm)
    ) {
      blockers.push(`request-binding:${request?.requestId ?? 'unknown'}`);
    }
  }
  for (const response of responseList) {
    if (response?.schemaVersion !== PAPER_5_VISUAL_V4_RESPONSE_SCHEMA) {
      blockers.push(`response-schema:${response?.requestId ?? 'unknown'}`);
      continue;
    }
    if (!requestById.has(response.requestId)) {
      blockers.push(`unexpected-response:${response.requestId}`);
      continue;
    }
    if (responseByRequest.has(response.requestId)) {
      blockers.push(`duplicate-response:${response.requestId}`);
      continue;
    }
    const request = requestById.get(response.requestId);
    if (
      response.family !== request.family ||
      response.modelVersion !== request.modelVersion ||
      response.caseId !== request.caseId ||
      response.arm !== request.arm ||
      Number(response.trial) !== Number(request.trial) ||
      response.requestPayloadSha256 === null ||
      !isSha256(response.requestPayloadSha256)
    ) {
      blockers.push(`response-binding:${response.requestId}`);
      continue;
    }
    const ranked = Array.isArray(response.rankedCandidateIds)
      ? response.rankedCandidateIds.map(String)
      : [];
    const responseCore = {
      schemaVersion: response.schemaVersion,
      requestId: response.requestId,
      protocolId: response.protocolId,
      packetSha256: response.packetSha256,
      family: response.family,
      modelVersion: response.modelVersion,
      caseId: response.caseId,
      repositoryId: response.repositoryId,
      category: response.category,
      arm: response.arm,
      trial: response.trial,
      valid: response.valid,
      error: response.error,
      rankedCandidateIds: response.rankedCandidateIds,
      unknownCandidateIds: response.unknownCandidateIds,
      confidence: response.confidence,
      latencyMs: response.latencyMs,
      requestPayloadSha256: response.requestPayloadSha256,
      imageInputReceipt: response.imageInputReceipt,
      providerResponseSha256: response.providerResponseSha256,
    };
    if (
      !isSha256(response.providerResponseSha256) ||
      !isSha256(response.responseSha256) ||
      response.responseSha256 !== sha256(JSON.stringify(responseCore)) ||
      (response.valid === true &&
        (ranked.length < 1 ||
          ranked.length > 5 ||
          new Set(ranked).size !== ranked.length ||
          ranked.some((alias) => !request.candidateAliases.includes(alias)) ||
          !Number.isFinite(Number(response.confidence)) ||
          Number(response.confidence) < 0 ||
          Number(response.confidence) > 1)) ||
      (response.valid !== true &&
        (ranked.length !== 0 || response.confidence !== null || !String(response.error ?? '').trim()))
    ) {
      blockers.push(`response-content:${response.requestId}`);
      continue;
    }
    const requiresImage = request?.input?.literalImage?.actualImageContentPartRequired === true;
    if (
      requiresImage &&
      (response?.imageInputReceipt?.actualImageBytes !== true ||
        response.imageInputReceipt.sha256 !== request.input.literalImage.sha256 ||
        !isSha256(response.imageInputReceipt.contentPartSha256))
    ) {
      blockers.push(`image-input-binding:${response.requestId}`);
      continue;
    }
    if (!requiresImage && response.imageInputReceipt !== null) {
      blockers.push(`unexpected-image-receipt:${response.requestId}`);
      continue;
    }
    responseByRequest.set(response.requestId, response);
  }
  for (const request of requests) {
    if (!responseByRequest.has(request.requestId)) blockers.push(`missing-response:${request.requestId}`);
  }

  const caseById = new Map(packetManifest.cases.map((studyCase) => [studyCase.id, studyCase]));
  const observations = [...responseByRequest.values()].map((response) => {
    const request = requestById.get(response.requestId);
    const studyCase = caseById.get(request.caseId);
    const ranked = response.valid === true ? response.rankedCandidateIds : [];
    const gold = new Set(studyCase.scoringKey.goldCandidateAliases);
    const top = ranked.slice(0, Number(protocol?.metrics?.precisionAt ?? 5));
    const hits = top.filter((alias) => gold.has(alias)).length;
    const firstHit = ranked.findIndex((alias) => gold.has(alias));
    return {
      ...response,
      precisionAt5: hits / Number(protocol?.metrics?.precisionAt ?? 5),
      reciprocalRank: firstHit < 0 ? 0 : 1 / (firstHit + 1),
      imageReceiptValid:
        request.input.literalImage === null ||
        (response?.imageInputReceipt?.actualImageBytes === true &&
          response.imageInputReceipt.sha256 === request.input.literalImage.sha256),
    };
  });

  const grouped = new Map();
  for (const observation of observations) {
    const key = `${observation.family}\0${observation.caseId}\0${observation.arm}`;
    const list = grouped.get(key) ?? [];
    list.push(observation);
    grouped.set(key, list);
  }
  const families = executionPlan.modelFamilies.map((item) => item.family).sort();
  const arms = armIds(protocol);
  const perFamily = {};
  for (const [familyIndex, family] of families.entries()) {
    const cases = packetManifest.cases
      .map((studyCase) => ({
        caseId: studyCase.id,
        repositoryId: studyCase.repositoryId,
        category: studyCase.category,
        arms: Object.fromEntries(
          arms.map((arm) => [
            arm,
            meanRecords(grouped.get(`${family}\0${studyCase.id}\0${arm}`) ?? []),
          ])
        ),
      }))
      .filter((item) => arms.every((arm) => item.arms[arm] !== null));
    const rows = factorialRows(cases);
    perFamily[family] = {
      modelVersion: executionPlan.modelFamilies.find((item) => item.family === family)?.modelVersion,
      pairedQueries: cases.length,
      arms: Object.fromEntries(
        arms.map((arm) => [arm, summarizeRecords(cases.map((item) => item.arms[arm]))])
      ),
      effects: effectSummary(rows, protocol, 100 * (familyIndex + 1)),
    };
  }
  const averagedCases = packetManifest.cases
    .map((studyCase) => {
      const familyCases = families.map((family) => ({
        family,
        arms: Object.fromEntries(
          arms.map((arm) => [
            arm,
            meanRecords(grouped.get(`${family}\0${studyCase.id}\0${arm}`) ?? []),
          ])
        ),
      }));
      if (familyCases.some((item) => arms.some((arm) => item.arms[arm] === null))) return null;
      return {
        caseId: studyCase.id,
        repositoryId: studyCase.repositoryId,
        category: studyCase.category,
        arms: Object.fromEntries(
          arms.map((arm) => [
            arm,
            averageArmRecords(familyCases.map((item) => item.arms[arm])),
          ])
        ),
      };
    })
    .filter(Boolean);
  const overallRows = factorialRows(averagedCases);
  const overallEffects = effectSummary(overallRows, protocol);
  const primaryCorrection = holmBonferroni({
    literal_pixels_main_effect_precision_at_5: overallEffects.literalPixels.precisionAt5,
    literal_pixels_main_effect_mean_reciprocal_rank: overallEffects.literalPixels.mrr,
  });
  const pixelRequests = requests.filter((request) => request.input.literalImage !== null);
  const receiptedPixelResponses = pixelRequests.filter((request) => {
    const response = responseByRequest.get(request.requestId);
    return (
      response?.imageInputReceipt?.actualImageBytes === true &&
      response.imageInputReceipt.sha256 === request.input.literalImage.sha256
    );
  });
  const imageInputReceiptRate =
    pixelRequests.length === 0 ? 0 : receiptedPixelResponses.length / pixelRequests.length;
  const threshold = protocol?.confirmationGate ?? {};
  const familyPasses = Object.entries(perFamily)
    .filter(
      ([, summary]) =>
        summary.effects.literalPixels.precisionAt5.ci[0] >
          Number(threshold.literalPixelsPrecisionAt5DeltaLower95CIGreaterThan ?? 0) &&
        summary.effects.literalPixels.mrr.ci[0] >
          Number(threshold.literalPixelsMrrDeltaLower95CIGreaterThan ?? 0)
    )
    .map(([family]) => family);
  const confirmationChecks = [
    {
      id: 'complete-response-set',
      pass: blockers.length === 0 && responseByRequest.size === requests.length,
      detail: { expected: requests.length, observed: responseByRequest.size },
    },
    {
      id: 'literal-pixels-precision-lower-ci',
      pass:
        overallEffects.literalPixels.precisionAt5.ci[0] >
        Number(threshold.literalPixelsPrecisionAt5DeltaLower95CIGreaterThan ?? 0),
      detail: overallEffects.literalPixels.precisionAt5,
    },
    {
      id: 'literal-pixels-mrr-lower-ci',
      pass:
        overallEffects.literalPixels.mrr.ci[0] >
        Number(threshold.literalPixelsMrrDeltaLower95CIGreaterThan ?? 0),
      detail: overallEffects.literalPixels.mrr,
    },
    {
      id: 'literal-pixels-invalid-rate',
      pass:
        overallEffects.literalPixels.invalidResponseRate <=
        Number(threshold.literalPixelsInvalidResponseRateIncreaseAtMost ?? 0.02),
      detail: overallEffects.literalPixels.invalidResponseRate,
    },
    {
      id: 'family-replication',
      pass:
        familyPasses.length >= Number(threshold.minimumFamiliesPassingBothPrimaryMetrics ?? 2),
      detail: {
        passing: familyPasses,
        minimum: Number(threshold.minimumFamiliesPassingBothPrimaryMetrics ?? 2),
      },
    },
    {
      id: 'image-input-receipts',
      pass: imageInputReceiptRate === 1,
      detail: { rate: round(imageInputReceiptRate), expected: 1 },
    },
    {
      id: 'holm-bonferroni-primary-metrics',
      pass: Object.values(primaryCorrection).every((item) => item.adjustedPValue < 0.05),
      detail: primaryCorrection,
    },
  ];
  const confirmationSupported =
    blockers.length === 0 && confirmationChecks.every((item) => item.pass);
  return {
    schemaVersion: PAPER_5_VISUAL_V4_RESULT_SCHEMA,
    status: blockers.length === 0 ? 'pass' : 'blocked',
    blockers,
    counts: {
      expectedResponses: requests.length,
      admittedResponses: responseByRequest.size,
      modelFamilies: families.length,
      pairedQueries: averagedCases.length,
      pixelRequests: pixelRequests.length,
      receiptedPixelResponses: receiptedPixelResponses.length,
    },
    arms: Object.fromEntries(
      arms.map((arm) => [arm, summarizeRecords(averagedCases.map((item) => item.arms[arm]))])
    ),
    effects: overallEffects,
    families: perFamily,
    quality: {
      imageInputReceiptRate: round(imageInputReceiptRate),
      primaryCorrection,
    },
    confirmation: {
      status: confirmationSupported ? 'supported' : 'not-supported',
      checks: confirmationChecks,
      familiesPassingBothPrimaryMetrics: familyPasses,
    },
    claimBoundary: {
      publicationReady: confirmationSupported,
      superiorityClaimEligible: confirmationSupported,
      literalPixelVisionMeasured: blockers.length === 0 && pixelRequests.length > 0,
      measuredSurface:
        blockers.length === 0
          ? 'Controlled-navigation four-arm factorial over admitted packet candidates.'
          : 'No complete admitted v4 response set.',
    },
  };
}

function caseByIdSafe(packetManifest) {
  return new Map(
    (Array.isArray(packetManifest?.cases) ? packetManifest.cases : []).map((studyCase) => [
      studyCase?.id,
      studyCase,
    ])
  );
}
