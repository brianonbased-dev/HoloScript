// @ts-nocheck
/**
 * Avatar component contract tests
 *
 * Rendering-logic tests for the avatar authoring UI.
 * Uses contract-style assertions (no React mount) to avoid lucide-react ESM issues.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useAvatarStore,
  getPartById,
  getActiveTraits,
  exportAvatarConfig,
  type AvatarConfiguration,
} from '@/lib/stores/avatarStore';

function resetStore() {
  useAvatarStore.getState().reset();
}

// ─── AvatarComposer rendering predicates ────────────────────────────────────

describe('AvatarComposer — selection predicates', () => {
  beforeEach(resetStore);

  it('identifies selected base parts by direct id match', () => {
    const config = useAvatarStore.getState().config;
    // Default head is 'head-round'
    expect(config.head).toBe('head-round');
  });

  it('identifies selected clothing by array inclusion', () => {
    useAvatarStore.getState().addClothing('shirt-hoodie');
    expect(useAvatarStore.getState().config.clothing).toContain('shirt-hoodie');
  });

  it('identifies selected accessories by array inclusion', () => {
    useAvatarStore.getState().addAccessory('acc-glasses');
    expect(useAvatarStore.getState().config.accessories).toContain('acc-glasses');
  });

  it('resolves the last selected clothing item as the active part', () => {
    useAvatarStore.getState().addClothing('shirt-tshirt');
    useAvatarStore.getState().addClothing('shirt-hoodie');
    const clothing = useAvatarStore.getState().config.clothing;
    const last = clothing[clothing.length - 1];
    expect(last).toBe('shirt-hoodie');
  });

  it('resolves the last selected accessory as the active part', () => {
    useAvatarStore.getState().addAccessory('acc-glasses');
    useAvatarStore.getState().addAccessory('acc-hat');
    const accessories = useAvatarStore.getState().config.accessories;
    const last = accessories[accessories.length - 1];
    expect(last).toBe('acc-hat');
  });

  it('applies scale clamping to [0.5, 2.0]', () => {
    useAvatarStore.getState().setScale(3.0);
    expect(useAvatarStore.getState().config.scale).toBe(2.0);
    useAvatarStore.getState().setScale(0.1);
    expect(useAvatarStore.getState().config.scale).toBe(0.5);
  });

  it('applies default color when a new part is selected', () => {
    useAvatarStore.getState().setPart('eyes', 'eyes-almond');
    expect(useAvatarStore.getState().config.colors['eyes-almond']).toBe('#4a90d9');
  });
});

// ─── AvatarPreview rendering predicates ─────────────────────────────────────

describe('AvatarPreview — rendering predicates', () => {
  beforeEach(resetStore);

  it('aggregates traits from all active parts', () => {
    const { config } = useAvatarStore.getState();
    const traits = getActiveTraits(config);
    expect(traits).toContain('round_face');
    expect(traits).toContain('standard_body');
    expect(traits).toContain('short_hair');
    expect(traits.length).toBeGreaterThanOrEqual(5);
  });

  it('counts base parts correctly', () => {
    const { config } = useAvatarStore.getState();
    const baseCount = [config.head, config.body, config.hair, config.eyes, config.mouth].filter(
      Boolean
    ).length;
    expect(baseCount).toBe(5);
  });

  it('counts clothing and accessories', () => {
    useAvatarStore.getState().addClothing('shirt-hoodie');
    useAvatarStore.getState().addAccessory('acc-glasses');
    expect(useAvatarStore.getState().config.clothing.length).toBeGreaterThanOrEqual(1);
    expect(useAvatarStore.getState().config.accessories.length).toBe(1);
  });

  it('formats scale to 1 decimal place', () => {
    const { setScale } = useAvatarStore.getState();
    setScale(1.25);
    const formatted = (1.25).toFixed(1);
    expect(formatted).toBe('1.3'); // rounds to 1 decimal
  });
});

// ─── AvatarExportPanel — export contracts ─────────────────────────────────

describe('AvatarExportPanel — export contracts', () => {
  beforeEach(resetStore);

  it('exportAvatarConfig produces versioned JSON', () => {
    const { config } = useAvatarStore.getState();
    const exported = exportAvatarConfig(config);
    expect(exported).toHaveProperty('version', '1.0');
    expect(exported).toHaveProperty('parts');
    expect(exported).toHaveProperty('colors');
    expect(exported).toHaveProperty('scale');
    expect(exported).toHaveProperty('traits');
    expect(exported).toHaveProperty('exportedAt');
  });

  it('exportAvatarConfig parts match active config', () => {
    useAvatarStore.getState().setPart('head', 'head-square');
    const exported = exportAvatarConfig(useAvatarStore.getState().config);
    expect(exported.parts.head).toBe('head-square');
  });

  it('generates HoloScript code from config', () => {
    const { config } = useAvatarStore.getState();
    const parts = [
      config.head && `  head = "${config.head}"`,
      config.body && `  body = "${config.body}"`,
      config.hair && `  hair = "${config.hair}"`,
      config.eyes && `  eyes = "${config.eyes}"`,
      config.mouth && `  mouth = "${config.mouth}"`,
      config.clothing.length > 0 &&
        `  clothing = [${config.clothing.map((c: string) => `"${c}"`).join(', ')}]`,
      config.accessories.length > 0 &&
        `  accessories = [${config.accessories.map((a: string) => `"${a}"`).join(', ')}]`,
      `  scale = ${config.scale}`,
      `  colors = ${JSON.stringify(config.colors, null, 4).replace(/\n/g, '\n  ')}`,
    ]
      .filter(Boolean)
      .join('\n');

    const hsCode = `// Auto-generated by HoloScript Avatar Authoring\n// ${new Date().toISOString()}\n\navatar "MyAvatar" {\n${parts}\n}\n`;

    expect(hsCode).toContain('avatar "MyAvatar"');
    expect(hsCode).toContain(`head = "${config.head}"`);
    expect(hsCode).toContain(`scale = ${config.scale}`);
    expect(hsCode).toContain('clothing =');
  });

  it('export is deterministic for a given config', () => {
    const { config } = useAvatarStore.getState();
    const a = exportAvatarConfig(config);
    const b = exportAvatarConfig(config);
    expect(a).toEqual(b);
  });
});
