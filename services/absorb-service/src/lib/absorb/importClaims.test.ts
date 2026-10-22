import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  CLAIM_SQL,
  COMPLETE_CLAIM_SQL,
  CONFIRM_CLAIM_SQL,
  MemoryImportClaimStore,
  PENDING_STALE_MS,
  PostgresImportClaimStore,
  READ_CLAIM_SQL,
  RELEASE_CLAIM_SQL,
} from './importClaims.js';

const U = '11111111-2222-4333-8444-555555555555';
const REF = { repoUrl: 'https://github.com/o/r', branch: 'main' };

describe('migration 0003_absorb_import_claims', () => {
  it('exists, is journaled, and has the unique index, holder and repo columns the claim relies on', () => {
    const dir = join(dirname(fileURLToPath(import.meta.url)), '../../../drizzle');
    const sqlText = readFileSync(join(dir, '0003_absorb_import_claims.sql'), 'utf8');
    expect(sqlText).toMatch(/CREATE TABLE IF NOT EXISTS "absorb_import_claims"/);
    for (const col of [
      '"user_id" text NOT NULL',
      '"import_id" text NOT NULL',
      '"status" text NOT NULL',
      '"holder" text NOT NULL',
      '"repo_url" text',
      '"branch" text',
      '"outcome" jsonb',
    ]) {
      expect(sqlText).toContain(col);
    }
    expect(sqlText).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "idx_absorb_import_claims_user_import" ON "absorb_import_claims" USING btree \("user_id","import_id"\)/
    );
    expect(CLAIM_SQL).toContain('ON CONFLICT (user_id, import_id)');
    const journal = JSON.parse(readFileSync(join(dir, 'meta/_journal.json'), 'utf8'));
    expect(journal.entries.map((e: { tag: string }) => e.tag)).toContain('0003_absorb_import_claims');
  });

  it('a stale takeover requires the same repo and branch and no usage row in the ledger', () => {
    expect(CLAIM_SQL).toContain('repo_url IS NOT DISTINCT FROM EXCLUDED.repo_url');
    expect(CLAIM_SQL).toContain('branch IS NOT DISTINCT FROM EXCLUDED.branch');
    expect(CLAIM_SQL).toMatch(/AND NOT EXISTS \(SELECT 1 FROM credit_transactions ct/);
    expect(CLAIM_SQL).toContain(`ct.metadata->>'importId' = $2`);
    for (const sql of [CONFIRM_CLAIM_SQL, COMPLETE_CLAIM_SQL, RELEASE_CLAIM_SQL]) {
      expect(sql).toContain('holder = $3');
    }
  });
});

describe('PostgresImportClaimStore', () => {
  it('a won insert is the claim (with its holder); a lost one replays a finished outcome', async () => {
    const outcome = { status: 200, json: { graphId: 'g1', cost: 10 } };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ import_id: 'imp-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'done', outcome, repo_url: REF.repoUrl, branch: 'main', charged: true }] });
    const store = new PostgresImportClaimStore(query, () => 'holder-a');
    expect(await store.claim(U, 'imp-1', REF)).toEqual({ kind: 'claimed', holder: 'holder-a' });
    expect(query).toHaveBeenNthCalledWith(1, CLAIM_SQL, [U, 'imp-1', PENDING_STALE_MS, 'holder-a', REF.repoUrl, 'main']);
    expect(await store.claim(U, 'imp-1', REF)).toEqual({ kind: 'done', outcome });
    expect(query).toHaveBeenNthCalledWith(3, READ_CLAIM_SQL, [U, 'imp-1']);
  });

  it('a lost insert on a pending row that the ledger shows charged is "charged", not a takeover', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'pending', outcome: null, repo_url: REF.repoUrl, branch: 'main', charged: true }] });
    const store = new PostgresImportClaimStore(query);
    expect(await store.claim(U, 'imp-2', REF)).toEqual({ kind: 'charged' });
  });

  it('a lost insert for another repo or branch is a mismatch', async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ status: 'done', outcome: { status: 200, json: {} }, repo_url: REF.repoUrl, branch: 'main' }] });
    const store = new PostgresImportClaimStore(query);
    expect(await store.claim(U, 'imp-3', { repoUrl: REF.repoUrl, branch: 'dev' })).toEqual({ kind: 'mismatch' });
  });

  it('confirm, complete and release all name the holder', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ import_id: 'imp-4' }] }).mockResolvedValue({ rows: [] });
    const store = new PostgresImportClaimStore(query);
    expect(await store.confirm(U, 'imp-4', 'h1')).toBe(true);
    expect(query).toHaveBeenCalledWith(CONFIRM_CLAIM_SQL, [U, 'imp-4', 'h1']);
    expect(await store.confirm(U, 'imp-4', 'h-old')).toBe(false);
    const outcome = { status: 200, json: { graphId: 'g4' } };
    await store.complete(U, 'imp-4', 'h1', outcome);
    expect(query).toHaveBeenCalledWith(COMPLETE_CLAIM_SQL, [U, 'imp-4', 'h1', JSON.stringify(outcome)]);
    await store.release(U, 'imp-4', 'h1');
    expect(query).toHaveBeenCalledWith(RELEASE_CLAIM_SQL, [U, 'imp-4', 'h1']);
  });
});

describe('MemoryImportClaimStore', () => {
  it('claims once, replays when done, and frees a released claim', async () => {
    const s = new MemoryImportClaimStore();
    const c = await s.claim(U, 'a', REF);
    expect(c.kind).toBe('claimed');
    expect((await s.claim(U, 'a', REF)).kind).toBe('pending');
    await s.release(U, 'a', (c as { holder: string }).holder);
    const c2 = await s.claim(U, 'a', REF);
    expect(c2.kind).toBe('claimed');
    await s.complete(U, 'a', (c2 as { holder: string }).holder, { status: 200, json: { ok: true } });
    expect(await s.claim(U, 'a', REF)).toEqual({ kind: 'done', outcome: { status: 200, json: { ok: true } } });
  });

  it('a late write from the old holder after a stale takeover is ignored', async () => {
    const s = new MemoryImportClaimStore();
    const old = (await s.claim(U, 'b', REF)) as { kind: 'claimed'; holder: string };
    s.ageForTests(U, 'b');
    const fresh = (await s.claim(U, 'b', REF)) as { kind: 'claimed'; holder: string };
    expect(fresh.kind).toBe('claimed');
    expect(fresh.holder).not.toBe(old.holder);
    expect(await s.confirm(U, 'b', old.holder)).toBe(false);
    await s.complete(U, 'b', old.holder, { status: 200, json: { from: 'old' } });
    await s.release(U, 'b', old.holder);
    expect((await s.claim(U, 'b', REF)).kind).toBe('pending'); // still the new holder's
    await s.complete(U, 'b', fresh.holder, { status: 200, json: { from: 'new' } });
    expect(await s.claim(U, 'b', REF)).toEqual({ kind: 'done', outcome: { status: 200, json: { from: 'new' } } });
  });

  it('refuses a reused importId for another repo or branch', async () => {
    const s = new MemoryImportClaimStore();
    await s.claim(U, 'c', REF);
    expect((await s.claim(U, 'c', { repoUrl: REF.repoUrl, branch: 'dev' })).kind).toBe('mismatch');
    expect((await s.claim(U, 'c', { repoUrl: 'https://github.com/o/other', branch: 'main' })).kind).toBe('mismatch');
  });
});