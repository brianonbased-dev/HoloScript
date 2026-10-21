import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  CLAIM_SQL,
  COMPLETE_CLAIM_SQL,
  MemoryImportClaimStore,
  PENDING_STALE_MS,
  PostgresImportClaimStore,
  READ_CLAIM_SQL,
  RELEASE_CLAIM_SQL,
} from './importClaims.js';

const U = '11111111-2222-4333-8444-555555555555';

describe('migration 0003_absorb_import_claims', () => {
  it('exists, is journaled, and has the unique (user_id, import_id) index the claim relies on', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../drizzle');
    const sqlText = readFileSync(join(dir, '0003_absorb_import_claims.sql'), 'utf8');
    expect(sqlText).toMatch(/CREATE TABLE IF NOT EXISTS "absorb_import_claims"/);
    for (const col of ['"user_id" text NOT NULL', '"import_id" text NOT NULL', '"status" text NOT NULL', '"outcome" jsonb']) {
      expect(sqlText).toContain(col);
    }
    expect(sqlText).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "idx_absorb_import_claims_user_import" ON "absorb_import_claims" USING btree \("user_id","import_id"\)/
    );
    expect(CLAIM_SQL).toContain('ON CONFLICT (user_id, import_id)');
    const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8'));
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toContain('0003_absorb_import_claims');
  });
});

describe('PostgresImportClaimStore', () => {
  it('a won insert is the claim; a lost one reads the row and replays a finished outcome', async () => {
    const outcome = { status: 200, json: { graphId: 'g1', cost: 10 } };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ import_id: 'imp-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'done', outcome }] });
    const store = new PostgresImportClaimStore(query);
    expect(await store.claim(U, 'imp-1')).toEqual({ kind: 'claimed' });
    expect(query).toHaveBeenNthCalledWith(1, CLAIM_SQL, [U, 'imp-1', PENDING_STALE_MS]);
    expect(await store.claim(U, 'imp-1')).toEqual({ kind: 'done', outcome });
    expect(query).toHaveBeenNthCalledWith(3, READ_CLAIM_SQL, [U, 'imp-1']);
  });

  it('a lost insert on a still-pending row is pending; complete and release write what they say', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'pending', outcome: null }] })
      .mockResolvedValue({ rows: [] });
    const store = new PostgresImportClaimStore(query);
    expect(await store.claim(U, 'imp-2')).toEqual({ kind: 'pending' });
    const outcome = { status: 200, json: { graphId: 'g2' } };
    await store.complete(U, 'imp-2', outcome);
    expect(query).toHaveBeenCalledWith(COMPLETE_CLAIM_SQL, [U, 'imp-2', JSON.stringify(outcome)]);
    await store.release(U, 'imp-2');
    expect(query).toHaveBeenCalledWith(RELEASE_CLAIM_SQL, [U, 'imp-2']);
  });
});

describe('MemoryImportClaimStore', () => {
  it('claims once, replays when done, and frees a released claim', async () => {
    const s = new MemoryImportClaimStore();
    expect((await s.claim(U, 'a')).kind).toBe('claimed');
    expect((await s.claim(U, 'a')).kind).toBe('pending');
    await s.release(U, 'a');
    expect((await s.claim(U, 'a')).kind).toBe('claimed');
    await s.complete(U, 'a', { status: 200, json: { ok: true } });
    expect(await s.claim(U, 'a')).toEqual({ kind: 'done', outcome: { status: 200, json: { ok: true } } });
  });
});