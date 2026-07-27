import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';

export const PAPER_5_VISUAL_V4_PROTOCOL_SCHEMA =
  'holoscript.paper5.visual-agent-study-protocol.v4';
export const PAPER_5_VISUAL_V4_DATASET_SCHEMA =
  'holoscript.paper5.visual-agent-study-dataset.v4';
export const PAPER_5_VISUAL_V4_PACKET_SCHEMA =
  'holoscript.paper5.visual-agent-packets.v4';

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
  const candidates = [...new Set((query?.candidates ?? []).map((item) => normalizePath(item.file)))];
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
    dataset ? dataset.datasetId ?? null : 'dataset not supplied'
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
  const expectedCalibrationFraction = Number(protocol?.dataset?.custody?.calibrationFraction ?? 0.2);
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
  '1': ['010', '110', '010', '010', '111'],
  '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'],
  '0': ['111', '101', '101', '101', '111'],
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
    const tip = [
      to[0] - Math.cos(angle) * 48,
      to[1] - Math.sin(angle) * 48,
    ];
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
      goldCandidateAliases: relevantFilesFor(query).map((file) => aliasByFile.get(file)).sort(),
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
          ...(arm === 'pixels' || arm === 'relations-pixels'
            ? { literalImageRequired: true }
            : {}),
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
      pass: ineligible.length === 0,
      detail: ineligible,
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
