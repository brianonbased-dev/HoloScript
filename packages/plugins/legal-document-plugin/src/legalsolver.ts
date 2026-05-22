/**
 * Legal document analytics solvers — legal-document-plugin
 *
 * Implements:
 *  - Flesch-Kincaid readability (grade level + reading ease)
 *  - Clause risk scorer (keyword-weighted penalty model)
 *  - Obligation extractor (SHALL/MUST/WILL pattern grammar)
 *  - Deadline calendar builder (ISO 8601 date normalization)
 *  - Contract similarity (token-set Jaccard on clause n-grams)
 *  - Penalty exposure estimator (expected liquidated damages)
 *
 * References:
 *  - Flesch R (1948) J.Applied Psychology 32:221-233
 *  - Kincaid JP et al. (1975) Research Branch Report 8-75, US Navy
 *  - ABA Model Rules of Professional Conduct — risk assessment
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReadabilityResult {
  /** Flesch Reading Ease score (0-100, higher = easier) */
  readingEase: number;
  /** Flesch-Kincaid Grade Level */
  gradeLevel: number;
  /** Interpretation */
  difficulty: 'very-easy' | 'easy' | 'fairly-easy' | 'standard' | 'fairly-difficult' | 'difficult' | 'very-difficult';
  /** Word count */
  wordCount: number;
  /** Sentence count */
  sentenceCount: number;
  /** Average syllables per word */
  avgSyllablesPerWord: number;
}

export interface ClauseRiskResult {
  /** Overall risk score 0-100 */
  riskScore: number;
  /** Risk category */
  riskCategory: 'low' | 'medium' | 'high' | 'critical';
  /** Flagged terms with their scores */
  flaggedTerms: Array<{ term: string; weight: number; occurrences: number }>;
  /** Recommended review areas */
  recommendations: string[];
}

export interface Obligation {
  /** Raw text of obligation clause */
  text: string;
  /** Obligor (party bound) — extracted or 'unspecified' */
  obligor: string;
  /** Obligation type */
  type: 'shall' | 'must' | 'will' | 'shall-not' | 'must-not';
  /** Clause index in contract */
  clauseIndex: number;
}

export interface ContractDeadline {
  /** Raw text mentioning deadline */
  text: string;
  /** Extracted date string (ISO 8601 if parseable) */
  dateString: string;
  /** Days from today (null if relative/unparseable) */
  daysFromToday: number | null;
  /** Type of deadline */
  deadlineType: 'absolute' | 'relative' | 'event-based';
}

export interface SimilarityResult {
  documentA: string;
  documentB: string;
  /** Token-level Jaccard similarity on unigrams */
  unigramJaccard: number;
  /** Jaccard on bigrams */
  bigramJaccard: number;
  /** Combined score (weighted: 60% unigram, 40% bigram) */
  combinedSimilarity: number;
  /** Whether documents are likely duplicates (> 0.85) */
  likelyDuplicate: boolean;
}

export interface PenaltyExposureResult {
  /** List of penalty clauses found */
  penalties: Array<{
    text: string;
    amountUSD: number | null;
    probability: number;
    expectedValueUSD: number | null;
  }>;
  /** Total expected penalty exposure USD */
  totalExpectedExposureUSD: number;
  /** Maximum possible exposure USD */
  maxExposureUSD: number;
}

export interface LegalReceiptOptions {
  runId?: string;
}

// ─── Syllable counting ────────────────────────────────────────────────────────

function countSyllables(word: string): number {
  word = word.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// ─── Flesch-Kincaid Readability ───────────────────────────────────────────────

/**
 * Compute Flesch Reading Ease and Kincaid Grade Level.
 *
 * Reading Ease = 206.835 − 1.015×(words/sentences) − 84.6×(syllables/words)
 * Grade Level  = 0.39×(words/sentences) + 11.8×(syllables/words) − 15.59
 */
export function fleschKincaid(text: string): ReadabilityResult {
  if (!text || text.trim().length === 0) throw new Error('Text must not be empty');

  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 3);
  const words = text.split(/\s+/).filter(w => w.match(/[a-zA-Z]/));

  if (words.length === 0) throw new Error('Text contains no words');
  const sentenceCount = Math.max(1, sentences.length);
  const wordCount = words.length;

  const totalSyllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  const avgSyllablesPerWord = totalSyllables / wordCount;
  const avgWordsPerSentence = wordCount / sentenceCount;

  const readingEase = Math.min(100, Math.max(0,
    206.835 - 1.015 * avgWordsPerSentence - 84.6 * avgSyllablesPerWord,
  ));
  const gradeLevel = Math.max(0, 0.39 * avgWordsPerSentence + 11.8 * avgSyllablesPerWord - 15.59);

  const difficulty: ReadabilityResult['difficulty'] =
    readingEase >= 90 ? 'very-easy' :
    readingEase >= 80 ? 'easy' :
    readingEase >= 70 ? 'fairly-easy' :
    readingEase >= 60 ? 'standard' :
    readingEase >= 50 ? 'fairly-difficult' :
    readingEase >= 30 ? 'difficult' : 'very-difficult';

  return { readingEase, gradeLevel, difficulty, wordCount, sentenceCount, avgSyllablesPerWord };
}

