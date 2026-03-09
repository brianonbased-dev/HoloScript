/**
 * TraitCompositionAnalyzer - Parses HoloScript source to extract trait hierarchy.
 *
 * Scans a HoloScript document for:
 * 1. `trait Name [extends Base] { ... }` definitions
 * 2. `@name = @a + @b + @c` composition expressions
 * 3. Property declarations within traits
 *
 * Builds a tree structure suitable for the VS Code TreeDataProvider,
 * including extends relationships, property override detection, and
 * diamond inheritance warnings.
 *
 * @module TraitCompositionAnalyzer
 * @version 1.0.0
 */

import type {
  TraitTreeNode,
  TraitProperty,
  DiamondWarning,
  TraitCompositionAnalysis,
  TraitSourceLocation,
} from './TraitTreeTypes';

// =============================================================================
// PARSED INTERMEDIATE TYPES
// =============================================================================

interface ParsedTrait {
  name: string;
  base?: string;
  properties: ParsedProperty[];
  location: TraitSourceLocation;
  /** Line range end */
  endLine: number;
}

interface ParsedProperty {
  key: string;
  value: string;
  type?: string;
  location: TraitSourceLocation;
}

interface ParsedComposition {
  name: string;
  sources: string[];
  location: TraitSourceLocation;
}

// =============================================================================
// REGEX PATTERNS
// =============================================================================

/**
 * Matches trait definitions:
 *   trait Interactable { ... }
 *   trait Clickable extends Interactable { ... }
 */
const TRAIT_DEF_RE = /^\s*trait\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{/;

/**
 * Matches composition expressions:
 *   @turret = @physics + @ai_npc + @targeting
 */
const COMPOSITION_RE = /^\s*@(\w+)\s*=\s*((?:@\w+\s*\+\s*)*@\w+)/;

/**
 * Matches property declarations inside a trait body:
 *   cursor: "pointer"
 *   mass: 5.0
 *   highlight: true
 */
const PROPERTY_RE = /^\s+(\w+)\s*:\s*(.+?)$/;

/**
 * Matches closing brace (end of trait definition).
 */
const CLOSE_BRACE_RE = /^\s*\}/;

// =============================================================================
// ANALYZER
// =============================================================================

export class TraitCompositionAnalyzer {
  /**
   * Analyze a HoloScript source string and produce a full trait composition analysis.
   *
   * @param source   The HoloScript source text
   * @param filePath The file path (for source locations in click-to-navigate)
   * @returns Complete analysis result
   */
  analyze(source: string, filePath: string): TraitCompositionAnalysis {
    const lines = source.split('\n');
    const parsedTraits: ParsedTrait[] = [];
    const parsedCompositions: ParsedComposition[] = [];
    const errors: string[] = [];

    // =========================================================================
    // PASS 1: Parse trait definitions and compositions
    // =========================================================================

    let currentTrait: ParsedTrait | null = null;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1; // 1-based

      // Check for composition expression
      const compMatch = line.match(COMPOSITION_RE);
      if (compMatch && !currentTrait) {
        const name = compMatch[1];
        const sourcesStr = compMatch[2];
        const sources = sourcesStr
          .split('+')
          .map((s) => s.trim().replace(/^@/, ''))
          .filter(Boolean);

        parsedCompositions.push({
          name,
          sources,
          location: { filePath, line: lineNum, column: 0 },
        });
        continue;
      }

      // Check for trait definition start
      const traitMatch = line.match(TRAIT_DEF_RE);
      if (traitMatch && !currentTrait) {
        currentTrait = {
          name: traitMatch[1],
          base: traitMatch[2] || undefined,
          properties: [],
          location: { filePath, line: lineNum, column: line.indexOf('trait') },
          endLine: lineNum,
        };
        braceDepth = 1;
        continue;
      }

      // Inside a trait definition
      if (currentTrait) {
        // Track brace depth
        for (const ch of line) {
          if (ch === '{') braceDepth++;
          if (ch === '}') braceDepth--;
        }

        // Property declaration
        const propMatch = line.match(PROPERTY_RE);
        if (propMatch && braceDepth >= 1) {
          currentTrait.properties.push({
            key: propMatch[1],
            value: propMatch[2].trim().replace(/,\s*$/, ''),
            location: { filePath, line: lineNum, column: line.indexOf(propMatch[1]) },
          });
        }

        // Closing brace — end of trait definition
        if (braceDepth <= 0) {
          currentTrait.endLine = lineNum;
          parsedTraits.push(currentTrait);
          currentTrait = null;
          braceDepth = 0;
        }
      }
    }

