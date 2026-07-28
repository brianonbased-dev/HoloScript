#!/usr/bin/env node
/**
 * semantic.mjs — TRUE meaning-based code search (sovereign, laptop-operated).
 *
 * A separate lane from holoembed (which is lexical/trigram): nomic-embed-text (a LEARNED
 * encoder) runs laptop-local via ollama, and vectors persist in the sovereign Jetson pgvector
 * `knowledge` DB (code_symbols). The holoembed GraphRAG policy is untouched — this lane never
 * goes through the guarded factory; it uses nomic directly and stores in its own space.
 *
 *   node scripts/semantic.mjs index [limit]        # embed graph-cache symbols -> pgvector
 *   node scripts/semantic.mjs ask "<query>" [topK] # nomic-embed query -> pgvector cosine
 *
 * Operate on laptop (nomic embed) + hold sovereign (Jetson pgvector, reached via SSH tunnel
 * because pgvector is 127.0.0.1-bound on the Jetson — the guest never gets a LAN-exposed DB).
 */
import fs from 'node:fs';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import pg from 'pg';

const OLLAMA = 'http://localhost:11434/api/embeddings';
const MODEL = 'nomic-embed-text';
const HOME = os.homedir().split('\\').join('/');
const KEY = `${HOME}/.ssh/jetson_ed25519`;
const HOST = 'username@192.168.0.119';
const LOCAL_PORT = 15434;
const REPO = 'C:/Users/Josep/Documents/GitHub/HoloScript';

// ── nomic embedding (laptop-local ollama), bounded concurrency ────────────────────────────────
async function embed(text) {
  const r = await fetch(OLLAMA, {
    method: 'POST',
    body: JSON.stringify({ model: MODEL, prompt: text }),
  });
  const j = await r.json();
  if (!j.embedding) throw new Error('no embedding: ' + JSON.stringify(j).slice(0, 100));
  return j.embedding;
}
async function embedMany(texts, conc = 8) {
  const out = new Array(texts.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (i < texts.length) {
        const k = i++;
        out[k] = await embed(texts[k]);
      }
    })
  );
  return out;
}
const vecLiteral = (v) => `[${v.join(',')}]`;

