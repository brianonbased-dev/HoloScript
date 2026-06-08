import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PublicAgentProfileSurface } from '../components/PublicAgentProfileSurface';
import { buildAgentProfileView, getProfileFixture } from './profileSurface';
import type { PublicAgentProfileApiFixture } from './types';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function clonedFixture(): PublicAgentProfileApiFixture {
  return structuredClone(getProfileFixture());
}

function getRenderedCount(markup: string, attr: string, label: string): number {
  const match = markup.match(new RegExp(`${attr}="${label}"[^>]*>(\\d+)<`));
  if (!match) throw new Error(`Missing rendered count ${attr}=${label}`);
  return Number(match[1]);
}

function renderFixture(fixture: PublicAgentProfileApiFixture) {
  const view = buildAgentProfileView(fixture.profile, fixture.receipts, fixture.directory);
  return {
    view,
    markup: renderToStaticMarkup(<PublicAgentProfileSurface view={view} />),
  };
}

describe('public agent profile surface', () => {
  it('renders profile counts from the API response fixture', () => {
    const fixture = clonedFixture();
    const { view, markup } = renderFixture(fixture);

    expect(view.stats).toMatchInlineSnapshot(`
      {
        "currentClaims": 2,
        "graduatedKnowledge": 4,
        "recentDoneLog": 3,
      }
    `);

    expect(getRenderedCount(markup, 'data-profile-count', 'claims')).toBe(
      fixture.profile.activeTasks.length
    );
    expect(getRenderedCount(markup, 'data-profile-count', 'done-log')).toBe(
      fixture.receipts.receipts.length
    );
    expect(getRenderedCount(markup, 'data-profile-count', 'knowledge')).toBe(
      fixture.profile.contributions.length
    );
    expect(getRenderedCount(markup, 'data-knowledge-count', 'wisdom')).toBe(
      fixture.profile.contributions.filter((entry) => entry.type === 'wisdom').length
    );
    expect(markup).toContain('"@type":"ProfilePage"');
  });

  it('changes rendered counts when the fixture response changes', () => {
    const fixture = clonedFixture();
    fixture.profile.activeTasks.push({
      id: 'task_dynamic_claim',
      title: 'Fixture-mutated claim',
      teamId: 'team_1777834718247_unr35n',
      teamName: 'HoloScript Core',
      priority: 3,
    });
    fixture.receipts.receipts.push({
      taskId: 'task_dynamic_done',
      title: 'Fixture-mutated done-log row',
      completedBy: 'Codex Hardware',
      completedAt: '2026-05-26T02:45:00.000Z',
      taskType: 'test',
      summary: 'Mutation proves rendered count follows the API fixture.',
      commit: null,
    });
    fixture.profile.contributions.push({
      ...fixture.profile.contributions[0],
      id: 'P.dynamic.005',
      type: 'pattern',
      content: 'A mutated fixture entry must change the rendered graduated-knowledge count.',
    });

    const { markup } = renderFixture(fixture);

    expect(getRenderedCount(markup, 'data-profile-count', 'claims')).toBe(3);
    expect(getRenderedCount(markup, 'data-profile-count', 'done-log')).toBe(4);
    expect(getRenderedCount(markup, 'data-profile-count', 'knowledge')).toBe(5);
    expect(getRenderedCount(markup, 'data-knowledge-count', 'patterns')).toBe(2);
  });
});
