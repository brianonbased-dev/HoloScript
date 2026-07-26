import type { ExternalSymbolDefinition } from './types';

export type HybridMatchKind = 'exact-name' | 'lexical' | 'semantic';

export interface LexicalMatchScore {
  score: number;
  exactMatch: boolean;
  matchKind: HybridMatchKind;
}

export interface LexicalQuery {
  tokens: string[];
  tokenSet: Set<string>;
}

export interface LexicalDocument {
  nameTokens: string[];
  nameTokenSet: Set<string>;
  fileStemTokens: string[];
  pathTokenSet: Set<string>;
  textTokenSet: Set<string>;
}

export interface HybridLexicalEntry {
  symbol: ExternalSymbolDefinition;
  text?: string;
}

/**
 * Compact inverted lexical index.
 *
 * Query-time tokenization must not walk every symbol: production graphs can
 * contain hundreds of thousands of entries. Postings keep lookup proportional
 * to the query terms and matching candidates while the vector side remains the
 * only full-index pass.
 */
export class HybridLexicalIndex {
  private readonly namePostings = new Map<string, number[]>();
  private readonly stemPostings = new Map<string, number[]>();
  private readonly pathPostings = new Map<string, number[]>();
  private readonly exactPhrases = new Map<string, number[]>();
  private readonly nameTokenCounts: Uint16Array;
  private readonly stemTokenCounts: Uint16Array;

  constructor(entries: HybridLexicalEntry[]) {
    this.nameTokenCounts = new Uint16Array(entries.length);
    this.stemTokenCounts = new Uint16Array(entries.length);

    for (let index = 0; index < entries.length; index++) {
      const symbol = entries[index].symbol;
      const nameTokens = uniqueTokens(
        tokenize(symbol.owner ? `${symbol.owner} ${symbol.name}` : symbol.name)
      );
      const stemTokens = uniqueTokens(tokenize(fileStem(symbol.filePath)));
      const pathTokens = uniqueTokens(tokenize(symbol.filePath));

      this.nameTokenCounts[index] = Math.min(nameTokens.length, 0xffff);
      this.stemTokenCounts[index] = Math.min(stemTokens.length, 0xffff);
      addPostings(this.namePostings, nameTokens, index);
      addPostings(this.stemPostings, stemTokens, index);
      addPostings(this.pathPostings, pathTokens, index);
      addPhrase(this.exactPhrases, nameTokens, index);
      addPhrase(this.exactPhrases, stemTokens, index);
    }
  }

  score(queryText: string): Map<number, LexicalMatchScore> {
    const query = createLexicalQuery(queryText);
    if (query.tokens.length === 0) return new Map();

    const uniqueQueryTokens = Array.from(query.tokenSet);
    const nameMatches = collectMatches(uniqueQueryTokens, this.namePostings);
    const stemMatches = collectMatches(uniqueQueryTokens, this.stemPostings);
    const pathMatches = collectMatches(uniqueQueryTokens, this.pathPostings);
    const exactMatches = this.collectExactMatches(query.tokens);
    const candidates = new Set<number>([
      ...nameMatches.keys(),
      ...stemMatches.keys(),
      ...pathMatches.keys(),
      ...exactMatches.keys(),
    ]);
    const scores = new Map<number, LexicalMatchScore>();

    for (const index of candidates) {
      const nameMatched = nameMatches.get(index) ?? 0;
      const stemMatched = stemMatches.get(index) ?? 0;
      const pathMatched = pathMatches.get(index) ?? 0;
      const exactEvidence = exactMatches.get(index);
      const exactMatch = Boolean(exactEvidence);
      const nameCount = this.nameTokenCounts[index] || 1;
      const stemCount = this.stemTokenCounts[index] || 1;
      const queryCount = uniqueQueryTokens.length;
      const exactIntent = exactEvidence
        ? 1 - (exactEvidence.start / Math.max(1, query.tokens.length - 1)) * 0.5
        : 0;
      const nameScore =
        0.65 * (nameMatched / nameCount) +
        0.25 * (nameMatched / queryCount) +
        0.1 * exactIntent;
      const fileScore =
        0.65 * (stemMatched / stemCount) +
        0.25 * (pathMatched / queryCount) +
        0.1 * exactIntent;
      const score = roundScore(Math.min(1, Math.max(nameScore, fileScore)));
      scores.set(index, {
        score,
        exactMatch,
        matchKind: exactMatch ? 'exact-name' : score > 0 ? 'lexical' : 'semantic',
      });
    }

    return scores;
  }

  private collectExactMatches(
    queryTokens: string[]
  ): Map<number, { start: number; length: number }> {
    const matches = new Map<number, { start: number; length: number }>();
    const minimumLength = queryTokens.length === 1 ? 1 : 2;
    for (let start = 0; start < queryTokens.length; start++) {
      for (let end = start + minimumLength; end <= queryTokens.length; end++) {
        const postings = this.exactPhrases.get(queryTokens.slice(start, end).join(' '));
        if (!postings) continue;
        const evidence = { start, length: end - start };
        for (const index of postings) {
          const previous = matches.get(index);
          if (
            !previous ||
            evidence.start < previous.start ||
            (evidence.start === previous.start && evidence.length > previous.length)
          ) {
            matches.set(index, evidence);
          }
        }
      }
    }
    return matches;
  }
}

const QUERY_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'uses',
  'using',
  'with',
]);

/**
 * Score the lexical side of HoloAbsorb hybrid retrieval.
 *
 * File stems and symbol names are deliberately stronger than body text. This
 * lets an agent asking for `safe-commit` retrieve a parser-light
 * `scripts/safe-commit.ps1` file node without turning every prose overlap into
 * an exact match.
 */
