/**
 * DiagnosticProvider.ts
 *
 * Provides diagnostics (errors, warnings, hints) for HoloScript+ source code.
 * Validates: directive usage, property types, node structure, trait compatibility,
 * domain block properties, and simulation construct requirements.
 *
 * @version 4.2.0
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint';

export interface Diagnostic {
    severity: DiagnosticSeverity;
    message: string;
    line: number;
    column: number;
    endLine?: number;
    endColumn?: number;
    source: string;
    code?: string;
}

export interface DiagnosticRule {
    id: string;
    check: (context: DiagnosticContext) => Diagnostic[];
}

export interface DiagnosticContext {
    /** Parsed nodes */
    nodes: Array<{
        type: string;
        name?: string;
        directives?: Array<{ name: string; args?: any }>;
        properties?: Record<string, any>;
        loc?: { start: { line: number; column: number }; end: { line: number; column: number } };
        children?: any[];
        domain?: string;
        keyword?: string;
    }>;
    /** Known trait names */
    knownTraits: Set<string>;
}

// =============================================================================
// BUILT-IN RULES
// =============================================================================

const KNOWN_DIRECTIVES = new Set([
    'version', 'author', 'description', 'tags', 'license', 'deprecated',
    'if', 'each', 'slot', 'switch', 'case', 'default', 'for',
    'on', 'emit', 'once', 'watch', 'computed', 'effect',
    // Simulation traits (v4.2)
    'physics', 'collidable', 'networked', 'pbr', 'spatial', 'hrtf',
    'looping', 'dynamic', 'lod', 'obstacle_avoidance', 'safety_rated',
    'telemetry', 'animated', 'encoder', 'revolute', 'seed',
]);

const unknownDirectiveRule: DiagnosticRule = {
    id: 'HS001',
    check(ctx: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const node of ctx.nodes) {
            if (!node.directives) continue;
            for (const d of node.directives) {
                if (!KNOWN_DIRECTIVES.has(d.name) && !ctx.knownTraits.has(d.name)) {
                    diagnostics.push({
                        severity: 'warning',
                        message: `Unknown directive '@${d.name}' — may be a custom trait`,
                        line: node.loc?.start.line || 0,
                        column: node.loc?.start.column || 0,
                        source: 'holoscript',
                        code: 'HS001',
                    });
                }
            }
        }
        return diagnostics;
    },
};

const emptyChildrenWarning: DiagnosticRule = {
    id: 'HS002',
    check(ctx: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const node of ctx.nodes) {
            if (node.type === 'group' && (!node.children || node.children.length === 0)) {
                diagnostics.push({
                    severity: 'warning',
                    message: `Empty group '${node.name || 'unnamed'}' has no children`,
                    line: node.loc?.start.line || 0,
                    column: node.loc?.start.column || 0,
                    source: 'holoscript',
                    code: 'HS002',
                });
            }
        }
        return diagnostics;
    },
};

const deprecatedDirectiveHint: DiagnosticRule = {
    id: 'HS003',
    check(ctx: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const node of ctx.nodes) {
            if (!node.directives) continue;
            for (const d of node.directives) {
                if (d.name === 'deprecated') {
                    diagnostics.push({
                        severity: 'hint',
                        message: `Node '${node.name || node.type}' is marked as deprecated`,
                        line: node.loc?.start.line || 0,
                        column: node.loc?.start.column || 0,
                        source: 'holoscript',
                        code: 'HS003',
                    });
                }
            }
        }
        return diagnostics;
    },
};

// Required properties per domain/simulation block keyword
const REQUIRED_PROPERTIES: Record<string, string[]> = {
    material: ['baseColor'],
    pbr_material: ['baseColor'],
    rigidbody: ['mass'],
    audio_source: ['clip'],
    sensor: ['type'],
    navmesh: ['agent_radius', 'agent_height'],
};

const domainBlockValidation: DiagnosticRule = {
    id: 'HS004',
    check(ctx: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const node of ctx.nodes) {
            if (node.type !== 'DomainBlock' || !node.keyword) continue;
            const required = REQUIRED_PROPERTIES[node.keyword];
            if (!required) continue;
            for (const prop of required) {
                if (!node.properties || !(prop in node.properties)) {
                    diagnostics.push({
                        severity: 'warning',
                        message: `'${node.keyword}' block '${node.name || 'unnamed'}' is missing recommended property '${prop}'`,
                        line: node.loc?.start.line || 0,
                        column: node.loc?.start.column || 0,
                        source: 'holoscript',
                        code: 'HS004',
                    });
                }
            }
        }
        return diagnostics;
    },
};

const materialTextureHint: DiagnosticRule = {
    id: 'HS005',
    check(ctx: DiagnosticContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const node of ctx.nodes) {
            if (node.keyword !== 'pbr_material' && node.keyword !== 'material') continue;
            const props = node.properties || {};
            const hasTexture = Object.keys(props).some(k => k.endsWith('_map'));
            if (!hasTexture && props['roughness'] !== undefined) {
                diagnostics.push({
                    severity: 'info',
                    message: `Material '${node.name || 'unnamed'}' has no texture maps — consider adding albedo_map for better visual quality`,
                    line: node.loc?.start.line || 0,
                    column: node.loc?.start.column || 0,
                    source: 'holoscript',
                    code: 'HS005',
                });
            }
        }
        return diagnostics;
    },
};

// =============================================================================
// DIAGNOSTIC PROVIDER
// =============================================================================

export class DiagnosticProvider {
    private rules: DiagnosticRule[] = [
        unknownDirectiveRule,
        emptyChildrenWarning,
        deprecatedDirectiveHint,
        domainBlockValidation,
        materialTextureHint,
    ];

    /** Add a custom diagnostic rule. */
    addRule(rule: DiagnosticRule): void {
        this.rules.push(rule);
    }

    /** Run all rules against the context. */
    diagnose(context: DiagnosticContext): Diagnostic[] {
        const all: Diagnostic[] = [];
        for (const rule of this.rules) {
            all.push(...rule.check(context));
        }
        all.sort((a, b) => a.line - b.line || a.column - b.column);
        return all;
    }

    /** Get count of registered rules. */
    get ruleCount(): number {
        return this.rules.length;
    }
}
