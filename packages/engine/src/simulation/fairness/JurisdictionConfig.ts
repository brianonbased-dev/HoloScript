import type {
  FairnessMetrics,
  FairnessReceipt,
  FairnessRobustnessReceipt,
} from './FairnessReceipt';

export const FAIRNESS_JURISDICTIONS = [
  'EEOC_TITLE_VII',
  'NYC_LL144',
  'CFPB_ECOA',
  'COLORADO_SB21_169',
  'EU_AI_ACT_PROHIBITED',
] as const;

export type FairnessJurisdiction = (typeof FAIRNESS_JURISDICTIONS)[number];

export const FAIRNESS_STATISTICAL_TESTS = [
  'four_fifths',
  'fisher_exact',
  'chi_squared',
  'geographic_redlining',
] as const;

export type FairnessStatisticalTest = (typeof FAIRNESS_STATISTICAL_TESTS)[number];

export interface JurisdictionConfig {
  id: FairnessJurisdiction | string;
  label: string;
  disclosureStandard: string;
  protectedCategories: string[];
  requiredTests: FairnessStatisticalTest[];
  adverseImpactRatioMin: number;
  demographicParityDiffMax?: number;
  fisherExactMaxPValue?: number;
  chiSquaredMaxStatistic?: number;
  geographicRedlining?: {
    maxApprovalRateGap: number;
    proxyFieldPattern?: RegExp;
  };
}

export interface JurisdictionDecisionRecord {
  group: string;
  approved: boolean;
  features?: Record<string, number>;
}

export interface JurisdictionTestResult {
  test: FairnessStatisticalTest;
  passed: boolean;
  statistic?: number;
  pValue?: number;
  threshold?: number;
  message: string;
}

export interface JurisdictionAuditSummary {
  jurisdictionId: string;
  disclosureStandard: string;
  protectedCategories: string[];
  requiredTests: FairnessStatisticalTest[];
  testResults: JurisdictionTestResult[];
  passed: boolean;
}

export interface BiasAuditReportInput {
  receipt: FairnessReceipt;
  robustnessReceipt?: FairnessRobustnessReceipt;
  jurisdiction?: FairnessJurisdiction | JurisdictionConfig | JurisdictionAuditSummary;
  generatedAt?: string;
  issuer?: string;
  format?: 'markdown' | 'json';
}

export interface BiasAuditReportOutput {
  success: true;
  target: 'bias_audit_report';
  format: 'markdown' | 'json';
  jurisdictionId: string;
  disclosureStandard: string;
  modelId: string;
  decision: FairnessReceipt['decision'];
  content: string;
  contentHash: string;
  generatedAt: string;
  receiptHash: string;
}

