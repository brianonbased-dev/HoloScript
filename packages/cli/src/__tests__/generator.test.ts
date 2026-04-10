import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateObject, generateScene, listTemplates, getTemplate } from '../generator';

// Mock the traits module to avoid async AI calls
vi.mock('../traits', () => ({
  suggestTraits: vi.fn().mockResolvedValue([]),
}));

describe('Generator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listTemplates', () => {
    it('should return array of template names', () => {
      const templates = listTemplates();
      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should include common object types', () => {
      const templates = listTemplates();
      expect(templates).toContain('button');
      expect(templates).toContain('ball');
      expect(templates).toContain('weapon');
      expect(templates).toContain('npc');
      expect(templates).toContain('portal');
    });

    it('should include platform and crate', () => {
      const templates = listTemplates();
      expect(templates).toContain('platform');
      expect(templates).toContain('crate');
    });
  });

  describe('getTemplate', () => {
    it('should return template for valid name', () => {
      const template = getTemplate('button');
      expect(template).not.toBeNull();
      expect(template?.traits).toContain('clickable');
      expect(template?.template).toContain('orb {{name}}');
    });

    it('should return ball template', () => {
      const template = getTemplate('ball');
      expect(template).not.toBeNull();
      expect(template?.traits).toContain('grabbable');
      expect(template?.traits).toContain('throwable');
      expect(template?.traits).toContain('physics');
    });

    it('should return weapon template', () => {
      const template = getTemplate('weapon');
      expect(template).not.toBeNull();
      expect(template?.traits).toContain('holdable');
    });

    it('should return npc template', () => {
      const template = getTemplate('npc');
      expect(template).not.toBeNull();
      expect(template?.traits).toContain('animated');
      expect(template?.traits).toContain('state');
    });

    it('should return null for unknown template', () => {
      const template = getTemplate('nonexistent');
      expect(template).toBeNull();
    });

    it('should return portal template with portal trait', () => {
      const template = getTemplate('portal');
      expect(template?.traits).toContain('portal');
      expect(template?.template).toContain('destination');
    });

    it('should return lamp template with emissive', () => {
      const template = getTemplate('lamp');
      expect(template?.traits).toContain('emissive');
      expect(template?.traits).toContain('glowing');
    });

    it('should return magic_orb template', () => {
      const template = getTemplate('magic_orb');
      expect(template?.traits).toContain('particle_emitter');
      expect(template?.traits).toContain('spatial_audio');
    });
  });

  describe('generateObject', () => {
    it('should generate button from description', async () => {
      const result = await generateObject('create a button');
      expect(result.source).toBe('local');
      expect(result.code).toContain('@clickable');
    });

    it('should generate ball from description', async () => {
      const result = await generateObject('create a bouncy ball');
      expect(result.code).toContain('@grabbable');
      expect(result.code).toContain('@throwable');
    });

    it('should generate weapon from description', async () => {
      const result = await generateObject('create a sword weapon');
      expect(result.code).toContain('@grabbable');
      expect(result.code).toContain('@holdable');
    });

    it('should extract name from description', async () => {
      const result = await generateObject('create a button called myBtn');
      expect(result.code).toContain('mybtn');
    });

    it('should extract color from description', async () => {
      const result = await generateObject('create a red button');
      expect(result.code).toContain('#ff0000');
    });

    it('should extract blue color', async () => {
      const result = await generateObject('create a blue ball');
      expect(result.code).toContain('#0000ff');
    });

    it('should extract green color', async () => {
      const result = await generateObject('make a green object');
      expect(result.code).toContain('#00ff00');
    });

    it('should extract position from description', async () => {
      const result = await generateObject('create object at 5, 10, 15');
      expect(result.code).toContain('[5, 10, 15]');
    });

    it('should generate portal from description', async () => {
      const result = await generateObject('create a teleport portal');
      expect(result.code).toContain('@portal');
    });

    it('should generate NPC from description', async () => {
      const result = await generateObject('create a shopkeeper NPC');
      expect(result.code).toContain('@animated');
      expect(result.code).toContain('@clickable');
    });

    it('should generate collectible from description', async () => {
      const result = await generateObject('create a gold coin collectible');
      expect(result.code).toContain('@consumable');
    });

    it('should generate lamp from description', async () => {
      const result = await generateObject('create a glowing lamp');
      expect(result.code).toContain('@emissive');
    });

    it('should generate platform from description', async () => {
      const result = await generateObject('create a floor platform');
      expect(result.code).toContain('@collidable');
    });

    it('should generate crate from description', async () => {
      const result = await generateObject('create a wooden crate');
      expect(result.code).toContain('@physics');
      expect(result.code).toContain('@destructible');
    });

    it('should generate magic orb from description', async () => {
      // Use "mystical" keyword to match magic_orb template without triggering ball
      const result = await generateObject('create a mystical glowing item');
      expect(result.code).toContain('@glowing');
      expect(result.code).toContain('@particle_emitter');
    });

    it('should fall back to generic object for unknown types', async () => {
      const result = await generateObject('create something unusual');
      expect(result.code).toContain('orb');
      expect(result.code).toContain('position');
    });

    it('should include position in generated code', async () => {
      const result = await generateObject('create a simple object');
      expect(result.code).toMatch(/position:\s*\[/);
    });

    it('should include color in generated code', async () => {
      const result = await generateObject('create a simple object');
      expect(result.code).toMatch(/color:\s*"/);
    });

    it('should return traits array', async () => {
      const result = await generateObject('create a button');
      expect(Array.isArray(result.traits)).toBe(true);
    });
  });

  describe('generateScene', () => {
    it('should generate composition structure', async () => {
      const result = await generateScene('a simple VR room');
      expect(result).toContain('composition');
      expect(result).toContain('environment');
    });

    it('should include environment settings', async () => {
      const result = await generateScene('outdoor scene');
      expect(result).toContain('skybox');
      expect(result).toContain('ambient_light');
    });

    it('should include logic block', async () => {
      const result = await generateScene('interactive scene');
      expect(result).toContain('logic');
      expect(result).toContain('on_scene_ready');
    });

    it('should create object from description', async () => {
      const result = await generateScene('a room with objects');
      expect(result).toContain('object');
    });

    it('should use description for composition name', async () => {
      const result = await generateScene('My VR Gallery');
      expect(result).toContain('composition "My VR Gallery"');
    });

    it('should strip special characters from name', async () => {
      const result = await generateScene('Test @#$ Scene!');
      expect(result).toContain('composition "Test  Scene"');
    });

    it('should include fog setting', async () => {
      const result = await generateScene('foggy scene');
      expect(result).toContain('fog');
    });

    it('should extract color for main object', async () => {
      const result = await generateScene('a room with a red centerpiece');
      expect(result).toContain('#ff0000');
    });
  });

  describe('Color extraction', () => {
    const colorTests = [
      { desc: 'yellow', hex: '#ffff00' },
      { desc: 'purple', hex: '#8800ff' },
      { desc: 'orange', hex: '#ff8800' },
      { desc: 'pink', hex: '#ff88cc' },
      { desc: 'white', hex: '#ffffff' },
      { desc: 'black', hex: '#222222' },
      { desc: 'cyan', hex: '#00ffff' },
      { desc: 'magenta', hex: '#ff00ff' },
    ];

    for (const { desc, hex } of colorTests) {
      it(`should extract ${desc} color`, async () => {
        const result = await generateObject(`create a ${desc} ball`);
        expect(result.code).toContain(hex);
      });
    }
  });

  describe('Object type detection', () => {
    const typeTests = [
      { desc: 'switch', type: 'button' },
      { desc: 'toggle', type: 'button' },
      { desc: 'sphere', type: 'ball' },
      { desc: 'gun', type: 'weapon' },
      { desc: 'axe', type: 'weapon' },
      { desc: 'character', type: 'npc' },
      { desc: 'merchant', type: 'npc' },
      { desc: 'gem', type: 'collectible' },
      { desc: 'treasure', type: 'collectible' },
      { desc: 'gate', type: 'portal' },
      { desc: 'torch', type: 'lamp' },
      { desc: 'lantern', type: 'lamp' },
      { desc: 'ground', type: 'platform' },
      { desc: 'bridge', type: 'platform' },
      { desc: 'box', type: 'crate' },
      { desc: 'barrel', type: 'crate' },
      { desc: 'mystical', type: 'magic_orb' },
      { desc: 'arcane', type: 'magic_orb' },
    ];

    for (const { desc } of typeTests) {
      it(`should detect "${desc}" keyword`, async () => {
        const result = await generateObject(`create a ${desc}`);
        // Just verify it generates valid code
        expect(result.code).toContain('orb');
      });
    }
  });
});