export function scoreLexicalMatch(
  query: string,
  symbol: ExternalSymbolDefinition,
  indexedText = ''
): LexicalMatchScore {
  return scoreLexicalDocument(
    createLexicalQuery(query),
    createLexicalDocument(symbol, indexedText)
  );
}

export function createLexicalQuery(query: string): LexicalQuery {
  const tokens = tokenize(query, true);
  return { tokens, tokenSet: new Set(tokens) };
}

export function createLexicalDocument(
  symbol: ExternalSymbolDefinition,
  indexedText = ''
): LexicalDocument {
  const nameTokens = tokenize(symbol.owner ? `${symbol.owner} ${symbol.name}` : symbol.name);
  const fileStemTokens = tokenize(fileStem(symbol.filePath));
  return {
    nameTokens,
    nameTokenSet: new Set(nameTokens),
    fileStemTokens,
    pathTokenSet: new Set(tokenize(symbol.filePath)),
    textTokenSet: new Set(tokenize(indexedText)),
  };
}

export function scoreLexicalDocument(
  query: LexicalQuery,
  document: LexicalDocument
): LexicalMatchScore {
  const queryTokens = query.tokens;
  if (queryTokens.length === 0) {
    return { score: 0, exactMatch: false, matchKind: 'semantic' };
  }

  const nameCoverage = candidateCoverage(document.nameTokens, query.tokenSet);
  const fileCoverage = candidateCoverage(document.fileStemTokens, query.tokenSet);
  const nameQueryCoverage = queryCoverage(queryTokens, document.nameTokenSet);
  const pathQueryCoverage = queryCoverage(queryTokens, document.pathTokenSet);
  const textQueryCoverage = queryCoverage(queryTokens, document.textTokenSet);

  const exactName = isExactCandidate(queryTokens, document.nameTokens);
  const exactFile = isExactCandidate(queryTokens, document.fileStemTokens);
  const exactMatch = exactName || exactFile;

  const nameScore =
    0.65 * nameCoverage +
    0.25 * nameQueryCoverage +
    0.1 * (containsSequence(queryTokens, document.nameTokens) ? 1 : 0);
  const fileScore =
    0.65 * fileCoverage +
    0.25 * pathQueryCoverage +
    0.1 * (containsSequence(queryTokens, document.fileStemTokens) ? 1 : 0);
  const contextScore = 0.55 * textQueryCoverage;
  const score = roundScore(Math.max(nameScore, fileScore, contextScore));

  return {
    score,
    exactMatch,
    matchKind: exactMatch ? 'exact-name' : score > 0 ? 'lexical' : 'semantic',
  };
}

/**
 * Probabilistic-OR-style fusion: lexical evidence can lift a vector result but
 * never lowers a good semantic match. Exact symbol/file names receive a stable
 * floor so downstream graph centrality cannot bury the user's named target.
 */
export function fuseHybridScore(
  vectorScore: number,
  lexicalScore: number,
  exactMatch: boolean
): number {
  const boundedVector = clamp(vectorScore, 0, 1);
  const boundedLexical = clamp(lexicalScore, 0, 1);
  let fused =
    boundedLexical > 0
      ? boundedVector + (1 - boundedVector) * 0.45 * boundedLexical
      : vectorScore;

  if (exactMatch) {
    fused = Math.max(fused, 0.99 + 0.01 * boundedLexical);
  }

  return roundScore(clamp(fused, -1, 1));
}

function tokenize(value: string, removeStopWords = false): string[] {
  const normalized = value
    .normalize('NFKD')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!normalized) return [];

  const tokens = normalized.split(/\s+/).filter((token) => token.length > 1);
  return removeStopWords ? tokens.filter((token) => !QUERY_STOP_WORDS.has(token)) : tokens;
}

function uniqueTokens(tokens: string[]): string[] {
  return Array.from(new Set(tokens));
}

function addPostings(target: Map<string, number[]>, tokens: string[], index: number): void {
  for (const token of tokens) {
    const postings = target.get(token);
    if (postings) postings.push(index);
    else target.set(token, [index]);
  }
}

function addPhrase(target: Map<string, number[]>, tokens: string[], index: number): void {
  if (tokens.length === 0) return;
  const phrase = tokens.join(' ');
  const postings = target.get(phrase);
  if (postings) postings.push(index);
  else target.set(phrase, [index]);
}

function collectMatches(
  queryTokens: string[],
  postingsByToken: Map<string, number[]>
): Map<number, number> {
  const matches = new Map<number, number>();
  for (const token of queryTokens) {
    const postings = postingsByToken.get(token);
    if (!postings) continue;
    for (const index of postings) {
      matches.set(index, (matches.get(index) ?? 0) + 1);
    }
  }
  return matches;
}

function fileStem(filePath: string): string {
  const basename = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath;
  return basename.replace(/\.[^.]+$/, '');
}

function candidateCoverage(candidateTokens: string[], queryTokens: Set<string>): number {
  if (candidateTokens.length === 0) return 0;
  const matched = candidateTokens.filter((token) => queryTokens.has(token)).length;
  return matched / candidateTokens.length;
}

function queryCoverage(queryTokens: string[], candidateTokens: Set<string>): number {
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((token) => candidateTokens.has(token)).length;
  return matched / queryTokens.length;
}

function isExactCandidate(queryTokens: string[], candidateTokens: string[]): boolean {
  if (candidateTokens.length === 0 || !containsSequence(queryTokens, candidateTokens)) {
    return false;
  }

  return candidateTokens.length > 1 || queryTokens.length === 1;
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let start = 0; start <= haystack.length - needle.length; start++) {
    for (let offset = 0; offset < needle.length; offset++) {
      if (haystack[start + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}

function roundScore(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
