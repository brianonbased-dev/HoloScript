export interface KnowledgePublicationEntry {
  type?: string;
  content?: string;
  domain?: string;
  tags?: string[];
  is_premium?: boolean;
  [key: string]: unknown;
}

export interface PublishKnowledgeInput {
  entries: KnowledgePublicationEntry[];
  workspaceId: string;
  defaultPremium?: boolean;
  holomeshKey: string;
  mcpServerUrl: string;
  fetchImpl?: typeof fetch;
}

export interface PublishKnowledgeResult {
  publishedCount: number;
  premium_count: number;
  free_count: number;
  errors?: string[];
  allSucceeded: boolean;
}

export async function publishKnowledgeEntries({
  entries,
  workspaceId,
  defaultPremium = false,
  holomeshKey,
  mcpServerUrl,
  fetchImpl = fetch,
}: PublishKnowledgeInput): Promise<PublishKnowledgeResult> {
  let premium_count = 0;
  let free_count = 0;
  let publishedCount = 0;
  const errors: string[] = [];

  for (const entry of entries) {
    try {
      const isPremium = entry.is_premium ?? defaultPremium;
      const res = await fetchImpl(`${mcpServerUrl}/api/holomesh/contribute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${holomeshKey}`,
        },
        body: JSON.stringify({
          ...entry,
          type: entry.type?.toLowerCase() || 'wisdom',
          content: entry.content || '',
          domain: entry.domain || workspaceId,
          tags: isPremium ? Array.from(new Set(['premium', ...(entry.tags ?? [])])) : (entry.tags ?? []),
          is_premium: isPremium,
        }),
      });

      if (res.ok) {
        publishedCount += 1;
        if (isPremium) {
          premium_count += 1;
        } else {
          free_count += 1;
        }
      } else {
        errors.push(await res.text());
      }
    } catch (err) {
      errors.push(String(err));
    }
  }

  return {
    publishedCount,
    premium_count,
    free_count,
    errors: errors.length > 0 ? errors : undefined,
    allSucceeded: publishedCount === entries.length && errors.length === 0,
  };
}