// ─── Clause Risk Scorer ───────────────────────────────────────────────────────

const RISK_TERMS: Array<{ term: string; weight: number; category: string }> = [
  // High risk
  { term: 'indemnify',          weight: 15, category: 'indemnification' },
  { term: 'indemnification',    weight: 15, category: 'indemnification' },
  { term: 'unlimited liability', weight: 20, category: 'liability' },
  { term: 'sole discretion',    weight: 12, category: 'control' },
  { term: 'liquidated damages', weight: 10, category: 'penalties' },
  { term: 'penalty',            weight: 8,  category: 'penalties' },
  { term: 'terminate immediately', weight: 10, category: 'termination' },
  { term: 'without cause',      weight: 8,  category: 'termination' },
  { term: 'waiver',             weight: 6,  category: 'rights' },
  { term: 'assign',             weight: 5,  category: 'assignment' },
  // Medium risk
  { term: 'non-compete',        weight: 7,  category: 'restraint' },
  { term: 'non-solicitation',   weight: 5,  category: 'restraint' },
  { term: 'perpetual',          weight: 6,  category: 'term' },
  { term: 'irrevocable',        weight: 5,  category: 'term' },
  { term: 'confidential',       weight: 3,  category: 'confidentiality' },
  { term: 'arbitration',        weight: 4,  category: 'dispute' },
  { term: 'governing law',      weight: 2,  category: 'jurisdiction' },
  // Protective (reduce score)
  { term: 'limitation of liability', weight: -5, category: 'protection' },
  { term: 'mutual',             weight: -3, category: 'fairness' },
];

export function clauseRiskScorer(contractText: string): ClauseRiskResult {
  if (!contractText || contractText.trim().length === 0) throw new Error('Contract text must not be empty');

  const lower = contractText.toLowerCase();
  let riskScore = 0;
  const flaggedTerms: ClauseRiskResult['flaggedTerms'] = [];

  for (const { term, weight } of RISK_TERMS) {
    const regex = new RegExp(term.replace(/[-]/g, '[-]?'), 'gi');
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      const contribution = weight * Math.min(matches.length, 3); // cap at 3 occurrences
      riskScore += contribution;
      flaggedTerms.push({ term, weight, occurrences: matches.length });
    }
  }

  // Normalize to 0-100
  riskScore = Math.max(0, Math.min(100, riskScore));

  const riskCategory: ClauseRiskResult['riskCategory'] =
    riskScore >= 70 ? 'critical' :
    riskScore >= 50 ? 'high' :
    riskScore >= 25 ? 'medium' : 'low';

  const recommendations: string[] = [];
  const highWeight = flaggedTerms.filter(t => t.weight >= 10);
  if (highWeight.length > 0) recommendations.push(`Review high-risk clauses: ${highWeight.map(t => t.term).join(', ')}`);
  if (flaggedTerms.some(t => t.term === 'unlimited liability')) recommendations.push('Negotiate cap on liability — unlimited liability exposure detected');
  if (flaggedTerms.some(t => t.term === 'sole discretion')) recommendations.push('"Sole discretion" clauses grant unilateral power — seek mutual consent provisions');

  return { riskScore, riskCategory, flaggedTerms: flaggedTerms.sort((a, b) => b.weight - a.weight), recommendations };
}

// ─── Obligation Extractor ─────────────────────────────────────────────────────

const SHALL_PATTERN = /([A-Z][^.]*?)\s+(shall\s+not|must\s+not|shall|must|will)\s+([^.]+\.)/gi;
const PARTY_WORDS = ['vendor', 'client', 'supplier', 'customer', 'buyer', 'seller', 'licensor', 'licensee', 'contractor', 'company', 'party', 'parties'];

