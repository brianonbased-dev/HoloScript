import type {
  DaemonPass,
  DaemonPlan,
  DaemonPlanProfile,
  DaemonProfile,
  DaemonProjectDNA,
  ProjectDNA,
} from '@/lib/daemon/types';

function mapKindToPlanProfile(kind: ProjectDNA['kind']): DaemonPlanProfile {
  switch (kind) {
    case 'frontend':
      return 'frontend';
    case 'data':
      return 'data';
    case 'automation':
      return 'automation';
    case 'spatial':
      return 'spatial';
    case 'agent-backend':
      return 'agent-backend';
    case 'service':
    case 'library':
    case 'unknown':
    default:
      return 'service';
  }
}

export function projectDNAFromLegacySignals(input: DaemonProjectDNA): ProjectDNA {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const packageManagers = new Set<string>();
  const runtimes = new Set<string>();
  const riskSignals = new Set<string>();
  const strengths = new Set<string>();

  for (const item of input.detectedStack) {
    const lower = item.toLowerCase();
    if (
      ['ts', 'tsx', 'typescript', 'javascript', 'js', 'jsx', 'python', 'go', 'rust'].includes(lower)
    ) {
      languages.add(lower);
    } else {
      frameworks.add(item);
    }
  }

  for (const manifest of input.manifests ?? []) {
    packageManagers.add(manifest.buildSystem);
    if (manifest.scripts.some((script) => /test|build|lint/.test(script))) {
      strengths.add(`${manifest.fileName} scripts detected`);
    }
    if (manifest.dependencyCount > 100) {
      riskSignals.add(`${manifest.fileName} has high dependency count`);
    }
  }

  if (frameworks.has('next.js') || frameworks.has('react')) runtimes.add('browser');
  if (frameworks.has('express') || frameworks.has('node')) runtimes.add('node');
  if (languages.has('python')) runtimes.add('python');
  if (languages.has('go')) runtimes.add('go');
  if (languages.has('rust')) runtimes.add('rust');

  return {
    kind: input.kind,
    confidence: input.confidence,
    languages: [...languages],
    frameworks: [...frameworks],
    packageManagers: [...packageManagers],
    runtimes: [...runtimes],
    repoShape: (input.manifests?.length ?? 0) > 1 ? 'polyglot' : 'single-package',
    riskSignals: [...riskSignals],
    strengths: [...strengths],
    recommendedProfile: mapKindToPlanProfile(input.kind),
    recommendedMode: input.recommendedProfile,
  };
}

function passesFor(profile: DaemonPlanProfile, mode: DaemonProfile): DaemonPass[] {
  const base: DaemonPass[] = ['absorb', 'typefix', 'docs'];

  if (profile === 'frontend') base.push('coverage', 'complexity');
  if (profile === 'data') base.push('coverage', 'security-scan');
  if (profile === 'automation') base.push('retry-backoff-check', 'security-scan');
  if (profile === 'agent-backend')
    base.push('contract-check', 'retry-backoff-check', 'security-scan');
  if (profile === 'spatial')
    base.push('target-sweep', 'trait-sampling', 'runtime-matrix', 'absorb-roundtrip');
  if (profile === 'service') base.push('coverage', 'contract-check', 'retry-backoff-check');

  if (mode !== 'quick' && !base.includes('coverage')) base.push('coverage');
  if (mode === 'deep') {
    for (const pass of ['complexity', 'security-scan', 'contract-check'] as DaemonPass[]) {
      if (!base.includes(pass)) base.push(pass);
    }
  }

  return base;
}

export function buildDaemonPlan(
  projectDna: ProjectDNA,
  mode: DaemonProfile = projectDna.recommendedMode
): DaemonPlan {
  const profile = projectDna.recommendedProfile;
  const passes = passesFor(profile, mode);

  return {
    profile,
    mode,
    passes,
    maxFiles: mode === 'quick' ? 10 : mode === 'balanced' ? 25 : 50,
    maxCycles: mode === 'quick' ? 1 : mode === 'balanced' ? 2 : 3,
    tokenBudget: mode === 'quick' ? 50_000 : mode === 'balanced' ? 150_000 : 500_000,
    requiresHumanReview: mode !== 'quick' || profile === 'agent-backend' || profile === 'spatial',
  };
}
