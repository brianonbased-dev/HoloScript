type HoloProperty = {
  type?: string;
  key: string;
  value: unknown;
};

type HoloObjectLike = {
  name: string;
  properties?: HoloProperty[];
};

type HoloCompositionLike = {
  objects?: HoloObjectLike[];
};

type PillarDomainSlice = {
  pillar_domain?: string;
  pos_1?: unknown;
  pos_2?: unknown;
};

type PillarTelemetryRecord = Record<string, unknown>;

type ExtractedPillarEvent = {
  seriesKey: string;
  domain: string;
  score: number;
};

const AXIS_DOMAIN_BY_LABEL: Record<string, string> = {
  reasoning: 'solver',
  'tool use': 'compiler',
  write: 'language',
  accuracy: 'accuracy_speed',
  memory: 'storage',
  truth: 'truth_approval',
  coordination: 'coordination',
  mobility: 'agent',
};

const SERIES_ALIASES: Record<string, string> = {
  brittney: 'brittney',
  daimon: 'daimon',
  worker: 'worker',
  codex: 'worker',
  openai: 'worker',
  claude: 'worker',
  anthropic: 'worker',
  grok: 'worker',
  gemini: 'worker',
  cursor: 'worker',
  copilot: 'worker',
};

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function propValue(obj: HoloObjectLike, key: string): unknown {
  const value = (obj.properties || []).find((prop) => prop.key === key)?.value;
  if (value && typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).value;
  }
  return value;
}

function stringProp(obj: HoloObjectLike, key: string): string {
  const value = propValue(obj, key);
  return value == null ? '' : String(value);
}

