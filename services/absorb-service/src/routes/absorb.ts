import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { userUuid } from '../middleware/auth.js';
import { cloneRepo, CloneRefusal, normalizeRepoUrl, resolveCommitSha } from '../lib/absorb/clone-from-url.js';
import {
  CLAIM_HEARTBEAT_MS,
  MemoryImportClaimStore,
  commitImportId,
  PostgresImportClaimStore,
  RefusingImportClaimStore,
  databaseRequiredRefusal,
  type ImportClaimStore,
} from '../lib/absorb/importClaims.js';

const router = Router();

// In-memory graph store (replace with Redis/DB for production scale)
const graphStore = new Map<string, { 
  graph: any; 
  stats: any; 
  createdAt: Date;
  path: string;
  shallow: boolean;
  // Account that paid for this scan. Null when nobody was charged.
  // A later scan is reused only for this same account.
  ownerId: string | null;
  topology: any;
  fileCount: number;
  // Account that created this graph (the signed-in user uuid). Null when the
  // scan had no account. Missing or null is an ownerless row: visible to nobody.
  userId: string | null;
}>();

const ScanRequestSchema = z
  .object({
    // Exactly one of: a folder on this server, or a public github.com repo
    // that absorb clones itself (Studio's clone lives on another volume).
    path: z.string().min(1).optional(),
    repoUrl: z.string().min(1).max(300).optional(),
    branch: z.string().max(200).optional(),
    // One import = one charge. A retry with the same importId gets the first
    // result back and is not charged again.
    importId: z.string().min(8).max(100).optional(),
    languages: z.array(z.string()).optional(),
    shallow: z.boolean().optional().default(false),
    projectId: z.string().optional(),
  })
  .refine((b) => (b.path ? 1 : 0) + (b.repoUrl ? 1 : 0) === 1, {
    message: 'send exactly one of path or repoUrl',
  })
  // A URL import is charged once per importId, so it must carry one: without
  // it a retry could not be told apart from a new import.
  .refine((b) => !b.repoUrl || !!b.importId, {
    message: 'importId is required with repoUrl',
    path: ['importId'],
  });

type ScanBody = z.infer<typeof ScanRequestSchema> & { commitSha?: string; clientImportId?: string };
type ScanOutcome = { status: number; json: Record<string, unknown> };

// URL imports running on THIS instance, per (account, importId): two requests
// here share one run. Across instances and restarts the durable claim decides
// (lib/absorb/importClaims.ts, table absorb_import_claims, migration 0003).
const importsInFlight = new Map<string, Promise<ScanOutcome>>();
const memoryClaims = new MemoryImportClaimStore();

function importClaimStore(): ImportClaimStore {
  const db = getDb();
  if (!db) {
    // Production without a database fails closed (503, nothing charged);
    // server.ts also refuses to start. Local dev: this process only.
    const refusal = databaseRequiredRefusal();
    return refusal ? new RefusingImportClaimStore(refusal) : memoryClaims;
  }
  return new PostgresImportClaimStore(async (text, params) =>
    db.$client.query(text, params as unknown[])
  );
}

/** Test seam: forget saved graphs only, as a restart does (claims survive). */
export function __dropGraphsForTests(): void {
  graphStore.clear();
}

/** Test seam: forget remembered imports and saved scans. */
export function __resetImportsForTests(): void {
  graphStore.clear();
  scanSlots.clear();
  parallelScanCap = ABSORB_MAX_PARALLEL_SCANS_PER_ACCOUNT;
  memoryClaims.clear();
  importsInFlight.clear();
}

const QueryRequestSchema = z.object({
  graphId: z.string().min(1),
  query: z.string().min(1),
  maxResults: z.number().optional().default(10),
});

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
  sourceType: z.enum(['github', 'local', 'upload', 'url']),
  sourceUrl: z.string().optional(),
  localPath: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// One shared load of the engine for the scan route: the root check and the scan read the same module, and two scans arriving together do not each start their own import.
let enginePromise: Promise<any> | undefined;
const loadEngine = () => (enginePromise ??= import('@holoscript/absorb-service/engine'));
let creditsPromise: Promise<any> | undefined;
const loadCredits = () => (creditsPromise ??= import('@holoscript/absorb-service/credits'));

