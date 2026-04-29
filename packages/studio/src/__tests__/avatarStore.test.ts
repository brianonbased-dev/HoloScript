/**
 * avatarStore.test.ts
 *
 * Unit tests for the avatar Zustand store in src/lib/stores/avatarStore.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  useAvatarStore,
  AVATAR_PARTS,
  getPartById,
  getPartsByType,
  getActiveTraits,
  exportAvatarConfig,
} from '@/lib/stores/avatarStore';

function resetStore() {
  useAvatarStore.getState().reset();
}

describe('avatarStore — initial state', () => {
  beforeEach(resetStore);

  it('has default parts selected', () => {
    const config = useAvatarStore.getState().config;
    expect(config.head).toBe('head-round');
    expect(config.body).toBe('body-standard');
    expect(config.hair).toBe('hair-short');
    expect(config.eyes).toBe('eyes-round');
    expect(config.mouth).toBe('mouth-smile');
  });

  it('has default clothing', () => {
    const config = useAvatarStore.getState().config;
    expect(config.clothing).toEqual(['shirt-tshirt', 'pants-jeans', 'shoes-sneakers']);
  });

  it('starts with no accessories', () => {
    expect(useAvatarStore.getState().config.accessories).toEqual([]);
  });

  it('starts at scale 1.0', () => {
    expect(useAvatarStore.getState().config.scale).toBe(1.0);
  });
});

describe('avatarStore — setPart', () => {
  beforeEach(resetStore);

  it('sets a part and adds its default color', () => {
    useAvatarStore.getState().setPart('head', 'head-square');
    const config = useAvatarStore.getState().config;
    expect(config.head).toBe('head-square');
    expect(config.colors['head-square']).toBe('#e8beac');
  });

  it('clears a part when null is passed', () => {
    useAvatarStore.getState().setPart('hair', null);
    expect(useAvatarStore.getState().config.hair).toBeNull();
  });
});

describe('avatarStore — clothing', () => {
  beforeEach(resetStore);

  it('adds clothing with default color', () => {
    useAvatarStore.getState().addClothing('shirt-hoodie');
    const config = useAvatarStore.getState().config;
    expect(config.clothing).toContain('shirt-hoodie');
    expect(config.colors['shirt-hoodie']).toBe('#808080');
  });

  it('removes clothing and its color', () => {
    useAvatarStore.getState().addClothing('shirt-hoodie');
    useAvatarStore.getState().removeClothing('shirt-hoodie');
    const config = useAvatarStore.getState().config;
    expect(config.clothing).not.toContain('shirt-hoodie');
    expect(config.colors['shirt-hoodie']).toBeUndefined();
  });
});

describe('avatarStore — accessories', () => {
  beforeEach(resetStore);

  it('adds accessory with default color', () => {
    useAvatarStore.getState().addAccessory('acc-glasses');
    const config = useAvatarStore.getState().config;
    expect(config.accessories).toContain('acc-glasses');
    expect(config.colors['acc-glasses']).toBe('#333333');
  });

  it('removes accessory and its color', () => {
    useAvatarStore.getState().addAccessory('acc-glasses');
    useAvatarStore.getState().removeAccessory('acc-glasses');
    const config = useAvatarStore.getState().config;
    expect(config.accessories).not.toContain('acc-glasses');
    expect(config.colors['acc-glasses']).toBeUndefined();
  });
});

describe('avatarStore — color and scale', () => {
  beforeEach(resetStore);

  it('sets part color', () => {
    useAvatarStore.getState().setPartColor('head-round', '#ff0000');
    expect(useAvatarStore.getState().config.colors['head-round']).toBe('#ff0000');
  });

  it('clamps scale to [0.5, 2.0]', () => {
    useAvatarStore.getState().setScale(3.0);
    expect(useAvatarStore.getState().config.scale).toBe(2.0);
    useAvatarStore.getState().setScale(0.1);
    expect(useAvatarStore.getState().config.scale).toBe(0.5);
  });
});

describe('avatarStore — reset', () => {
  it('restores defaults after mutation', () => {
    useAvatarStore.getState().setPart('head', 'head-square');
    useAvatarStore.getState().setScale(1.5);
    useAvatarStore.getState().addAccessory('acc-glasses');
    useAvatarStore.getState().reset();

    const config = useAvatarStore.getState().config;
    expect(config.head).toBe('head-round');
    expect(config.scale).toBe(1.0);
    expect(config.accessories).toEqual([]);
  });
});

describe('avatarStore — helpers', () => {
  it('getPartById finds existing parts', () => {
    const part = getPartById('head-round');
    expect(part).toBeDefined();
    expect(part?.name).toBe('Round Head');
  });

  it('getPartById returns undefined for unknown id', () => {
    expect(getPartById('nonexistent')).toBeUndefined();
  });

  it('getPartsByType filters correctly', () => {
    const heads = getPartsByType('head');
    expect(heads.length).toBeGreaterThan(0);
    expect(heads.every((p) => p.type === 'head')).toBe(true);
  });

  it('getActiveTraits aggregates traits', () => {
    const config = useAvatarStore.getState().config;
    const traits = getActiveTraits(config);
    expect(traits.length).toBeGreaterThan(0);
    expect(traits).toContain('round_face');
    expect(traits).toContain('standard_body');
  });

  it('exportAvatarConfig produces valid structure', () => {
    const config = useAvatarStore.getState().config;
    const exported = exportAvatarConfig(config);
    expect(exported).toHaveProperty('version', '1.0');
    expect(exported).toHaveProperty('parts');
    expect(exported).toHaveProperty('colors');
    expect(exported).toHaveProperty('scale');
    expect(exported).toHaveProperty('traits');
    expect(exported).toHaveProperty('exportedAt');
  });
});
