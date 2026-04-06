/**
 * StyleResolver.ts
 *
 * Resolves CSS-like style rules for nodes based on type, class, and state.
 * Supports cascading specificity: base type → class → state → inline.
 */

import { ThemeTokens } from './ThemeEngine';

export interface StyleRule {
  selector: string; // e.g., 'button', '.primary', 'button:hover'
  properties: Record<string, any>;
}

export interface ResolvedStyle {
  [key: string]: unknown;
}

export class StyleResolver {
  private rules: StyleRule[] = [];

  /**
   * Add a style rule.
   */
  addRule(selector: string, properties: Record<string, any>): void {
    this.rules.push({ selector, properties });
  }

  /**
   * Add multiple rules.
   */
  addRules(rules: StyleRule[]): void {
    for (const rule of rules) this.rules.push(rule);
  }

  /**
   * Resolve styles for a node based on its type, classes, and state.
   */
  resolve(
    type: string,
    classes: string[] = [],
    states: string[] = [],
    inline: Record<string, any> = {}
  ): ResolvedStyle {
    const result: ResolvedStyle = {};

    // 1. Base type rules (lowest specificity)
    for (const rule of this.rules) {
      if (rule.selector === type) {
        Object.assign(result, rule.properties);
      }
    }

    // 2. Class rules
    for (const cls of classes) {
      for (const rule of this.rules) {
        if (rule.selector === `.${cls}`) {
          Object.assign(result, rule.properties);
        }
      }
    }

    // 3. State rules (type:state)
    for (const state of states) {
      for (const rule of this.rules) {
        if (rule.selector === `${type}:${state}`) {
          Object.assign(result, rule.properties);
        }
      }
    }

    // 4. Inline styles (highest specificity)
    Object.assign(result, inline);

    return result;
  }

  /**
   * Create default style rules from theme tokens.
   */
  static fromTokens(tokens: ThemeTokens): StyleResolver {
    const resolver = new StyleResolver();

    resolver.addRules([
      {
        selector: 'panel',
        properties: {
          backgroundColor: tokens.colors.surface,
          borderColor: tokens.colors.border,
          borderRadius: tokens.borderRadius.md,
          padding: tokens.spacing.md,
        },
      },
      {
        selector: 'button',
        properties: {
          backgroundColor: tokens.colors.primary,
          color: tokens.colors.text,
          borderRadius: tokens.borderRadius.md,
          padding: tokens.spacing.sm,
          fontSize: tokens.fontSize.md,
        },
      },
      {
        selector: 'button:hover',
        properties: {
          opacity: tokens.opacity.hover,
        },
      },
      {
        selector: 'button:pressed',
        properties: {
          opacity: tokens.opacity.pressed,
        },
      },
      {
        selector: 'button:disabled',
        properties: {
          opacity: tokens.opacity.disabled,
        },
      },
      {
        selector: '.primary',
        properties: {
          backgroundColor: tokens.colors.primary,
        },
      },
      {
        selector: '.secondary',
        properties: {
          backgroundColor: tokens.colors.secondary,
        },
      },
      {
        selector: '.danger',
        properties: {
          backgroundColor: tokens.colors.error,
        },
      },
      {
        selector: '.success',
        properties: {
          backgroundColor: tokens.colors.success,
        },
      },
      {
        selector: 'text',
        properties: {
          color: tokens.colors.text,
          fontSize: tokens.fontSize.md,
        },
      },
      {
        selector: 'input',
        properties: {
          backgroundColor: tokens.colors.background,
          borderColor: tokens.colors.border,
          color: tokens.colors.text,
          borderRadius: tokens.borderRadius.sm,
          padding: tokens.spacing.sm,
        },
      },
    ]);

    return resolver;
  }

  /**
   * Get count of rules.
   */
  get ruleCount(): number {
    return this.rules.length;
  }
}