// POST /scan — Scan a codebase (a server folder, or a github.com repo by URL)
router.post('/scan', async (req: Request, res: Response) => {
  let body: ScanBody;
  try {
    body = ScanRequestSchema.parse(req.body);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    throw error;
  }
  try {
    const outcome = body.repoUrl ? await scanFromUrlOnce(req, body) : await scanPath(req, body);
    res.status(outcome.status).json(outcome.json);
  } catch (error: any) {
    console.error('[absorb/scan] Error:', error.message);
    res.status(500).json({ error: 'Scan failed', message: error.message });
  }
});

const replayed = (o: ScanOutcome): ScanOutcome => ({
  status: o.status,
  json: { ...o.json, cost: 0, costCents: 0, replayed: true },
});

/** URL import, at most once per (account, importId), across instances. */
async function scanFromUrlOnce(req: Request, body: ScanBody): Promise<ScanOutcome> {
  const account = userUuid(req);
  // No account: nobody could be charged, so a URL import is refused before
  // any clone (Mapping N2, #617). A URL scan is never free. Checked before
  // ls-remote and the clone (#617 N3): an unauthenticated caller makes absorb
  // do no outbound git work at all.
  if (!(req as AuthenticatedRequest).authenticated || !account) {
    return {
      status: 401,
      json: {
        error: 'account_required',
        message: 'A repository import is charged to a signed-in account. Sign in and retry.',
      },
    };
  }
  // One charge per user + repo + commit SHA (CoS/Treasurer, #617): the claim
  // key is derived from the commit the branch points at, not from the
  // client's importId. A reload after a 502 sends a new importId for the same
  // commit and gets the first import back instead of a second charge.
  let repoUrl: string;
  let commitSha: string;
  try {
    repoUrl = normalizeRepoUrl(body.repoUrl);
    commitSha = await resolveCommitSha(body.repoUrl, body.branch);
  } catch (err) {
    if (err instanceof CloneRefusal) return cloneRefusalOutcome(err);
    throw err;
  }
  // Keyed on the scan options too (#617 H1): shallow and deep are separate imports.
  const importId = commitImportId(repoUrl, commitSha, { shallow: body.shallow, languages: body.languages });
  const keyed: ScanBody = { ...body, repoUrl, importId, commitSha, clientImportId: body.importId };
  const key = `${account}:${importId}`;

  const running = importsInFlight.get(key);
  if (running) return replayed(await running);
  const p = claimAndScan(req, keyed, account, importId);
  importsInFlight.set(key, p);
  try {
    return await p;
  } finally {
    importsInFlight.delete(key);
  }
}

/**
 * Claim (user, importId) in the database BEFORE cloning, scanning or charging.
 * Only the claim holder runs the import; a finished one replays with cost 0.
 * Every later write names the holder token, so a late write from a holder
 * whose stale claim was taken over changes nothing.
 */
