/**
 * @holoscript/core/compiler — Native 2D Compiler Target
 *
 * Compiles HoloScript objects with Native 2D traits (@panel, @layout, @button, etc.)
 * into flat, performant HTML/Tailwind strings or React (.tsx) components.
 *
 * Supports '--format react' vs default HTML string generation.
 */

import { CompilerBase, type BaseCompilerOptions } from './CompilerBase';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

export interface Native2DCompilerOptions extends BaseCompilerOptions {
  /** Output format: raw html/css string or full React .tsx component */
  format?: 'html' | 'react';
}

export class Native2DCompiler extends CompilerBase {
  protected readonly compilerName = 'Native2DCompiler';

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string,
    options?: Native2DCompilerOptions
  ): string | any {
    // 1. Validate permissions
    this.validateCompilerAccess(agentToken, outputPath);

    const isReact = options?.format === 'react';

    // 2. Discover UI elements (either in composition.ui, or standard objects)
    const elements = composition.ui?.elements || composition.objects || [];

    // 3. Generate markup
    if (isReact) {
      const code = this.generateReactComponent(composition.name, elements);
      if (options?.generateDocs) {
        return {
          output: code,
          documentation: this.generateDocumentation(composition, code, options.docsOptions),
        };
      }
      return code;
    } else {
      const code = this.generateHTMLPage(composition.name, elements, composition);
      if (options?.generateDocs) {
        return {
          output: code,
          documentation: this.generateDocumentation(composition, code, options.docsOptions),
        };
      }
      return code;
    }
  }

  // ============================================================================
  // REACT GENERATION
  // ============================================================================

  private generateReactComponent(name: string, objects: HoloObjectDecl[] | any[]): string {
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '');
    const jsx = objects.map((obj) => this.generateReactNode(obj)).join('\n        ');

    return `import React from 'react';

// Auto-generated Native 2D HoloScript Component
export function ${safeName}Component() {
  const navigate = (path: string) => { window.location.href = path; };
  const submitNewsletter = (e: React.FormEvent) => { e.preventDefault(); alert("Subscribed!"); };

  return (
    <div className="holoscript-2d-root" style={{ width: '100%', height: '100%' }}>
      ${jsx}
    </div>
  );
}

export default ${safeName}Component;
`;
  }

  private generateReactNode(obj: Record<string, unknown>): string {
    const traits = this.extractTraits(obj);
    let tag = traits.theme?.tag || traits.panel?.tag || (typeof obj.type === 'string' ? obj.type.toLowerCase() : undefined) || 'div';

    // Default mapping for custom semantic keywords used in HoloScript (nav, section, container)
    if (
      [
        'nav',
        'section',
        'main',
        'footer',
        'form',
        'style',
        'a',
        'header',
        'h1',
        'h2',
        'h3',
      ].includes(tag)
    ) {
      // Keep structural and explicit tags
    } else if (tag === 'container') {
      tag = 'div';
    } else if (traits.link || tag === 'link') {
      tag = 'a';
    } else if (traits.button || tag === 'button') {
      tag = 'button';
    } else if (traits.image || tag === 'image') {
      tag = 'img';
    } else if (traits.input || tag === 'input') {
      tag = 'input';
    } else if (traits.text || tag === 'text') {
      tag = this.mapTextVariantToTag(traits.text?.variant || 'body');
    } else {
      tag = 'div';
    }

    const styles = this.buildStyles(traits);
    const classes = this.buildClasses(traits);
    let props = ``;

    if (traits.theme?.className) {
      classes.push(traits.theme.className);
    }
    if (traits.theme?.id) {
      props += ` id="${traits.theme.id}"`;
    }

    const combinedStyles: Record<string, string> = { ...styles };
    if (traits.theme?.style) {
      traits.theme.style.split(';').forEach((rule: string) => {
        const [key, ...valueParts] = rule.split(':');
        const value = valueParts.join(':');
        if (key && value) {
          const camelKey = key.trim().replace(/-([a-z])/g, (g: string) => g[1].toUpperCase());
          combinedStyles[camelKey] = value.trim();
        }
      });
    }

    if (Object.keys(combinedStyles).length > 0) {
      props += ` style={${JSON.stringify(combinedStyles)}}`;
    }
    if (classes.length > 0) {
      props += ` className="${classes.join(' ')}"`;
    }
    if (traits.theme?.attributes) {
      try {
        const parsedAttrs = JSON.parse(traits.theme.attributes);
        for (const [key, value] of Object.entries(parsedAttrs)) {
          props += ` ${key}="${value}"`;
        }
      } catch (e) {
        // Intentionally swallowed: invalid theme attributes JSON should not break rendering
      }
    }

    // Interactive props
    if (traits.button?.onClick || traits.form?.onSubmit) {
      const action = traits.button?.onClick || traits.form?.onSubmit;
      if (action) {
        const cleanAction = action.replace(/["']/g, "'");
        // Simple mapping for demo prototypes
        if (cleanAction.includes('navigate')) {
          props += ` onClick={() => ${cleanAction}}`;
        } else if (cleanAction.includes('submit')) {
          props += ` onSubmit={${cleanAction}}`;
        } else if (cleanAction.includes('window.open')) {
          props += ` onClick={() => ${cleanAction}}`;
        } else {
          props += ` onClick={() => console.log('${cleanAction}')}`;
        }
      }
    }

    // Media & Input props
    if (traits.image?.src) props += ` src="${traits.image.src}"`;
    if (traits.image?.alt) props += ` alt="${traits.image.alt}"`;
    if (traits.link?.href) props += ` href="${traits.link.href}"`;
    if (traits.input?.placeholder) props += ` placeholder="${traits.input.placeholder}"`;
    if (traits.input?.type) props += ` type="${traits.input.type}"`;
    if (traits.input?.required) props += ` required`;
    if (traits.button?.type) props += ` type="${traits.button.type}"`;

    const childrenMarkup = ((obj.children || obj.objects || []) as Record<string, unknown>[])
      .map((child: Record<string, unknown>) => this.generateReactNode(child))
      .join('\n');

    const content =
      traits.text?.content || traits.button?.content || traits.link?.content || traits.icon?.name;
    let safeContent = '';
    if (content) {
      safeContent = `{\`${content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`}`;
    }

    if (tag === 'style') {
      const escapedStyle = (content || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      return `<style dangerouslySetInnerHTML={{ __html: \`${escapedStyle}\` }} />`;
    }

    if (tag === 'img' || tag === 'input') {
      return `<${tag}${props} />`;
    }

    return `<${tag}${props}>
      ${safeContent}
      ${childrenMarkup}
    </${tag}>`;
  }

  // ============================================================================
  // HTML GENERATION
  // ============================================================================

  private generateHTMLPage(name: string, objects: any[], composition: HoloComposition): string {
    const content = objects.map((obj) => this.generateHTMLNode(obj)).join('\n      ');

    let bgColor = '#ffffff';
    let color = '#000000';

    // Extract background environment theme
    if (composition.environment?.properties) {
      const themeProp = composition.environment.properties.find((p) => p.key === 'theme');
      const bgProp = composition.environment.properties.find((p) => p.key === 'backgroundColor');
      if (
        themeProp?.value === 'dark' ||
        (composition as unknown as { traits?: Array<{ name: string; config?: { dark?: boolean } }> }).traits?.some((t) => t.name === 'theme' && t.config?.dark)
      ) {
        bgColor = (bgProp?.value as string) || '#050510';
        color = '#ffffff';
      }
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body { margin: 0; padding: 0; background-color: ${bgColor}; color: ${color}; font-family: system-ui, -apple-system, sans-serif; }
      /* Basic resets and custom trait animations to mirror React Framer variants */
      .glow-btn:hover { box-shadow: 0 0 15px rgba(255,255,255,0.5); }
      .lift-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .lift-card:hover { transform: translateY(-4px); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
    </style>
</head>
<body>
    <div id="holoscript-native-root">
      ${content}
    </div>
    <script>
      function navigate(path) { window.location.href = path; }
      function submitNewsletter(e) { e.preventDefault(); alert('Subscribed!'); }
    </script>
</body>
</html>`;
  }

  private generateHTMLNode(obj: any): string {
    const traits = this.extractTraits(obj);
    let tag = traits.theme?.tag || traits.panel?.tag || obj.type?.toLowerCase() || 'div';

    // Keyword extraction for parsing output logic
    if (
      [
        'nav',
        'section',
        'main',
        'footer',
        'form',
        'style',
        'a',
        'header',
        'h1',
        'h2',
        'h3',
      ].includes(tag)
    ) {
      // Keep structural and explicit tags
    } else if (tag === 'container') {
      tag = 'div';
    } else if (traits.link || tag === 'link') {
      tag = 'a';
    } else if (traits.button || tag === 'button') {
      tag = 'button';
    } else if (traits.image || tag === 'image') {
      tag = 'img';
    } else if (traits.input || tag === 'input') {
      tag = 'input';
    } else if (traits.text || tag === 'text') {
      tag = this.mapTextVariantToTag(traits.text?.variant || 'body');
    } else {
      tag = 'div';
    }

    const styles = this.buildStyles(traits);
    const classes = this.buildClasses(traits);
    let props = ``;

    if (traits.theme?.className) {
      classes.push(traits.theme.className);
    }
    if (traits.theme?.id) {
      props += ` id="${traits.theme.id}"`;
    }

    if (Object.keys(styles).length > 0 || traits.theme?.style) {
      let styleStr = Object.entries(styles)
        .map(([k, v]) => `${this.camelToKebab(k)}: ${v}`)
        .join('; ');
      if (traits.theme?.style) {
        styleStr += (styleStr ? '; ' : '') + traits.theme.style;
      }
      props += ` style="${styleStr}"`;
    }

    if (classes.length > 0) {
      props += ` class="${classes.join(' ')}"`;
    }
    if (traits.theme?.attributes) {
      try {
        const parsedAttrs = JSON.parse(traits.theme.attributes);
        for (const [key, value] of Object.entries(parsedAttrs)) {
          props += ` ${key}="${value}"`;
        }
      } catch (e) {
        // Intentionally swallowed: invalid theme attributes JSON should not break rendering
      }
    }

    // Input attributes
    if (traits.button?.onClick) props += ` onclick="${traits.button.onClick}"`;
    if (traits.form?.onSubmit) props += ` onsubmit="${traits.form.onSubmit}"`;
    if (traits.image?.src) props += ` src="${traits.image.src}"`;
    if (traits.image?.alt) props += ` alt="${traits.image.alt}"`;
    if (traits.link?.href) props += ` href="${traits.link.href}"`;
    if (traits.input?.placeholder) props += ` placeholder="${traits.input.placeholder}"`;
    if (traits.input?.type) props += ` type="${traits.input.type}"`;
    if (traits.input?.required) props += ` required`;

    const childrenMarkup = (obj.children || obj.objects || [])
      .map((child: any) => this.generateHTMLNode(child))
      .join('\n');

    const content =
      traits.text?.content || traits.button?.content || traits.link?.content || traits.icon?.name;

    if (tag === 'img' || tag === 'input') {
      return `<${tag}${props}>`;
    }

    return `<${tag}${props}>
      ${content ? content : ''}
      ${childrenMarkup}
    </${tag}>`;
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private extractTraits(obj: any): Record<string, any> {
    const map: Record<string, any> = {};
    if (!obj.traits) return map;
    for (const t of obj.traits) {
      map[t.name] = t.config || {};

      // Special case for primitive traits like @tailwind which might be passed as a single string
      // instead of an object if used like @tailwind("bg-black")
      if (t.name === 'tailwind' && typeof t.config === 'string') {
        map[t.name] = { classes: t.config };
      }
    }
    return map;
  }

  private mapTextVariantToTag(variant: string): string {
    switch (variant) {
      case 'h1':
        return 'h1';
      case 'h2':
        return 'h2';
      case 'h3':
        return 'h3';
      case 'subtitle':
        return 'h4';
      case 'caption':
        return 'span';
      case 'emoji':
        return 'span';
      default:
        return 'p';
    }
  }

  private buildStyles(traits: Record<string, any>): Record<string, string> {
    const styles: Record<string, string> = {};
    const layout = traits.layout;
    const theme = traits.theme;

    if (layout) {
      if (layout.flex) {
        styles.display = 'flex';
        styles.flexDirection = layout.flex === 'row' ? 'row' : 'column';
      }
      if (layout.grid) {
        styles.display = 'grid';
        styles.gridTemplateColumns = `repeat(${layout.columns || 1}, minmax(0, 1fr))`;
      }
      if (layout.justify) styles.justifyContent = layout.justify;
      if (layout.align) styles.alignItems = layout.align;
      if (layout.gap) styles.gap = typeof layout.gap === 'number' ? `${layout.gap}px` : layout.gap;
      if (layout.padding)
        styles.padding =
          typeof layout.padding === 'number' ? `${layout.padding}px` : layout.padding;
    }

    if (theme) {
      if (theme.backgroundColor) styles.backgroundColor = theme.backgroundColor;
      if (theme.color) styles.color = theme.color;
      if (theme.padding)
        styles.padding = typeof theme.padding === 'number' ? `${theme.padding}px` : theme.padding;
      if (theme.borderRadius)
        styles.borderRadius =
          typeof theme.borderRadius === 'number' ? `${theme.borderRadius}px` : theme.borderRadius;
      if (theme.border) styles.border = theme.border;
      if (theme.borderTop) styles.borderTop = theme.borderTop;
    }

    if (traits.text) {
      if (traits.text.align) styles.textAlign = traits.text.align;
      if (traits.text.maxWidth)
        styles.maxWidth =
          typeof traits.text.maxWidth === 'number'
            ? `${traits.text.maxWidth}px`
            : traits.text.maxWidth;
      if (traits.text.weight) styles.fontWeight = traits.text.weight;
    }

    return styles;
  }

  private buildClasses(traits: Record<string, any>): string[] {
    const classes: string[] = [];

    if (traits.text) {
      if (traits.text.variant === 'h1') classes.push('text-5xl font-bold tracking-tight');
      if (traits.text.variant === 'h2') classes.push('text-3xl font-bold');
      if (traits.text.variant === 'h3') classes.push('text-xl font-semibold');
      if (traits.text.variant === 'subtitle') classes.push('text-xl text-gray-400');
      if (traits.text.variant === 'caption') classes.push('text-sm text-gray-500');
      if (traits.text.variant === 'emoji') classes.push('text-2xl');
    }

    if (traits.button) {
      classes.push('px-4 py-2 rounded-lg font-medium transition-all');
      if (traits.button.variant === 'primary')
        classes.push('bg-blue-600 hover:bg-blue-700 text-white');
      if (traits.button.variant === 'outline')
        classes.push('border border-gray-600 hover:bg-gray-800 text-white');
      if (traits.button.variant === 'ghost')
        classes.push('hover:bg-gray-800 text-gray-300 hover:text-white');
      if (traits.button.variant === 'glow')
        classes.push('bg-indigo-600 text-white glow-btn hover:bg-indigo-500');

      if (traits.button.size === 'lg') classes.push('px-6 py-3 text-lg');
      if (traits.button.size === 'sm') classes.push('px-3 py-1 text-sm');
    }

    if (traits.card) {
      if (traits.card.shadow === 'md') classes.push('shadow-md');
      if (traits.card.shadow === 'lg') classes.push('shadow-lg');
      if (traits.card.hover === 'glow') classes.push('lift-card');
    }

    if (traits.input) {
      classes.push(
        'px-4 py-2 rounded-lg border border-gray-700 bg-gray-900 text-white focus:ring-2 focus:ring-indigo-500 outline-none'
      );
    }

    if (traits.tailwind?.classes) {
      classes.push(traits.tailwind.classes);
    }

    return classes;
  }

  private camelToKebab(str: string): string {
    return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  }
}