export const JURISDICTION_CONFIGS: Record<FairnessJurisdiction, JurisdictionConfig> = {
  EEOC_TITLE_VII: {
    id: 'EEOC_TITLE_VII',
    label: 'EEOC Title VII',
    disclosureStandard:
      'EEOC Uniform Guidelines adverse-impact analysis with Title VII protected categories',
    protectedCategories: ['race', 'color', 'religion', 'sex', 'national_origin'],
    requiredTests: ['four_fifths', 'fisher_exact', 'chi_squared'],
    adverseImpactRatioMin: 0.8,
    fisherExactMaxPValue: 0.05,
    chiSquaredMaxStatistic: 3.8415,
  },
  NYC_LL144: {
    id: 'NYC_LL144',
    label: 'NYC Local Law 144 AEDT',
    disclosureStandard: 'NYC Local Law 144 annual AEDT bias audit public summary',
    protectedCategories: ['sex', 'race_ethnicity', 'intersectional_sex_race_ethnicity'],
    requiredTests: ['four_fifths', 'fisher_exact', 'chi_squared'],
    adverseImpactRatioMin: 0.8,
    fisherExactMaxPValue: 0.05,
    chiSquaredMaxStatistic: 3.8415,
  },
  CFPB_ECOA: {
    id: 'CFPB_ECOA',
    label: 'CFPB ECOA fair lending',
    disclosureStandard: 'CFPB/ECOA fair-lending disparate-impact and redlining audit file',
    protectedCategories: [
      'race',
      'color',
      'religion',
      'national_origin',
      'sex',
      'marital_status',
      'age',
      'public_assistance_status',
    ],
    requiredTests: ['four_fifths', 'fisher_exact', 'chi_squared', 'geographic_redlining'],
    adverseImpactRatioMin: 0.8,
    fisherExactMaxPValue: 0.05,
    chiSquaredMaxStatistic: 3.8415,
    geographicRedlining: { maxApprovalRateGap: 0.2 },
  },
  COLORADO_SB21_169: {
    id: 'COLORADO_SB21_169',
    label: 'Colorado SB21-169 / Reg 10-1-1',
    disclosureStandard: 'Colorado unfair-discrimination testing and governance audit file',
    protectedCategories: [
      'race',
      'color',
      'national_origin',
      'religion',
      'sex',
      'sexual_orientation',
      'disability',
      'gender_identity',
      'gender_expression',
    ],
    requiredTests: ['four_fifths', 'chi_squared', 'geographic_redlining'],
    adverseImpactRatioMin: 0.8,
    chiSquaredMaxStatistic: 3.8415,
    geographicRedlining: { maxApprovalRateGap: 0.2 },
  },
  EU_AI_ACT_PROHIBITED: {
    id: 'EU_AI_ACT_PROHIBITED',
    label: 'EU AI Act prohibited/high-risk discrimination screen',
    disclosureStandard:
      'EU AI Act discrimination-risk technical documentation and record-keeping summary',
    protectedCategories: [
      'sex',
      'racial_or_ethnic_origin',
      'religion_or_belief',
      'disability',
      'age',
      'sexual_orientation',
    ],
    requiredTests: ['four_fifths', 'chi_squared'],
    adverseImpactRatioMin: 0.8,
    chiSquaredMaxStatistic: 3.8415,
  },
};

const GEO_FIELD_RE = /(?:geo|zip|postal|tract|county|neighborhood|redlin|location|region)/i;

export function isFairnessJurisdiction(value: string): value is FairnessJurisdiction {
  return (FAIRNESS_JURISDICTIONS as readonly string[]).includes(value);
}

export function resolveJurisdictionConfig(
  jurisdiction?: FairnessJurisdiction | JurisdictionConfig
): JurisdictionConfig | undefined {
  if (!jurisdiction) return undefined;
  if (typeof jurisdiction === 'string') {
    if (!isFairnessJurisdiction(jurisdiction)) {
      throw new Error(`Unknown FairnessSweep jurisdiction "${jurisdiction}".`);
    }
    return JURISDICTION_CONFIGS[jurisdiction];
  }
  return {
    ...jurisdiction,
    requiredTests: [...jurisdiction.requiredTests],
    protectedCategories: [...jurisdiction.protectedCategories],
  };
}

export function evaluateJurisdictionTests(
  decisions: readonly JurisdictionDecisionRecord[],
  config: JurisdictionConfig,
  metrics: FairnessMetrics
): JurisdictionAuditSummary {
  const testResults = config.requiredTests.map((test) => {
    switch (test) {
      case 'four_fifths':
        return evaluateFourFifths(metrics, config);
      case 'fisher_exact':
        return evaluateFisherExact(decisions, config);
      case 'chi_squared':
        return evaluateChiSquared(decisions, config);
      case 'geographic_redlining':
        return evaluateGeographicRedlining(decisions, metrics, config);
      default:
        return exhaustive(test);
    }
  });

  return {
    jurisdictionId: config.id,
    disclosureStandard: config.disclosureStandard,
    protectedCategories: [...config.protectedCategories],
    requiredTests: [...config.requiredTests],
    testResults,
    passed: testResults.every((result) => result.passed),
  };
}