async function claimAndScan(
  req: Request,
  body: ScanBody,
  account: string,
  importId: string
): Promise<ScanOutcome> {
  const store = importClaimStore();
  let claim;
  try {
    // A commit-keyed claim: the key already names repo + commit, so the
    // branch name used to reach that commit is not part of its identity.
    claim = await store.claim(account, importId, {
      repoUrl: body.repoUrl as string,
      branch: body.commitSha ? null : (body.branch ?? null),
    });
  } catch (err) {
    // Fail closed: without the claim a retry elsewhere could be charged again.
    console.error('[absorb/scan] import guard unavailable:', (err as Error)?.message);
    return {
      status: 503,
      json: {
        error: 'import_guard_unavailable',
        message: 'This import could not be recorded before charging for it. Try again shortly.',
      },
    };
  }
  if (claim.kind === 'mismatch') {
    return {
      status: 409,
      json: {
        error: 'import_id_reused',
        message: 'This importId belongs to a different repository or branch. Use a new importId.',
      },
    };
  }
  if (claim.kind === 'done') return replayOrRehydrate(req, body, claim.outcome);
  if (claim.kind === 'charged') {
    return {
      status: 409,
      json: {
        error: 'import_already_charged',
        message: 'This import was already charged but its result was not recorded. It will not be charged again.',
      },
    };
  }
  if (claim.kind === 'pending') {
    return {
      status: 409,
      json: {
        error: 'import_in_progress',
        message: 'This import is already running. Retry with the same importId to get its result.',
      },
    };
  }
  const holder = claim.holder;

  // Right before the charge: still the holder? (refreshes the claim, so a live
  // holder is never stale when it charges). False means another instance took
  // the claim over, and this one must not charge.
  const stillHolder = () => store.confirm(account, importId, holder);
  // The same check inside the debit's transaction (CoS, #617): a stall between
  // the confirm above and the debit cannot let a taken-over holder charge.
  const chargeGuard = store.chargeGuard(account, importId, holder);

  // Heartbeat (Mapping, #617): while this holder clones and scans, refresh the
  // claim every CLAIM_HEARTBEAT_MS, so a long clone or scan never looks stale
  // and cannot be taken over. Only a holder that stopped beating (died) ages
  // past PENDING_STALE_MS, and a takeover still checks the ledger first.
  const heartbeat = setInterval(() => {
    store.confirm(account, importId, holder).catch((err: unknown) => {
      console.error('[absorb/scan] import claim heartbeat failed:', (err as Error)?.message);
    });
  }, CLAIM_HEARTBEAT_MS);
  heartbeat.unref?.();

  try {
    let outcome: ScanOutcome;
    try {
      outcome = await scanFromUrl(req, body, stillHolder, chargeGuard);
    } catch (err) {
      await store.release(account, importId, holder).catch(() => undefined);
      throw err;
    }
    if (outcome.status === 200) {
      try {
        await store.complete(account, importId, holder, outcome);
      } catch (err) {
        // The charge has landed; the claim stays pending, and the ledger row
        // keeps any takeover from charging again (409 import_already_charged).
        console.error('[absorb/scan] import charged but not recorded as done:', (err as Error)?.message);
      }
    } else {
      // Not delivered, so nothing was charged: let the import be retried.
      await store.release(account, importId, holder).catch(() => undefined);
    }
    return outcome;
  } finally {
    clearInterval(heartbeat);
  }
}
/**
 * A finished import replays its first result (#617 H1). The graph itself lives
 * in this instance's memory (graphStore), so after a restart, or on another
 * instance, the stored graphId points at nothing. Then the import is scanned
 * again under the SAME graphId and the existing claim, with no credit check
 * and no debit: it was paid for once. The claim row is not touched.
 */
async function replayOrRehydrate(req: Request, body: ScanBody, outcome: ScanOutcome): Promise<ScanOutcome> {
  const graphId = outcome.json?.graphId;
  if (outcome.status !== 200 || typeof graphId !== 'string' || graphStore.has(graphId)) {
    return replayed(outcome);
  }
  const fresh = await scanFromUrl(req, body, undefined, undefined, graphId);
  if (fresh.status !== 200) return fresh; // nothing charged; the paid claim stays done
  return { status: 200, json: { ...replayed(fresh).json, rehydrated: true } };
}

function cloneRefusalOutcome(err: CloneRefusal): ScanOutcome {
  const status =
    err.code === 'repo_url_not_allowed' || err.code === 'branch_not_allowed'
      ? 400
      : err.code === 'clone_too_large'
        ? 413
        : err.code === 'clone_timeout'
          ? 504
          : 502;
  console.error(`[absorb/scan] clone refused (${err.code}): ${err.message}`);
  return { status, json: { error: err.code, message: err.message } };
}

