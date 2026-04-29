import { Project, SourceFile, SyntaxKind, Node, type JsxOpeningElement, type JsxSelfClosingElement } from 'ts-morph';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { existsSync } from 'node:fs';

export interface ComponentNode {
  /** PascalCase component name as it appears in JSX. */
  name: string;
  /** Repo-relative file path where the component is defined (forward slashes). */
  file: string;
  /** Children rendered inside this component's JSX, recursively. */
  children: ComponentNode[];
  /** Zustand stores this file consumes (v0.2). */
  stores?: string[];
  /** API/SSE endpoints this file calls (v0.3). */
  apis?: string[];
}

export interface TreeBuilderOptions {
  repoRoot: string;
  /** Map alias → absolute root, e.g. {"@/": "packages/studio/src/"}. */
  aliases?: Record<string, string>;
  /** Skip recursion past this depth to keep the graph tractable. */
  maxDepth?: number;
}

const TS_EXTS = ['.tsx', '.ts', '.jsx', '.js'];

export class TreeBuilder {
  private project = new Project({ skipAddingFilesFromTsConfig: true, useInMemoryFileSystem: false });
  private cache = new Map<string, ComponentNode>();
  private repoRoot: string;
  private aliases: Record<string, string>;
  private maxDepth: number;

  constructor(opts: TreeBuilderOptions) {
    this.repoRoot = opts.repoRoot;
    this.aliases = opts.aliases ?? {};
    this.maxDepth = opts.maxDepth ?? 6;
  }

  /** Build a component tree rooted at the page.tsx file. */
  buildPageTree(pageAbs: string): ComponentNode {
    return this.nodeForFile(pageAbs, 'Page', 0, new Set());
  }