    // Handle unclosed trait
    if (currentTrait) {
      currentTrait.endLine = lines.length;
      parsedTraits.push(currentTrait);
      errors.push(`Trait "${currentTrait.name}" was not closed with "}".`);
    }

    // =========================================================================
    // PASS 2: Build trait map and resolve inheritance
    // =========================================================================

    const traitMap = new Map<string, ParsedTrait>();
    for (const t of parsedTraits) {
      traitMap.set(t.name, t);
    }

    // Build TraitTreeNode for each trait
    const nodeMap = new Map<string, TraitTreeNode>();

    for (const parsed of parsedTraits) {
      const node = this.buildTraitNode(parsed, traitMap, filePath);
      nodeMap.set(parsed.name, node);
    }

    // =========================================================================
    // PASS 3: Detect diamond inheritance in compositions
    // =========================================================================

    const allDiamondWarnings: DiamondWarning[] = [];
    const compositionNodes: TraitTreeNode[] = [];

    for (const comp of parsedCompositions) {
      const diamonds = this.detectDiamondInheritance(comp.sources, traitMap);
      allDiamondWarnings.push(...diamonds);

      const compNode = this.buildCompositionNode(comp, nodeMap, traitMap, diamonds);
      compositionNodes.push(compNode);
    }

    // =========================================================================
    // PASS 4: Build root nodes (top-level traits and compositions)
    // =========================================================================

    // Find root traits (those that are NOT extended by anything else,
    // OR that have no parent themselves)
    const extendedTraits = new Set<string>();
    for (const parsed of parsedTraits) {
      if (parsed.base) {
        extendedTraits.add(parsed.base);
      }
    }

    const rootTraitNodes: TraitTreeNode[] = [];
    for (const parsed of parsedTraits) {
      // A trait is a "root" if it has no parent (is a base trait)
      if (!parsed.base) {
        const node = nodeMap.get(parsed.name);
        if (node) {
          // Attach child traits that extend this one
          this.attachChildTraits(node, parsedTraits, nodeMap);
          rootTraitNodes.push(node);
        }
      }
    }

    // Also include traits whose parent is NOT in the file (orphaned extends)
    for (const parsed of parsedTraits) {
      if (parsed.base && !traitMap.has(parsed.base)) {
        const node = nodeMap.get(parsed.name);
        if (node) {
          this.attachChildTraits(node, parsedTraits, nodeMap);
          rootTraitNodes.push(node);
        }
      }
    }

    const roots: TraitTreeNode[] = [...rootTraitNodes, ...compositionNodes];