async function scanFromUrl(
  req: Request,
  body: ScanBody,
  beforeCharge?: () => Promise<boolean>,
  chargeGuard?: (tx: unknown) => Promise<boolean>,
  rehydrateGraphId?: string
): Promise<ScanOutcome> {
  let repo;
  try {
    // Pinned to the SHA the charge is keyed on (#617): a branch that moved
    // since ls-remote cannot change what is scanned for this charge.
    repo = await cloneRepo(body.repoUrl, body.branch, body.commitSha ? { expectedSha: body.commitSha } : {});
  } catch (err) {
    if (err instanceof CloneRefusal) return cloneRefusalOutcome(err);
    throw err;
  }
  try {
    // The clone dir is ours (made just now under absorb's clone root), so the
    // caller-path root check does not apply. The URL is the cache identity.
    return await scanAndCharge(req, body, repo.dir, `${body.repoUrl}#${body.branch ?? ''}${body.commitSha ? `@${body.commitSha}` : ''}`, beforeCharge, chargeGuard, rehydrateGraphId);
  } finally {
    await repo.cleanup();
  }
}

async function scanPath(req: Request, body: ScanBody): Promise<ScanOutcome> {
  const scanRoot = body.path as string;
  // The scan root must sit inside the folders this server may scan; before
  // 2026-10-04 any authenticated caller could map any server directory here.
  const { absorbRootRefusal } = await loadEngine();
  const rootRefusal = absorbRootRefusal(scanRoot);
  if (rootRefusal) {
    return { status: 403, json: { error: 'path_not_allowed', message: rootRefusal } };
  }
  return scanAndCharge(req, body, scanRoot, scanRoot);
}

/**
 * Overdraft cap (#617 N4). requireCredits only looks at the balance, and the
 * settle allows overdraft, so N parallel scans by one account could each pass
 * the check before any debit and leave the account N-1 prices short.
 *
 * At most ABSORB_MAX_PARALLEL_SCANS_PER_ACCOUNT charged scans per account run
 * at once on this instance; the next one waits for a slot, and its balance
 * check then runs after the earlier debits have landed. requireCredits refuses
 * (402) any balance that cannot cover the price, which includes one that is
 * already negative. So the most one account can owe is
 * (cap - 1) x one scan price per absorb instance. With the default 1 the scans
 * are serialized and the overdraft from parallel scans is zero per instance.
 * A rehydrate (#617 H1, no charge) takes no slot.
 *
 * PENDING TREASURER: the number is Treasurer's to set. Default 1 (serialized).
 */
export const ABSORB_MAX_PARALLEL_SCANS_PER_ACCOUNT = 1; // pending Treasurer
let parallelScanCap = ABSORB_MAX_PARALLEL_SCANS_PER_ACCOUNT;
/** Test seam: run with another cap. */
export function __setParallelScanCapForTests(n: number): void {
  parallelScanCap = n;
}

const scanSlots = new Map<string, { running: number; waiting: Array<() => void> }>();

async function takeScanSlot(uid: string): Promise<() => void> {
  let s = scanSlots.get(uid);
  if (!s) scanSlots.set(uid, (s = { running: 0, waiting: [] }));
  const slots = s;
  if (slots.running >= Math.max(1, parallelScanCap)) {
    await new Promise<void>((resolve) => slots.waiting.push(resolve));
  } else {
    slots.running += 1;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const next = slots.waiting.shift();
    if (next) next(); // the slot passes straight to the next waiter
    else {
      slots.running -= 1;
      if (slots.running === 0) scanSlots.delete(uid);
    }
  };
}

async function scanAndCharge(
  req: Request,
  body: ScanBody,
  rootDir: string,
  cacheKey: string,
  beforeCharge?: () => Promise<boolean>,
  chargeGuard?: (tx: unknown) => Promise<boolean>,
  rehydrateGraphId?: string
): Promise<ScanOutcome> {
  const uid = userUuid(req);
  if (!uid || rehydrateGraphId) {
    return scanAndChargeNow(req, body, rootDir, cacheKey, beforeCharge, chargeGuard, rehydrateGraphId);
  }
  const release = await takeScanSlot(uid);
  try {
    return await scanAndChargeNow(req, body, rootDir, cacheKey, beforeCharge, chargeGuard);
  } finally {
    release();
  }
}

