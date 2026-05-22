import { describe, expect, it } from 'vitest';
import { createInitialWizardState, type WizardState } from '@/lib/brittney/WizardFlow';
import { buildWizardProvisionBody } from '../BrittneyWizard';

function stateWith(overrides: Partial<WizardState>): WizardState {
  return { ...createInitialWizardState(), ...overrides };
}

describe('BrittneyWizard provisioning payload', () => {
  it('includes the collected GitHub repo as an approved repo', () => {
    const state = stateWith({
      repoUrl: 'https://github.com/example/spatial-app',
      userIntent: 'spatialize my app',
      consent: {
        repos: ['https://github.com/example/spatial-app'],
        scaffold: true,
        absorb: true,
        publishKnowledge: false,
        daemon: true,
      },
    });

    const body = buildWizardProvisionBody(state);

    expect(body.repoUrl).toBe('https://github.com/example/spatial-app');
    expect(body.intent).toBe('spatialize my app');
    expect(body.consent.repos).toEqual(['https://github.com/example/spatial-app']);
    expect(body.consent.scaffold).toBe(true);
    expect(body.consent.absorb).toBe(true);
    expect(body.consent.daemon).toBe(true);
  });

  it('adds repoUrl to approved repos when the consent state has not recorded it yet', () => {
    const state = stateWith({
      repoUrl: 'https://github.com/example/new-repo',
      consent: {
        repos: [],
        scaffold: true,
        absorb: false,
        publishKnowledge: true,
        daemon: false,
      },
    });

    const body = buildWizardProvisionBody(state);

    expect(body.consent.repos).toEqual(['https://github.com/example/new-repo']);
    expect(body.consent.publishKnowledge).toBe(true);
    expect(body.consent.daemon).toBe(false);
  });

  it('passes project DNA name when provisioning a new workspace', () => {
    const state = stateWith({
      projectDNA: {
        name: 'surgical-sim',
        repoUrl: '',
        techStack: ['typescript'],
        frameworks: ['react'],
        languages: ['ts'],
        packageCount: 1,
        testCoverage: 0,
        codeHealthScore: 5,
        compilationTargets: ['react'],
        traits: ['physics'],
      },
    });

    const body = buildWizardProvisionBody(state);

    expect(body.projectName).toBe('surgical-sim');
    expect(body.consent.repos).toEqual([]);
  });
});
