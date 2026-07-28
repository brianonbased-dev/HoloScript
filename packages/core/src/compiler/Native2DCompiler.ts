/**
 * @holoscript/core/compiler — Native 2D Compiler Target
 *
 * Compiles HoloScript objects with Native 2D traits (@panel, @layout, @button, etc.)
 * into flat, performant HTML/Tailwind strings or React (.tsx) components.
 *
 * Supports '--format react' vs default HTML string generation.
 */

import { createHash } from 'node:crypto';
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
  private _hookCalls: Array<{ name: string; import: string; returns: string; args?: string }> = [];
  private _computedBindings: Array<{ name: string; expr: string; from?: string; uses: string[] }> =
    [];
  private _options: Native2DCompilerOptions = {};
  /** Honest mode (composition-level `@honest`): every data-bound element MUST carry
   *  `@provenance_bound` or the compiler refuses to emit it (HONEST-UNSOURCED). This is
   *  the Receipt-Bound Surface constitution — the surface cannot emit an unsourced pixel. */
  private _honestMode = false;
  private _verifiedViewMode = false;
  /** Version tag for the co-emitted `holoViewContract` (@verified_view v1). */
  private static readonly VIEW_CONTRACT_VERSION = 'holo-view-contract-v1';
  /** Valid projection roots: composition state keys + @fetch into-slots (pre-scanned). */
  private _projectionRoots = new Set<string>();
  /**
   * Verified projections collected during traversal (@verified_view v1): the machine-readable
   * view contract that co-emits with the surface — a portable, hash-bound receipt of what
   * every element renders, so an independent consumer can re-derive it from the ARTIFACT
   * (not the source). Populated by resolveProjection; emitted as `export const holoViewContract`.
   */
  private _collectedProjections: Array<{
    element: string;
    node: string;
    /** Optional twin entity this projection mirrors (v1 Framing B — StateAuthority entity id). */
    entity?: string;
    /** True iff a transform-free scalar @bind (raw displayed == raw source). */
    identity: boolean;
    /** Slice 3: the declared value transform for a formatted @bind (precision/prefix/suffix), so a
     *  formatted projection is twin-checkable (checker re-applies it to the twin) instead of
     *  abstaining. Absent for identity binds and for @chart/@sparkline/@each/@model. */
    transform?: { precision?: number; prefix?: string; suffix?: string };
  }> = [];

  /**
   * 2D data-value provenance vocabulary, ordered by TRUST (highest → lowest),
   * aligned to the shipped 3D PointProvenanceClass idiom (observed | interpolated |
   * nlos-inferred | generative-extended). An UNKNOWN class is REJECTED, never
   * silently upgraded to `measured` — provenance fails toward lower trust, so a
   * typo can never make an inferred value read as sensor-attested.
   */
  private static readonly PROVENANCE_CLASSES = new Set([
    'measured', // source-attested: a real sensor reading, DB value, on-chain fact
    'derived', // computed from measured values by a transparent bounded function
    'inferred', // model/heuristic estimate (a forecast) — honest that it is a guess
    'generative', // produced by a generative model (LLM-authored value)
  ]);
  /** Visible honesty glyph appended to a non-`measured` text value (measured = trusted, no marker). */
  private static readonly PROVENANCE_GLYPH: Record<string, string> = {
    measured: '',
    derived: '°',
    inferred: '~',
    generative: '✦',
  };

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
    this._computedBindings = [];
    this._options = options || {};
    // Honest mode: composition-level `@honest` trait turns on the no-unsourced-pixel gate.
    this._honestMode = (
      (composition as { traits?: Array<{ name?: string }> } | undefined)?.traits ?? []
    ).some((t) => t?.name === 'honest');
    // Verified-view mode (slice 4): composition-level `@verified_view` requires
    // every data-bound element to DECLARE its projection (@projects), verified
    // against the actual binding — the admission gate for agent-authored surfaces.
    this._verifiedViewMode = (
      (composition as { traits?: Array<{ name?: string }> } | undefined)?.traits ?? []
    ).some((t) => t?.name === 'verified_view');

    const safeName = name.replace(/[^a-zA-Z0-9]/g, '');

    // Extract state from composition
    if (composition?.state?.properties) {
      for (const prop of composition.state.properties) {
        this._stateFields.set(prop.key, prop.value ?? null);
      }
    }

    // Projection roots (slice 4): the names a @projects claim may legitimately
    // resolve against — composition state keys, every @fetch into-slot, and every
    // @each loop variable — PRE-SCANNED so a projection is never order-dependent on
    // where its fetch/loop container sits in the tree. A claim rooted anywhere else
    // is a hallucinated node (VIEW-UNGROUNDED). The @each loop var is admitted
    // composition-wide (an OUTER over-approximation: a loop var is really only in
    // scope inside its own subtree, but admitting it everywhere never false-FALSIFIES
    // a legitimate loop-var binding, whose provenance flows transitively from the
    // array proven at the @each element — subtree-precise scoping is a v1 refinement).
    this._projectionRoots = new Set(this._stateFields.keys());
    this._collectedProjections = [];
    const scanProjectionRoots = (objs: Array<Record<string, unknown>>): void => {
      for (const o of objs) {
        for (const t of (o.traits as
          | Array<{ name?: string; config?: Record<string, unknown> }>
          | undefined) ?? []) {
          if (t?.name === 'fetch') {
            const into = (t.config as { into?: unknown } | undefined)?.into;
            this._projectionRoots.add(typeof into === 'string' && into ? into : 'data');
          }
          if (t?.name === 'each') {
            const as = (t.config as { as?: unknown } | undefined)?.as;
            this._projectionRoots.add(typeof as === 'string' && as ? as : 'item');
          }
          // @computed defines a derived value (from state via an expression); its NAME is a
          // legitimate projection root — an element rendering the computed value can prove it.
          // (OUTER over-approx: v0 does not yet verify the expression's inputs are grounded.)
          if (t?.name === 'computed') {
            const nm = (t.config as { name?: unknown } | undefined)?.name;
            if (typeof nm === 'string' && nm) this._projectionRoots.add(nm);
          }
          // @hook destructures named values from an external hook (`returns: "a, b"`); each is
          // a bindable value, hence a legitimate projection root for an element rendering it.
          if (t?.name === 'hook') {
            const returns = (t.config as { returns?: unknown } | undefined)?.returns;
            if (typeof returns === 'string') {
              for (const r of returns.split(',').map((s) => s.trim())) {
                if (r) this._projectionRoots.add(r);
              }
            }
          }
        }
        if (Array.isArray(o.children))
          scanProjectionRoots(o.children as Array<Record<string, unknown>>);
      }
    };
    scanProjectionRoots(objects as unknown as Array<Record<string, unknown>>);

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

    // Imports for @computed bindings that call an external symbol (dedupe by module).
    const computedImports = new Map<string, Set<string>>();
    for (const b of this._computedBindings) {
      if (b.from && b.uses.length) {
        const set = computedImports.get(b.from) || new Set<string>();
        b.uses.forEach((u) => set.add(u));
        computedImports.set(b.from, set);
      }
    }
    for (const [from, uses] of computedImports) {
      imports.push(`import { ${[...uses].join(', ')} } from '${from}';`);
    }

    // Build state hooks
    const stateHooks: string[] = [];
    for (const [key, value] of this._stateFields) {
      const capitalKey = key.charAt(0).toUpperCase() + key.slice(1);
      const initValue = JSON.stringify(value);
      const isFetchedRecord = initValue === 'null' && this._fetchCalls.some((f) => f.name === key);
      const stateGeneric = isFetchedRecord
        ? '<Record<string, string | number | null | undefined> | null>'
        : '';
      stateHooks.push(
        `  const [${key}, set${capitalKey}] = useState${stateGeneric}(${initValue === undefined ? 'null' : initValue});`
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
      const call = `${h.name}(${h.args ?? ''})`;
      hookBindings.push(
        members.length > 0 ? `  const { ${members.join(', ')} } = ${call};` : `  ${call};`
      );
    }

    // Derived-value bindings (@computed): emitted after state/effects since they read state.
    const computedLines: string[] = [];
    for (const b of this._computedBindings) {
      computedLines.push(`  const ${b.name} = ${b.expr};`);
    }

    // @verified_view v1: co-emit the portable, hash-bound view contract. The traversal above
    // (via resolveProjection) collected every verified projection; the contract binds them
    // into one sha256-anchored receipt that ships WITH the artifact.
    const viewContract = this.buildViewContract();
    const rootAttrs = viewContract ? ` data-holo-view-contract="${viewContract.hash}"` : '';
    const contractExport = viewContract
      ? `\n\nexport const holoViewContract = ${viewContract.json} as const;`
      : '';

    return `${imports.join('\n')}

// @generated by HoloScript Native2DCompiler — DO NOT EDIT
export function ${safeName}Component() {${hookBindings.length > 0 ? '\n' + hookBindings.join('\n') : ''}
${stateHooks.join('\n')}
${fetchEffects.join('\n')}
${computedLines.join('\n')}

  return (
    <div className="holoscript-2d-root w-full h-full"${rootAttrs}>
      ${jsx}
    </div>
  );
}

export default ${safeName}Component;${contractExport}
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
      const propsStr = Object.keys(slotProps).length ? ` {...${JSON.stringify(slotProps)}}` : '';
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
        throw new Error(
          `Native2DCompiler @hook: invalid import path ${JSON.stringify(importPath)}`
        );
      }
      // Optional args: an injection-safe expression passed to the hook call, e.g.
      // useCreatorStats({ address }). Same char-class as @computed plus object-literal
      // braces; backticks/semicolons are still rejected so no statements can be injected.
      let hookArgs = '';
      if (traits.hook.args != null) {
        hookArgs = String(traits.hook.args);
        // eslint-disable-next-line no-useless-escape
        if (!/^[a-zA-Z0-9_$.,(){}\[\]'"/\s*+\-%<>=?:!&|]+$/.test(hookArgs)) {
          throw new Error(`Native2DCompiler @hook: unsafe args ${JSON.stringify(hookArgs)}`);
        }
      }
      if (!this._hookCalls.some((h) => h.name === hookName)) {
        this._hookCalls.push({
          name: hookName,
          import: importPath,
          returns: String(traits.hook.returns || ''),
          args: hookArgs || undefined,
        });
      }
    }

    // @computed{name, expr, from?, uses?} — a derived value from state/props, emitted as
    // `const {name} = {expr};` after the state hooks. `expr` is an injection-safe expression
    // (identifiers, member access, calls, literals, arithmetic/logical operators — NO
    // backticks or semicolons). Optional `from` + `uses` import the symbols the expr calls
    // (e.g. compileAST), mirroring @hook's import handling. Closes the pinned @computed gap.
    if (traits.computed?.name && traits.computed?.expr) {
      const cname = String(traits.computed.name);
      const expr = String(traits.computed.expr);
      if (!/^[A-Za-z_$][\w$]*$/.test(cname)) {
        throw new Error(`Native2DCompiler @computed: invalid name ${JSON.stringify(cname)}`);
      }
      // eslint-disable-next-line no-useless-escape
      if (!/^[a-zA-Z0-9_$.,()\[\]'"/\s*+\-%<>=?:!&|]+$/.test(expr)) {
        throw new Error(`Native2DCompiler @computed: unsafe expr ${JSON.stringify(expr)}`);
      }
      const from = traits.computed.from ? String(traits.computed.from) : '';
      if (from && /['"`\\]/.test(from)) {
        throw new Error(`Native2DCompiler @computed: invalid import path ${JSON.stringify(from)}`);
      }
      const usesRaw = traits.computed.uses;
      const uses = (Array.isArray(usesRaw) ? usesRaw : usesRaw ? [usesRaw] : [])
        .map(String)
        .filter((u) => /^[A-Za-z_$][\w$]*$/.test(u));
      if (!this._computedBindings.some((b) => b.name === cname)) {
        this._computedBindings.push({ name: cname, expr, from: from || undefined, uses });
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

    // Receipt-Bound Surface: enforce honest mode + emit the provenance receipt. Runs
    // before the element branch so the attributes reach chart/sparkline/generic alike.
    const prov = this.resolveProvenance(traits, obj);
    if (prov) props += prov.propsStr;

    // Verified view (slice 4): enforce the projection contract + emit the
    // projection receipt. Same placement rationale as resolveProvenance.
    const proj = this.resolveProjection(traits, obj);
    if (proj) props += proj;

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
      // template-literal className so it re-evaluates every render. The tier
      // cascade OWNS the color families it assigns, so strip those families
      // from the static prefix — otherwise a variant-default color (e.g. the
      // caption default text-gray-500) both leaks as a raw color AND is dead
      // weight, since the appended dynamic class always overrides it.
      const tierFamilies = this.tierColorFamilies(traits);
      const cleaned = this.stripColorFamilies(
        this.resolveColorConflicts(classes.join(' ')),
        tierFamilies
      );
      const staticPrefix = cleaned ? `${cleaned} ` : '';
      props += ` className={\`${staticPrefix}\${${tierExpr}}\`}`;
    } else if (classes.length > 0) {
      props += ` className="${this.resolveColorConflicts(classes.join(' '))}"`;
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
    // Preferred: @action{on, emit, args} — declarative event dispatch via context.emit.
    //   on:   DOM event name ('click', 'submit', 'change', 'focus', …)
    //   emit: action/event name to emit (maps to context.emit(emit, ...args) in runtime)
    //   args: optional array of arguments (strings/numbers)
    // @event{on, handler} — declarative event with a raw handler expression (injection-safe:
    //   only identifier + dot-path characters are accepted; arbitrary JS is rejected).
    // Legacy: @button{onClick} / @form{onSubmit} string-sniff kept for backward compat.
    if (traits.action) {
      const on = String(traits.action.on || 'click').toLowerCase();
      const emit = String(traits.action.emit || '');
      const rawArgs: unknown[] = Array.isArray(traits.action.args) ? traits.action.args : [];
      const safeArgs = rawArgs.map((a) => JSON.stringify(a)).join(', ');
      const argsExpr = safeArgs ? `, ${safeArgs}` : '';
      const handler = emit ? `context.emit(${JSON.stringify(emit)}${argsExpr})` : 'undefined';
      const reactEvent = on === 'submit' ? 'onSubmit' : on === 'change' ? 'onChange' : 'onClick';
      const wrapArg = on === 'submit' ? 'e' : '';
      props += wrapArg
        ? ` ${reactEvent}={(${wrapArg}) => { ${wrapArg}.preventDefault(); ${handler}; }}`
        : ` ${reactEvent}={() => { ${handler}; }}`;
    } else if (traits.event) {
      // @event{on, handler} — raw handler expression. Injection-safe: only
      // identifier + call + dot-path characters are permitted.
      const on = String(traits.event.on || 'click').toLowerCase();
      const rawHandler = String(traits.event.handler || '');
      // Allow: identifiers, parens, dots, commas, quotes, spaces, slashes (paths).
      // Reject anything else (semicolons, backticks, template literals, etc.).
      const safe = /^[a-zA-Z0-9_.,()'"/\s-]+$/.test(rawHandler);
      if (safe && rawHandler) {
        const reactEvent = on === 'submit' ? 'onSubmit' : on === 'change' ? 'onChange' : 'onClick';
        const wrapArg = on === 'submit' ? 'e' : '';
        props += wrapArg
          ? ` ${reactEvent}={(${wrapArg}) => ${rawHandler}}`
          : ` ${reactEvent}={() => ${rawHandler}}`;
      }
    } else if (traits.button?.onClick || traits.form?.onSubmit) {
      // Legacy string-sniff path — kept for backward compat with existing .holo
      // compositions that use @button{onClick:"navigate(...)"}.
      const action = traits.button?.onClick || traits.form?.onSubmit;
      if (action) {
        const cleanAction = action.replace(/["']/g, "'");
        if (cleanAction.includes('navigate')) {
          props += ` onClick={() => ${cleanAction}}`;
        } else if (cleanAction.includes('submit')) {
          props += ` onSubmit={(e) => ${cleanAction}}`;
        } else if (cleanAction.includes('window.open')) {
          props += ` onClick={() => ${cleanAction}}`;
        } else {
          props += ` onClick={() => console.log('${cleanAction}')}`;
        }
      }
    }

    // @model{state, path} — two-way binding for input/select/textarea.
    // Emits value={state.path} onChange={(e) => setState(e.target.value)}.
    // state: the React state variable name (must have a corresponding useState setter).
    // path:  optional sub-path for nested state (e.g. 'form.email'); defaults to state.
    if (traits.model && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
      const stateVar = String(traits.model.state || '');
      const subPath = traits.model.path ? String(traits.model.path) : '';
      if (stateVar) {
        // Derive setter name: 'myState' → 'setMyState'
        const setter = `set${stateVar.charAt(0).toUpperCase()}${stateVar.slice(1)}`;
        const valueExpr = subPath ? `${stateVar}.${subPath}` : stateVar;
        // Numeric inputs (range/number) or explicit `cast: number` coerce the string event
        // value so the bound state stays numeric (else e.g. a range slider makes state a string).
        const inputType = String(traits.input?.type || '').toLowerCase();
        const numeric =
          traits.model.cast === 'number' || inputType === 'range' || inputType === 'number';
        const getter = numeric ? 'Number(e.target.value)' : 'e.target.value';
        props += ` value={${valueExpr}} onChange={(e) => ${setter}(${getter})}`;
      }
    }

    // Media & Input props
    if (traits.image?.src) props += ` src="${traits.image.src}"`;
    if (traits.image?.alt) props += ` alt="${traits.image.alt}"`;
    if (traits.link?.href) props += ` href="${traits.link.href}"`;
    if (traits.input?.placeholder) props += ` placeholder="${traits.input.placeholder}"`;
    if (traits.input?.type) props += ` type="${traits.input.type}"`;
    if (traits.input?.required) props += ` required`;
    if (traits.input?.min != null) props += ` min="${String(traits.input.min)}"`;
    if (traits.input?.max != null) props += ` max="${String(traits.input.max)}"`;
    if (traits.input?.step != null) props += ` step="${String(traits.input.step)}"`;
    if (traits.button?.type) props += ` type="${traits.button.type}"`;

    const childrenMarkup = ((obj.children || obj.objects || []) as Record<string, unknown>[])
      .map((child: Record<string, unknown>) => this.generateReactNode(child))
      .join('\n');

    const content =
      traits.text?.content || traits.button?.content || traits.link?.content || traits.icon?.name;
    let safeContent = '';
    // @bind: emit a reactive JSX expression reading a state variable path
    if (traits.bind?.state) {
      safeContent = this.buildBindContentExpr(traits.bind);
    } else if (content) {
      safeContent = `{\`${content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`}`;
    }

    // Visible honesty glyph on a non-measured @provenance_bound text value: an inferred
    // metric reads e.g. `1,240~`, a generative one `Summary✦`. The machine-readable
    // receipt lives on props; this is the human-visible signal. measured = trusted (no mark).
    if (prov && safeContent && Native2DCompiler.PROVENANCE_GLYPH[prov.cls]) {
      safeContent += `<sup className="holo-prov-mark" title=${JSON.stringify(
        `provenance: ${prov.cls}`
      )}>${Native2DCompiler.PROVENANCE_GLYPH[prov.cls]}</sup>`;
    }

    // @each list iteration: render this node once per item of a bound array. The
    // node's own content/children can reference the loop variable (default `item`)
    // via @bind state=<as>. A React `key={i}` is injected so the list reconciles.
    // When the trait is ABSENT, `keyProp` is '' and the element is byte-identical
    // to the pre-@each output.
    const each = this.buildEachIterator(traits);
    const keyProp = each ? ` key={i}` : '';

    let element: string;
    if (tag === 'style') {
      const escapedStyle = (content || '').replace(/`/g, '\\`').replace(/\$/g, '\\$');
      element = `<style${keyProp} dangerouslySetInnerHTML={{ __html: \`${escapedStyle}\` }} />`;
    } else if (traits.sparkline?.state) {
      // @sparkline: render the bound numeric array as an inline SVG polyline.
      element = this.buildSparklineElement(traits, props, keyProp);
    } else if (traits.chart?.state) {
      // @chart: render the bound array as an SVG bar/line/area chart with a baseline.
      element = this.buildChartElement(traits, props, keyProp);
    } else if (traits.live_proof?.claim) {
      // @live_proof: a live falsification verdict — the receipt IS render state.
      element = this.buildLiveProofElement(traits, keyProp);
    } else if (tag === 'img' || tag === 'input') {
      element = `<${tag}${props}${keyProp} />`;
    } else {
      element = `<${tag}${props}${keyProp}>
      ${safeContent}
      ${childrenMarkup}
    </${tag}>`;
    }

    // @each wraps the element in a `.map` over the bound array (applied first so
    // the conditional, if any, gates the whole iteration).
    if (each) {
      element = `{${each.array}.map((${each.as}, i) => (
      ${element.split('\n').join('\n  ')}
    ))}`;
    }

    // @when conditional render: wrap the (possibly iterated) element in
    // `{<cond> && (<element>)}`. When the trait is ABSENT, the element is
    // returned unchanged (byte-identical no-op).
    const whenCond = this.buildWhenCondition(traits);
    if (whenCond) {
      element = `{${whenCond} && (
      ${element.split('\n').join('\n  ')}
    )}`;
    }

    return element;
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
      .text-green-400 { color: #4ade80; }
      .text-yellow-400 { color: #facc15; }
      .text-red-400 { color: #f87171; }
      .text-studio-text { color: #f8fafc; }
      .text-studio-muted { color: #94a3b8; }
      .text-\\[15px\\] { font-size: 15px; line-height: 1.2; }
      .text-\\[9px\\] { font-size: 9px; line-height: 1.2; }
      /* --- Backgrounds --- */
      .bg-white { background-color: #fff; }
      .bg-gray-800 { background-color: #1f2937; }
      .bg-gray-900 { background-color: #111827; }
      .bg-gray-950 { background-color: #030712; }
      .bg-blue-600 { background-color: #2563eb; }
      .bg-blue-700 { background-color: #1d4ed8; }
      .bg-indigo-600 { background-color: #4f46e5; }
      .bg-indigo-500 { background-color: #6366f1; }
      .bg-studio-surface { background-color: #0f172a; }
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
      .p-2 { padding: 0.5rem; }
      .p-3 { padding: 0.75rem; }
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
      .border-studio-border { border-color: #334155; }
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
      .h-full { height: 100%; }
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
      .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tabular-nums { font-variant-numeric: tabular-nums; }
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
      .overflow-y-auto { overflow-y: auto; }
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
    <script>
      /* HoloScript Native2D bind runtime. Applies @bind text and threshold tiers
         to static HTML without React hydration. Tests and host shells can call
         window.__holoApplyNativeBindings({ snap: { fps: 60 } }). */
      (function () {
        function getPath(o, p) { return p.split('.').filter(Boolean).reduce(function (a, k) { return a == null ? a : a[k]; }, o); }
        function formatValue(el, value) {
          var hasPrecision = el.hasAttribute('data-holo-bind-precision');
          var hasPrefix = el.hasAttribute('data-holo-bind-prefix');
          var hasSuffix = el.hasAttribute('data-holo-bind-suffix');
          if (value == null) value = (hasPrecision || hasPrefix || hasSuffix) ? 0 : (el.getAttribute('data-holo-bind-fallback') || '');
          var text;
          if (hasPrecision) {
            var precision = Number(el.getAttribute('data-holo-bind-precision') || '0');
            var numeric = Number(value);
            text = (Number.isFinite(numeric) ? numeric : 0).toFixed(precision);
          } else {
            text = String(value);
          }
          return (el.getAttribute('data-holo-bind-prefix') || '') + text + (el.getAttribute('data-holo-bind-suffix') || '');
        }
        function tierClass(el, value) {
          var raw = el.getAttribute('data-holo-bind-tiers');
          if (!raw) return '';
          var tiers;
          try { tiers = JSON.parse(raw); } catch (_) { return ''; }
          var numeric = Number(value == null ? 0 : value);
          if (!Number.isFinite(numeric)) numeric = 0;
          for (var i = 0; i < tiers.length; i++) {
            var t = tiers[i] || {};
            var bounded = false;
            var ok = true;
            if (typeof t.gte === 'number') { bounded = true; ok = ok && numeric >= t.gte; }
            if (typeof t.gt === 'number') { bounded = true; ok = ok && numeric > t.gt; }
            if (typeof t.lte === 'number') { bounded = true; ok = ok && numeric <= t.lte; }
            if (typeof t.lt === 'number') { bounded = true; ok = ok && numeric < t.lt; }
            if (!bounded || ok) return t.className || '';
          }
          return '';
        }
        function applyBinding(el, data) {
          var state = el.getAttribute('data-holo-bind-state') || '';
          var path = el.getAttribute('data-holo-bind-path') || '';
          var value = getPath(data || {}, state + (path ? '.' + path : ''));
          el.textContent = formatValue(el, value);
          var base = el.getAttribute('data-holo-static-class') || '';
          var tier = tierClass(el, value);
          el.className = [base, tier].filter(Boolean).join(' ');
        }
        function applyAll(data) {
          document.querySelectorAll('[data-holo-bind-state]').forEach(function (el) { applyBinding(el, data || {}); });
        }
        window.__holoApplyNativeBindings = applyAll;
        window.addEventListener('holo:native-bind', function (event) { applyAll((event && event.detail) || {}); });
        function boot() { applyAll(window.__holoNativeState || {}); }
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

    const staticClassName = classes.join(' ');
    if (classes.length > 0) {
      props += ` class="${this.escapeHtmlAttr(staticClassName)}"`;
    }
    props += this.buildHTMLBindAttributes(traits, staticClassName);
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

    // Interactive attributes — HTML path
    // @action{on, emit, args}: emit a data-holo-action attribute the vanilla
    // runtime can read to dispatch context.emit() on the server-rendered page.
    // @event{on, handler}: inline handler string for progressive enhancement.
    // Legacy @button{onClick} / @form{onSubmit} kept for backward compat.
    if (traits.action) {
      const on = String(traits.action.on || 'click').toLowerCase();
      const emit = String(traits.action.emit || '');
      const rawArgs: unknown[] = Array.isArray(traits.action.args) ? traits.action.args : [];
      const payload = JSON.stringify({ emit, args: rawArgs });
      props += ` data-holo-action-on="${on}" data-holo-action='${payload.replace(/'/g, '&#39;')}'`;
    } else if (traits.event) {
      const on = String(traits.event.on || 'click').toLowerCase();
      const rawHandler = String(traits.event.handler || '');
      const safe = /^[a-zA-Z0-9_.,()'"/\s-]+$/.test(rawHandler);
      if (safe && rawHandler) {
        const attrName = on === 'submit' ? 'onsubmit' : on === 'change' ? 'onchange' : 'onclick';
        props += ` ${attrName}="${rawHandler.replace(/"/g, '&quot;')}"`;
      }
    } else {
      if (traits.button?.onClick) props += ` onclick="${traits.button.onClick}"`;
      if (traits.form?.onSubmit) props += ` onsubmit="${traits.form.onSubmit}"`;
    }
    // @model{state, path}: data attribute for SSR hydration of two-way bindings.
    if (traits.model && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
      const stateVar = String(traits.model.state || '');
      const subPath = traits.model.path ? `.${traits.model.path}` : '';
      if (stateVar) props += ` data-holo-model="${stateVar}${subPath}"`;
    }
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

    const content = traits.bind
      ? this.buildHTMLBindFallbackContent(traits.bind)
      : traits.text?.content || traits.button?.content || traits.link?.content || traits.icon?.name;

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
   * Each tier may specify `gte` (>=), `gt` (>), `lte` (<=), and/or `lt` (<) for
   * numeric thresholds, OR `eq`/`neq` for exact-match categories (e.g. a
   * security audit outcome: `{ eq: "denied", className: "text-red-400" }`).
   * `eq`/`neq` accept a string or a number; string operands pass the same
   * injection guard as `@when eq` and are emitted via JSON.stringify. When any
   * tier compares strings, the bound value is coerced to `''` (not `0`) so the
   * cascade stays total before state loads without mis-coercing a string to 0.
   * Conditions on one tier are AND-ed. A tier with no bounds is the
   * unconditional fallback (its className is the trailing `:` branch). If no
   * tier is unconditional, an empty-string fallback is appended so the
   * expression is always total.
   */
  private buildBindTierClassName(traits: Record<string, any>): string | null {
    const bind = traits.bind;
    if (!bind || !Array.isArray(bind.tiers) || bind.tiers.length === 0) return null;

    // Resolve the bound value reference exactly the same way the content
    // expression does. Numeric tiers coerce with `?? 0`; string-equality tiers
    // coerce with `?? ''` so the cascade stays total before state has loaded.
    const baseExpr = this.buildStatePathExpr(
      String(bind.state),
      String(bind.path || ''),
      '@bind tiers'
    );

    const tiers = bind.tiers as Array<Record<string, unknown>>;
    const usesStringCompare = tiers.some(
      (t) => typeof t.eq === 'string' || typeof t.neq === 'string'
    );
    const valueRef = usesStringCompare ? `(${baseExpr} ?? '')` : `(${baseExpr} ?? 0)`;

    const branches: Array<{ condition: string | null; className: string }> = [];

    for (const tier of tiers) {
      const className = typeof tier.className === 'string' ? tier.className : '';
      const conditions: string[] = [];
      if (typeof tier.gte === 'number') conditions.push(`${valueRef} >= ${tier.gte}`);
      if (typeof tier.gt === 'number') conditions.push(`${valueRef} > ${tier.gt}`);
      if (typeof tier.lte === 'number') conditions.push(`${valueRef} <= ${tier.lte}`);
      if (typeof tier.lt === 'number') conditions.push(`${valueRef} < ${tier.lt}`);
      if (typeof tier.eq === 'number') conditions.push(`${valueRef} === ${tier.eq}`);
      else if (typeof tier.eq === 'string')
        conditions.push(
          `${valueRef} === ${JSON.stringify(this.assertSafeLiteral(tier.eq, '@bind tier eq'))}`
        );
      if (typeof tier.neq === 'number') conditions.push(`${valueRef} !== ${tier.neq}`);
      else if (typeof tier.neq === 'string')
        conditions.push(
          `${valueRef} !== ${JSON.stringify(this.assertSafeLiteral(tier.neq, '@bind tier neq'))}`
        );
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

  /**
   * @sparkline: render a bound numeric array as an inline SVG polyline — the
   * smallest slice of native data-viz (no axes/legend). The points are computed
   * at render time from the array, normalized into a fixed viewBox
   * (`width`×`height`, default 100×30) with `preserveAspectRatio="none"` so the
   * SVG fills its CSS box. `state`(+optional `path`) is the array; `valueKey`
   * reads a number out of object items (e.g. items `{sizeKb}` → valueKey
   * "sizeKb"); `stroke` is a themeable line-color class (default
   * `stroke-studio-accent`). Container styling (`@theme`/`@layout`) rides in on
   * `props`. Dependency-free, injection-safe: identifiers are validated and the
   * points expression uses string concatenation (no inner template literals).
   */
  private buildSparklineElement(
    traits: Record<string, any>,
    props: string,
    keyProp: string
  ): string {
    const sp = traits.sparkline;
    const state = this.assertSafeDotPath(String(sp.state), '@sparkline state');
    const path = sp.path ? String(sp.path) : '';
    if (path) this.assertSafeDotPath(path, '@sparkline path');
    const arrayRef = this.buildStatePathExpr(state, path, '@sparkline');

    const W = Number.isInteger(sp.width) && sp.width > 0 ? sp.width : 100;
    const H = Number.isInteger(sp.height) && sp.height > 0 ? sp.height : 30;

    let valueExpr = 'd';
    if (sp.valueKey != null) {
      const vk = String(sp.valueKey);
      if (!/^[A-Za-z_$][\w$]*$/.test(vk)) {
        throw new Error(`Native2DCompiler @sparkline: invalid valueKey ${JSON.stringify(vk)}`);
      }
      valueExpr = `d?.${vk}`;
    }

    const stroke =
      typeof sp.stroke === 'string'
        ? this.assertSafeLiteral(sp.stroke, '@sparkline stroke')
        : 'stroke-studio-accent';
    const strokeWidth = /^[0-9]+(\.[0-9]+)?$/.test(String(sp.strokeWidth ?? ''))
      ? String(sp.strokeWidth)
      : '1.5';

    // Runtime points builder: normalize the array into `${W}×${H}` coordinates.
    // String concatenation (not template literals) keeps the emitted code free of
    // backticks so it nests cleanly inside the generated component.
    const points =
      `((__a) => { const __v = (__a ?? []).map((d) => Number(${valueExpr}) || 0); ` +
      `if (!__v.length) return ''; ` +
      `const __mn = Math.min(...__v), __mx = Math.max(...__v), __r = (__mx - __mn) || 1, ` +
      `__sx = __v.length > 1 ? ${W} / (__v.length - 1) : 0; ` +
      `return __v.map((y, i) => (i * __sx).toFixed(2) + ',' + (${H} - ((y - __mn) / __r) * ${H}).toFixed(2)).join(' '); ` +
      `})(${arrayRef})`;

    // HONEST FRAMING (deliberate): a sparkline KEEPS min-max normalization in ALL
    // modes, including @honest. It is an axis-less shape glyph — no ticks, no labels,
    // no magnitude axis — whose entire purpose is shape-reading; anchoring it at zero
    // would flatten the shape and destroy that purpose rather than make it more
    // honest. Min-max is therefore the legitimate framing here, and the honest
    // contract is the DECLARATION: `data-baseline="min"` is emitted unconditionally,
    // mirroring the @chart data-baseline receipt, so an independent consumer can
    // audit the framing instead of trusting the pixels.
    return `<svg${props}${keyProp} data-baseline="min" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <polyline fill="none" className="${stroke}" strokeWidth="${strokeWidth}" points={${points}} />
    </svg>`;
  }

  /**
   * @chart: the fuller native data-viz primitive — a bar / line / area chart with
   * a baseline axis and (bar) crisp category labels. Unlike @sparkline (fill-the-box,
   * no axes), @chart uses a fixed-aspect viewBox with margins so `<text>` labels stay
   * undistorted. Geometry is computed at render time from the bound array; a bar chart
   * emits one `<rect>` per item, line/area emit a `<polyline>`/`<polygon>` over the
   * plot region. Injection-safe: `state`/`path`/`valueKey`/`labelKey` are validated
   * identifiers/dot-paths, `stroke`/`fill` pass the literal guard, and the point math
   * uses string concatenation (no inner template literals).
   *
   * `@chart { kind: "bar"|"line"|"area", state, path?, valueKey?, labelKey?,
   *           width?, height?, stroke?, fill? }`
   */
  private buildChartElement(traits: Record<string, any>, props: string, keyProp: string): string {
    const ch = traits.chart;
    const kind = ch.kind === 'line' || ch.kind === 'area' ? ch.kind : 'bar';
    const state = this.assertSafeDotPath(String(ch.state), '@chart state');
    const path = ch.path ? String(ch.path) : '';
    if (path) this.assertSafeDotPath(path, '@chart path');
    const arrayRef = this.buildStatePathExpr(state, path, '@chart');

    let valueExpr = 'd';
    if (ch.valueKey != null) {
      const vk = String(ch.valueKey);
      if (!/^[A-Za-z_$][\w$]*$/.test(vk)) {
        throw new Error(`Native2DCompiler @chart: invalid valueKey ${JSON.stringify(vk)}`);
      }
      valueExpr = `d?.${vk}`;
    }
    let labelKey = '';
    if (ch.labelKey != null) {
      labelKey = String(ch.labelKey);
      if (!/^[A-Za-z_$][\w$]*$/.test(labelKey)) {
        throw new Error(`Native2DCompiler @chart: invalid labelKey ${JSON.stringify(labelKey)}`);
      }
    }
    // classKey (bar only): per-item provenance — each bar's fill reflects its data-value
    // provenance class (measured/derived = solid, inferred = hatch, generative = dots), so
    // honesty is visible at the BAR level. Extends the Receipt-Bound Surface to per-datum.
    let classKey = '';
    if (ch.classKey != null) {
      classKey = String(ch.classKey);
      if (!/^[A-Za-z_$][\w$]*$/.test(classKey)) {
        throw new Error(`Native2DCompiler @chart: invalid classKey ${JSON.stringify(classKey)}`);
      }
    }

    const W = Number.isInteger(ch.width) && ch.width > 0 ? ch.width : 280;
    const H = Number.isInteger(ch.height) && ch.height > 0 ? ch.height : 140;
    const stroke =
      typeof ch.stroke === 'string'
        ? this.assertSafeLiteral(ch.stroke, '@chart stroke')
        : 'stroke-studio-accent';
    const fill =
      typeof ch.fill === 'string'
        ? this.assertSafeLiteral(ch.fill, '@chart fill')
        : 'fill-studio-accent';

    // Fixed-aspect layout with margins: bottom band for labels keeps text crisp.
    const PX = 6;
    const PT = 8;
    const PB = labelKey && kind === 'bar' ? 16 : 6;
    const plotW = W - 2 * PX;
    const plotH = H - PT - PB;
    const baselineY = H - PB;

    const baseline = `<line x1="${PX}" y1="${baselineY}" x2="${W - PX}" y2="${baselineY}" className="stroke-studio-border" strokeWidth="0.5" />`;

    // Per-item provenance patterns (classKey): SVG defs referenced by non-measured bars
    // so an inferred bar is hatched and a generative bar is dotted — visible honesty.
    const provDefs = classKey
      ? `<defs><pattern id="holo-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" className="stroke-studio-accent" strokeWidth="1.2" /></pattern><pattern id="holo-dots" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="0.6" className="fill-studio-accent" /></pattern></defs>`
      : '';

    let body: string;
    if (kind === 'bar') {
      const label = labelKey
        ? `<text x={__x + __bw / 2} y={${H - 4}} textAnchor="middle" className="fill-studio-muted" fontSize="6">{String(d?.${labelKey} ?? '')}</text>`
        : '';
      // Per-bar provenance fill: an inferred bar shows the hatch pattern, a generative bar
      // the dots; measured/derived keep the solid fill className. The explicit `fill`
      // attribute overrides the class only when a pattern applies (undefined = solid).
      const provFill = classKey
        ? ` fill={d?.${classKey} === "inferred" ? "url(#holo-hatch)" : d?.${classKey} === "generative" ? "url(#holo-dots)" : undefined} data-provenance-class={String(d?.${classKey} ?? "")}`
        : '';
      // NEGATIVE VALUES: a negative bar height is invalid SVG (and a zero-anchored
      // bar cannot draw below its baseline), so each value is clamped to 0 at render
      // time — and the truncation is DECLARED via the runtime-computed `data-clamped`
      // attribute on the svg root (see clampedAttr below). Split-axis rendering
      // (bars descending below a mid-chart zero line) is deliberately out of scope
      // here — future work if a consumer needs signed bar charts.
      body =
        `{((__a) => { const __d = (__a ?? []); ` +
        `const __v = __d.map((d) => Number(${valueExpr}) || 0); ` +
        `const __max = Math.max(1, ...__v); const __n = __d.length || 1; ` +
        `const __slot = ${plotW} / __n; const __bw = Math.max(1, Math.min(__slot * 0.62, __slot - 1)); ` +
        `return __d.map((d, i) => { const __h = Math.max(0, Number(${valueExpr}) || 0) / __max * ${plotH}; ` +
        `const __x = ${PX} + i * __slot + (__slot - __bw) / 2; const __y = ${baselineY} - __h; ` +
        `return (<g key={i}><rect x={__x} y={__y} width={__bw} height={__h} className="${fill}"${provFill} rx="0.5" />${label}</g>); }); ` +
        `})(${arrayRef})}`;
    } else {
      // line / area: polyline over the plot region; area closes to a polygon.
      // Honest framing: min-max normalization exaggerates variation (the classic
      // truncated-axis dark pattern), so in @honest mode the baseline is anchored at
      // ZERO and the range at max — mirroring the bar branch. Framing is per-chart
      // auditable via the `data-baseline` attribute on the svg root.
      const norm = this._honestMode
        ? `const __mn = 0, __r = Math.max(1, ...__v), `
        : `const __mn = Math.min(...__v), __mx = Math.max(...__v), __r = (__mx - __mn) || 1, `;
      // NEGATIVE VALUES (honest mode): with the baseline anchored at zero a negative
      // y would plot BELOW the axis line (misleading geometry), so each value is
      // clamped to the baseline at render time and the truncation is declared via
      // the `data-clamped` attribute on the svg root (see clampedAttr below).
      // Non-honest min-max framing handles negative values natively (min re-anchors
      // the range), so it is left untouched. Split-axis rendering for signed series
      // is deliberately out of scope — future work.
      const yExpr = this._honestMode ? 'Math.max(0, y)' : 'y';
      const pts =
        `((__a) => { const __v = (__a ?? []).map((d) => Number(${valueExpr}) || 0); ` +
        `if (!__v.length) return ''; ` +
        norm +
        `__sx = __v.length > 1 ? ${plotW} / (__v.length - 1) : 0; ` +
        `return __v.map((y, i) => (${PX} + i * __sx).toFixed(2) + ',' + (${baselineY} - ((${yExpr} - __mn) / __r) * ${plotH}).toFixed(2)).join(' '); })(${arrayRef})`;
      const line = `<polyline fill="none" className="${stroke}" strokeWidth="1.5" points={${pts}} />`;
      if (kind === 'area') {
        const areaPts = `((__p) => __p ? __p + ' ' + ${W - PX} + ',' + ${baselineY} + ' ' + ${PX} + ',' + ${baselineY} : '')(${pts})`;
        body = `<polygon className="${fill}" fillOpacity="0.25" points={${areaPts}} />
      ${line}`;
      } else {
        body = line;
      }
    }

    // NOTE: no preserveAspectRatio="none" here (unlike @sparkline) — a chart carries
    // `<text>` labels, so it must scale uniformly (default xMidYMid meet) to keep text
    // crisp; the fixed-aspect viewBox + `w-full` sizes it by width with height derived.
    // `data-baseline` makes the y-axis framing itself part of the receipt: bars are
    // always zero-anchored; line/area are zero-anchored in @honest mode, min-anchored
    // otherwise — an independent consumer can audit the framing, not just the values.
    const baselineAttr = ` data-baseline="${kind === 'bar' || this._honestMode ? 'zero' : 'min'}"`;
    // `data-clamped` declares the render-time truncation: runtime-computed true when
    // any bound value is negative (and was therefore clamped to the zero baseline).
    // Emitted exactly where zero-baseline clamp math applies — bars in every mode,
    // line/area only in @honest mode. Non-honest line/area min-max needs no clamp
    // and stays attribute-free (byte-identical to pre-clamp output).
    const clampedAttr =
      kind === 'bar' || this._honestMode
        ? ` data-clamped={String(((__a) => (__a ?? []).some((d) => (Number(${valueExpr}) || 0) < 0))(${arrayRef}))}`
        : '';
    return `<svg${props}${keyProp}${baselineAttr}${clampedAttr} viewBox="0 0 ${W} ${H}">
      ${provDefs}
      ${baseline}
      ${body}
    </svg>`;
  }

  /**
   * Receipt-Bound Surface enforcement + emission (@honest / @provenance_bound).
   *
   * A "data-bound" element (one that renders a value from state via @bind/@chart/
   * @sparkline/@model) must, in honest mode, carry `@provenance_bound {source, class}`
   * — otherwise the compiler THROWS (HONEST-UNSOURCED): the surface cannot emit an
   * unsourced pixel. When provenance IS present, this returns the inline receipt
   * attributes (`data-holo-provenance` = a machine-readable {source,class,confidence}
   * an independent consumer can re-derive against, `data-provenance-class`) plus the
   * class so the caller can add a visible honesty glyph to text values. An unknown
   * class is rejected (fail toward lower trust — never silently upgraded to measured).
   * Returns null when the element is not provenance-bound (no attributes, no glyph).
   */
  /**
   * @verified_view / @projects — the admission gate for agent-authored
   * surfaces (slice 4 of the Receipt-Bound Surface, honest v0).
   *
   * `@projects { node: "stats.sessions" }` is the AUTHOR'S CLAIM of which
   * world-model node an element renders. This compiler owns the actual data
   * path (@bind/@chart/@sparkline/@model → state[.path]), so the claim is
   * verified as compiler-owned DATA-FLOW — the two sides are independently
   * authored, which is exactly what the shallow "source is non-empty" version
   * (rejected as theater in the slice-4 warning) lacks. Checks, all fatal
   * (VIEW-UNGROUNDED):
   *   1. a declared projection must MATCH the element's actual bound path —
   *      "the agent says sessions but wired revenue" fails to compile;
   *   2. a projection must root in a REAL node (composition state or a @fetch
   *      into-slot) — a hallucinated node fails to compile;
   *   3. a projection on an element with NO data binding is a lie by
   *      construction — fails to compile;
   *   4. under composition-level `@verified_view`, every data-bound element
   *      MUST declare a projection (mirrors HONEST-UNSOURCED).
   * Checks 1–3 are always-on (a lying receipt is worse than none); check 4 is
   * the mode. Verified elements emit `data-holo-projects` so independent
   * consumers can re-check the claim against the artifact. HONEST SCOPE:
   * runtime re-derivation against a live graph.holo world model (the full
   * research-spec `projects:` semantics + SimulationContract co-emission) is
   * v1+ — this v0 proves what the compiler can prove, statically.
   */
  private resolveProjection(
    traits: Record<string, any>,
    obj: Record<string, unknown>
  ): string | null {
    const nm = () => String((obj as { name?: unknown }).name ?? 'element');
    // The element's ACTUAL bound data path, from whichever binding trait it carries.
    const src = traits.bind?.state
      ? { state: traits.bind.state, path: traits.bind.path }
      : traits.chart?.state
        ? { state: traits.chart.state, path: traits.chart.path }
        : traits.sparkline?.state
          ? { state: traits.sparkline.state, path: traits.sparkline.path }
          : traits.model?.state
            ? { state: traits.model.state, path: traits.model.path }
            : // @each renders a LIST from state — the element's provenance is the bound array.
              traits.each?.state
              ? { state: traits.each.state, path: traits.each.path }
              : null;
    const actualPath = src ? `${String(src.state)}${src.path ? '.' + String(src.path) : ''}` : null;

    const pj = traits.projects;
    if (!pj) {
      if (this._verifiedViewMode && actualPath) {
        throw new Error(
          `Native2DCompiler @verified_view: VIEW-UNGROUNDED — "${nm()}" renders data without @projects {node}; an agent-authored surface ships only if every element declares what it renders`
        );
      }
      return null;
    }

    const node = this.assertSafeDotPath(String(pj.node ?? ''), '@projects node');
    if (!actualPath) {
      throw new Error(
        `Native2DCompiler @projects: VIEW-UNGROUNDED — "${nm()}" claims to project "${node}" but has no data binding at all; the claim is a lie by construction`
      );
    }
    if (node !== actualPath) {
      throw new Error(
        `Native2DCompiler @projects: VIEW-UNGROUNDED — "${nm()}" claims to project "${node}" but is actually bound to "${actualPath}"; the surface would lie about its source`
      );
    }
    const root = node.split('.')[0];
    if (!this._projectionRoots.has(root)) {
      throw new Error(
        `Native2DCompiler @projects: VIEW-UNGROUNDED — "${nm()}" projects "${node}" but no state node "${root}" exists (hallucinated node; declared state keys and @fetch slots: ${[...this._projectionRoots].join(', ') || 'none'})`
      );
    }
    // Record the verified projection for the co-emitted view contract (v1).
    // identity = a transform-free scalar @bind (raw displayed value == raw source).
    const b = traits.bind;
    const identity =
      !!b?.state &&
      b.precision === undefined &&
      b.prefix === undefined &&
      b.suffix === undefined &&
      !b.tiers &&
      !traits.chart &&
      !traits.sparkline &&
      !traits.each &&
      !traits.model;
    // Slice 3 — the declared value transform for a FORMATTED plain @bind (precision/prefix/suffix),
    // mirrored from the same trait fields the render path formats with (buildBindContentExpr). An
    // independent checker re-applies it to the authoritative twin value instead of abstaining. Tiers
    // change COLOUR not the number, so they don't gate this; @chart/@sparkline/@each/@model carry no
    // scalar value transform and stay un-checked (abstain). Mutually exclusive with `identity`.
    let transform: { precision?: number; prefix?: string; suffix?: string } | undefined;
    if (
      b?.state &&
      !traits.chart &&
      !traits.sparkline &&
      !traits.each &&
      !traits.model &&
      (b.precision !== undefined || b.prefix !== undefined || b.suffix !== undefined)
    ) {
      transform = {};
      if (typeof b.precision === 'number') transform.precision = b.precision;
      if (b.prefix !== undefined) transform.prefix = String(b.prefix);
      if (b.suffix !== undefined) transform.suffix = String(b.suffix);
    }
    // Optional twin entity binding (v1 Framing B): the StateAuthority entity this projection
    // mirrors. Recorded in the contract so an independent checker can compare the displayed
    // value against the authoritative twin value (fetch_authoritative_state).
    let entity: string | undefined;
    if (pj.entity !== undefined) {
      const e = String(pj.entity);
      if (!/^[A-Za-z0-9_.:-]+$/.test(e)) {
        throw new Error(
          `Native2DCompiler @projects: invalid entity id ${JSON.stringify(e)} on "${nm()}" (allowed: alphanumerics and . : _ -)`
        );
      }
      entity = e;
    }
    this._collectedProjections.push({
      element: nm(),
      node,
      ...(entity ? { entity } : {}),
      identity,
      ...(transform ? { transform } : {}),
    });
    return ` data-holo-projects="${node}"`;
  }

  /**
   * @verified_view v1 — build the co-emitted view contract: a portable, sha256-bound JSON
   * receipt of every verified projection plus the valid state roots. The contract travels
   * WITH the compiled artifact (`export const holoViewContract` + a `data-holo-view-contract`
   * hash on the root), so an independent consumer re-derives the projection set from the
   * emitted `data-holo-projects` attributes and checks it against this contract — the two
   * emission paths cannot silently drift, and the surface's honesty becomes one verifiable
   * receipt instead of N scattered attributes (W.772). Returns null outside @verified_view
   * mode (un-gated surfaces carry no contract). Canonical: projections sorted by
   * (element, node) and roots sorted, so the hash is stable across traversal order.
   *
   * NOTE (v1 scope): this makes the projection contract portable and independently
   * re-checkable from the ARTIFACT — the foundation for runtime re-derivation. Verifying the
   * bound value against a LIVE graph.holo world model at runtime is the deeper v1 still to be
   * designed.
   */
  private buildViewContract(): { json: string; hash: string } | null {
    if (!this._verifiedViewMode) return null;
    const projections = [...this._collectedProjections].sort((a, b) =>
      a.element === b.element ? a.node.localeCompare(b.node) : a.element.localeCompare(b.element)
    );
    const stateRoots = [...this._projectionRoots].sort();
    const body = { version: Native2DCompiler.VIEW_CONTRACT_VERSION, projections, stateRoots };
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    return { json: JSON.stringify({ ...body, contractHash: hash }), hash };
  }

  private resolveProvenance(
    traits: Record<string, any>,
    obj: Record<string, unknown>
  ): { propsStr: string; cls: string } | null {
    // A @chart with `classKey` carries per-item provenance (each bar is self-sourced),
    // so it satisfies honest mode on its own and is NOT required to also declare a
    // single chart-level @provenance_bound. Every other data binding must be sourced.
    const dataBound = !!(
      traits.bind?.state ||
      (traits.chart?.state && !traits.chart?.classKey) ||
      traits.sparkline?.state ||
      traits.model
    );
    const pb = traits.provenance_bound;
    if (this._honestMode && dataBound && !pb) {
      const nm = String((obj as { name?: unknown }).name ?? 'element');
      throw new Error(
        `Native2DCompiler @honest: HONEST-UNSOURCED — "${nm}" renders data without @provenance_bound {source, class}; the surface cannot emit an unsourced pixel`
      );
    }
    if (!pb) return null;
    const cls = String(pb.class ?? '');
    if (!Native2DCompiler.PROVENANCE_CLASSES.has(cls)) {
      throw new Error(
        `Native2DCompiler @provenance_bound: invalid class ${JSON.stringify(cls)} — expected measured|derived|inferred|generative (unknown classes fail toward lower trust, never default to measured)`
      );
    }
    const source = this.assertSafeLiteral(String(pb.source ?? ''), '@provenance_bound source');
    const receipt: Record<string, unknown> = { source, class: cls };
    if (pb.confidence != null) {
      const c = Number(pb.confidence);
      if (Number.isFinite(c) && c >= 0 && c <= 1) receipt.confidence = c;
    }
    // Single-quoted JSX attribute holding the JSON receipt. The JSON has no single
    // quotes (assertSafeLiteral rejects them in `source`; class/confidence are controlled),
    // so single-quoting is safe and keeps the emitted receipt human-readable.
    const propsStr = ` data-holo-provenance='${JSON.stringify(receipt)}' data-provenance-class="${cls}"`;
    return { propsStr, cls };
  }

  /**
   * @live_proof: the falsifiable surface — the receipt is load-bearing RENDER STATE.
   *
   * `@live_proof { claim, label? }` declares a boolean claim over state (a theorem the
   * element asserts). It compiles to a self-styled verdict badge whose colour + text
   * FLIP live as the claim breaks: `✓ <label> holds` (green) vs `✗ <label> FALSIFIED`
   * (red). Because the claim re-evaluates on every render, dragging a bound parameter
   * (via a sibling @model slider) past the point where the theorem fails flips the
   * badge in-band — FALSIFIED is a render state, not a console log.
   *
   * DISCIPLINE (W.767/W.769): the claim must re-derive from INDEPENDENT state fields
   * (e.g. `capacity >= load * factor`), never re-read the displayed value — a
   * self-referential claim proves nothing. The compiler cannot enforce independence,
   * but the emitted `data-proof-claim` makes the predicate auditable. The claim is
   * injection-safe (same char-class as @computed; no backticks/semicolons).
   *
   * HONESTY LABEL (@verified_view v1 groundwork): the emitted `data-proof-state` re-runs the
   * SAME `cond` the badge renders from, so today it proves DISPLAY-FAITHFULNESS (the badge
   * matches its own formula), NOT independently-verified TRUTH of the claim. We refuse to let
   * that masquerade — `data-proof-independence="self-referential"` marks it so no consumer (or
   * the moat's own claims) mistakes it for a real proof. A v1 runtime verifier that re-derives
   * the claim's inputs through a path the render did not author (an external state store or a
   * solver/StateAuthority oracle) flips this to `"verified"`. Until that oracle exists, honest
   * labeling is the only non-theatre option (see research/2026-07-10_verified-view-v1-design.md).
   */
  private buildLiveProofElement(traits: Record<string, any>, keyProp: string): string {
    const lp = traits.live_proof;
    const claim = String(lp.claim ?? '');
    // eslint-disable-next-line no-useless-escape
    if (!claim.trim() || !/^[a-zA-Z0-9_$.,()\[\]'"/\s*+\-%<>=?:!&|]+$/.test(claim)) {
      throw new Error(
        `Native2DCompiler @live_proof: unsafe or empty claim ${JSON.stringify(claim)}`
      );
    }
    const label =
      lp.label != null ? this.assertSafeLiteral(String(lp.label), '@live_proof label') : 'Claim';
    const cond = `(${claim})`;
    return `<div${keyProp} data-proof-claim={${JSON.stringify(claim)}} data-proof-independence="self-referential" data-proof-state={${cond} ? "pass" : "falsified"} className={\`rounded-md p-2 text-xs font-semibold \${${cond} ? "bg-studio-success/10 text-studio-success" : "bg-studio-error/10 text-studio-error"}\`}>
      {${cond} ? "✓ ${label} holds" : "✗ ${label} FALSIFIED"}
    </div>`;
  }

  private buildHTMLBindAttributes(traits: Record<string, any>, staticClassName: string): string {
    const bind = traits.bind;
    if (!bind?.state) return '';

    const state = this.assertSafeDotPath(String(bind.state), '@bind state');
    const path = String(bind.path || '');
    if (path) this.assertSafeDotPath(path, '@bind path');

    const attrs: string[] = [
      ` data-holo-bind-state="${this.escapeHtmlAttr(state)}"`,
      ` data-holo-bind-fallback="${this.escapeHtmlAttr(this.bindFallbackForHTML(bind))}"`,
    ];
    if (path) attrs.push(` data-holo-bind-path="${this.escapeHtmlAttr(path)}"`);
    if (staticClassName)
      attrs.push(` data-holo-static-class="${this.escapeHtmlAttr(staticClassName)}"`);
    if (typeof bind.precision === 'number') {
      if (!Number.isInteger(bind.precision)) {
        throw new Error(
          `Native2DCompiler @bind: precision must be an integer, got ${JSON.stringify(bind.precision)}`
        );
      }
      attrs.push(` data-holo-bind-precision="${bind.precision}"`);
    }
    if (bind.prefix !== undefined) {
      const prefix = this.assertSafeTemplateLiteral(String(bind.prefix), '@bind prefix');
      attrs.push(` data-holo-bind-prefix="${this.escapeHtmlAttr(prefix)}"`);
    }
    if (bind.suffix !== undefined) {
      const suffix = this.assertSafeTemplateLiteral(String(bind.suffix), '@bind suffix');
      attrs.push(` data-holo-bind-suffix="${this.escapeHtmlAttr(suffix)}"`);
    }
    if (Array.isArray(bind.tiers) && bind.tiers.length > 0) {
      attrs.push(
        ` data-holo-bind-tiers="${this.escapeHtmlAttr(JSON.stringify(this.buildHTMLBindTiers(bind)))}"`
      );
    }
    return attrs.join('');
  }

  private buildHTMLBindFallbackContent(bind: Record<string, any>): string {
    let value = this.bindFallbackForHTML(bind);
    if (typeof bind.precision === 'number') {
      const numeric = Number(value);
      value = (Number.isFinite(numeric) ? numeric : 0).toFixed(bind.precision);
    }
    const prefix =
      bind.prefix !== undefined
        ? this.assertSafeTemplateLiteral(String(bind.prefix), '@bind prefix')
        : '';
    const suffix =
      bind.suffix !== undefined
        ? this.assertSafeTemplateLiteral(String(bind.suffix), '@bind suffix')
        : '';
    return this.escapeHtmlText(`${prefix}${value}${suffix}`);
  }

  private bindFallbackForHTML(bind: Record<string, any>): string {
    const hasFormatting =
      typeof bind.precision === 'number' || bind.prefix !== undefined || bind.suffix !== undefined;
    return String(bind.fallback ?? (hasFormatting ? 0 : ''));
  }

  private buildHTMLBindTiers(bind: Record<string, any>): Array<Record<string, string | number>> {
    return (bind.tiers as Array<Record<string, unknown>>).map((tier) => {
      const out: Record<string, string | number> = {
        className:
          typeof tier.className === 'string'
            ? this.assertSafeTemplateLiteral(tier.className, '@bind tier className')
            : '',
      };
      if (typeof tier.gte === 'number') out.gte = tier.gte;
      if (typeof tier.gt === 'number') out.gt = tier.gt;
      if (typeof tier.lte === 'number') out.lte = tier.lte;
      if (typeof tier.lt === 'number') out.lt = tier.lt;
      return out;
    });
  }

  private escapeHtmlAttr(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private escapeHtmlText(value: string): string {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --------------------------------------------------------------------------
  // Injection-safety guards — shared by @when / @each / @bind formatting.
  //
  // Every value that becomes part of an emitted JSX *expression* (a state name,
  // a dot-path, a loop variable, a comparison literal) is checked here BEFORE it
  // is interpolated, so authored .holo source can never escape its expression
  // context. The threat model mirrors buildBindTierClassName: identifiers must be
  // identifier-dotpaths; string/class literals may not carry the characters that
  // break out of a JS string / JSX braces (`" ' \` $ { } < > \`).
  // --------------------------------------------------------------------------

  /** Reject anything that isn't a dotted chain of JS identifiers (e.g. `snap.fps`,
   *  `agents.active`). Throws on empty, leading/trailing dots, or invalid chars so
   *  the value can be safely interpolated into a member-access expression. */
  private assertSafeDotPath(value: string, where: string): string {
    if (!/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(value)) {
      throw new Error(
        `Native2DCompiler ${where}: invalid identifier path ${JSON.stringify(value)}`
      );
    }
    return value;
  }

  /** Reject string/class literals that contain characters which would break out
   *  of the surrounding JS string or JSX expression. Used where the literal is
   *  compared as an equality operand. */
  private assertSafeLiteral(value: string, where: string): string {
    if (/["'`$(){}<>\\]/.test(value)) {
      throw new Error(`Native2DCompiler ${where}: unsafe literal ${JSON.stringify(value)}`);
    }
    return value;
  }

  /** Reject characters that would break out of a JS *template literal* context.
   *  A backtick closes the literal, a backslash starts an escape, and the `${`
   *  sequence opens an interpolation — those are the only break-outs. A lone `$`
   *  (e.g. a currency prefix `$5.00`) is harmless literal text and is allowed. */
  private assertSafeTemplateLiteral(value: string, where: string): string {
    if (/[`\\]/.test(value) || value.includes('${')) {
      throw new Error(`Native2DCompiler ${where}: unsafe literal ${JSON.stringify(value)}`);
    }
    return value;
  }

  /** Build a safe optional-chained member expression `state?.a?.b` from a
   *  validated state identifier and dot-path. Both halves are guarded. */
  private buildStatePathExpr(state: string, path: string, where: string): string {
    this.assertSafeDotPath(state, where);
    const pathParts = String(path || '')
      .split('.')
      .filter(Boolean);
    for (const p of pathParts) this.assertSafeDotPath(p, where);
    return pathParts.reduce((acc: string, key: string) => `${acc}?.${key}`, state);
  }

  /**
   * @when conditional render. `@when { state, path, gt?/gte?/lt?/lte?/eq? }` on a
   * node compiles to a boolean JS expression that the caller wraps as
   * `{<cond> && (<element>)}`. Numeric comparisons (gt/gte/lt/lte) are AND-ed using
   * the SAME `(ref ?? 0)` value-coercion as buildBindTierClassName so a badge only
   * shows when e.g. `dropped > 0`. `eq` supports string/number equality (e.g. show
   * an empty-state only when `status eq "empty"`). Returns `null` when the trait is
   * absent or specifies no comparison → caller emits the element unchanged.
   */
  private buildWhenCondition(traits: Record<string, any>): string | null {
    const when = traits.when;
    if (!when || !when.state) return null;
    const baseExpr = this.buildStatePathExpr(String(when.state), String(when.path || ''), '@when');

    const conditions: string[] = [];
    const numRef = `(${baseExpr} ?? 0)`;
    if (typeof when.gte === 'number') conditions.push(`${numRef} >= ${when.gte}`);
    if (typeof when.gt === 'number') conditions.push(`${numRef} > ${when.gt}`);
    if (typeof when.lte === 'number') conditions.push(`${numRef} <= ${when.lte}`);
    if (typeof when.lt === 'number') conditions.push(`${numRef} < ${when.lt}`);
    if (when.eq !== undefined) {
      if (typeof when.eq === 'number') {
        conditions.push(`(${baseExpr}) === ${when.eq}`);
      } else {
        const lit = this.assertSafeLiteral(String(when.eq), '@when eq');
        conditions.push(`(${baseExpr}) === ${JSON.stringify(lit)}`);
      }
    }

    if (conditions.length === 0) return null;
    return conditions.length === 1 ? conditions[0] : conditions.join(' && ');
  }

  /**
   * @each list iteration. `@each { state, path, as? }` on a node renders the node
   * once per item of the bound array. Returns `{ array, as }` where `array` is the
   * safe `(state?.path ?? [])` expression the caller `.map()`s over, and `as` is the
   * validated loop-variable name (default `item`). Children reference the item via
   * `@bind state=<as>`. Returns `null` when the trait is absent → no iteration.
   */
  private buildEachIterator(traits: Record<string, any>): { array: string; as: string } | null {
    const each = traits.each;
    if (!each || !each.state) return null;
    const baseExpr = this.buildStatePathExpr(String(each.state), String(each.path || ''), '@each');
    const asVar = each.as !== undefined ? String(each.as) : 'item';
    if (!/^[A-Za-z_$][\w$]*$/.test(asVar)) {
      throw new Error(`Native2DCompiler @each: invalid loop variable ${JSON.stringify(asVar)}`);
    }
    return { array: `(${baseExpr} ?? [])`, as: asVar };
  }

  /**
   * @bind content expression with optional formatting. The base reactive read is
   * `{state?.path ?? fallback}` (unchanged, byte-identical, when no formatting keys
   * are present). When `precision`, `suffix`, or `prefix` is supplied, the value is
   * wrapped in a template literal: e.g. `precision:1, suffix:"ms"` →
   * `{`${(snap?.path ?? 0).toFixed(1)}ms`}`. `prefix`/`suffix` are guarded literals;
   * `precision` must be an integer.
   */
  private buildBindContentExpr(bind: Record<string, any>): string {
    const baseExpr = this.buildStatePathExpr(String(bind.state), String(bind.path || ''), '@bind');
    const hasPrecision = typeof bind.precision === 'number';
    const hasSuffix = bind.suffix !== undefined;
    const hasPrefix = bind.prefix !== undefined;

    // No formatting keys → emit exactly as before (byte-identical).
    if (!hasPrecision && !hasSuffix && !hasPrefix) {
      const fallback = JSON.stringify(bind.fallback ?? '—');
      return `{${baseExpr} ?? ${fallback}}`;
    }

    if (hasPrecision && !Number.isInteger(bind.precision)) {
      throw new Error(
        `Native2DCompiler @bind: precision must be an integer, got ${JSON.stringify(bind.precision)}`
      );
    }
    const prefix = hasPrefix
      ? this.assertSafeTemplateLiteral(String(bind.prefix), '@bind prefix')
      : '';
    const suffix = hasSuffix
      ? this.assertSafeTemplateLiteral(String(bind.suffix), '@bind suffix')
      : '';
    const valueExpr = hasPrecision
      ? `(${baseExpr} ?? 0).toFixed(${bind.precision})`
      : `(${baseExpr} ?? 0)`;
    return `{\`${prefix}\${${valueExpr}}${suffix}\`}`;
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

  private static readonly TEXT_SIZE_TOKENS = new Set([
    'text-xs',
    'text-sm',
    'text-base',
    'text-lg',
    'text-xl',
    'text-2xl',
    'text-3xl',
    'text-4xl',
    'text-5xl',
    'text-6xl',
    'text-7xl',
    'text-8xl',
    'text-9xl',
  ]);

  /**
   * Resolve conflicting Tailwind COLOR utilities in a STATIC class string, keeping the LAST
   * of each color family. A node's @theme className is appended AFTER the variant defaults
   * (buildClasses), so this lets an authored token color win over a hardcoded default color
   * (e.g. @theme `text-studio-muted` overrides the caption default `text-gray-500`) — which
   * class actually wins otherwise depends on Tailwind's CSS emission order, not the class
   * attribute, so the default's raw color leaks unpredictably. Only color families are deduped
   * (text/bg/border/ring/…, incl. variant prefixes like hover:/focus:); sizes, spacing, and
   * layout are untouched, and text-<size> / border-<width> / ring-<width> are never colors.
   */
  /**
   * The Tailwind COLOR family a token belongs to (incl. variant prefixes like
   * hover:/focus:), or null for a non-color token. Shared by conflict-resolution
   * and tier-family stripping. text-<size> / text-<align> / border|ring|divide-<width>
   * and arbitrary values ([10px], [#fff]) are NOT colors.
   */
  private colorFamilyKey(t: string): string | null {
    const m = t.match(
      /^((?:[a-z-]+:)*)(text|bg|border|ring|ring-offset|divide|accent|fill|stroke|placeholder|caret|decoration|from|to|via)-(.+)$/
    );
    if (!m) return null;
    const [, variant, prop, rest] = m;
    if (rest.startsWith('[')) return null;
    if (prop === 'text') {
      if (Native2DCompiler.TEXT_SIZE_TOKENS.has(`text-${rest}`)) return null; // font-size, not color
      if (['left', 'center', 'right', 'justify', 'start', 'end'].includes(rest)) return null; // align
    }
    // bg- utilities that are not colors: gradient direction, clip, origin,
    // repeat, blend, attachment, size, and position (bg-gradient-to-r,
    // bg-clip-text, bg-cover, bg-center, ...). Treating these as the "bg"
    // color family made resolveColorConflicts drop bg-gradient-to-* whenever
    // bg-clip-text followed it, silently killing gradient text.
    if (prop === 'bg') {
      if (
        /^(gradient-to-[trbl]{1,2}|none|clip-.+|origin-.+|(no-)?repeat(-[xy]|-round|-space)?|blend-.+|auto|cover|contain|fixed|local|scroll|center|top|bottom|left|right|(top|bottom)-(left|right)|(left|right)-(top|bottom))$/.test(
          rest
        )
      ) {
        return null;
      }
    }
    // border/divide side+width (border-l, border-x-2, border-b, divide-y) and any
    // numeric width (border-2, ring-4) are NOT colors — a color is <prop>-<name>.
    if (prop === 'border' || prop === 'divide') {
      if (/^([xytrbles]|\d+|[xytrbles]-\d+)$/.test(rest)) return null;
    }
    if (prop === 'ring' && /^(\d+|inset)$/.test(rest)) return null;
    return `${variant}${prop}`;
  }

  private resolveColorConflicts(classStr: string): string {
    const tokens = classStr.split(/\s+/).filter(Boolean);
    const lastIndex = new Map<string, number>();
    tokens.forEach((t, i) => {
      const k = this.colorFamilyKey(t);
      if (k) lastIndex.set(k, i);
    });
    return tokens
      .filter((t, i) => {
        const k = this.colorFamilyKey(t);
        return k === null || lastIndex.get(k) === i;
      })
      .join(' ');
  }

  /**
   * The set of color families a @bind's tier classNames assign — so the caller
   * can strip those families from the static prefix (the dynamic tier cascade
   * owns them, and the static default would otherwise leak a raw color).
   */
  private tierColorFamilies(traits: Record<string, any>): Set<string> {
    const families = new Set<string>();
    const tiers = traits?.bind?.tiers;
    if (!Array.isArray(tiers)) return families;
    for (const tier of tiers) {
      const cn = typeof tier?.className === 'string' ? tier.className : '';
      for (const tok of cn.split(/\s+/).filter(Boolean)) {
        const k = this.colorFamilyKey(tok);
        if (k) families.add(k);
      }
    }
    return families;
  }

  /** Drop every token whose color family is in `families` (removes a static
   *  default color that a dynamic @bind tier cascade will always override). */
  private stripColorFamilies(classStr: string, families: Set<string>): string {
    if (families.size === 0) return classStr;
    return classStr
      .split(/\s+/)
      .filter(Boolean)
      .filter((t) => {
        const k = this.colorFamilyKey(t);
        return k === null || !families.has(k);
      })
      .join(' ');
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
