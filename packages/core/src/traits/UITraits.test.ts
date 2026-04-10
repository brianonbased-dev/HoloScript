import { describe, it, expect } from 'vitest';
import {
  validateUITrait,
  registerUITrait,
  getUITrait,
  getAllUITraits,
  UITraitHandler,
  UITraitContext,
} from './UITraits';

describe('UITraits', () => {
  describe('Validation', () => {
    it('should validate ui_floating config', () => {
      expect(validateUITrait('ui_floating', { distance: 1.5, follow_delay: 0.1 }).valid).toBe(true);

      const invalidDist = validateUITrait('ui_floating', { distance: -1 });
      expect(invalidDist.valid).toBe(false);
      expect(invalidDist.errors).toContain('distance must be a positive number');

      const invalidDelay = validateUITrait('ui_floating', { follow_delay: -0.1 });
      expect(invalidDelay.valid).toBe(false);
      expect(invalidDelay.errors).toContain('follow_delay must be a non-negative number');
    });

    it('should validate ui_anchored config', () => {
      expect(validateUITrait('ui_anchored', { to: 'head' }).valid).toBe(true);

      const missingTo = validateUITrait('ui_anchored', {});
      expect(missingTo.valid).toBe(false);
      expect(missingTo.errors).toContain("ui_anchored requires 'to' parameter");
    });

    it('should validate ui_hand_menu config', () => {
      expect(validateUITrait('ui_hand_menu', { hand: 'left' }).valid).toBe(true);

      const invalidHand = validateUITrait('ui_hand_menu', { hand: 'foot' });
      expect(invalidHand.valid).toBe(false);
      expect(invalidHand.errors).toContain("hand must be 'left', 'right', or 'dominant'");
    });

    it('should validate ui_docked config', () => {
      expect(validateUITrait('ui_docked', { position: 'top-left' }).valid).toBe(true);

      const invalidPos = validateUITrait('ui_docked', { position: 'center' });
      expect(invalidPos.valid).toBe(false);
      expect(invalidPos.errors[0]).toContain('position must be one of');
    });
  });

  describe('Registration', () => {
    it('should register and retrieve trait handlers', () => {
      const handler: UITraitHandler<any> = {
        name: 'ui_custom',
        defaultConfig: {},
        validate: () => ({ valid: true, errors: [] }),
      };

      registerUITrait(handler);
      expect(getUITrait('ui_custom' as any)).toBe(handler);
      expect(getAllUITraits()).toContain('ui_custom');
    });
  });
});