// ── Jetson pgvector via SSH tunnel ─────────────────────────────────────────────────────────────
function jetsonSecret() {
  // fetch app-DB password from the canonical root-only secret file — base64 to avoid quote
  // mangling, captured to a var, never printed. (The pgvector container has no POSTGRES_PASSWORD
  // env — it's init-only and was omitted on the image swap; the role password lives in the secret.)
  const remote =
    "sudo cat /mnt/nvme2/holo-volumes/secrets/pg-app.env 2>/dev/null | grep -E '^POSTGRES_PASSWORD=' | head -1 | cut -d= -f2-";
  const b64 = Buffer.from(remote, 'utf8').toString('base64');
  const pw = execSync(
    `ssh -i ${KEY} -o ConnectTimeout=20 ${HOST} "echo ${b64} | base64 -d | bash"`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
  ).trim();
  if (!pw) throw new Error('could not read app-DB password from Jetson secret');
  return pw;
}
async function openTunnel() {
  const child = spawn(
    'ssh',
    ['-i', KEY, '-N', '-L', `${LOCAL_PORT}:127.0.0.1:5434`, '-o', 'ExitOnForwardFailure=yes', HOST],
    { stdio: 'ignore' }
  );
  // wait for the forwarded port to accept connections
  const net = await import('node:net');
  for (let t = 0; t < 40; t++) {
    const ok = await new Promise((res) => {
      const s = net.connect(LOCAL_PORT, '127.0.0.1');
      s.on('connect', () => {
        s.destroy();
        res(true);
      });
      s.on('error', () => res(false));
    });
    if (ok) return child;
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error('SSH tunnel to Jetson pgvector did not come up');
}
async function withPg(fn) {
  const pw = jetsonSecret();
  const tunnel = await openTunnel();
  const pool = new pg.Pool({
    host: '127.0.0.1',
    port: LOCAL_PORT,
    user: 'holoscript_app',
    database: 'knowledge',
    password: pw,
    max: 4,
  });
  try {
    return await fn(pool);
  } finally {
    await pool.end().catch(() => {});
    tunnel.kill();
  }
}

// ── symbols from the graph-cache ───────────────────────────────────────────────────────────────
function loadSymbols(limit) {
  const g = JSON.parse(fs.readFileSync(os.homedir() + '/.holoscript/graph-cache.json', 'utf8'));
  const gj = typeof g.graphJson === 'string' ? JSON.parse(g.graphJson) : g.graphJson;
  const rootDir = g.rootDir || gj.rootDir || REPO;
  const gitCommit = g.gitCommitHash || gj.gitCommitHash || 'unknown';
  const syms = [];
  for (const f of gj.files) {
    const rel = f.path
      .split('\\')
      .join('/')
      .replace(rootDir.split('\\').join('/') + '/', '');
    if (!f.symbols || !f.symbols.length) continue;
    // Read the file once to enrich each symbol's embed-text with its DECLARATION LINE — nomic
    // ranks far better on real code than on names alone. Degrade gracefully if unreadable.
    let srcLines = null;
    try {
      srcLines = fs.readFileSync(f.path, 'utf8').split('\n');
    } catch {
      /* ignore */
    }
    for (const s of f.symbols) {
      if (!s.name) continue;
      const decl = srcLines && s.line ? (srcLines[s.line - 1] || '').trim().slice(0, 200) : '';
      // embed text: kind + name + actual declaration + location (nomic reads meaning from this)
      const text = decl
        ? `${s.type || 'symbol'} ${s.name}: ${decl} (${rel})`
        : `${s.type || 'symbol'} ${s.name} — ${rel}`;
      syms.push({
        file: f.path.split('\\').join('/'),
        rel,
        name: s.name,
        type: s.type || null,
        language: s.language || null,
        line: s.line ?? null,
        text,
      });
    }
  }
  return { rootDir, gitCommit, syms: limit ? syms.slice(0, limit) : syms };
}

// ── commands ────────────────────────────────────────────────────────────────────────────────────
async function index(limit) {
  const { rootDir, gitCommit, syms } = loadSymbols(limit);
  console.log(`[semantic] indexing ${syms.length} symbols (nomic, laptop) -> Jetson pgvector`);
  await withPg(async (pool) => {
    const BATCH = 200;
    let done = 0;
    for (let off = 0; off < syms.length; off += BATCH) {
      const chunk = syms.slice(off, off + BATCH);
      const vecs = await embedMany(
        chunk.map((s) => s.text),
        8
      );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let k = 0; k < chunk.length; k++) {
          const s = chunk[k];
          await client.query(
            `INSERT INTO code_symbols (repo, root_dir, git_commit, file_path, symbol, symbol_type, language, line, text, embedding)
             VALUES ('HoloScript',$1,$2,$3,$4,$5,$6,$7,$8,$9::vector)
             ON CONFLICT (repo, root_dir, symbol, file_path, line)
             DO UPDATE SET embedding=EXCLUDED.embedding, git_commit=EXCLUDED.git_commit, symbol_type=EXCLUDED.symbol_type, updated_at=now()`,
            [
              rootDir,
              gitCommit,
              s.rel,
              s.name,
              s.type,
              s.language,
              s.line,
              s.text,
              vecLiteral(vecs[k]),
            ]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
      done += chunk.length;
      process.stdout.write(`\r[semantic] ${done}/${syms.length}`);
    }
    console.log('');
    const { rows } = await pool.query(`SELECT count(*) FROM code_symbols WHERE repo='HoloScript'`);
    console.log(`[semantic] pgvector code_symbols (HoloScript): ${rows[0].count} rows`);
  });
}

async function ask(query, topK = 8) {
  const qv = vecLiteral(await embed(query));
  await withPg(async (pool) => {
    const { rows } = await pool.query(
      `SELECT file_path, symbol, symbol_type, line, 1-(embedding <=> $1::vector) AS score
       FROM code_symbols WHERE repo='HoloScript'
       ORDER BY embedding <=> $1::vector LIMIT $2`,
      [qv, topK]
    );
    console.log(`[semantic] "${query}"  (${rows.length} hits, nomic meaning-ranked)`);
    for (const r of rows)
      console.log(
        `  ${Number(r.score).toFixed(3)}  ${r.file_path}:${r.line ?? ''}  ${r.symbol} [${r.symbol_type || ''}]`
      );
  });
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'index') await index(a ? Number(a) : undefined);
else if (cmd === 'ask') await ask(a, b ? Number(b) : 8);
else {
  console.error('usage: semantic.mjs <index [limit] | ask "<query>" [topK]>');
  process.exit(1);
}