async function scanAndChargeNow(
  req: Request,
  body: ScanBody,
  rootDir: string,
  cacheKey: string,
  beforeCharge?: () => Promise<boolean>,
  chargeGuard?: (tx: unknown) => Promise<boolean>,
  rehydrateGraphId?: string
): Promise<ScanOutcome> {
  const shallow = body.shallow;
  const rehydrate = typeof rehydrateGraphId === 'string';
  // NO FREE PATHS (#617 N2, CoS/Treasurer): every scan, folder or URL, with
  // or without a projectId, is charged to the signed-in account. No account
  // (unauthenticated, or an id that is not a user uuid) is refused before
  // the scan starts. There is no fallback to a server or project key.
  const scanUserId = userUuid(req);
  if (!(req as AuthenticatedRequest).authenticated || !scanUserId) {
    return {
      status: 401,
      json: { error: 'account_required', message: 'A scan is charged to a signed-in account. Sign in and retry.' },
    };
  }
  // A saved scan is reused only for the account that paid for it.
  // The id is the same one the charge uses (a user uuid). Matching on
  // the folder alone handed that scan to anyone, free, for 5 minutes,
  // including someone who had just been refused.
  //
  // Someone with no account id is not charged, and their scan is not
  // saved for reuse. A paid scan is never given to them.
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const now = new Date();
  const callerId = userUuid(req);
  if (callerId && !rehydrate) {
    for (const [id, entry] of graphStore.entries()) {
      if (entry.ownerId === callerId && entry.path === cacheKey && entry.shallow === shallow) {
        if (now.getTime() - entry.createdAt.getTime() < CACHE_TTL_MS) {
          return {
            status: 200,
            json: {
              graphId: id,
              stats: entry.stats,
              fileCount: entry.fileCount,
              cost: 0, // Already paid by this caller. Not charged again.
              costCents: 0,
              cached: true,
              topology: entry.topology,
            },
          };
        }
      }
    }
  }

  // Reserve before the scan: a balance that cannot cover the price is refused
  // (402) before any work runs. The settle after the scan always lands
  // (allowOverdraft): a scan that was allowed to start finishes, and if the
  // balance dropped meanwhile (a concurrent scan) the account is left owing.
  const creditsModule = await loadCredits();
  const { requireCredits, isCreditError, deductCredits, CHARGE_GUARD_REFUSED } =
    (creditsModule as any).default || creditsModule;
  const opType = shallow ? 'absorb_shallow' : 'absorb_deep';
  // A rehydrate (#617 H1) re-runs an import that was already paid: no check, no debit.
  let creditCheck: any = null;
  if (!rehydrate) {
    creditCheck = await requireCredits(scanUserId, opType);
    if (isCreditError(creditCheck)) {
      return { status: 402, json: creditCheck as Record<string, unknown> };
    }
  }

  // Lazy import to avoid loading heavy modules at startup
  const engineModule = await loadEngine();
  const { CodebaseScanner, CodebaseGraph } = (engineModule as any).default || engineModule;

  // @ts-ignore - Automatic remediation for TS18046
  const scanner = new CodebaseScanner();
  const scanResult = await scanner.scan({
    rootDir,
    languages: body.languages as any,
    shallow,
  });

  // @ts-ignore - Automatic remediation for TS18046
  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);

  const graphId = rehydrateGraphId ?? uuidv4();

  // Build in-degree map for topological intelligence
  const inDegree: Record<string, number> = {};
  const filesList = scanResult.files || [];
  for (const file of filesList) {
    if (!(file.path in inDegree)) inDegree[file.path] = 0;
    for (const imp of file.imports || []) {
      if (imp.resolvedPath) {
        inDegree[imp.resolvedPath] = (inDegree[imp.resolvedPath] ?? 0) + 1;
      }
    }
  }

  // Leaf-first order: sort files by in-degree ascending (safest to fix first)
  const leafFirstOrder = filesList
    .map((f: any) => f.path)
    .sort((a: string, b: string) => (inDegree[a] ?? 0) - (inDegree[b] ?? 0));

  // Deduct credits if authenticated.
  //
  // Two faults lived here until 2026-09-21. The userId fell back to the
  // literal 'anonymous', which entry-lookup.ts defines as the id every
  // UNAUTHENTICATED caller carries — so an authenticated caller with no id
  // spent from, and was billed against, the bucket that belongs to nobody.
  // And the charge is gated on body.projectId while the response below
  // reported `cost: 10` or `cost: 50` unconditionally, so a scan with no
  // projectId told the client it had been billed when nothing was taken.
  let chargedCents = 0;
  // Set only after the charge lands, so a refused scan is not saved
  // for a free replay, and an unpaid scan is not saved under an account.
  let cacheOwnerId: string | null = null;
  // userUuid(), not a truthiness test. middleware/auth.ts sets
  // userId = `orchestrator:${key}` for an orchestrator caller: authenticated,
  // truthy, and not a uuid. It would flow into requireCredits -> checkBalance
  // -> getOrCreateAccount, which queries a uuid column and throws, 500-ing an
  // orchestrator scan. This guard is new in this change and chose the weaker
  // predicate when the right one was already imported.
  // Built BEFORE the charge (Mapping H1), so nothing that can throw runs
  // between the debit and the delivered result.
  const topology = {
    leafFirstOrder,
    inDegree,
    communities: (graph as any).communities ?? {},
    graphJson: typeof graph.serialize === 'function' ? graph.serialize() : '{}',
    durationMs: scanResult.stats.durationMs ?? 0,
  };

  let balanceAfterCents: number | null = null;
  if (rehydrate) {
    // Already charged once for this import (its claim is done); not again.
    cacheOwnerId = scanUserId;
  } else {
    const userId = scanUserId;

    // requireCredits only looks. Two scans can both be told the balance
    // covers them before either charge lands. deductCredits is the charge:
    // it returns empty when the balance is no longer enough, and it does
    // not take the money in that case. Handing over the scan anyway, and
    // reporting cost, would bill the customer for a charge that never
    // happened.
    //
    // The scan above has already run. The charge comes after it. The
    // ledger can add credits back only by recording a purchase, which
    // would say the customer bought money they did not buy. A scan that
    // fails therefore costs nothing, and a charge that comes back empty
    // is not delivered. A refused scan has still used the machine.
    // A URL import charges only while it still holds its claim (#617).
    if (beforeCharge && !(await beforeCharge())) {
      return {
        status: 409,
        json: {
          error: 'import_claim_lost',
          message: 'Another request took over this import. This one was not charged.',
        },
      };
    }
    const claimLost: ScanOutcome = {
      status: 409,
      json: {
        error: 'import_claim_lost',
        message: 'Another request took over this import. This one was not charged.',
      },
    };
    let debit;
    try {
      debit = await deductCredits(
        userId,
        creditCheck.costCents,
        `Codebase scan: ${cacheKey}`,
        {
          graphId,
          shallow,
          importId: body.importId ?? null,
          ...(body.commitSha ? { commitSha: body.commitSha, clientImportId: body.clientImportId ?? null } : {}),
          ...(body.projectId ? { projectId: body.projectId } : {}),
        },
        chargeGuard ? { guard: chargeGuard, allowOverdraft: true } : { allowOverdraft: true }
      );
    } catch (err) {
      // The guard ran in the debit's transaction and found the claim gone:
      // rolled back, nothing charged.
      const code = (err as { code?: unknown } | null)?.code;
      if (code === (CHARGE_GUARD_REFUSED ?? 'charge_guard_refused')) return claimLost;
      throw err;
    }
    if (!debit) {
      return { status: 402, json: { error: 'Not enough credits for this scan.' } };
    }
    chargedCents = creditCheck.costCents;
    cacheOwnerId = userId;
    balanceAfterCents = typeof debit.balanceCents === 'number' ? debit.balanceCents : null;
  }

  graphStore.set(graphId, {
    graph,
    stats: scanResult.stats,
    createdAt: new Date(),
    path: cacheKey,
    shallow,
    ownerId: cacheOwnerId,
    topology,
    fileCount: scanResult.files?.length ?? 0,
    userId: userUuid(req),
  });

  return {
    status: 200,
    json: {
    graphId,
    stats: scanResult.stats,
    fileCount: scanResult.files?.length ?? 0,
    // `cost` is in CENTS (credits at $0.01 each, as #569). costCents says so.
    cost: chargedCents,
    costCents: chargedCents,
    cached: false,
    topology,
    // The scan was allowed to start and finished; the settle left the account
    // short (a concurrent spend). The amount is owed, never forgiven.
    ...(balanceAfterCents !== null && balanceAfterCents < 0 ? { balanceOwedCents: -balanceAfterCents } : {}),
    },
  };

}

