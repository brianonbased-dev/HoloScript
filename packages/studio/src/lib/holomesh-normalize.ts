export type JsonObject = Record<string, unknown>;

export function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
}

export function asObjectArray(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.map(asObject).filter((item) => Object.keys(item).length > 0)
    : [];
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function reputationTier(score: number): 'newcomer' | 'contributor' | 'expert' | 'authority' {
  if (score >= 100) return 'authority';
  if (score >= 30) return 'expert';
  if (score >= 5) return 'contributor';
  return 'newcomer';
}

export function normalizeAgent(value: unknown, fallback: Partial<JsonObject> = {}): JsonObject {
  const record = { ...fallback, ...asObject(value) };
  const id = asString(record.id, asString(record.agentId, asString(record.name, 'agent-unknown')));
  const name = asString(record.name, id);
  const reputation = asNumber(record.reputation ?? record.score);
  const contributionCount = asNumber(record.contributionCount ?? record.contributions);

  return {
    ...record,
    id,
    name,
    workspace: asString(record.workspace, 'holomesh'),
    traits: asStringArray(record.traits),
    reputation,
    contributionCount,
    queryCount: asNumber(record.queryCount ?? record.queriesAnswered),
    joinedAt: asString(record.joinedAt ?? record.createdAt, new Date(0).toISOString()),
  };
}

export function normalizeDomain(value: unknown): JsonObject {
  const record = asObject(value);
  return {
    ...record,
    name: asString(record.name, 'general'),
    description: asString(record.description, 'Knowledge entries in this domain.'),
    entryCount: asNumber(record.entryCount ?? record.count),
    subscriberCount: asNumber(record.subscriberCount),
    recentActivity: asString(record.recentActivity, new Date().toISOString()),
  };
}

export function normalizeKnowledgeEntry(value: unknown): JsonObject {
  const record = asObject(value);
  const rawType = asString(record.type, 'wisdom');
  const type =
    rawType === 'pattern' || rawType === 'gotcha' || rawType === 'wisdom' ? rawType : 'wisdom';

  return {
    ...record,
    id: asString(record.id, `entry-${Date.now()}`),
    workspaceId: asString(record.workspaceId, 'holomesh'),
    type,
    content: asString(record.content),
    provenanceHash: asString(record.provenanceHash),
    authorId: asString(record.authorId),
    authorName: asString(record.authorName, 'unknown'),
    price: asNumber(record.price),
    queryCount: asNumber(record.queryCount),
    reuseCount: asNumber(record.reuseCount),
    tags: asStringArray(record.tags),
    confidence: asNumber(record.confidence, 0),
    createdAt: asString(record.createdAt, new Date().toISOString()),
    voteCount: asNumber(record.voteCount),
    commentCount: asNumber(record.commentCount),
  };
}

/**
 * Sets one `key: value` line of a composition's `state {}` to `value`, rendered as a
 * HoloScript literal: strings and arrays as JSON, numbers and booleans as-is. The
 * HoloMesh surface routes use it to splice a caller's own profile into
 * holomesh-profile.hsplus.
 *
 * The replacement is a function, not a replacement string. In a string, `$'`, `` $` ``,
 * `$&` and `$1` inside a value (a bio is free text) expand into other parts of the
 * source (task_1790602604837_whpw, item 1). A function's return value is inserted as-is.
 */
export function spliceCompositionState(
  code: string,
  key: string,
  value: string | number | boolean | string[]
): string {
  const rendered =
    Array.isArray(value) || typeof value === 'string' ? JSON.stringify(value) : String(value);
  const pattern = new RegExp(
    `(^\\s*${key}:\\s*)(?:"[^"]*"|\\[[^\\]]*\\]|true|false|-?\\d+(?:\\.\\d+)?)`,
    'm'
  );
  return code.replace(pattern, (_match, prefix: string) => `${prefix}${rendered}`);
}
