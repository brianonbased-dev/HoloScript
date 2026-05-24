#!/usr/bin/env node
/**
 * ingest-arxiv.mjs — P3 corpus ingestion for the Conjecture Engine novelty check
 * (scope 2026-05-23_holoembed-semantic-encoder, P3).
 *
 * Fetches real paper abstracts from the public arXiv API across the engine's live math
 * domains and maps each to a ConjecturePriorArtEntry { id, title, source, statement }.
 * The result is a real prior-art corpus (10^3+ entries) that the SEMANTIC advisory layer
 * (assessSemanticNoveltyIndexed) compares against — closing the "12-entry corpus is theater"
 * gap (D.060). The lexical trigram guard is near-useless against abstracts (no near-verbatim
 * match); the semantic encoder is what makes a large corpus valuable.
 *
 * Sovereign: a plain HTTPS GET of public data, no API key. Respects arXiv's rate guidance
 * (>=3s between requests). Atom XML parsed with bounded string extraction (no XML dep).
 *
 *   node scripts/conjecture-corpus/ingest-arxiv.mjs --per-cat 180 --out scripts/conjecture-corpus/corpus.arxiv.json
 */
import { writeFileSync } from 'node:fs';

const ARXIV = 'https://export.arxiv.org/api/query';
// Default categories mirror the engine's live MATH claim domains:
//   geometry/topology (AG, GT, DG, MG), number theory (NT), combinatorics/enumerative (CO).
// Override with --categories to broaden into the hub's other branches (cs.*, physics, q-bio).
const DEFAULT_CATEGORIES = ['math.AG', 'math.NT', 'math.GT', 'math.CO', 'math.DG', 'math.MG'];
const PAGE = 100; // arXiv max per request is large, but 100 is polite and reliable.

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
}
const PER_CAT = parseInt(arg('--per-cat', '180'), 10);
const OUT = arg('--out', 'scripts/conjecture-corpus/corpus.arxiv.json');
const CATEGORIES = arg('--categories', '')
  ? arg('--categories', '').split(',').map((c) => c.trim()).filter(Boolean)
  : DEFAULT_CATEGORIES;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clean = (s) => s.replace(/\s+/g, ' ').trim();
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(clean(m[1])) : '';
}

/** Parse the Atom feed into entries. Returns [{ arxivId, title, summary, year, authors }]. */
function parseFeed(xml) {
  const out = [];
  const entries = xml.split('<entry>').slice(1);
  for (const raw of entries) {
    const block = raw.split('</entry>')[0];
    const idUrl = tag(block, 'id'); // e.g. http://arxiv.org/abs/2401.01234v1
    const arxivId = (idUrl.match(/abs\/([^v]+)(v\d+)?$/) || [])[1] || idUrl;
    const title = tag(block, 'title');
    const summary = tag(block, 'summary');
    const published = tag(block, 'published');
    const year = (published.match(/^(\d{4})/) || [])[1] || '';
    const authors = [...block.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => decodeEntities(clean(m[1])));
    if (arxivId && title && summary) out.push({ arxivId, title, summary, year, authors });
  }
  return out;
}

async function fetchCategory(cat, want) {
  const entries = [];
  for (let start = 0; entries.length < want; start += PAGE) {
    const url = `${ARXIV}?search_query=cat:${cat}&start=${start}&max_results=${PAGE}&sortBy=submittedDate&sortOrder=descending`;
    const res = await fetch(url, { headers: { 'User-Agent': 'HoloScript-ConjectureCorpus/1.0 (research)' } });
    if (!res.ok) { console.error(`[ingest] ${cat} start=${start} HTTP ${res.status}`); break; }
    const xml = await res.text();
    const parsed = parseFeed(xml);
    if (parsed.length === 0) break; // exhausted
    entries.push(...parsed);
    console.error(`[ingest] ${cat}: +${parsed.length} (total ${entries.length})`);
    await sleep(3100); // arXiv rate guidance: >= 3s between requests
  }
  return entries.slice(0, want);
}

const corpus = [];
const seen = new Set();
for (const cat of CATEGORIES) {
  const fetched = await fetchCategory(cat, PER_CAT);
  for (const e of fetched) {
    const id = `prior.arxiv.${e.arxivId}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const authorStr = e.authors.length ? `${e.authors.slice(0, 3).join(', ')}${e.authors.length > 3 ? ' et al.' : ''}` : 'unknown';
    corpus.push({
      id,
      title: e.title,
      source: `arXiv:${e.arxivId} (${authorStr}${e.year ? `, ${e.year}` : ''}) [${cat}]`,
      // The abstract is the comparable statement for the semantic novelty check.
      statement: e.summary,
    });
  }
}

const artifact = {
  schema: 'conjecture.prior-art-corpus.v1',
  generatedAt: new Date().toISOString(),
  provider: 'arxiv',
  categories: CATEGORIES,
  perCategory: PER_CAT,
  count: corpus.length,
  entries: corpus,
};
writeFileSync(OUT, JSON.stringify(artifact, null, 2), 'utf8');
console.error(`[ingest] wrote ${corpus.length} entries → ${OUT}`);