// POST /query — GraphRAG query
router.post('/query', async (req: Request, res: Response) => {
  try {
    const body = QueryRequestSchema.parse(req.body);
    const entry = graphStore.get(body.graphId);
    const callerId = userUuid(req);

    // Same status and body as a missing graphId. A different answer would show
    // that this id exists. An ownerless row and a caller with no account miss too.
    if (!entry || !callerId || entry.userId !== callerId) {
      res.status(404).json({ error: 'Graph not found', graphId: body.graphId });
      return;
    }

    const creditsModule = await import('@holoscript/absorb-service/credits');
    const { requireCredits, isCreditError, deductCredits } = (creditsModule as any).default || creditsModule;
    const userId = userUuid(req);
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    // @ts-ignore - Automatic remediation for TS18046
    const creditCheck = await requireCredits(userId, 'query_with_llm');
    
    // @ts-ignore - Automatic remediation for TS18046
    if (isCreditError(creditCheck)) {
      res.status(402).json(creditCheck);
      return;
    }

    // This endpoint could never have answered once. EmbeddingIndex has required
    // an explicit provider since it gained one, and `new EmbeddingIndex()`
    // throws "EmbeddingIndex requires an explicit provider" on every call — so
    // /query has been returning 500 to everybody. requireCredits only CHECKS,
    // and the throw landed before deductCredits, so nobody was charged for the
    // failure; they simply never got an answer.
    //
    // The default provider is 'structural': zero-dependency, no API key, no
    // model download, and F.106 forbids the factory from ever auto-selecting a
    // paid one. That is why query_with_llm is now priced at 0 — there is no LLM
    // on this path and never was, whatever the operation's name says.
    // Imported without a cast and without a suppression, so the compiler checks
    // these two calls. It could not before: the cast erased the module's types
    // and the suppression hid what was left, which is how both of this
    // handler's runtime throws passed a clean type check.
    const { EmbeddingIndex, createEmbeddingProvider } = await import(
      '@holoscript/absorb-service/engine'
    );
    const index = new EmbeddingIndex({ provider: await createEmbeddingProvider() });

    // Build index from graph symbols.
    //
    // The previous loop called index.add(id, text, symbol) — a three-argument
    // method this class has never had. So /query was dead at two separate
    // points, not one, and fixing only the constructor left it dead. Probed
    // directly rather than reasoned about: the old constructor call throws
    // "requires an explicit provider", and with that fixed the next line throws
    // "index.add is not a function".
    //
    // addSymbols is the real API, and it is the better one: it derives each
    // symbol's text itself from the symbol plus graph context, which is what
    // the graph-text-terms feature exists to do. Hand-concatenating name and
    // documentation threw that away.
    const symbols = entry.graph.getAllSymbols?.() ?? [];
    await index.addSymbols(symbols, entry.graph);

    const results = await index.search(body.query, body.maxResults);

    // Same rule as /scan, including while this query is priced at 0.
    // A charge that comes back empty did not happen, so the answer is
    // not delivered and no cost is reported.
    const debit = await deductCredits(
      userId,
      creditCheck.costCents,
      `Semantic codebase query: ${body.query.substring(0, 32)}...`,
      { graphId: body.graphId }
    );
    if (!debit) {
      res.status(402).json({ error: 'Not enough credits for this query.' });
      return;
    }

    res.json({
      query: body.query,
      results: results.map((r: any) => ({
        symbol: r.metadata?.name,
        type: r.metadata?.type,
        file: r.metadata?.filePath,
        score: r.score,
        documentation: r.metadata?.documentation,
      })),
      graphId: body.graphId,
      cost: creditCheck.costCents,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    console.error('[absorb/query] Error:', error.message);
    res.status(500).json({ error: 'Query failed', message: error.message });
  }
});

// GET /projects — List projects
router.get('/projects', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('@holoscript/absorb-service/schema');
    const { eq, desc } = await import('drizzle-orm');
    // user_id is a uuid column — a service/API-key caller (no user uuid) has no
    // user-scoped projects. Returning [] avoids the 'anonymous'→uuid 500.
    const userId = userUuid(req);
    if (!userId) {
      res.json({ projects: [] });
      return;
    }

    const projects = await db
      .select()
      // @ts-ignore - Automatic remediation for TS2345
      .from(absorbProjects)
      // @ts-ignore - Automatic remediation for TS18046
      .where(eq(absorbProjects.userId, userId))
      // @ts-ignore - Automatic remediation for TS18046
      .orderBy(desc(absorbProjects.createdAt))
      .limit(50);

    res.json({ projects });
  } catch (error: any) {
    console.error('[absorb/projects] Error:', error.message);
    res.status(500).json({ error: 'Failed to list projects', message: error.message });
  }
});

