/**
 * .hs process / pipeline DSL — parser regression tests.
 *
 * Locks the grammar surface behind the A-009 example-freshness clusters
 * (HSP101 DOT/ARROW, HSP001 colon/on_error, HSP201 numeric directives,
 * HSP300 pipe), board tasks task_1781055824225_{i8un,tjcn,3qk0,rpkn}:
 *   - top-level `connect a.b -> c.d` / `execute a.b() repeat forever`
 *   - on_error(err) { ... } handlers with parameter lists
 *   - @trait: { config } colon-form trait configuration
 *   - @2d_canvas digit-leading directive names
 *   - transform/filter/branch/validate pipeline block bodies
 *   - YAML-style block scalars (prompt: | / template: |)
 *   - top-level @directive("args") { config } blocks
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../../parser/HoloScriptPlusParser';

interface AnyNode {
  type?: string;
  children?: AnyNode[];
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Depth-first search for nodes of a given type anywhere in the AST. */
function findNodes(root: AnyNode | undefined, type: string): AnyNode[] {
  if (!root) return [];
  const out: AnyNode[] = [];
  const walk = (n: AnyNode) => {
    if (n.type === type) out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(root);
  return out;
}

function parseOk(source: string): AnyNode {
  const result = parse(source);
  expect(
    result.success,
    `expected clean parse, got: ${(result.errors ?? [])
      .slice(0, 3)
      .map((e: { message?: string }) => e.message)
      .join(' | ')}`
  ).toBe(true);
  return result.ast as AnyNode;
}

// ============================================================================
// Top-level .hs process statements (HSP101 cluster)
// ============================================================================

describe('.hs connect / execute statements', () => {
  it('parses connect with dotted member chains and reconstructs clean paths', () => {
    const ast = parseOk('connect guard_captain.raise_alarm -> alarm_bell.activate\n');
    const [conn] = findNodes(ast, 'connection');
    expect(conn).toBeDefined();
    expect(conn.properties?.from).toBe('guard_captain.raise_alarm');
    expect(conn.properties?.to).toBe('alarm_bell.activate');
  });

  it('parses connect with a state-assignment target', () => {
    const ast = parseOk(
      'connect alarm_bell.alarm_triggered -> guard_captain.state.alert_level = 3\n'
    );
    const [conn] = findNodes(ast, 'connection');
    expect(conn.properties?.from).toBe('alarm_bell.alarm_triggered');
    expect(conn.properties?.to).toBe('guard_captain.state.alert_level = 3');
  });

  it('parses execute and splits target from schedule clause', () => {
    const ast = parseOk('execute guard_captain.patrol() repeat forever\n');
    const [exec] = findNodes(ast, 'execute');
    expect(exec.properties?.target).toBe('guard_captain.patrol()');
    expect(exec.properties?.schedule).toBe('repeat forever');
  });

  it('parses execute with an interval schedule', () => {
    const ast = parseOk('execute temp_sensor_A.read() every 1000ms\n');
    const [exec] = findNodes(ast, 'execute');
    expect(exec.properties?.target).toBe('temp_sensor_A.read()');
    expect(exec.properties?.schedule).toBe('every 1000ms');
  });
});

// ============================================================================
// on_error handlers with params (HSP001 cluster)
// ============================================================================

describe('.hs on_error handlers', () => {
  it('parses on_error(err) with a parameter list inside a node body', () => {
    const ast = parseOk(
      'agent "Mover" {\n' +
        '  on_error(err) {\n' +
        '    emit("transfer_error", { error: err.message })\n' +
        '  }\n' +
        '}\n'
    );
    // Parenthesised handlers route through the inline-method path
    const handler = findNodes(ast, 'method').find((m) => m.name === 'on_error');
    expect(handler).toBeDefined();
    expect(handler?.params).toEqual(['err']);
  });
});

// ============================================================================
// Colon-form trait config (HSP001 cluster: @waypoint: { ... })
// ============================================================================

describe('colon-form trait configuration', () => {
  it('parses @trait: { config } on objects', () => {
    const ast = parseOk(
      'object "waypoint_a" {\n' +
        '  geometry: "cylinder"\n' +
        '  @waypoint: { id: "wp_a", order: 1 }\n' +
        '  @emissive: { color: "#0088ff", intensity: 0.7 }\n' +
        '}\n'
    );
    const [obj] = findNodes(ast, 'object');
    const traits = obj.traits as Map<string, Record<string, unknown>>;
    expect(traits.get('waypoint')).toMatchObject({ id: 'wp_a', order: 1 });
    expect(traits.get('emissive')).toMatchObject({ color: '#0088ff' });
  });
});

// ============================================================================
// Digit-leading directive names (HSP201 cluster: @2d_canvas)
// ============================================================================

describe('digit-leading directive names', () => {
  it('parses @2d_canvas with a config block', () => {
    const result = parse('@2d_canvas {\n  title: "Quantum Ops Dashboard"\n}\n');
    expect(result.success).toBe(true);
  });

  it('still rejects a bare number as a directive name', () => {
    const result = parse('@2(broken)\n');
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Top-level directive with args and config block
// ============================================================================

describe('top-level @directive("args") { config }', () => {
  it('parses without HSP003 and merges the block into the directive config', () => {
    const result = parse(
      '@agent_behavior("dashboard-orchestrator") {\n' +
        '  apply_bounty: 200,\n' +
        '  trigger: @particle_feedback { type: "success" }\n' +
        '}\n'
    );
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Pipeline DSL blocks (HSP001/HSP101/HSP300 clusters)
// ============================================================================

describe('pipeline transform blocks', () => {
  it('parses field mappings with op chains', () => {
    const ast = parseOk(
      'pipeline "Sync" {\n' +
        '  transform MapFields {\n' +
        '    sku       -> productId\n' +
        '    unit_cost -> costCents : multiply(100)\n' +
        '    name      -> displayName : trim() : titleCase()\n' +
        '  }\n' +
        '}\n'
    );
    const [transform] = findNodes(ast, 'transform');
    const mappings = (transform.children ?? []).filter((c) => c.type === 'mapping');
    expect(mappings).toHaveLength(3);
    expect(mappings[0]).toMatchObject({ from: 'sku', to: 'productId', ops: [] });
    expect(mappings[1]).toMatchObject({
      from: 'unit_cost',
      to: 'costCents',
      ops: ['multiply(100)'],
    });
    expect(mappings[2].ops).toEqual(['trim()', 'titleCase()']);
  });

  it('parses indexed-path and array-unwrap mappings', () => {
    const ast = parseOk(
      'pipeline "P" {\n' +
        '  transform Resolve {\n' +
        '    disease_entities.results[0].result[0][0].id -> disease.efo_id\n' +
        '    entries[] -> entry\n' +
        '  }\n' +
        '}\n'
    );
    const [transform] = findNodes(ast, 'transform');
    const mappings = (transform.children ?? []).filter((c) => c.type === 'mapping');
    expect(mappings[0].from).toBe('disease_entities.results[0].result[0][0].id');
    expect(mappings[0].to).toBe('disease.efo_id');
    expect(mappings[1]).toMatchObject({ from: 'entries[]', to: 'entry' });
  });

  it('parses expression and array-literal mapping sources', () => {
    const ast = parseOk(
      'pipeline "P" {\n' +
        '  transform BuildBindingSite {\n' +
        '    target.chembl_id + "-" + drug.chembl_id -> binding.id\n' +
        '    [790, 797, 858] -> binding.residues\n' +
        '  }\n' +
        '}\n'
    );
    const [transform] = findNodes(ast, 'transform');
    const mappings = (transform.children ?? []).filter((c) => c.type === 'mapping');
    expect(mappings[0].from).toBe('target.chembl_id + "-" + drug.chembl_id');
    expect(mappings[0].to).toBe('binding.id');
    expect(mappings[1].to).toBe('binding.residues');
  });

  it('keeps plain properties in transform blocks', () => {
    const ast = parseOk(
      'pipeline "P" {\n' +
        '  transform Extract {\n' +
        '    type: "llm"\n' +
        '    model: "claude-sonnet-4-6"\n' +
        '    input: content\n' +
        '  }\n' +
        '}\n'
    );
    const [transform] = findNodes(ast, 'transform');
    expect(transform.properties).toMatchObject({
      type: 'llm',
      model: 'claude-sonnet-4-6',
      input: 'content',
    });
  });
});

describe('pipeline filter blocks', () => {
  it('parses where conditions with || line continuations', () => {
    const ast = parseOk(
      'pipeline "P" {\n' +
        '  filter StockChanged {\n' +
        '    where: stock != previous.stock\n' +
        '        || costCents != previous.costCents\n' +
        '  }\n' +
        '}\n'
    );
    const [filter] = findNodes(ast, 'filter');
    expect(filter.properties?.where).toBe(
      'stock != previous.stock || costCents != previous.costCents'
    );
  });
});

describe('pipeline branch blocks', () => {
  it('parses when-guards and default routes', () => {
    const ast = parseOk(
      'pipeline "P" {\n' +
        '  branch Route {\n' +
        '    when category == "bug_report" -> sink GitHub\n' +
        '    when category == "question"   -> sink KnowledgeBase\n' +
        '    default                       -> sink Dashboard\n' +
        '  }\n' +
        '}\n'
    );
    const [branch] = findNodes(ast, 'branch');
    const whens = (branch.children ?? []).filter((c) => c.type === 'when');
    const defaults = (branch.children ?? []).filter((c) => c.type === 'default');
    expect(whens).toHaveLength(2);
    expect(whens[0]).toMatchObject({
      condition: 'category == "bug_report"',
      target: 'sink GitHub',
    });
    expect(defaults).toHaveLength(1);
    expect(defaults[0].target).toBe('sink Dashboard');
  });
});

describe('pipeline validate blocks', () => {
  it('parses constraint lists for plain and dotted fields', () => {
    const ast = parseOk(
      'pipeline "P" {\n' +
        '  validate Inventory {\n' +
        '    productId : required, string, minLength(3)\n' +
        '    disease.efo_id : required, string, startsWith("EFO_")\n' +
        '  }\n' +
        '}\n'
    );
    const [validate] = findNodes(ast, 'validate');
    const constraints = (validate.children ?? []).filter((c) => c.type === 'constraint');
    expect(constraints).toHaveLength(2);
    expect(constraints[0]).toMatchObject({
      field: 'productId',
      rules: 'required, string, minLength(3)',
    });
    expect(constraints[1].field).toBe('disease.efo_id');
    expect(constraints[1].rules).toBe('required, string, startsWith("EFO_")');
  });
});

// ============================================================================
// Block scalars (HSP300 cluster: prompt: | / template: |)
// ============================================================================

describe('block scalar property values', () => {
  it('parses prompt: | block scalars in transform blocks', () => {
    const ast = parseOk(
      'pipeline "P" {\n' +
        '  transform Extract {\n' +
        '    type: "llm"\n' +
        '    prompt: |\n' +
        '      Extract wisdom from this content.\n' +
        '      Only extract insights with confidence > 0.7.\n' +
        '    input: content\n' +
        '  }\n' +
        '}\n'
    );
    const [transform] = findNodes(ast, 'transform');
    expect(transform.properties?.prompt).toBe(
      'Extract wisdom from this content.\nOnly extract insights with confidence > 0.7.'
    );
    // properties after the scalar still parse
    expect(transform.properties?.input).toBe('content');
  });

  it('parses template: | block scalars in generic node bodies (sink)', () => {
    const ast = parseOk(
      'pipeline "P" {\n' +
        '  sink HoloComposition {\n' +
        '    type: "holo"\n' +
        '    template: |\n' +
        '      composition "${target.name}" {\n' +
        '        metadata { generator: "x" }\n' +
        '      }\n' +
        '  }\n' +
        '}\n'
    );
    const sinks = findNodes(ast, 'sink');
    expect(sinks).toHaveLength(1);
    const template = sinks[0].properties?.template as string;
    expect(template).toContain('composition "${target.name}" {');
    expect(template).toContain('metadata { generator: "x" }');
  });
});