function setStringProp(obj: HoloObjectLike, key: string, value: string): HoloObjectLike {
  const properties = [...(obj.properties || [])];
  const existing = properties.findIndex((prop) => prop.key === key);
  const nextProp = { type: 'ObjectProperty', key, value };
  if (existing >= 0) properties[existing] = nextProp;
  else properties.push(nextProp);
  return { ...obj, properties };
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeSeriesKey(value: unknown): string | undefined {
  const normalized = normalizeKey(value);
  if (!normalized) return undefined;

  for (const [needle, series] of Object.entries(SERIES_ALIASES)) {
    if (normalized.includes(needle)) return series;
  }

  return normalized;
}

function toNumber(value: unknown): number | undefined {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function clamp01(value: unknown, fallback = 0): number {
  const number = toNumber(value) ?? fallback;
  return Math.min(1, Math.max(0, number));
}

function round1(value: number): number {
  return Number(value.toFixed(1));
}

function parseValues(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((part) => Number(part))
    .filter((number) => Number.isFinite(number));
}

function formatValues(values: number[]): string {
  return values
    .map((value) => (Number.isInteger(value) ? String(value) : value.toFixed(1)))
    .join(',');
}

function radarScore(slice: PillarDomainSlice): number {
  const domain = slice.pillar_domain;
  const pos1 = clamp01(slice.pos_1);
  const pos2 = clamp01(slice.pos_2);

  if (domain === 'truth_approval') return round1(((pos1 + (1 - pos2)) / 2) * 10);
  if (domain === 'accuracy_speed') return round1(pos1 * 10);
  if (domain === 'storage') return round1(((1 - pos1 + pos2) / 2) * 10);

  return round1(((pos1 + pos2) / 2) * 10);
}

function eventSlice(record: PillarTelemetryRecord): PillarDomainSlice | undefined {
  const payload = asObject(record.payload);
  const directSlice = asObject(record.slice) || asObject(record.pillar_slice);
  const payloadSlice = asObject(payload?.slice) || asObject(payload?.pillar_slice);
  const slice = directSlice || payloadSlice;
  if (!slice) return undefined;

  const domain = slice.pillar_domain;
  if (typeof domain !== 'string' || domain.length === 0) return undefined;

  return {
    pillar_domain: domain,
    pos_1: slice.pos_1,
    pos_2: slice.pos_2,
  };
}

function eventSeriesKey(record: PillarTelemetryRecord): string {
  const payload = asObject(record.payload);
  const context = asObject(record.context) || asObject(payload?.context);
  const metadata =
    asObject(context?.metadata) || asObject(payload?.metadata) || asObject(record.metadata);

  return (
    normalizeSeriesKey(record.series) ||
    normalizeSeriesKey(record.agent_class) ||
    normalizeSeriesKey(record.agentClass) ||
    normalizeSeriesKey(record.class) ||
    normalizeSeriesKey(payload?.series) ||
    normalizeSeriesKey(payload?.agent_class) ||
    normalizeSeriesKey(payload?.agentClass) ||
    normalizeSeriesKey(metadata?.series) ||
    normalizeSeriesKey(metadata?.agent_class) ||
    normalizeSeriesKey(metadata?.agentClass) ||
    normalizeSeriesKey(context?.agent_id) ||
    normalizeSeriesKey(record.agent_id) ||
    'worker'
  );
}

function extractedEvents(records: unknown[]): ExtractedPillarEvent[] {
  const events: ExtractedPillarEvent[] = [];

  for (const rawRecord of records) {
    const record = asObject(rawRecord);
    if (!record) continue;

    const slice = eventSlice(record);
    if (!slice?.pillar_domain) continue;

    events.push({
      seriesKey: eventSeriesKey(record),
      domain: slice.pillar_domain,
      score: radarScore(slice),
    });
  }

  return events;
}

function axisDomains(objects: HoloObjectLike[]): string[] {
  return objects
    .filter((obj) => stringProp(obj, 'kind') === 'axis' || obj.name.startsWith('axis'))
    .map((axis) => {
      const explicitDomain = stringProp(axis, 'pillar_domain') || stringProp(axis, 'domain');
      if (explicitDomain) return explicitDomain;
      return AXIS_DOMAIN_BY_LABEL[stringProp(axis, 'label').toLowerCase()] || '';
    });
}

function seriesObjects(objects: HoloObjectLike[]): HoloObjectLike[] {
  return objects.filter(
    (obj) => stringProp(obj, 'kind') === 'series' || obj.name.startsWith('series')
  );
}

function seriesKey(obj: HoloObjectLike): string {
  return (
    normalizeSeriesKey(stringProp(obj, 'series_key')) ||
    normalizeSeriesKey(stringProp(obj, 'name')) ||
    normalizeSeriesKey(obj.name) ||
    obj.name
  );
}

function fallbackValues(obj: HoloObjectLike): number[] {
  return parseValues(stringProp(obj, 'fallback_values') || stringProp(obj, 'values'));
}

export function normalizePillarTelemetryInput(input: unknown): unknown[] {
  if (Array.isArray(input)) return input;

  const object = asObject(input);
  if (!object) return [];

  for (const key of ['events', 'records', 'slices', 'pillar_slices', 'pillarSlices']) {
    const value = object[key];
    if (Array.isArray(value)) return value;
  }

  return [object];
}

export function applyPillarDomainRadarTelemetry<T extends HoloCompositionLike>(
  composition: T,
  telemetryRecords: unknown[]
): T {
  const objects = composition.objects || [];
  const domains = axisDomains(objects);
  const axisIndexByDomain = new Map(domains.map((domain, index) => [domain, index]));
  const series = seriesObjects(objects);
  const knownSeries = new Set(series.map(seriesKey));
  const buckets = new Map<string, Map<number, number[]>>();

  for (const event of extractedEvents(telemetryRecords)) {
    const axisIndex = axisIndexByDomain.get(event.domain);
    if (axisIndex == null) continue;

    const key = knownSeries.has(event.seriesKey) ? event.seriesKey : 'worker';
    if (!buckets.has(key)) buckets.set(key, new Map());
    const byAxis = buckets.get(key)!;
    if (!byAxis.has(axisIndex)) byAxis.set(axisIndex, []);
    byAxis.get(axisIndex)!.push(event.score);
  }

  const nextObjects = objects.map((obj) => {
    if (!series.includes(obj)) return obj;

    const key = seriesKey(obj);
    const byAxis = buckets.get(key);
    const fallback = fallbackValues(obj);
    const values = domains.map((_, index) => {
      const scores = byAxis?.get(index);
      if (scores?.length) {
        return round1(scores.reduce((sum, score) => sum + score, 0) / scores.length);
      }
      return fallback[index] ?? 0;
    });

    return setStringProp(obj, 'values', formatValues(values));
  });

  return {
    ...composition,
    objects: nextObjects,
  };
}
