import { createHash, randomBytes } from 'crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { userApiKeys } from '@/db/schema';

const PREFIX = 'bk_';
const MAX_KEYS_PER_USER = 10;

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = PREFIX + randomBytes(32).toString('base64url');
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, PREFIX.length + 7); // "bk_" + 7 chars
  return { rawKey, keyHash, keyPrefix };
}

export async function createUserApiKey(
  userId: string,
  label: string
): Promise<{ rawKey: string; id: string; keyPrefix: string; createdAt: Date } | { error: string }> {
  const db = getDb();
  if (!db) return { error: 'Database not configured' };

  const existing = await db
    .select({ id: userApiKeys.id })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), isNull(userApiKeys.revokedAt)));
  if (existing.length >= MAX_KEYS_PER_USER) {
    return { error: `Maximum ${MAX_KEYS_PER_USER} active API keys per user` };
  }

  const { rawKey, keyHash, keyPrefix } = generateApiKey();
  const [row] = await db
    .insert(userApiKeys)
    .values({ userId, keyHash, keyPrefix, label })
    .returning({ id: userApiKeys.id, createdAt: userApiKeys.createdAt });

  return { rawKey, id: row.id, keyPrefix, createdAt: row.createdAt };
}

export async function validateApiKey(
  rawKey: string
): Promise<{ userId: string; keyId: string } | null> {
  if (!rawKey.startsWith(PREFIX)) return null;
  const db = getDb();
  if (!db) return null;

  const keyHash = hashKey(rawKey);
  const rows = await db
    .select({
      id: userApiKeys.id,
      userId: userApiKeys.userId,
      revokedAt: userApiKeys.revokedAt,
    })
    .from(userApiKeys)
    .where(eq(userApiKeys.keyHash, keyHash))
    .limit(1);

  if (!rows.length || rows[0].revokedAt) return null;

  // Update last-used timestamp in the background — don't block the request.
  db.update(userApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(userApiKeys.id, rows[0].id))
    .catch(() => {});

  return { userId: rows[0].userId, keyId: rows[0].id };
}

export async function revokeUserApiKey(id: string, userId: string): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const result = await db
    .update(userApiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(userApiKeys.id, id), eq(userApiKeys.userId, userId), isNull(userApiKeys.revokedAt))
    )
    .returning({ id: userApiKeys.id });
  return result.length > 0;
}

export async function listUserApiKeys(userId: string) {
  const db = getDb();
  if (!db) return [];
  return db
    .select({
      id: userApiKeys.id,
      label: userApiKeys.label,
      keyPrefix: userApiKeys.keyPrefix,
      createdAt: userApiKeys.createdAt,
      lastUsedAt: userApiKeys.lastUsedAt,
      revokedAt: userApiKeys.revokedAt,
    })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .orderBy(userApiKeys.createdAt);
}
