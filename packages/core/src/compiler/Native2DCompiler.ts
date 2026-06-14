/**
 * @holoscript/core/compiler — Native 2D Compiler Target
 *
 * Compiles HoloScript objects with Native 2D traits (@panel, @layout, @button, etc.)
 * into flat, performant HTML/Tailwind strings or React (.tsx) components.
 *
 * Supports '--format react' vs default HTML string generation.
 */

import { CompilerBase, type BaseCompilerOptions } from './CompilerBase';
import { readJson } from '../errors/safeJsonParse';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloUIElement,
} from '../parser/HoloCompositionTypes';

export interface Native2DCompilerOptions extends BaseCompilerOptions {
  /** Output format: raw html/css string or full React .tsx component */
  format?: 'html' | 'react';
  /** Map @holoscript/ui components instead of raw HTML tags */
  useUIComponents?: boolean;
  /** Slot imports: map of slot name → { component, importPath } */
  slots?: Record<string, { component: string; importPath: string }>;
}

export class Native2DCompiler extends CompilerBase {
  protected readonly compilerName = 'Native2DCompiler';

  // @ts-expect-error During migration
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
      const code = this.generateReactComponent(composition.name, elements, composition, options);
      return this.withTripleOutputIfRequested(composition, code, options);
    }
    const code = this.generateHTMLPage(composition.name, elements, composition);
    return this.withTripleOutputIfRequested(composition, code, options);
  }

  // ============================================================================
  // REACT GENERATION
  // ============================================================================

  /** Collected during node traversal — used to generate imports and hooks */
  private _slotImports: Map<string, { component: string; importPath: string }> = new Map();
  private _uiImports: Set<string> = new Set();
  private _stateFields: Map<string, unknown> = new Map();
  private _fetchCalls: Array<{ name: string; endpoint: string; method: string }> = [];
  private _hookCalls: Array<{ name: string; import: string; returns: string }> = [];
  private _options: Native2DCompilerOptions = {};

  generateReactComponent(
    name: string,
    objects: HoloObjectDecl[] | HoloUIElement[] | Record<string, unknown>[],
    composition?: HoloComposition,
    options?: Native2DCompilerOptions
  ): string {
    // Reset per-compilation state
    this._slotImports.clear();
    this._uiImports.clear();
    this._stateFields.clear();
    this._fetchCalls = [];
    this._hookCalls = [];
    this._options = options || {};

    const safeName = name.replace(/[^a-zA-Z0-9]/g, '');

    // Extract state from composition
    if (composition?.state?.properties) {
      for (const prop of composition.state.properties) {
        this._stateFields.set(prop.key, prop.value ?? null);
      }
    }

    // Generate JSX from objects
    const jsx = objects
      .map((obj) => this.generateReactNode(obj as unknown as Record<string, unknown>))
      .join('\n        ');

    // Build imports
    const imports: string[] = [];
    const reactImports = new Set<string>();
    if (this._stateFields.size > 0) reactImports.add('useState');
    if (this._fetchCalls.length > 0) reactImports.add('useEffect');
    imports.push(
      reactImports.size > 0
        ? `import React, { ${[...reactImports].join(', ')} } from 'react';`
        : `import React from 'react';`
    );

    if (this._uiImports.size > 0) {
      imports.push(`import { ${[...this._uiImports].join(', ')} } from '@holoscript/ui';`);
    }

    for (const [, slot] of this._slotImports) {
      imports.push(`import { ${slot.component} } from '${slot.importPath}';`);
    }

    for (const h of this._hookCalls) {
      imports.push(`import { ${h.name} } from '${h.import}';`);
    }

    // Build state hooks
    const stateHooks: string[] = [];
    for (const [key, value] of this._stateFields) {
      const capitalKey = key.charAt(0).toUpperCase() + key.slice(1);
      const initValue = JSON.stringify(value);
      stateHooks.push(
        `  const [${key}, set${capitalKey}] = useState(${initValue === undefined ? 'null' : initValue});`
      );
    }

    // Build fetch effects
    const fetchEffects: string[] = [];
    for (const f of this._fetchCalls) {
      fetchEffects.push(`  useEffect(() => {
    fetch(\`${f.endpoint}\`${f.method !== 'GET' ? `, { method: '${f.method}' }` : ''})
      .then(r => r.json())
      .then(set${f.name.charAt(0).toUpperCase() + f.name.slice(1)})
      .catch(console.error);
  }, []);`);
    }

    // Build hook bindings: `const { snap } = useProfiler();` at the top of the component
    const hookBindings: string[] = [];
    for (const h of this._hookCalls) {
      const members = h.returns
        .split(',')
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
      hookBindings.push(
        members.length > 0 ? `  const { ${members.join(', ')} } = ${h.name}();` : `  ${h.name}();`
      );
    }

    return `${imports.join('\n')}

// @generated by HoloScript Native2DCompiler — DO NOT EDIT
export function ${safeName}Component() {${hookBindings.length > 0 ? '\n' + hookBindings.join('\n') : ''}
${stateHooks.join('\n')}
${fetchEffects.join('\n')}

  return (
    <div className="holoscript-2d-root w-full h-full">
      ${jsx}
    </div>
  );
}

export default ${safeName}Component;
`;
  }

  private generateReactNode(obj: Record<string, unknown>): string {
    const traits = this.extractTraits(obj);

    // @slot trait: mount a hand-written React component
    if (traits.slot) {
      const slotName = traits.slot.name || (obj as Record<string, unknown>).name || 'Slot';
      const configuredSlot = this._options.slots?.[String(slotName)];
      const component = traits.slot.component || configuredSlot?.component || slotName;
      const importPath =
        traits.slot.import || configuredSlot?.importPath || `@/components/${component}`;
      this._slotImports.set(slotName, { component, importPath });
      // Props for the slot component: flat config keys (everything except the slot's
      // own name/component/import/props) AND an optional nested `props: {...}`. Flat
      // keys let a .holo page pass simple scalars (e.g. sceneName: "...") without the
      // nested-object trait grammar (which only round-trips inside arrays).
      const RESERVED_SLOT_KEYS = new Set(['name', 'component', 'import', 'props']);
      const slotProps: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(traits.slot)) {
        if (!RESERVED_SLOT_KEYS.has(k)) slotProps[k] = v;
      }
      if (traits.slot.props && typeof traits.slot.props === 'object') {
        Object.assign(slotProps, traits.slot.props as Record<string, unknown>);
      }
      const propsStr = Object.keys(slotProps).length
        ? ` {...${JSON.stringify(slotProps)}}`
        : '';
      return `<div data-holo-slot="${slotName}">
        <${component}${propsStr} />
      </div>`;
    }

    // @fetch trait: register a fetch call and bind to state
    if (traits.fetch) {
      const name = traits.fetch.into || 'data';
      const endpoint = traits.fetch.endpoint || '/api/data';
      const method = traits.fetch.method || 'GET';
      this._fetchCalls.push({ name, endpoint, method });
      if (!this._stateFields.has(name)) {
        this._stateFields.set(name, null);
      }
    }

    // @hook trait: call a React hook at the top of the component and destructure its
    // returns into local consts that @bind can read (e.g. useProfiler -> { snap }).
    // This is the bridge for panels whose data is a hook, not a @fetch endpoint.
    if (traits.hook?.name && traits.hook?.import) {
      const hookName = String(traits.hook.name);
      const importPath = String(traits.hook.import);
      if (!/^[A-Za-z_$][\w$]*$/.test(hookName)) {
        throw new Error(`Native2DCompiler @hook: invalid hook name ${JSON.stringify(hookName)}`);
      }
      if (/['"`\\]/.test(importPath)) {
        throw new Error(`Native2DCompiler @hook: invalid import path ${JSON.stringify(importPath)}`);
      }
      if (!this._hookCalls.some((h) => h.name === hookName)) {
        this._hookCalls.push({ name: hookName, import: importPath, returns: String(traits.hook.returns || '') });
      }
    }

    let tag =
      traits.theme?.tag ||
      traits.panel?.tag ||
      (typeof obj.type === 'string' ? obj.type.toLowerCase() : undefined) ||
      'div';

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

    // @bind value-tier styling: a `tiers` array on the bind trait makes the
    // element's className threshold-conditional on the bound numeric value.
    // This is what lets a profiler readout (FPS → green/amber/red) compile
    // natively instead of needing a hand-written .tsx ternary cascade.
    // Each tier: { gte?: number, lt?: number, className: string }. Tiers are
    // evaluated in source order, first match wins; a tier with neither `gte`
    // nor `lt` is the unconditional default (place it last). The expression
    // is emitted as a JSX `{...}` className so it re-evaluates on every render
    // as the bound state changes.
    const tierExpr = this.buildBindTierClassName(traits);

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
    if (tierExpr) {
      // Merge any static classes with the value-tier cascade into one JSX
      // template-literal className so it re-evaluates every render.
      const staticPrefix = classes.length > 0 ? `${classes.join(' ')} ` : '';
      props += ` className={\`${staticPrefix}\${${tierExpr}}\`}`;
    } else if (classes.length > 0) {
      props += ` className="${classes.join(' ')}"`;
    }
    if (traits.theme?.attributes) {
      try {
        const parsedAttrs = readJson(traits.theme.attributes) as Record<string, string>;
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
          // Wrap in an arrow so the handler is PASSED, not invoked during render.
          // `onSubmit={submitFn(e)}` calls submitFn at render time (e undefined);
          // `onSubmit={(e) => submitFn(e)}` is the correct event-handler form.
          props += ` onSubmit={(e) => ${cleanAction}}`;
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
    // @bind: emit a reactive JSX expression reading a state variable path
    if (traits.bind?.state) {
      const pathParts = String(traits.bind.path || '').split('.').filter(Boolean);
      const expr = pathParts.reduce(
        (acc: string, key: string) => `${acc}?.${key}`,
        String(traits.bind.state)
      );
      const fallback = JSON.stringify(traits.bind.fallback ?? '—');
      safeContent = `{${expr} ?? ${fallback}}`;
    } else if (content) {
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

  generateHTMLPage(name: string, objects: unknown[], composition: HoloComposition): string {
    const content = objects.map((obj) => this.generateHTMLNode(obj)).join('\n      ');

    // Resolve theme: dark by default; only use light when explicitly declared
    let isDark = true;
    let bgColor = '#050510';
    let color = '#ffffff';

    // Extract background environment theme
    if (composition.environment?.properties) {
      const themeProp = composition.environment.properties.find((p) => p.key === 'theme');
      const bgProp = composition.environment.properties.find((p) => p.key === 'backgroundColor');
      const fgProp = composition.environment.properties.find((p) => p.key === 'color');
      if (themeProp?.value === 'light') {
        isDark = false;
        bgColor = (bgProp?.value as string) || '#ffffff';
        color = (fgProp?.value as string) || '#000000';
      } else if (themeProp?.value === 'dark' || !themeProp) {
        isDark = true;
        bgColor = (bgProp?.value as string) || '#050510';
        color = (fgProp?.value as string) || '#ffffff';
      }
    }
    if (
      (
        composition as unknown as {
          traits?: Array<{ name: string; config?: { dark?: boolean; light?: boolean } }>;
        }
      ).traits?.some((t) => t.name === 'theme' && t.config?.light)
    ) {
      isDark = false;
      bgColor = '#ffffff';
      color = '#000000';
    }
    void isDark; // used below via bgColor/color

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <style>
      /* HoloScript Native2D — minimal Tailwind-compatible utility CSS (no CDN dependency) */
      *, *::before, *::after { box-sizing: border-box; }
      body { margin: 0; padding: 0; background-color: ${bgColor}; color: ${color}; font-family: system-ui, -apple-system, sans-serif; }
      /* --- Typography --- */
      .text-5xl { font-size: 3rem; line-height: 1; }
      .text-3xl { font-size: 1.875rem; line-height: 2.25rem; }
      .text-2xl { font-size: 1.5rem; line-height: 2rem; }
      .text-xl { font-size: 1.25rem; line-height: 1.75rem; }
      .text-lg { font-size: 1.125rem; line-height: 1.75rem; }
      .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
      .text-xs { font-size: 0.75rem; line-height: 1rem; }
      .font-bold { font-weight: 700; }
      .font-semibold { font-weight: 600; }
      .font-medium { font-weight: 500; }
      .tracking-tight { letter-spacing: -0.025em; }
      /* --- Colors --- */
      .text-white { color: #fff; }
      .text-black { color: #000; }
      .text-gray-300 { color: #d1d5db; }
      .text-gray-400 { color: #9ca3af; }
      .text-gray-500 { color: #6b7280; }
      .text-gray-600 { color: #4b5563; }
      /* --- Backgrounds --- */
      .bg-white { background-color: #fff; }
      .bg-gray-800 { background-color: #1f2937; }
      .bg-gray-900 { background-color: #111827; }
      .bg-gray-950 { background-color: #030712; }
      .bg-blue-600 { background-color: #2563eb; }
      .bg-blue-700 { background-color: #1d4ed8; }
      .bg-indigo-600 { background-color: #4f46e5; }
      .bg-indigo-500 { background-color: #6366f1; }
      /* --- Hover states --- */
      .hover\\:bg-blue-700:hover { background-color: #1d4ed8; }
      .hover\\:bg-gray-800:hover { background-color: #1f2937; }
      .hover\\:bg-indigo-500:hover { background-color: #6366f1; }
      .hover\\:text-white:hover { color: #fff; }
      /* --- Spacing --- */
      .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
      .px-4 { padding-left: 1rem; padding-right: 1rem; }
      .px-6 { padding-left: 1.5rem; padding-right: 1.5rem; }
      .px-8 { padding-left: 2rem; padding-right: 2rem; }
      .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
      .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
      .py-3 { padding-top: 0.75rem; padding-bottom: 0.75rem; }
      .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
      .py-8 { padding-top: 2rem; padding-bottom: 2rem; }
      .py-16 { padding-top: 4rem; padding-bottom: 4rem; }
      .p-4 { padding: 1rem; }
      .p-6 { padding: 1.5rem; }
      .p-8 { padding: 2rem; }
      .mt-2 { margin-top: 0.5rem; }
      .mt-4 { margin-top: 1rem; }
      .mt-6 { margin-top: 1.5rem; }
      .mt-8 { margin-top: 2rem; }
      .mb-2 { margin-bottom: 0.5rem; }
      .mb-4 { margin-bottom: 1rem; }
      .mb-6 { margin-bottom: 1.5rem; }
      .gap-2 { gap: 0.5rem; }
      .gap-4 { gap: 1rem; }
      .gap-6 { gap: 1.5rem; }
      .gap-8 { gap: 2rem; }
      .space-y-2 > * + * { margin-top: 0.5rem; }
      .space-y-4 > * + * { margin-top: 1rem; }
      /* --- Borders & Radius --- */
      .border { border-width: 1px; border-style: solid; }
      .border-gray-600 { border-color: #4b5563; }
      .border-gray-700 { border-color: #374151; }
      .border-gray-800 { border-color: #1f2937; }
      .rounded { border-radius: 0.25rem; }
      .rounded-lg { border-radius: 0.5rem; }
      .rounded-xl { border-radius: 0.75rem; }
      .rounded-2xl { border-radius: 1rem; }
      .rounded-full { border-radius: 9999px; }
      /* --- Shadows --- */
      .shadow { box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24); }
      .shadow-md { box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1); }
      .shadow-lg { box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1); }
      .shadow-xl { box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); }
      /* --- Layout --- */
      .flex { display: flex; }
      .inline-flex { display: inline-flex; }
      .grid { display: grid; }
      .block { display: block; }
      .hidden { display: none; }
      .items-center { align-items: center; }
      .items-start { align-items: flex-start; }
      .justify-center { justify-content: center; }
      .justify-between { justify-content: space-between; }
      .flex-col { flex-direction: column; }
      .flex-wrap { flex-wrap: wrap; }
      .flex-1 { flex: 1 1 0%; }
      .w-full { width: 100%; }
      .w-auto { width: auto; }
      .max-w-sm { max-width: 24rem; }
      .max-w-md { max-width: 28rem; }
      .max-w-lg { max-width: 32rem; }
      .max-w-xl { max-width: 36rem; }
      .max-w-2xl { max-width: 42rem; }
      .max-w-3xl { max-width: 48rem; }
      .max-w-4xl { max-width: 56rem; }
      .max-w-5xl { max-width: 64rem; }
      .max-w-6xl { max-width: 72rem; }
      .max-w-7xl { max-width: 80rem; }
      .mx-auto { margin-left: auto; margin-right: auto; }
      .text-center { text-align: center; }
      .text-left { text-align: left; }
      .text-right { text-align: right; }
      .relative { position: relative; }
      .absolute { position: absolute; }
      /* --- Interaction --- */
      .cursor-pointer { cursor: pointer; }
      .select-none { user-select: none; }
      .transition-all { transition: all 0.15s ease; }
      .transition { transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease; }
      .outline-none { outline: none; }
      /* Focus ring for inputs */
      .focus\\:ring-2:focus { box-shadow: 0 0 0 2px rgba(99,102,241,0.5); }
      .focus\\:ring-indigo-500:focus { box-shadow: 0 0 0 2px #6366f1; }
      /* --- Opacity --- */
      .opacity-50 { opacity: 0.5; }
      .opacity-75 { opacity: 0.75; }
      /* --- Overflow --- */
      .overflow-hidden { overflow: hidden; }
      .overflow-auto { overflow: auto; }
      /* --- Custom HoloScript trait animations --- */
      .glow-btn:hover { box-shadow: 0 0 15px rgba(255,255,255,0.5); }
      .lift-card { transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .lift-card:hover { transform: translateY(-4px); box-shadow: 0 10px 20px rgba(0,0,0,0.2); }
      [data-holo-template] { display: none; }
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
    <script>
      /* HoloScript Native2D — hydration-free live list-binding runtime (@fetch).
         For each [data-holo-fetch] container: fetch the endpoint, then clone the
         [data-holo-template] child per item and interpolate {{field}} (dotted paths
         supported) into text + attributes. Plain DOM — no framework, no hydration. */
      (function () {
        function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
        function interp(s, item) { return s.replace(/\{\{([^}]+)\}\}/g, function (_, k) { var v = getPath(item, k.trim()); return v == null ? '' : String(v); }); }
        function fill(node, item) {
          if (node.attributes) { for (var i = 0; i < node.attributes.length; i++) { var a = node.attributes[i]; if (a.value.indexOf('{{') >= 0) a.value = interp(a.value, item); } }
          (node.childNodes || []).forEach(function (c) {
            if (c.nodeType === 3) { if (c.nodeValue.indexOf('{{') >= 0) c.nodeValue = interp(c.nodeValue, item); }
            else if (c.nodeType === 1) fill(c, item);
          });
        }
        function render(el) {
          var url = el.getAttribute('data-holo-fetch'); var method = el.getAttribute('data-holo-method') || 'GET';
          var tpl = el.querySelector('[data-holo-template]'); if (!tpl) return;
          fetch(url, { method: method }).then(function (r) { return r.json(); }).then(function (d) {
            var items = (d && (d.items || d.actions)) || (Array.isArray(d) ? d : []);
            items.forEach(function (item) {
              var n = tpl.cloneNode(true); n.removeAttribute('data-holo-template'); n.style.display = '';
              fill(n, item); el.appendChild(n);
            });
            var into = el.getAttribute('data-holo-into');
            if (into) { document.querySelectorAll('[data-holo-count-for="' + into + '"]').forEach(function (c) { c.textContent = String(items.length); }); }
          }).catch(function (e) { console.error('[holo-fetch]', url, e); });
        }
        function boot() { document.querySelectorAll('[data-holo-fetch]').forEach(render); }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
      })();
    </script>
</body>
</html>`;
  }

  /** Build a semantic HTML block for @semantic_entity / @semantic_layout traits.
   *
   * HoloScript's `generate_semantic_ui` tool emits 3D-world-style objects
   * (`mesh`, `text`, `plane`) annotated with semantic traits:
   *   @semantic_entity(stock_table)                     → config._arg0 = entity name
   *   @semantic_layout(table, columns:["a","b","c"])    → config._arg0 = layout type
   *   @content("Inventory Dashboard")                   → config._arg0 = text
   *   @color("#16213e")                                 → config._arg0 = bg colour
   *
   * Without this handler every semantic object falls through to `tag = 'div'` with
   * no content.  This method maps the semantic vocabulary to real HTML elements so
   * the compiled page is actually perceivable.
   */
  private generateSemanticHTMLBlock(traits: Record<string, any>): string | null {
    // semantic_layout supports both positional arg (_arg0) and named key (flow/type/layout).
    // semantic_entity supports both positional arg (_arg0) and named key (type/name/entity).
    // Both config shapes are emitted depending on how traits are authored in .holo source.
    const layoutType = (traits.semantic_layout?._arg0 ||
      traits.semantic_layout?.flow ||
      traits.semantic_layout?.layout ||
      traits.semantic_layout?.type) as string | undefined;
    const entityName = (traits.semantic_entity?._arg0 ||
      traits.semantic_entity?.type ||
      traits.semantic_entity?.name ||
      traits.semantic_entity?.entity) as string | undefined;
    const bgColor = traits.color?._arg0 as string | undefined;
    const textContent = traits.content?._arg0 as string | undefined;

    if (!layoutType && !entityName) return null;

    const styleAttr = bgColor
      ? ` style="background-color:${bgColor};padding:1rem;border-radius:0.5rem;margin-bottom:1rem;"`
      : ` style="padding:1rem;margin-bottom:1rem;"`;

    // ── TABLE layout ─────────────────────────────────────────────────────────────
    // Match explicit 'table' layout or entity names that imply tabular data (stock_table, etc.)
    const isTableEntity =
      !!entityName &&
      (entityName.includes('table') || entityName.includes('grid') || entityName.includes('list'));
    if (layoutType === 'table' || (isTableEntity && !layoutType)) {
      const columns = (traits.semantic_layout?.columns as string[] | undefined) || [];
      const headerCells = columns
        .map(
          (col) =>
            `<th style="padding:0.5rem 1rem;text-align:left;border-bottom:2px solid #334;">${col}</th>`
        )
        .join('');
      // Render two sample rows so the table body is non-empty and selectors match.
      const sampleRow = columns
        .map((col) => `<td style="padding:0.5rem 1rem;">${col}</td>`)
        .join('');
      return `<div${styleAttr} data-holo-semantic="table" data-holo-entity="${entityName || ''}">
  <table style="width:100%;border-collapse:collapse;">
    <thead><tr>${headerCells}</tr></thead>
    <tbody>
      <tr>${sampleRow}</tr>
    </tbody>
  </table>
</div>`;
    }

    // ── FORM layout ─────────────────────────────────────────────────────────────
    if (layoutType === 'form' || (entityName && entityName.includes('form'))) {
      const fields = (traits.semantic_layout?.fields as string[] | undefined) || [];
      const inputs = fields
        .map(
          (f) =>
            `<div style="margin-bottom:0.5rem;">` +
            `<label style="display:block;margin-bottom:0.25rem;">${f}</label>` +
            `<input type="text" name="${f}" placeholder="${f}" ` +
            `style="width:100%;padding:0.4rem 0.6rem;border:1px solid #556;border-radius:0.25rem;background:#111;color:#eee;" />` +
            `</div>`
        )
        .join('\n');
      return `<div${styleAttr} data-holo-semantic="form" data-holo-entity="${entityName || ''}">
  <form onsubmit="return false;">
    ${inputs}
    <button type="submit" style="padding:0.4rem 1rem;border-radius:0.25rem;background:#3b82f6;color:#fff;border:none;cursor:pointer;">Submit</button>
  </form>
</div>`;
    }

    // ── ALERT LIST layout ────────────────────────────────────────────────────────
    if (layoutType === 'alert_list') {
      const filterLabel = (traits.semantic_layout?.filter as string | undefined) || '';
      return `<div${styleAttr} data-holo-semantic="alert_list" data-holo-entity="${entityName || ''}">
  <ul style="list-style:none;padding:0;margin:0;" data-holo-filter="${filterLabel}">
    <li style="padding:0.4rem 0.8rem;border-bottom:1px solid #446;">(no alerts)</li>
  </ul>
</div>`;
    }

    // ── DASHBOARD GRID / generic container ───────────────────────────────────────
    if (layoutType === 'dashboard_grid' || layoutType) {
      return `<div${styleAttr} data-holo-semantic="${layoutType}" data-holo-entity="${entityName || ''}"></div>`;
    }

    // ── Entity with @content (e.g. title text or button) ────────────────────────
    if (entityName && textContent) {
      const isButton =
        entityName.includes('button') ||
        entityName.includes('btn') ||
        entityName.includes('submit');
      if (isButton) {
        return (
          `<div${styleAttr} data-holo-entity="${entityName}">` +
          `<button type="button" style="padding:0.4rem 1rem;border-radius:0.25rem;background:#3b82f6;color:#fff;border:none;cursor:pointer;">${textContent}</button>` +
          `</div>`
        );
      }
      return `<div${styleAttr} data-holo-entity="${entityName}"><span>${textContent}</span></div>`;
    }

    // ── Entity-only (no layout, no content) — named div ─────────────────────────
    if (entityName) {
      return `<div${styleAttr} data-holo-entity="${entityName}"></div>`;
    }

    return null;
  }

  private generateHTMLNode(obj: unknown, opts: { asTemplate?: boolean } = {}): string {
    const node = obj as Record<string, unknown>;
    const traits = this.extractTraits(obj);
    const nodeType = typeof node.type === 'string' ? node.type.toLowerCase() : undefined;

    // ── Semantic entity/layout: use the dedicated semantic renderer ──────────────
    if (traits.semantic_entity || traits.semantic_layout) {
      const block = this.generateSemanticHTMLBlock(traits);
      if (block) return block;
    }

    let tag = traits.theme?.tag || traits.panel?.tag || nodeType || 'div';

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
        const parsedAttrs = readJson(traits.theme.attributes) as Record<string, string>;
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

    // Live data-binding (hydration-free): a @fetch container renders its first
    // child as a row template; the vanilla bootstrap in generateHTMLPage clones it
    // per fetched item and interpolates {{field}} tokens. No React, no hydration —
    // so it cannot hit the Next/React app-router tunnel-hydration bug class.
    if (opts.asTemplate) props += ` data-holo-template`;
    // @count_of { source: "<into>" } → element whose text the runtime sets to the
    // live item count of the matching @fetch container (hydration-free live counter).
    if (traits.count_of?.source) props += ` data-holo-count-for="${traits.count_of.source}"`;
    if (traits.fetch) {
      const fEndpoint = traits.fetch.endpoint || '/api/data';
      const fInto = traits.fetch.into || 'data';
      const fMethod = traits.fetch.method || 'GET';
      props += ` data-holo-fetch="${fEndpoint}" data-holo-into="${fInto}" data-holo-method="${fMethod}"`;
    }

    const children = (node.children || node.objects || []) as unknown[];
    const childrenMarkup = children
      .map((child: unknown, i: number) =>
        this.generateHTMLNode(child, { asTemplate: !!traits.fetch && i === 0 })
      )
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

  /**
   * Build a JSX expression that resolves to a className string based on where
   * the bound numeric value falls among a set of value tiers. Returns `null`
   * when the bind trait carries no `tiers` array (so the caller falls back to
   * the plain static className path).
   *
   * Given:
   *   @bind(state: "snap", path: "fps", tiers: [
   *     { gte: 55, className: "text-emerald-400" },
   *     { gte: 30, className: "text-amber-400" },
   *     {          className: "text-red-400" }   // default (no bound)
   *   ])
   *
   * emits (with the bound value resolved to e.g. `snap?.fps`):
   *   (snap?.fps ?? 0) >= 55 ? "text-emerald-400"
   *     : (snap?.fps ?? 0) >= 30 ? "text-amber-400"
   *     : "text-red-400"
   *
   * Each tier may specify `gte` (>=), `gt` (>), `lte` (<=), and/or `lt` (<).
   * Conditions on one tier are AND-ed. A tier with no bounds is the
   * unconditional fallback (its className is the trailing `:` branch). If no
   * tier is unconditional, an empty-string fallback is appended so the
   * expression is always total.
   */
  private buildBindTierClassName(traits: Record<string, any>): string | null {
    const bind = traits.bind;
    if (!bind || !Array.isArray(bind.tiers) || bind.tiers.length === 0) return null;

    // Resolve the bound value reference exactly the same way the content
    // expression does, then coerce to a number for comparison. `?? 0` keeps
    // the cascade total even before the bound state has loaded.
    const pathParts = String(bind.path || '').split('.').filter(Boolean);
    const baseExpr = pathParts.reduce(
      (acc: string, key: string) => `${acc}?.${key}`,
      String(bind.state)
    );
    const valueRef = `(${baseExpr} ?? 0)`;

    const tiers = bind.tiers as Array<Record<string, unknown>>;
    const branches: Array<{ condition: string | null; className: string }> = [];

    for (const tier of tiers) {
      const className = typeof tier.className === 'string' ? tier.className : '';
      const conditions: string[] = [];
      if (typeof tier.gte === 'number') conditions.push(`${valueRef} >= ${tier.gte}`);
      if (typeof tier.gt === 'number') conditions.push(`${valueRef} > ${tier.gt}`);
      if (typeof tier.lte === 'number') conditions.push(`${valueRef} <= ${tier.lte}`);
      if (typeof tier.lt === 'number') conditions.push(`${valueRef} < ${tier.lt}`);
      branches.push({
        condition: conditions.length > 0 ? conditions.join(' && ') : null,
        className,
      });
    }

    // Build the ternary cascade from the conditional branches, ending in the
    // first unconditional branch (or an empty-string default for totality).
    let fallback = '""';
    const conditional: Array<{ condition: string; className: string }> = [];
    for (const b of branches) {
      if (b.condition === null) {
        fallback = JSON.stringify(b.className);
        break; // first default wins; later tiers are unreachable
      }
      conditional.push({ condition: b.condition, className: b.className });
    }

    if (conditional.length === 0) {
      // Only a default tier was supplied — degenerate to a constant.
      return fallback === '""' ? null : fallback;
    }

    return conditional.reduceRight(
      (acc, b) => `${b.condition} ? ${JSON.stringify(b.className)} : ${acc}`,
      fallback
    );
  }

  private extractTraits(obj: unknown): Record<string, any> {
    const map: Record<string, any> = {};
    const node = obj as { traits?: Array<{ name: string; config?: unknown }> };
    if (!node.traits) return map;
    for (const t of node.traits) {
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
