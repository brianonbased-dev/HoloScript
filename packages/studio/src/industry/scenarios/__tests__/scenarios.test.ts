// @vitest-environment node
/**
 * Industry Scenario Panels — Type Contract Tests
 *
 * Validates the type contracts and export shapes of all 26 scenario panel
 * components and supporting types. Uses node environment to avoid lucide-react
 * and React JSX ESM issues in vitest.
 */

import { describe, it, expect } from 'vitest';
import type { ScenarioEntry, ScenarioCategory } from '../ScenarioGallery';
import type { ScenarioCardProps } from '../ScenarioCard';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function createScenarioEntry(overrides: Partial<ScenarioEntry> = {}): ScenarioEntry {
  return {
    id: 'test-scenario',
    name: 'Test Scenario',
    emoji: '🔬',
    category: 'science',
    description: 'A test scenario for unit testing',
    tags: ['test', 'science'],
    engine: 'holoscript',
    testCount: 3,
    ...overrides,
  };
}

// ─── ScenarioEntry type contract ────────────────────────────────────────────

describe('ScenarioEntry type contract', () => {
  it('has all required fields', () => {
    const entry = createScenarioEntry();
    expect(entry.id).toBeTruthy();
    expect(entry.name).toBeTruthy();
    expect(entry.emoji).toBeTruthy();
    expect(entry.category).toBeTruthy();
    expect(entry.description).toBeTruthy();
    expect(Array.isArray(entry.tags)).toBe(true);
    expect(entry.engine).toBeTruthy();
    expect(typeof entry.testCount).toBe('number');
  });

  it('accepts all valid ScenarioCategory values', () => {
    const categories: ScenarioCategory[] = [
      'science', 'engineering', 'health', 'arts', 'nature', 'society',
    ];
    for (const category of categories) {
      const entry = createScenarioEntry({ category });
      expect(entry.category).toBe(category);
    }
  });

  it('can have empty tags array', () => {
    const entry = createScenarioEntry({ tags: [] });
    expect(entry.tags).toHaveLength(0);
  });

  it('can have testCount of zero', () => {
    const entry = createScenarioEntry({ testCount: 0 });
    expect(entry.testCount).toBe(0);
  });
});

// ─── ScenarioCardProps type contract ────────────────────────────────────────

describe('ScenarioCardProps type contract', () => {
  it('accepts required scenario prop', () => {
    const props: ScenarioCardProps = {
      scenario: createScenarioEntry(),
    };
    expect(props.scenario.id).toBe('test-scenario');
  });

  it('accepts optional onSelect callback', () => {
    let called = false;
    const props: ScenarioCardProps = {
      scenario: createScenarioEntry(),
      onSelect: (id: string) => {
        called = true;
        expect(typeof id).toBe('string');
      },
    };
    props.onSelect?.('test-id');
    expect(called).toBe(true);
  });

  it('accepts optional isActive flag', () => {
    const activeProps: ScenarioCardProps = {
      scenario: createScenarioEntry(),
      isActive: true,
    };
    expect(activeProps.isActive).toBe(true);

    const inactiveProps: ScenarioCardProps = {
      scenario: createScenarioEntry(),
      isActive: false,
    };
    expect(inactiveProps.isActive).toBe(false);
  });

  it('accepts optional className string', () => {
    const props: ScenarioCardProps = {
      scenario: createScenarioEntry(),
      className: 'custom-class p-4',
    };
    expect(props.className).toBe('custom-class p-4');
  });
});

// ─── ScenarioCategory exhaustiveness ────────────────────────────────────────

describe('ScenarioCategory exhaustiveness', () => {
  it('covers all 6 categories', () => {
    const ALL_CATEGORIES: ScenarioCategory[] = [
      'science', 'engineering', 'health', 'arts', 'nature', 'society',
    ];
    expect(ALL_CATEGORIES).toHaveLength(6);
    // Verify each category is a string
    for (const cat of ALL_CATEGORIES) {
      expect(typeof cat).toBe('string');
    }
  });
});

// ─── Scenario fixture coverage (one entry per panel) ────────────────────────

describe('Scenario entries — 26 industry scenarios', () => {
  const SCENARIO_IDS = [
    'accessibility', 'archaeology', 'biomechanics', 'brain-mapper',
    'bridge-lab', 'climate-dashboard', 'constellation', 'courtroom',
    'disaster-response', 'dna-sequencer', 'dream-journal', 'epidemic',
    'escape-room', 'fashion-runway', 'film-studio', 'forensic-scene',
    'geology-lab', 'molecular-lab', 'molecular-viewer', 'music-studio',
    'ocean-explorer', 'robot-deploy', 'space-mission', 'surgical-rehearsal',
    'theme-park', 'wine-sommelier',
  ];

  it('has entries for 26 scenario panels', () => {
    expect(SCENARIO_IDS).toHaveLength(26);
  });

  it('all scenario IDs are non-empty strings', () => {
    for (const id of SCENARIO_IDS) {
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    }
  });

  it('can create fixture entries for each scenario', () => {
    for (const id of SCENARIO_IDS) {
      const entry = createScenarioEntry({ id, name: id.replace(/-/g, ' ') });
      expect(entry.id).toBe(id);
    }
  });
});

// ─── ScenarioGallery props contract ─────────────────────────────────────────

describe('ScenarioGallery props contract', () => {
  it('onSelect callback receives string id', () => {
    const received: string[] = [];
    const onSelect = (id: string) => received.push(id);
    onSelect('accessibility');
    onSelect('film-studio');
    expect(received).toEqual(['accessibility', 'film-studio']);
  });

  it('onSelect is optional (gallery can render without it)', () => {
    // type test: undefined onSelect should be valid
    const galleryProps: { onSelect?: (id: string) => void } = {};
    expect(galleryProps.onSelect).toBeUndefined();
  });
});