export function compileBiasAuditReport(input: BiasAuditReportInput): BiasAuditReportOutput {
  const format = input.format ?? 'markdown';
  const generatedAt = input.generatedAt ?? new Date(0).toISOString();
  const summary = resolveReportSummary(input);

  const reportObject = {
    target: 'compile_to_bias_audit_report',
    generatedAt,
    issuer: input.issuer ?? 'HoloScript',
    jurisdiction: summary,
    receipt: {
      kind: input.receipt.kind,
      modelId: input.receipt.modelId,
      sampleSize: input.receipt.sampleSize,
      protectedAttribute: input.receipt.protectedAttribute,
      decision: input.receipt.decision,
      metrics: input.receipt.metrics,
      replayFingerprint: input.receipt.replayFingerprint,
      receiptHash: input.receipt.receiptHash,
      regulatoryMapping: input.receipt.regulatoryMapping,
    },
    robustness: input.robustnessReceipt
      ? {
          verdict: input.robustnessReceipt.verdict,
          band: input.robustnessReceipt.robustness,
          receiptHash: input.robustnessReceipt.receiptHash,
        }
      : undefined,
  };

  const content =
    format === 'json'
      ? JSON.stringify(reportObject, null, 2)
      : renderBiasAuditMarkdown(reportObject);

  return {
    success: true,
    target: 'bias_audit_report',
    format,
    jurisdictionId: summary.jurisdictionId,
    disclosureStandard: summary.disclosureStandard,
    modelId: input.receipt.modelId,
    decision: input.receipt.decision,
    content,
    contentHash: hashString(content),
    generatedAt,
    receiptHash: input.receipt.receiptHash,
  };
}

function resolveReportSummary(input: BiasAuditReportInput): JurisdictionAuditSummary {
  if (isJurisdictionAuditSummary(input.jurisdiction)) return input.jurisdiction;
  if (input.receipt.jurisdiction) return input.receipt.jurisdiction;

  const config = resolveJurisdictionConfig(
    input.jurisdiction as FairnessJurisdiction | JurisdictionConfig | undefined
  );
  if (config) {
    return {
      jurisdictionId: config.id,
      disclosureStandard: config.disclosureStandard,
      protectedCategories: [...config.protectedCategories],
      requiredTests: [...config.requiredTests],
      testResults: [],
      passed: input.receipt.decision === 'PASS',
    };
  }

  return {
    jurisdictionId: 'GENERAL_FAIRNESS',
    disclosureStandard: 'General algorithmic-fairness audit report',
    protectedCategories: [],
    requiredTests: ['four_fifths'],
    testResults: [
      {
        test: 'four_fifths',
        passed: input.receipt.metrics.fourFifthsPass,
        statistic: input.receipt.metrics.adverseImpactRatio,
        threshold: 0.8,
        message: `Adverse-impact ratio ${input.receipt.metrics.adverseImpactRatio}.`,
      },
    ],
    passed: input.receipt.decision === 'PASS',
  };
}

function isJurisdictionAuditSummary(value: unknown): value is JurisdictionAuditSummary {
  return (
    !!value &&
    typeof value === 'object' &&
    'jurisdictionId' in value &&
    'testResults' in value &&
    Array.isArray((value as JurisdictionAuditSummary).testResults)
  );
}