// POST /projects — Create project
router.post('/projects', async (req: Request, res: Response) => {
  try {
    const body = CreateProjectSchema.parse(req.body);
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('@holoscript/absorb-service/schema');
    // A fourth 'anonymous' fallback, on a uuid column, in a file this change
    // already fixed twice. Found by reading for the pattern rather than for the
    // sites the review happened to name.
    const userId = userUuid(req);
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await db
      // @ts-ignore - Automatic remediation for TS2345
      .insert(absorbProjects)
      .values({
        id: uuidv4(),
        userId,
        name: body.name,
        sourceType: body.sourceType,
        sourceUrl: body.sourceUrl ?? null,
        localPath: body.localPath ?? null,
        status: 'pending',
        metadata: body.metadata ?? {},
      })
      .returning();
    const project = Array.isArray(result) ? result[0] : result;

    res.status(201).json({ project });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.issues });
      return;
    }
    console.error('[absorb/projects] Error:', error.message);
    res.status(500).json({ error: 'Failed to create project', message: error.message });
  }
});

// GET /projects/:id — Get project detail
router.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('@holoscript/absorb-service/schema');
    const { and, eq } = await import('drizzle-orm');
    const userId = userUuid(req);
    if (!userId) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const [project] = await db
      .select()
      // @ts-ignore - Automatic remediation for TS2345
      .from(absorbProjects)
      // @ts-ignore - Automatic remediation for TS18046
      .where(and(eq(absorbProjects.id, req.params.id), eq(absorbProjects.userId, userId)))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ project });
  } catch (error: any) {
    console.error('[absorb/projects/:id] Error:', error.message);
    res.status(500).json({ error: 'Failed to get project', message: error.message });
  }
});