  private nodeForFile(abs: string, displayName: string, depth: number, seen: Set<string>): ComponentNode {
    const cacheKey = `${abs}::${displayName}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return { ...cached, children: cached.children.slice() };
    if (seen.has(abs) || depth > this.maxDepth) {
      return { name: displayName, file: this.relFile(abs), children: [] };
    }
    const next = new Set(seen);
    next.add(abs);

    const sf = this.loadSource(abs);
    const root: ComponentNode = {
      name: displayName,
      file: this.relFile(abs),
      children: [],
    };
    if (!sf) {
      this.cache.set(cacheKey, root);
      return root;
    }

    const importMap = this.collectImports(sf);
    const used = this.collectJsxIdentifiers(sf);
    const stores = this.collectStores(sf);
    const apis = this.collectApis(sf);
    if (stores.length) root.stores = stores;
    if (apis.length) root.apis = apis;

    for (const ident of used) {
      const importInfo = importMap.get(ident);
      if (!importInfo) continue; // built-in HTML or local-defined component — skip in v0.1
      const childAbs = this.resolveImport(importInfo, abs);
      if (!childAbs || !TS_EXTS.some((e) => childAbs.endsWith(e))) continue;
      root.children.push(this.nodeForFile(childAbs, ident, depth + 1, next));
    }

    this.cache.set(cacheKey, root);
    return { ...root, children: root.children.slice() };
  }

  private loadSource(abs: string): SourceFile | undefined {
    if (!existsSync(abs)) return undefined;
    const existing = this.project.getSourceFile(abs);
    if (existing) return existing;
    try {
      return this.project.addSourceFileAtPath(abs);
    } catch {
      return undefined;
    }
  }

  private collectImports(sf: SourceFile): Map<string, string> {
    const map = new Map<string, string>();
    for (const imp of sf.getImportDeclarations()) {
      const spec = imp.getModuleSpecifierValue();
      const def = imp.getDefaultImport();
      if (def) map.set(def.getText(), spec);
      for (const named of imp.getNamedImports()) {
        const local = named.getAliasNode()?.getText() ?? named.getName();
        map.set(local, spec);
      }
    }
    return map;
  }

  private collectJsxIdentifiers(sf: SourceFile): string[] {
    const set = new Set<string>();
    sf.forEachDescendant((node) => {
      const kind = node.getKind();
      if (kind !== SyntaxKind.JsxOpeningElement && kind !== SyntaxKind.JsxSelfClosingElement) return;
      const el = node as JsxOpeningElement | JsxSelfClosingElement;
      // ts-morph: tag name node is Identifier (e.g. `Foo`) or PropertyAccessExpression (`Mod.Foo`).
      const tagNode = el.getTagNameNode();
      const tagText = Node.isIdentifier(tagNode)
        ? tagNode.getText()
        : tagNode.getText().split('.')[0] ?? tagNode.getText();
      // Only PascalCase identifiers are React components; lowercase = HTML
      if (tagText && /^[A-Z]/.test(tagText)) set.add(tagText);
    });
    return Array.from(set).sort();
  }

  /**
   * v0.2: detect Zustand stores consumed by this source file. Two patterns:
   *   - hook named `use*Store` / `use*State` invoked in JSX or component body
   *   - direct `create<...>()(...)` call (file owns the store definition)
   * Returned names are PascalCase store identifiers (e.g. "ConnectorStore").
   */
  private collectStores(sf: SourceFile): string[] {
    const set = new Set<string>();
    const text = sf.getFullText();
    // Hook calls: useFooStore(...) / useFooState(...)
    const hookRegex = /\buse([A-Z][A-Za-z0-9]*?)(Store|State)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = hookRegex.exec(text)) !== null) {
      const name = m[1] + m[2]; // e.g. "ConnectorStore"
      // skip stdlib React hooks: useState, useReducer (already excluded by capitalised first char)
      if (name === 'State') continue;
      set.add(name);
    }
    // create<X>()(...)  — Zustand definition site
    const createRegex = /\bcreate\s*<\s*([A-Z][A-Za-z0-9]*)\s*>\s*\(/g;
    while ((m = createRegex.exec(text)) !== null) {
      set.add(m[1] + ' (defined here)');
    }
    return Array.from(set).sort();
  }

  /**
   * v0.3: detect API endpoints + SSE streams hit by this source file. Patterns:
   *   - fetch('/api/...') | fetch(`/api/.../${id}`)
   *   - useSWR('/api/...') | useSWRMutation('/api/...')
   *   - new EventSource('/api/.../sse')
   *   - axios.get/post/etc('/api/...')
   * Template-literal interpolations are normalized to `[id]`-style placeholders
   * to preserve route uniqueness without leaking expression noise.
   */
  private collectApis(sf: SourceFile): string[] {
    const set = new Set<string>();
    const text = sf.getFullText();
    const patterns = [
      /\bfetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /\bfetch\s*\(\s*`([^`]+)`/g,
      /\buseSWR(?:Mutation|Infinite)?\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /\bnew\s+EventSource\s*\(\s*['"`]([^'"`]+)['"`]/g,
      /\baxios\.[a-z]+\s*\(\s*['"`]([^'"`]+)['"`]/g,
    ];
    for (const re of patterns) {
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const url = m[1];
        if (url.startsWith('/api/') || url.startsWith('/v1/') || url.startsWith('/sse')) {
          set.add(this.normalizeUrl(url));
        }
      }
    }
    return Array.from(set).sort();
  }

  private normalizeUrl(url: string): string {
    // Replace `${expr}` interpolations with `[expr]`-style param markers so URLs
    // that vary only by interpolation collapse to a single canonical form.
    return url
      .replace(/\$\{[^}]+\}/g, '[id]')
      .replace(/\?.*$/, ''); // strip query strings — not part of route identity
  }

  private resolveImport(spec: string, fromAbs: string): string | undefined {
    // External package — skip
    if (!spec.startsWith('.') && !spec.startsWith('/') && !this.matchesAlias(spec)) {
      return undefined;
    }
    let target: string;
    if (this.matchesAlias(spec)) {
      target = this.applyAlias(spec);
    } else if (isAbsolute(spec)) {
      target = spec;
    } else {
      target = resolve(dirname(fromAbs), spec);
    }
    // Try direct + extension variants + index files
    for (const ext of ['', ...TS_EXTS]) {
      const candidate = target + ext;
      if (existsSync(candidate)) return candidate;
    }
    for (const ext of TS_EXTS) {
      const candidate = join(target, 'index' + ext);
      if (existsSync(candidate)) return candidate;
    }
    return undefined;
  }

  private matchesAlias(spec: string): boolean {
    return Object.keys(this.aliases).some((prefix) => spec === prefix.replace(/\/$/, '') || spec.startsWith(prefix));
  }

  private applyAlias(spec: string): string {
    for (const [prefix, root] of Object.entries(this.aliases)) {
      if (spec === prefix.replace(/\/$/, '')) return resolve(this.repoRoot, root);
      if (spec.startsWith(prefix)) {
        const rest = spec.slice(prefix.length);
        return resolve(this.repoRoot, root, rest);
      }
    }
    return spec;
  }

  private relFile(abs: string): string {
    return relative(this.repoRoot, abs).split(sep).join('/');
  }
}