    return {
      traits: nodeMap,
      compositions: compositionNodes,
      roots,
      diamondWarnings: allDiamondWarnings,
      errors,
    };
  }

  // ===========================================================================
  // NODE BUILDERS
  // ===========================================================================

  /**
   * Build a TraitTreeNode for a single parsed trait definition.
   */
  private buildTraitNode(
    parsed: ParsedTrait,
    traitMap: Map<string, ParsedTrait>,
    _filePath: string
  ): TraitTreeNode {
    const ancestors = this.getAncestors(parsed.name, traitMap);
    const resolvedProperties = this.resolveProperties(parsed, traitMap, ancestors);

    // Build property child nodes
    const propertyNodes: TraitTreeNode[] = resolvedProperties.map((prop) => ({
      id: `prop:${parsed.name}:${prop.key}`,
      label: prop.key,
      description: prop.value,
      tooltip: this.buildPropertyTooltip(prop),
      kind: 'property' as const,
      children: [],
      location: prop.location,
      iconId: prop.isOverride ? 'arrow-up' : 'symbol-field',
      contextValue: prop.isOverride ? 'traitProperty.override' : 'traitProperty',
    }));

    // Group overrides into a category if there are any
    const overrides = resolvedProperties.filter((p) => p.isOverride);
    const inherited = resolvedProperties.filter((p) => p.origin !== parsed.name && !p.isOverride);
    const own = resolvedProperties.filter((p) => p.origin === parsed.name && !p.isOverride);

    const children: TraitTreeNode[] = [];

    if (own.length > 0) {
      children.push({
        id: `cat:${parsed.name}:own`,
        label: 'Own Properties',
        description: `(${own.length})`,
        kind: 'category',
        children: propertyNodes.filter((n) => {
          const prop = resolvedProperties.find((p) => p.key === n.label);
          return prop && prop.origin === parsed.name && !prop.isOverride;
        }),
        iconId: 'symbol-property',
        contextValue: 'traitCategory',
      });
    }

    if (overrides.length > 0) {
      children.push({
        id: `cat:${parsed.name}:overrides`,
        label: 'Overrides',
        description: `(${overrides.length})`,
        tooltip: `Properties that override inherited values`,
        kind: 'category',
        children: propertyNodes.filter((n) => {
          const prop = resolvedProperties.find((p) => p.key === n.label);
          return prop?.isOverride;
        }),
        iconId: 'arrow-up',
        contextValue: 'traitCategory.overrides',
      });
    }

    if (inherited.length > 0) {
      children.push({
        id: `cat:${parsed.name}:inherited`,
        label: 'Inherited',
        description: `(${inherited.length})`,
        tooltip: `Properties inherited from ancestors`,
        kind: 'category',
        children: propertyNodes.filter((n) => {
          const prop = resolvedProperties.find((p) => p.key === n.label);
          return prop && prop.origin !== parsed.name && !prop.isOverride;
        }),
        iconId: 'arrow-down',
        contextValue: 'traitCategory.inherited',
      });
    }

    const extendsDesc = parsed.base ? `extends ${parsed.base}` : undefined;

    return {
      id: `trait:${parsed.name}`,
      label: parsed.name,
      description: extendsDesc,
      tooltip: this.buildTraitTooltip(parsed, ancestors, resolvedProperties),
      kind: 'trait',
      children,
      location: parsed.location,
      properties: resolvedProperties,
      extends: parsed.base,
      ancestors,
      iconId: 'symbol-interface',
      contextValue: 'traitDefinition',
    };
  }

  /**
   * Build a TraitTreeNode for a composition expression.
   */
  private buildCompositionNode(
    comp: ParsedComposition,
    nodeMap: Map<string, TraitTreeNode>,
    traitMap: Map<string, ParsedTrait>,
    diamonds: DiamondWarning[]
  ): TraitTreeNode {
    const children: TraitTreeNode[] = [];

    // Add source trait nodes
    const sourcesCategory: TraitTreeNode = {
      id: `cat:${comp.name}:sources`,
      label: 'Source Traits',
      description: `(${comp.sources.length})`,
      kind: 'category',
      children: comp.sources.map((src) => {
        const existing = nodeMap.get(src);
        if (existing) {
          // Clone the node to avoid tree cycles
          return {
            ...existing,
            id: `comp-src:${comp.name}:${src}`,
            children: [...existing.children],
          };
        }
        // Trait not found in file - show as unresolved
        return {
          id: `comp-src:${comp.name}:${src}`,
          label: src,
          description: '(not found in file)',
          kind: 'trait' as const,
          children: [],
          iconId: 'warning',
          contextValue: 'traitDefinition.unresolved',
        };
      }),
      iconId: 'symbol-class',
      contextValue: 'traitCategory.sources',
    };
    children.push(sourcesCategory);

    // Add merged properties category
    const mergedProps = this.buildMergedProperties(comp.sources, traitMap);
    if (mergedProps.length > 0) {
      children.push({
        id: `cat:${comp.name}:merged`,
        label: 'Merged Properties',
        description: `(${mergedProps.length})`,
        tooltip: 'Properties merged from all source traits (right-side wins)',
        kind: 'category',
        children: mergedProps.map((prop) => ({
          id: `prop:${comp.name}:merged:${prop.key}`,
          label: prop.key,
          description: `${prop.value} (from ${prop.origin})`,
          tooltip: this.buildPropertyTooltip(prop),
          kind: 'property' as const,
          children: [],
          location: prop.location,
          iconId: prop.isOverride ? 'arrow-up' : 'symbol-field',
          contextValue: prop.isOverride ? 'traitProperty.override' : 'traitProperty',
        })),
        iconId: 'merge',
        contextValue: 'traitCategory.merged',
      });
    }

    // Add diamond warnings
    if (diamonds.length > 0) {
      children.push({
        id: `cat:${comp.name}:diamonds`,
        label: 'Diamond Inheritance Warnings',
        description: `(${diamonds.length})`,
        kind: 'category',
        children: diamonds.map((d, i) => ({
          id: `warn:${comp.name}:diamond:${i}`,
          label: `Shared ancestor: ${d.sharedAncestor}`,
          description: d.paths.map((p) => p.join(' -> ')).join(' | '),
          tooltip: d.message,
          kind: 'warning' as const,
          children: [],
          iconId: 'warning',
          contextValue: 'traitWarning.diamond',
        })),
        iconId: 'alert',
        contextValue: 'traitCategory.warnings',
      });
    }

    const sourcesStr = comp.sources.map((s) => `@${s}`).join(' + ');

    return {
      id: `composition:${comp.name}`,
      label: `@${comp.name}`,
      description: `= ${sourcesStr}`,
      tooltip: `Composed trait: @${comp.name} = ${sourcesStr}${
        diamonds.length > 0
          ? `\n\nWarning: ${diamonds.length} diamond inheritance issue(s) detected`
          : ''
      }`,
      kind: 'composition',
      children,
      location: comp.location,
      diamondWarnings: diamonds.length > 0 ? diamonds : undefined,
      iconId: diamonds.length > 0 ? 'warning' : 'extensions',
      contextValue: 'traitComposition',
    };
  }

  // ===========================================================================
  // INHERITANCE RESOLUTION
  // ===========================================================================

  /**
   * Get the full ancestry chain for a trait (immediate parent -> root).
   */
  private getAncestors(
    name: string,
    traitMap: Map<string, ParsedTrait>,
    visited?: Set<string>
  ): string[] {
    const seen = visited || new Set<string>();
    const def = traitMap.get(name);
    if (!def?.base || seen.has(name)) return [];

    seen.add(name);

    const parent = def.base;
    return [parent, ...this.getAncestors(parent, traitMap, seen)];
  }

  /**
   * Resolve all properties for a trait, including inherited ones.
   * Child-wins semantics: later in chain overrides earlier.
   */
  private resolveProperties(
    parsed: ParsedTrait,
    traitMap: Map<string, ParsedTrait>,
    ancestors: string[]
  ): TraitProperty[] {
    // Start from the root ancestor and work forward
    const propertyMap = new Map<string, TraitProperty>();

    // Walk ancestors in reverse (root first, then children)
    const reversedAncestors = [...ancestors].reverse();

    for (const ancestorName of reversedAncestors) {
      const ancestor = traitMap.get(ancestorName);
      if (!ancestor) continue;

      for (const prop of ancestor.properties) {
        propertyMap.set(prop.key, {
          key: prop.key,
          value: prop.value,
          type: prop.type,
          origin: ancestorName,
          isOverride: false,
          location: prop.location,
        });
      }
    }

    // Apply own properties (child-wins)
    for (const prop of parsed.properties) {
      const existing = propertyMap.get(prop.key);
      propertyMap.set(prop.key, {
        key: prop.key,
        value: prop.value,
        type: prop.type,
        origin: parsed.name,
        isOverride: existing !== undefined && existing.origin !== parsed.name,
        overriddenValue: existing?.value,
        overriddenFrom: existing?.origin,
        location: prop.location,
      });
    }

    return Array.from(propertyMap.values());
  }

  /**
   * Build merged properties for a composition expression.
   * Right-side-wins precedence (same as TraitComposer).
   */
  private buildMergedProperties(
    sources: string[],
    traitMap: Map<string, ParsedTrait>
  ): TraitProperty[] {
    const propertyMap = new Map<string, TraitProperty>();

    for (const src of sources) {
      const parsed = traitMap.get(src);
      if (!parsed) continue;

      const ancestors = this.getAncestors(src, traitMap);
      const resolved = this.resolveProperties(parsed, traitMap, ancestors);

      for (const prop of resolved) {
        const existing = propertyMap.get(prop.key);
        propertyMap.set(prop.key, {
          key: prop.key,
          value: prop.value,
          type: prop.type,
          origin: src,
          isOverride: existing !== undefined,
          overriddenValue: existing?.value,
          overriddenFrom: existing?.origin,
          location: prop.location,
        });
      }
    }

    return Array.from(propertyMap.values());
  }

  // ===========================================================================
  // DIAMOND INHERITANCE DETECTION
  // ===========================================================================

  /**
   * Detect diamond inheritance when composing multiple traits.
   */
  private detectDiamondInheritance(
    sources: string[],
    traitMap: Map<string, ParsedTrait>
  ): DiamondWarning[] {
    const warnings: DiamondWarning[] = [];

    // Collect ancestors for each source trait
    const ancestorSets = new Map<string, Set<string>>();
    for (const src of sources) {
      const ancestors = new Set<string>();
      this.collectAllAncestors(src, traitMap, ancestors);
      ancestorSets.set(src, ancestors);
    }

    // Check pairwise for shared ancestors
    const sharedAncestorPaths = new Map<string, string[][]>();

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const nameA = sources[i];
        const nameB = sources[j];
        const ancestorsA = ancestorSets.get(nameA) || new Set();
        const ancestorsB = ancestorSets.get(nameB) || new Set();

        for (const ancestor of ancestorsA) {
          if (ancestorsB.has(ancestor)) {
            if (!sharedAncestorPaths.has(ancestor)) {
              sharedAncestorPaths.set(ancestor, []);
            }
            const pathA = this.getPathToAncestor(nameA, ancestor, traitMap);
            const pathB = this.getPathToAncestor(nameB, ancestor, traitMap);
            sharedAncestorPaths.get(ancestor)!.push(pathA, pathB);
          }
        }
      }
    }

    // Deduplicate and build warnings
    for (const [ancestor, paths] of sharedAncestorPaths) {
      const unique = this.deduplicatePaths(paths);
      if (unique.length >= 2) {
        warnings.push({
          sharedAncestor: ancestor,
          paths: unique,
          message:
            `Diamond inheritance: traits ${sources.map((s) => `"${s}"`).join(', ')} ` +
            `share common ancestor "${ancestor}" via ${unique.length} paths. ` +
            `Child-wins semantics will be applied.`,
          severity: 'warning',
        });
      }
    }

    return warnings;
  }

  /**
   * Collect all ancestors of a trait recursively.
   */
  private collectAllAncestors(
    name: string,
    traitMap: Map<string, ParsedTrait>,
    ancestors: Set<string>
  ): void {
    const def = traitMap.get(name);
    if (!def?.base) return;
    if (ancestors.has(def.base)) return;

    ancestors.add(def.base);
    this.collectAllAncestors(def.base, traitMap, ancestors);
  }

  /**
   * Get the path from a trait to a specific ancestor.
   */
  private getPathToAncestor(
    name: string,
    ancestor: string,
    traitMap: Map<string, ParsedTrait>
  ): string[] {
    const path: string[] = [name];
    let current = name;

    while (current !== ancestor) {
      const def = traitMap.get(current);
      if (!def?.base) break;
      path.push(def.base);
      current = def.base;
    }

    return path;
  }

  /**
   * Remove duplicate paths.
   */
  private deduplicatePaths(paths: string[][]): string[][] {
    const seen = new Set<string>();
    const result: string[][] = [];
    for (const path of paths) {
      const key = path.join('->');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(path);
      }
    }
    return result;
  }

  // ===========================================================================
  // TREE BUILDING HELPERS
  // ===========================================================================

  /**
   * Recursively attach child traits (those that `extends` this trait) as children.
   */
  private attachChildTraits(
    parentNode: TraitTreeNode,
    allTraits: ParsedTrait[],
    nodeMap: Map<string, TraitTreeNode>
  ): void {
    const childTraits = allTraits.filter((t) => t.base === parentNode.label);

    for (const child of childTraits) {
      const childNode = nodeMap.get(child.name);
      if (childNode) {
        this.attachChildTraits(childNode, allTraits, nodeMap);
        parentNode.children.push(childNode);
      }
    }
  }

  // ===========================================================================
  // TOOLTIP BUILDERS
  // ===========================================================================

  private buildTraitTooltip(
    parsed: ParsedTrait,
    ancestors: string[],
    properties: TraitProperty[]
  ): string {
    const lines: string[] = [];

    lines.push(`trait ${parsed.name}`);
    if (parsed.base) {
      lines.push(`  extends ${parsed.base}`);
    }
    if (ancestors.length > 0) {
      lines.push(`  ancestry: ${ancestors.join(' -> ')}`);
    }

    const own = properties.filter((p) => p.origin === parsed.name);
    const overrides = properties.filter((p) => p.isOverride);
    const inherited = properties.filter((p) => p.origin !== parsed.name && !p.isOverride);

    lines.push('');
    lines.push(`Own properties: ${own.length}`);
    lines.push(`Overrides: ${overrides.length}`);
    lines.push(`Inherited: ${inherited.length}`);

    return lines.join('\n');
  }

  private buildPropertyTooltip(prop: TraitProperty): string {
    const lines: string[] = [];

    lines.push(`${prop.key}: ${prop.value}`);
    if (prop.type) {
      lines.push(`Type: ${prop.type}`);
    }
    lines.push(`Defined in: ${prop.origin}`);

    if (prop.isOverride) {
      lines.push('');
      lines.push(`Overrides: ${prop.overriddenValue} (from ${prop.overriddenFrom})`);
    }

    return lines.join('\n');
  }
}