function renderBiasAuditMarkdown(report: {
  target: string;
  generatedAt: string;
  issuer: string;
  jurisdiction: JurisdictionAuditSummary;
  receipt: {
    modelId: string;
    sampleSize: number;
    protectedAttribute: string;
    decision: string;
    metrics: FairnessMetrics;
    replayFingerprint: string;
    receiptHash: string;
    regulatoryMapping: Record<string, string>;
  };
  robustness?: {
    verdict: string;
    band: unknown;
    receiptHash: string;
  };
}): string {
  const lines: string[] = [];
  lines.push('# Bias Audit Report');
  lines.push('');
  lines.push(`- Target: ${report.target}`);
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- Issuer: ${report.issuer}`);
  lines.push(`- Jurisdiction: ${report.jurisdiction.jurisdictionId}`);
  lines.push(`- Disclosure standard: ${report.jurisdiction.disclosureStandard}`);
  lines.push(
    `- Protected categories: ${report.jurisdiction.protectedCategories.join(', ') || 'unspecified'}`
  );
  lines.push('');
  lines.push('## Model And Sample');
  lines.push('');
  lines.push(`- Model: ${report.receipt.modelId}`);
  lines.push(`- Protected attribute: ${report.receipt.protectedAttribute}`);
  lines.push(`- Sample size: ${report.receipt.sampleSize}`);
  lines.push(`- Decision: ${report.receipt.decision}`);
  lines.push(`- Receipt hash: ${report.receipt.receiptHash}`);
  lines.push(`- Replay fingerprint: ${report.receipt.replayFingerprint}`);
  lines.push('');
  lines.push('## Metrics');
  lines.push('');
  lines.push(`- Adverse-impact ratio: ${report.receipt.metrics.adverseImpactRatio}`);
  lines.push(`- Demographic-parity difference: ${report.receipt.metrics.demographicParityDiff}`);
  lines.push(`- Four-fifths pass: ${report.receipt.metrics.fourFifthsPass}`);
  lines.push(
    `- Per-group approval rates: ${Object.entries(report.receipt.metrics.approvalRate)
      .map(([group, rate]) => `${group}=${rate}`)
      .join(', ')}`
  );
  lines.push('');
  lines.push('## Required Test Results');
  lines.push('');
  lines.push('| Test | Status | Statistic | Threshold | p-value | Notes |');
  lines.push('|---|---:|---:|---:|---:|---|');
  for (const result of report.jurisdiction.testResults) {
    lines.push(
      `| ${result.test} | ${result.passed ? 'PASS' : 'FAIL'} | ${formatNumber(result.statistic)} | ${formatNumber(result.threshold)} | ${formatNumber(result.pValue)} | ${result.message} |`
    );
  }
  if (report.jurisdiction.testResults.length === 0) {
    lines.push(
      '| configured-by-jurisdiction | SEE RECEIPT | n/a | n/a | n/a | No per-test summary was attached to the receipt. |'
    );
  }
  lines.push('');
  lines.push('## Regulatory Mapping');
  lines.push('');
  for (const [regulator, field] of Object.entries(report.receipt.regulatoryMapping)) {
    lines.push(`- ${regulator}: ${field}`);
  }
  if (report.robustness) {
    lines.push('');
    lines.push('## Robustness');
    lines.push('');
    lines.push(`- Verdict: ${report.robustness.verdict}`);
    lines.push(`- Receipt hash: ${report.robustness.receiptHash}`);
    lines.push(`- Band: ${JSON.stringify(report.robustness.band)}`);
  }
  return lines.join('\n');
}

function evaluateFourFifths(
  metrics: FairnessMetrics,
  config: JurisdictionConfig
): JurisdictionTestResult {
  return {
    test: 'four_fifths',
    passed: metrics.adverseImpactRatio >= config.adverseImpactRatioMin,
    statistic: metrics.adverseImpactRatio,
    threshold: config.adverseImpactRatioMin,
    message: `Adverse-impact ratio ${metrics.adverseImpactRatio} vs floor ${config.adverseImpactRatioMin}.`,
  };
}

function evaluateFisherExact(
  decisions: readonly JurisdictionDecisionRecord[],
  config: JurisdictionConfig
): JurisdictionTestResult {
  const groups = summarizeGroups(decisions);
  if (groups.length !== 2) {
    return {
      test: 'fisher_exact',
      passed: false,
      message: `Fisher's exact test requires exactly two cohorts; observed ${groups.length}.`,
    };
  }
  const [a, b] = groups;
  const pValue = fisherExactTwoTailed(a.approved, a.denied, b.approved, b.denied);
  const threshold = config.fisherExactMaxPValue ?? 0.05;
  return {
    test: 'fisher_exact',
    passed: pValue >= threshold,
    pValue,
    threshold,
    message: `Two-tailed Fisher p=${pValue}; p below ${threshold} indicates statistically significant disparity.`,
  };
}