// DELETE /projects/:id — Delete project
router.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) {
      res.status(503).json({ error: 'Database not configured' });
      return;
    }

    const { absorbProjects } = await import('@holoscript/absorb-service/schema');
    const { and, eq } = await import('drizzle-orm');
    const userId = userUuid(req);
    if (!userId) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const deleteResult = await db
      // @ts-ignore - Automatic remediation for TS2345
      .delete(absorbProjects)
      // @ts-ignore - Automatic remediation for TS18046
      .where(and(eq(absorbProjects.id, req.params.id), eq(absorbProjects.userId, userId)))
      .returning();

    if (!Array.isArray(deleteResult) || deleteResult.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json({ deleted: true, id: req.params.id });
  } catch (error: any) {
    console.error('[absorb/projects/:id] Error:', error.message);
    res.status(500).json({ error: 'Failed to delete project', message: error.message });
  }
});

// GET /graphs — List active graphs in memory
router.get('/graphs', (req: Request, res: Response) => {
  const callerId = userUuid(req);
  const graphs = callerId
    ? Array.from(graphStore.entries())
        .filter(([, entry]) => entry.userId === callerId)
        .map(([id, entry]) => ({
          graphId: id,
          stats: entry.stats,
          createdAt: entry.createdAt,
        }))
    : [];
  res.json({ graphs });
});

export { router as absorbRouter };
