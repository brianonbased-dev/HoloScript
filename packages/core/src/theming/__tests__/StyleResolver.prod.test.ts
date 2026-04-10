/**
 * StyleResolver Production Tests
 * Sprint CLIII - CSS-like style resolution with cascading specificity
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StyleResolver } from '../StyleResolver';
import { BuiltInThemes } from '../ThemeEngine';

describe('StyleResolver', () => {
  let resolver: StyleResolver;

  beforeEach(() => {
    resolver = new StyleResolver();
  });

  // -------------------------------------------------------------------------
  // addRule / ruleCount
  // -------------------------------------------------------------------------

  describe('addRule', () => {
    it('adds a rule and updates ruleCount', () => {
      resolver.addRule('button', { backgroundColor: 'red' });
      expect(resolver.ruleCount).toBe(1);
    });

    it('accumulates multiple rules', () => {
      resolver.addRule('button', { color: 'white' });
      resolver.addRule('panel', { padding: 4 });
      expect(resolver.ruleCount).toBe(2);
    });
  });

  describe('addRules', () => {
    it('adds an array of rules', () => {
      resolver.addRules([
        { selector: 'button', properties: { color: 'white' } },
        { selector: 'panel', properties: { padding: 8 } },
      ]);
      expect(resolver.ruleCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // resolve - base type
  // -------------------------------------------------------------------------

  describe('resolve - type selector', () => {
    it('applies type rules', () => {
      resolver.addRule('button', { backgroundColor: '#6C63FF', fontSize: 12 });
      const style = resolver.resolve('button');
      expect(style.backgroundColor).toBe('#6C63FF');
      expect(style.fontSize).toBe(12);
    });

    it('returns empty object when no rules match', () => {
      const style = resolver.resolve('unknown-type');
      expect(Object.keys(style)).toHaveLength(0);
    });

    it('later rules override earlier ones', () => {
      resolver.addRule('button', { color: 'red' });
      resolver.addRule('button', { color: 'blue' });
      const style = resolver.resolve('button');
      expect(style.color).toBe('blue');
    });
  });

  // -------------------------------------------------------------------------
  // resolve - class selector
  // -------------------------------------------------------------------------

  describe('resolve - class selector', () => {
    it('applies class rules when class matches', () => {
      resolver.addRule('button', { backgroundColor: 'grey' });
      resolver.addRule('.primary', { backgroundColor: 'purple' });
      const style = resolver.resolve('button', ['primary']);
      expect(style.backgroundColor).toBe('purple'); // class overrides type
    });

    it('class rules have higher specificity than type', () => {
      resolver.addRule('button', { opacity: 1.0 });
      resolver.addRule('.disabled', { opacity: 0.4 });
      const style = resolver.resolve('button', ['disabled']);
      expect(style.opacity).toBe(0.4);
    });

    it('applies multiple classes in order', () => {
      resolver.addRule('.a', { color: 'red' });
      resolver.addRule('.b', { color: 'blue' });
      const style = resolver.resolve('div', ['a', 'b']);
      expect(style.color).toBe('blue'); // last class wins
    });

    it('ignores classes that have no rules', () => {
      resolver.addRule('button', { color: 'white' });
      const style = resolver.resolve('button', ['nonexistent']);
      expect(style.color).toBe('white'); // type rule still applied
    });
  });

  // -------------------------------------------------------------------------
  // resolve - state selector
  // -------------------------------------------------------------------------

  describe('resolve - state selectors', () => {
    it('applies state rules', () => {
      resolver.addRule('button', { opacity: 1.0 });
      resolver.addRule('button:hover', { opacity: 0.8 });
      const style = resolver.resolve('button', [], ['hover']);
      expect(style.opacity).toBe(0.8);
    });

    it('applies multiple states in order', () => {
      resolver.addRule('button:hover', { scale: 1.05 });
      resolver.addRule('button:active', { scale: 0.95 });
      const style = resolver.resolve('button', [], ['hover', 'active']);
      expect(style.scale).toBe(0.95); // active overrides hover
    });

    it('state rules use type:state selector format', () => {
      // 'panel:open' should match only 'panel' type, not 'button'
      resolver.addRule('panel:open', { display: 'flex' });
      const panel = resolver.resolve('panel', [], ['open']);
      const button = resolver.resolve('button', [], ['open']);
      expect(panel.display).toBe('flex');
      expect(button.display).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // resolve - inline styles
  // -------------------------------------------------------------------------

  describe('resolve - inline styles', () => {
    it('inline styles override all other rules', () => {
      resolver.addRule('button', { color: 'white' });
      resolver.addRule('.primary', { color: 'blue' });
      resolver.addRule('button:hover', { color: 'green' });
      const style = resolver.resolve('button', ['primary'], ['hover'], { color: 'yellow' });
      expect(style.color).toBe('yellow');
    });

    it('inline styles are merged with other properties', () => {
      resolver.addRule('button', { fontSize: 14 });
      const style = resolver.resolve('button', [], [], { color: 'red' });
      expect(style.fontSize).toBe(14);
      expect(style.color).toBe('red');
    });
  });

  // -------------------------------------------------------------------------
  // resolve - full cascade order
  // -------------------------------------------------------------------------

  describe('resolve - full cascade specificity', () => {
    it('respects: type → class → state → inline', () => {
      const history: string[] = [];

      resolver.addRule('el', { src: 'type' });
      resolver.addRule('.cls', { src: 'class' });
      resolver.addRule('el:focus', { src: 'state' });

      const withType = resolver.resolve('el');
      expect(withType.src).toBe('type');

      const withClass = resolver.resolve('el', ['cls']);
      expect(withClass.src).toBe('class');

      const withState = resolver.resolve('el', [], ['focus']);
      expect(withState.src).toBe('state');

      const withInline = resolver.resolve('el', ['cls'], ['focus'], { src: 'inline' });
      expect(withInline.src).toBe('inline');
    });
  });

  // -------------------------------------------------------------------------
  // fromTokens static factory
  // -------------------------------------------------------------------------

  describe('fromTokens', () => {
    it('creates a resolver with default theme token rules', () => {
      const themed = StyleResolver.fromTokens(BuiltInThemes.dark.tokens);
      expect(themed.ruleCount).toBeGreaterThan(0);
    });

    it('button type resolves with primary background color', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('button');
      expect(style.backgroundColor).toBe(tokens.colors.primary);
    });

    it('button:hover state resolves opacity', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('button', [], ['hover']);
      expect(style.opacity).toBe(tokens.opacity.hover);
    });

    it('button:pressed applies pressed opacity', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('button', [], ['pressed']);
      expect(style.opacity).toBe(tokens.opacity.pressed);
    });

    it('button:disabled applies disabled opacity', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('button', [], ['disabled']);
      expect(style.opacity).toBe(tokens.opacity.disabled);
    });

    it('.primary class overrides to primary color', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('button', ['primary']);
      expect(style.backgroundColor).toBe(tokens.colors.primary);
    });

    it('.danger class applies error color', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('button', ['danger']);
      expect(style.backgroundColor).toBe(tokens.colors.error);
    });

    it('.success class applies success color', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('button', ['success']);
      expect(style.backgroundColor).toBe(tokens.colors.success);
    });

    it('panel type resolves with surface background', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('panel');
      expect(style.backgroundColor).toBe(tokens.colors.surface);
    });

    it('text type resolves with text color', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('text');
      expect(style.color).toBe(tokens.colors.text);
    });

    it('input type resolves border color', () => {
      const tokens = BuiltInThemes.dark.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('input');
      expect(style.borderColor).toBe(tokens.colors.border);
    });

    it('light theme resolver also works correctly', () => {
      const tokens = BuiltInThemes.light.tokens;
      const themed = StyleResolver.fromTokens(tokens);
      const style = themed.resolve('button');
      expect(style.backgroundColor).toBe(tokens.colors.primary);
    });
  });
});