export function extractObligations(contractText: string): Obligation[] {
  if (!contractText) return [];

  const obligations: Obligation[] = [];
  let match: RegExpExecArray | null;
  let clauseIndex = 0;

  const re = /([A-Z][a-zA-Z\s,]*?)\s+(shall\s+not|must\s+not|shall|must|will)\s+([^.!?]{5,200}[.!?])/gi;
  while ((match = re.exec(contractText)) !== null) {
    const [, subject, modal, action] = match;
    const lowerSubject = subject.toLowerCase().trim();
    const isParty = PARTY_WORDS.some(p => lowerSubject.includes(p));
    const obligor = isParty ? subject.trim() : 'unspecified';

    const type: Obligation['type'] =
      modal.toLowerCase().includes('not') ? (modal.toLowerCase().startsWith('shall') ? 'shall-not' : 'must-not') :
      modal.toLowerCase() === 'shall' ? 'shall' :
      modal.toLowerCase() === 'must' ? 'must' : 'will';

    obligations.push({
      text: match[0].trim(),
      obligor,
      type,
      clauseIndex: clauseIndex++,
    });
  }

  return obligations;
}

// ─── Deadline Calendar ────────────────────────────────────────────────────────

const ABS_DATE_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b|\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b|\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi;
const REL_DATE_RE = /\bwithin\s+(\d+)\s+(days?|weeks?|months?)\b|\b(\d+)\s+(days?|weeks?|months?)\s+(?:after|from|following)\b/gi;

const MONTH_MAP: Record<string, number> = { January:1, February:2, March:3, April:4, May:5, June:6, July:7, August:8, September:9, October:10, November:11, December:12 };

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function buildDeadlineCalendar(contractText: string): ContractDeadline[] {
  if (!contractText) return [];
  const today = new Date();
  const deadlines: ContractDeadline[] = [];

  let m: RegExpExecArray | null;

  // Absolute dates
  const absRe = new RegExp(ABS_DATE_RE.source, 'gi');
  while ((m = absRe.exec(contractText)) !== null) {
    let d: Date | null = null;
    if (m[7] && m[8] && m[9]) { // Month DD, YYYY
      d = new Date(+m[9], MONTH_MAP[m[7]] - 1, +m[8]);
    } else if (m[4] && m[5] && m[6]) { // YYYY-MM-DD
      d = new Date(+m[4], +m[5] - 1, +m[6]);
    } else if (m[1] && m[2] && m[3]) { // MM/DD/YYYY
      d = new Date(+m[3], +m[1] - 1, +m[2]);
    }
    if (d && !isNaN(d.getTime())) {
      const ctx = contractText.slice(Math.max(0, m.index - 60), m.index + 80);
      deadlines.push({
        text: ctx.trim(),
        dateString: d.toISOString().split('T')[0],
        daysFromToday: daysBetween(today, d),
        deadlineType: 'absolute',
      });
    }
  }

  // Relative dates
  const relRe = new RegExp(REL_DATE_RE.source, 'gi');
  while ((m = relRe.exec(contractText)) !== null) {
    const num = +(m[1] ?? m[3]);
    const unit = (m[2] ?? m[4]).toLowerCase();
    const days = unit.startsWith('day') ? num : unit.startsWith('week') ? num * 7 : num * 30;
    const ctx = contractText.slice(Math.max(0, m.index - 40), m.index + 60);
    deadlines.push({
      text: ctx.trim(),
      dateString: `T+${days} days`,
      daysFromToday: days,
      deadlineType: 'relative',
    });
  }

  return deadlines.sort((a, b) => (a.daysFromToday ?? Infinity) - (b.daysFromToday ?? Infinity));
}

// ─── Contract Similarity ──────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
}

function bigrams(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const set = new Set<string>();
  for (let i = 0; i < words.length - 1; i++) set.add(`${words[i]} ${words[i+1]}`);
  return set;
}

function jaccardSets(a: Set<string>, b: Set<string>): number {
  const intersection = new Set([...a].filter(x => b.has(x)));
  const union = new Set([...a, ...b]);
  return union.size > 0 ? intersection.size / union.size : 0;
}

