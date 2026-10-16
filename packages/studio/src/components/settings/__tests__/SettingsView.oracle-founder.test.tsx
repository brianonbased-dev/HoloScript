// @vitest-environment jsdom
/**
 * Oracle Boost status/telemetry/setup are founder-only APIs (#606). Settings
 * must not call them for anyone else (no 403s) and must hide the panel:
 * the composition gets isFounder=false and OracleSection is visible: $isFounder.
 */
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseSession = vi.fn();
const setState = vi.fn();
vi.mock('next-auth/react', () => ({ useSession: () => mockUseSession(), signIn: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/settings',
}));
vi.mock('@/components/holo-surface', () => ({
  HoloSurfaceRenderer: () => null,
  useHoloComposition: () => ({
    loading: false,
    error: null,
    nodes: [],
    state: {},
    computed: {},
    templates: {},
    setState,
  }),
}));
vi.mock('../BrittneyAPIKeysPanel', () => ({ default: () => null }));
vi.mock('@/components/integrations/IntegrationsView', () => ({ IntegrationsView: () => null }));
vi.mock('@/app/absorb/components', () => ({ CreditBalanceCard: () => null, PricingTab: () => null }));
vi.mock('@/lib/absorb/fetchWithAuth', () => ({ absorbFetch: vi.fn(async () => new Response('{}')) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), info: vi.fn() } }));

import { SettingsView } from '../SettingsView';

let fetchSpy: ReturnType<typeof vi.fn>;
const oracleCalls = () =>
  fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/oracle-boost/'));

function signedIn(isFounder: boolean) {
  mockUseSession.mockReturnValue({
    status: 'authenticated',
    data: { user: { id: isFounder ? 'founder' : 'user-1', email: 'a@b.test', isFounder } },
  });
}

beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
  setState.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('Settings Oracle Boost panel is founder-only', () => {
  it('non-founder: no oracle-boost calls and isFounder=false sent to the surface', async () => {
    signedIn(false);
    render(<SettingsView />);
    await waitFor(() => expect(setState).toHaveBeenCalled());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(oracleCalls()).toEqual([]);
    expect(setState.mock.calls.at(-1)?.[0]).toMatchObject({ isFounder: false });
  });

  it('founder: loads oracle status and telemetry and isFounder=true', async () => {
    signedIn(true);
    render(<SettingsView />);
    await waitFor(() => expect(oracleCalls().length).toBe(2));
    expect(oracleCalls().some((u) => u.includes('/oracle-boost/telemetry'))).toBe(true);
    await waitFor(() =>
      expect(setState.mock.calls.at(-1)?.[0]).toMatchObject({ isFounder: true })
    );
  });

  it('the settings surface hides OracleSection unless $isFounder', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../../../../compositions/studio/settings.hsplus'),
      'utf8'
    );
    const section = src.slice(src.indexOf('object "OracleSection"'));
    expect(section.slice(0, section.indexOf('object "OracleHeader"'))).toMatch(
      /visible:\s*\$isFounder/
    );
  });
});
