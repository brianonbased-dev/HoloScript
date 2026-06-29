import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  VISUAL_PROJECTION_SCHEMA_VERSION,
  createVisualRemixSeed,
  validateVisualProjectionManifest,
  type VisualProjectionManifest,
} from '../projection';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..', '..');

const baseProjection: VisualProjectionManifest = {
  schemaVersion: VISUAL_PROJECTION_SCHEMA_VERSION,
  pluginId: 'customer-success',
  projectionId: 'customer-success.base-room',
  displayName: 'Customer Success Base Room',
  sourcePackage: '@holoscript/plugin-customer-success',
  summary: 'A remixable room with account panels, health flags, and next-action verbs.',
  defaultScene: {
    id: 'customer-room',
    template: 'dashboard',
    title: 'Customer Room',
    viewport: ['2d', '3d', 'xr'],
    slots: ['accounts', 'actions', 'receipts'],
  },
  objectMappings: [
    {
      id: 'account-card',
      sourceTrait: 'account_health',
      visualRole: 'customer account status',
      primitive: 'card',
      affordances: ['inspect', 'prioritize'],
    },
  ],
  panelMappings: [
    {
      id: 'account-detail-panel',
      title: 'Account Detail',
      layout: 'detail',
      source: 'account-card',
      fields: ['name', 'health', 'risk', 'nextAction'],
    },
  ],
  interactions: [
    {
      verb: 'inspect_account',
      label: 'Inspect Account',
      target: 'account-card',
      agentAction: 'summarize account health and recommend next action',
      receiptKey: 'account.inspect',
    },
  ],
  remixPrompts: [
    {
      id: 'enterprise-war-room',
      audience: 'agent',
      prompt: 'Remix this into an enterprise customer-success war room.',
      guardrails: ['keep private fields behind an access panel'],
    },
  ],
};

function readProjection(relativePath: string): VisualProjectionManifest {
  const absolutePath = path.join(repoRoot, relativePath);
  return JSON.parse(readFileSync(absolutePath, 'utf8')) as VisualProjectionManifest;
}

describe('visual projection contract', () => {
  it('validates a plugin-owned remixable base visual', () => {
    const result = validateVisualProjectionManifest(baseProjection);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('turns a projection into an agent remix seed', () => {
    const seed = createVisualRemixSeed(baseProjection);
    expect(seed.pluginId).toBe('customer-success');
    expect(seed.scene.template).toBe('dashboard');
    expect(seed.objects.map((object) => object.id)).toContain('account-card');
    expect(seed.interactions.map((interaction) => interaction.verb)).toContain('inspect_account');
  });

  it('rejects projections without a remix prompt', () => {
    const invalidProjection: VisualProjectionManifest = {
      ...baseProjection,
      remixPrompts: [],
    };

    const result = validateVisualProjectionManifest(invalidProjection);
    expect(result.valid).toBe(false);
    expect(result.errors.some((issue) => issue.path === 'remixPrompts')).toBe(true);
  });

  it('accepts the geolocation GIS plugin projection seed', () => {
    const projection = readProjection(
      'packages/plugins/geolocation-gis-plugin/visual.projection.json',
    );

    const result = validateVisualProjectionManifest(projection);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(createVisualRemixSeed(projection).scene.template).toBe('map');
  });
});
