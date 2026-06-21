import { describe, expect, it } from 'vitest';
import {
  createModeForProjectKind,
  getWizardHubActions,
  wizardHubHref,
} from '../Step4WorkspaceReady';

describe('WizardHub action model', () => {
  it('routes imported workspace kinds to supported create modes', () => {
    expect(createModeForProjectKind('spatial')).toBe('world');
    expect(createModeForProjectKind('storefront')).toBe('world');
    expect(createModeForProjectKind('service')).toBe('app');
    expect(createModeForProjectKind('frontend')).toBe('app');
  });

  it('labels every post-workspace destination with readiness depth', () => {
    const actions = getWizardHubActions('service');

    expect(actions.map((action) => action.id)).toEqual([
      'build-scene',
      'improve-repo',
      'compile-target',
      'ship-share',
    ]);
    expect(actions.every((action) => action.depth === 'real' || action.depth === 'sketch')).toBe(
      true
    );
    expect(actions.find((action) => action.id === 'ship-share')?.depth).toBe('sketch');
  });

  it('builds create URLs with real panel view hints', () => {
    const compile = getWizardHubActions('spatial').find((action) => action.id === 'compile-target');
    const ship = getWizardHubActions('frontend').find((action) => action.id === 'ship-share');

    expect(compile && wizardHubHref(compile)).toBe('/create?mode=world&view=exportV2');
    expect(ship && wizardHubHref(ship)).toBe('/create?mode=app&view=publish');
  });
});
