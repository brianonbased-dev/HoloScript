import { describe, it, expect, beforeEach } from 'vitest';
import { StyleResolver } from '../StyleResolver';

describe('StyleResolver', () => {
  let resolver: StyleResolver;

  beforeEach(() => {
    resolver = new StyleResolver();
  });

  it('addRule and ruleCount', () => {
    resolver.addRule('button', { bg: 'blue' });
    expect(resolver.ruleCount).toBe(1);
  });

  it('addRules adds multiple', () => {
    resolver.addRules([
      { selector: 'panel', properties: { bg: 'gray' } },
      { selector: 'button', properties: { bg: 'blue' } },
    ]);
    expect(resolver.ruleCount).toBe(2);
  });

  // Base type resolution
  it('resolve returns type styles', () => {
    resolver.addRule('button', { bg: 'blue', color: 'white' });
    const style = resolver.resolve('button');
    expect(style.bg).toBe('blue');
    expect(style.color).toBe('white');
  });

  // Class resolution (higher specificity than type)
  it('resolve applies class overrides', () => {
    resolver.addRule('button', { bg: 'blue' });
    resolver.addRule('.primary', { bg: 'green' });
    const style = resolver.resolve('button', ['primary']);
    expect(style.bg).toBe('green');
  });

  // State resolution (type:state)
  it('resolve applies state styles', () => {
    resolver.addRule('button', { opacity: 1 });
    resolver.addRule('button:hover', { opacity: 0.8 });
    const style = resolver.resolve('button', [], ['hover']);
    expect(style.opacity).toBe(0.8);
  });

  // Inline override (highest specificity)
  it('resolve applies inline as highest priority', () => {
    resolver.addRule('button', { bg: 'blue' });
    const style = resolver.resolve('button', [], [], { bg: 'red' });
    expect(style.bg).toBe('red');
  });

  // Cascading order: type < class < state < inline
  it('full cascade resolves in order', () => {
    resolver.addRule('button', { bg: 'type', color: 'type' });
    resolver.addRule('.primary', { bg: 'class' });
    resolver.addRule('button:hover', { bg: 'state' });
    const style = resolver.resolve('button', ['primary'], ['hover'], {});
    expect(style.bg).toBe('state'); // state overrides class → type
    expect(style.color).toBe('type'); // only type
  });

  // No matching rules
  it('resolve returns empty for unmatched type', () => {
    const style = resolver.resolve('unknown');
    expect(Object.keys(style)).toHaveLength(0);
  });

  // Multiple classes
  it('resolve applies multiple classes in order', () => {
    resolver.addRule('.a', { x: 'a' });
    resolver.addRule('.b', { x: 'b', y: 'b' });
    const style = resolver.resolve('div', ['a', 'b']);
    expect(style.x).toBe('b'); // last class wins
    expect(style.y).toBe('b');
  });

  // fromTokens static factory
  it('fromTokens creates resolver with default rules', () => {
    const tokens = {
      colors: {
        primary: '#0a0',
        secondary: '#00a',
        background: '#fff',
        surface: '#eee',
        text: '#000',
        border: '#ccc',
        error: '#f00',
        success: '#0f0',
        warning: '#ff0',
        info: '#0ff',
      },
      spacing: { xs: 2, sm: 4, md: 8, lg: 16, xl: 24 },
      fontSize: { xs: 10, sm: 12, md: 14, lg: 18, xl: 24 },
      borderRadius: { sm: 2, md: 4, lg: 8, full: 9999 },
      opacity: { hover: 0.8, pressed: 0.6, disabled: 0.4 },
    };
    const r = StyleResolver.fromTokens(tokens);
    expect(r.ruleCount).toBeGreaterThan(0);
    const btn = r.resolve('button');
    expect(btn.backgroundColor).toBe('#0a0');
  });
});