export function contractSimilarity(
  docAId: string,
  docAText: string,
  docBId: string,
  docBText: string,
): SimilarityResult {
  const unigramJaccard = jaccardSets(tokenize(docAText), tokenize(docBText));
  const bigramJaccard  = jaccardSets(bigrams(docAText), bigrams(docBText));
  const combinedSimilarity = 0.60 * unigramJaccard + 0.40 * bigramJaccard;

  return {
    documentA: docAId,
    documentB: docBId,
    unigramJaccard,
    bigramJaccard,
    combinedSimilarity,
    likelyDuplicate: combinedSimilarity > 0.85,
  };
}

// ─── Penalty Exposure Estimator ───────────────────────────────────────────────

const PENALTY_AMOUNT_RE = /\$\s?([\d,]+(?:\.\d{2})?)\s?(?:USD|dollars?)?/gi;
const PENALTY_CLAUSE_RE = /(?:liquidated damages|penalty|penalties|late fee|termination fee)[^.]{0,200}\./gi;

export function penaltyExposure(
  contractText: string,
  defaultProbability = 0.10,
): PenaltyExposureResult {
  const penalties: PenaltyExposureResult['penalties'] = [];
  let m: RegExpExecArray | null;

  const clauseRe = new RegExp(PENALTY_CLAUSE_RE.source, 'gi');
  while ((m = clauseRe.exec(contractText)) !== null) {
    const clauseText = m[0];
    // Try to extract dollar amount from clause
    const amountMatch = clauseText.match(/\$\s?([\d,]+(?:\.\d{2})?)/i);
    const amountUSD = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    const expectedValueUSD = amountUSD != null ? amountUSD * defaultProbability : null;

    penalties.push({
      text: clauseText.trim(),
      amountUSD,
      probability: defaultProbability,
      expectedValueUSD,
    });
  }

  const totalExpectedExposureUSD = penalties.reduce((acc, p) => acc + (p.expectedValueUSD ?? 0), 0);
  const maxExposureUSD = penalties.reduce((acc, p) => acc + (p.amountUSD ?? 0), 0);

  return { penalties, totalExpectedExposureUSD, maxExposureUSD };
}

// ─── Unified analysis ─────────────────────────────────────────────────────────

export interface LegalAnalysisInput {
  text: string;
  compareWithText?: { id: string; text: string };
}

export interface LegalAnalysisResult {
  readability: ReadabilityResult;
  risk: ClauseRiskResult;
  obligations: Obligation[];
  deadlines: ContractDeadline[];
  similarity?: SimilarityResult;
  penaltyExposure: PenaltyExposureResult;
  converged: true;
}

export function analyzeLegalDocument(input: LegalAnalysisInput): LegalAnalysisResult {
  const result: LegalAnalysisResult = {
    readability: fleschKincaid(input.text),
    risk: clauseRiskScorer(input.text),
    obligations: extractObligations(input.text),
    deadlines: buildDeadlineCalendar(input.text),
    penaltyExposure: penaltyExposure(input.text),
    converged: true,
  };
  if (input.compareWithText) {
    result.similarity = contractSimilarity('doc-a', input.text, input.compareWithText.id, input.compareWithText.text);
  }
  return result;
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export function buildLegalReceipt(
  result: LegalAnalysisResult,
  options?: LegalReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.readability.gradeLevel > 16) {
    violations.push({ criterion: 'readability', message: `Reading grade level ${result.readability.gradeLevel.toFixed(1)} exceeds 16 — consider plain language revision` });
  }
  if (result.risk.riskScore > 70) {
    violations.push({ criterion: 'risk', message: `Contract risk score ${result.risk.riskScore.toFixed(0)}/100 is ${result.risk.riskCategory} — legal review recommended` });
  }
  if (result.penaltyExposure.maxExposureUSD > 100_000) {
    violations.push({ criterion: 'penalty_exposure', message: `Maximum penalty exposure $${result.penaltyExposure.maxExposureUSD.toLocaleString()} requires executive sign-off` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'legal-document',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `legal-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'contract-analytics', scale: 'document' },
    resultSummary: {
      readingGradeLevel: result.readability.gradeLevel,
      riskScore: result.risk.riskScore,
      obligationCount: result.obligations.length,
      deadlineCount: result.deadlines.length,
      maxPenaltyExposureUSD: result.penaltyExposure.maxExposureUSD,
    },
    cael: { version: 'cael.v1', event: 'legal_document.contract_analysis', solverType: 'legal-document.flesch-kincaid' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