function evaluateChiSquared(
  decisions: readonly JurisdictionDecisionRecord[],
  config: JurisdictionConfig
): JurisdictionTestResult {
  const groups = summarizeGroups(decisions);
  const totalApproved = groups.reduce((sum, group) => sum + group.approved, 0);
  const totalDenied = groups.reduce((sum, group) => sum + group.denied, 0);
  const total = totalApproved + totalDenied;
  if (groups.length < 2 || total === 0 || totalApproved === 0 || totalDenied === 0) {
    return {
      test: 'chi_squared',
      passed: false,
      message: 'Chi-squared test requires at least two cohorts with both approvals and denials.',
    };
  }

  let statistic = 0;
  for (const group of groups) {
    const expectedApproved = (group.total * totalApproved) / total;
    const expectedDenied = (group.total * totalDenied) / total;
    statistic += square(group.approved - expectedApproved) / expectedApproved;
    statistic += square(group.denied - expectedDenied) / expectedDenied;
  }

  const rounded = round(statistic);
  const threshold = config.chiSquaredMaxStatistic ?? 3.8415;
  return {
    test: 'chi_squared',
    passed: rounded <= threshold,
    statistic: rounded,
    pValue: groups.length === 2 ? round(erfc(Math.sqrt(rounded / 2))) : undefined,
    threshold,
    message: `Chi-squared statistic ${rounded} with ${groups.length - 1} degree(s) of freedom.`,
  };
}

function evaluateGeographicRedlining(
  decisions: readonly JurisdictionDecisionRecord[],
  metrics: FairnessMetrics,
  config: JurisdictionConfig
): JurisdictionTestResult {
  const geo = config.geographicRedlining ?? { maxApprovalRateGap: 0.2 };
  const proxyPattern = geo.proxyFieldPattern ?? GEO_FIELD_RE;
  const proxyFields = new Set<string>();
  for (const decision of decisions) {
    for (const field of Object.keys(decision.features ?? {})) {
      if (proxyPattern.test(field)) proxyFields.add(field);
    }
  }

  if (proxyFields.size === 0) {
    return {
      test: 'geographic_redlining',
      passed: false,
      message: 'No geographic proxy feature was supplied for redlining analysis.',
    };
  }

  const threshold = geo.maxApprovalRateGap;
  return {
    test: 'geographic_redlining',
    passed: metrics.demographicParityDiff <= threshold,
    statistic: metrics.demographicParityDiff,
    threshold,
    message: `Geographic proxy fields (${[...proxyFields].sort().join(', ')}) with approval-rate gap ${metrics.demographicParityDiff}.`,
  };
}

function summarizeGroups(decisions: readonly JurisdictionDecisionRecord[]): Array<{
  group: string;
  approved: number;
  denied: number;
  total: number;
}> {
  const groups = new Map<
    string,
    { group: string; approved: number; denied: number; total: number }
  >();
  for (const decision of decisions) {
    const group = groups.get(decision.group) ?? {
      group: decision.group,
      approved: 0,
      denied: 0,
      total: 0,
    };
    group.total += 1;
    if (decision.approved) group.approved += 1;
    else group.denied += 1;
    groups.set(decision.group, group);
  }
  return [...groups.values()].sort((a, b) => a.group.localeCompare(b.group));
}

function fisherExactTwoTailed(a: number, b: number, c: number, d: number): number {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const total = row1 + row2;
  const observed = hypergeometric(a, row1, col1, total);
  const min = Math.max(0, col1 - row2);
  const max = Math.min(row1, col1);
  let p = 0;
  for (let x = min; x <= max; x++) {
    const candidate = hypergeometric(x, row1, col1, total);
    if (candidate <= observed + 1e-12) p += candidate;
  }
  return round(Math.min(1, p));
}

function hypergeometric(x: number, row1: number, col1: number, total: number): number {
  return Math.exp(logChoose(col1, x) + logChoose(total - col1, row1 - x) - logChoose(total, row1));
}

const logFactorialMemo = [0];

function logFactorial(n: number): number {
  for (let i = logFactorialMemo.length; i <= n; i++) {
    logFactorialMemo[i] = logFactorialMemo[i - 1] + Math.log(i);
  }
  return logFactorialMemo[n];
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + z / 2);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function formatNumber(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : 'n/a';
}

function round(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

function square(x: number): number {
  return x * x;
}

function exhaustive(value: never): never {
  throw new Error(`Unhandled jurisdiction test ${String(value)}`);
}
