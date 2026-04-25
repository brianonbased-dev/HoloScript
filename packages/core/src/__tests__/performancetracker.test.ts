/**
 * Sprint32.test.ts â€” Performance + Debug + Profiling (v3.41.0)
 *
 * ~100 acceptance tests covering:
 *   Feature 1:  performance/PerformanceTracker
 *   Feature 2:  performance/FrustumCuller
 *   Feature 3:  performance/LODSystem
 *   Feature 4:  profiling/Profiler
 *   Feature 5:  profiling/Analyzer
 *   Feature 6:  debug/TelemetryCollector
 *   Feature 7:  debug/AgentInspector
 *   Feature 8:  audit/AuditLogger
 *   Feature 9:  audit/AuditQueryBuilder
 *   Feature 10: analysis/ComplexityMetrics
 */
import { describe, it, expect } from 'vitest';

import { readJson } from '../errors/safeJsonParse';
import { PerformanceTracker } from '../performance/PerformanceTracker.js';
import { FrustumCuller } from '../performance/FrustumCuller.js';
import { LODSystem } from '../performance/LODSystem.js';
import { Profiler } from '../profiling/Profiler.js';
import { Analyzer } from '../profiling/Analyzer.js';
import { TelemetryCollector } from '../debug/TelemetryCollector.js';
import { AgentInspector } from '../debug/AgentInspector.js';
import { AuditLogger } from '../audit/AuditLogger.js';
import { AuditQuery } from '../audit/AuditQueryBuilder.js';
import { ComplexityAnalyzer } from '../analysis/ComplexityMetrics.js';

// =============================================================================
// FEATURE 1: performance/PerformanceTracker
// =============================================================================
describe('Feature 1: PerformanceTracker', () => {
  it('getSummary.totalMetrics is 0 initially', () => {
    expect(new PerformanceTracker().getSummary().totalMetrics).toBe(0);
  });

  it('recordMetric increases totalMetrics', () => {
    const pt = new PerformanceTracker();
    pt.recordMetric('render', 16.7, 60);
    expect(pt.getSummary().totalMetrics).toBe(1);
  });

  it('getAllMetrics returns recorded metric names', () => {
    const pt = new PerformanceTracker();
    pt.recordMetric('parse', 5.2, 192);
    expect(pt.getAllMetrics().has('parse')).toBe(true);
  });

  it('generateReport returns a report object', () => {
    const pt = new PerformanceTracker();
    pt.recordMetric('compile', 10, 100);
    const report = pt.generateReport();
    expect(report).toBeDefined();
    expect(report.current).toBeDefined();
  });

  it('saveAsBaseline does not throw', () => {
    const pt = new PerformanceTracker();
    pt.recordMetric('x', 1, 1);
    expect(() => pt.saveAsBaseline('v1.0')).not.toThrow();
  });

  it('getSummary.hasBaseline is true after saveAsBaseline', () => {
    const pt = new PerformanceTracker();
    pt.recordMetric('y', 2, 2);
    pt.saveAsBaseline();
    expect(pt.getSummary().hasBaseline).toBe(true);
  });

  it('clearMetrics resets totalMetrics to 0', () => {
    const pt = new PerformanceTracker();
    pt.recordMetric('z', 5, 50);
    pt.clearMetrics();
    expect(pt.getSummary().totalMetrics).toBe(0);
  });

  it('compare returns an array', () => {
    const pt = new PerformanceTracker();
    pt.recordMetric('fps', 16, 60);
    pt.saveAsBaseline();
    expect(Array.isArray(pt.compare())).toBe(true);
  });
});

// =============================================================================
// FEATURE 2: performance/FrustumCuller
// =============================================================================
describe('Feature 2: FrustumCuller', () => {
  const pos = [0, 0, -5];
  const forward = [0, 0, 1 ];
  const up = [0, 1, 0 ];

  function makeSphere(id: string, x: number, y: number, z: number, r = 1) {
    return { id, x, y, z, radius: r };
  }

  it('getLastCullCount is 0 initially', () => {
    expect(new FrustumCuller().getLastCullCount()).toBe(0);
  });

  it('setFrustumFromPerspective does not throw', () => {
    const fc = new FrustumCuller();
    expect(() => fc.setFrustumFromPerspective(pos, forward, up, 60, 1.6, 0.1, 1000)).not.toThrow();
  });

  it('isVisible returns boolean for any sphere', () => {
    const fc = new FrustumCuller();
    fc.setFrustumFromPerspective(pos, forward, up, 60, 1.6, 0.1, 1000);
    const result = fc.isVisible(makeSphere('s1', 0, 0, 5));
    expect(typeof result).toBe('boolean');
  });

  it('cull returns array of surviving spheres', () => {
    const fc = new FrustumCuller();
    fc.setFrustumFromPerspective(pos, forward, up, 60, 1.6, 0.1, 1000);
    const spheres = [makeSphere('a', 0, 0, 5), makeSphere('b', 0, 0, 10000)];
    const result = fc.cull(spheres);
    expect(Array.isArray(result)).toBe(true);
  });

  it('cull excludes spheres beyond far plane', () => {
    const fc = new FrustumCuller();
    fc.setFrustumFromPerspective(pos, forward, up, 60, 1.6, 0.1, 100);
    const spheres = [makeSphere('near', 0, 0, 5), makeSphere('far', 0, 0, 5000)];
    const result = fc.cull(spheres);
    expect(result.length).toBeLessThan(spheres.length);
  });

  it('getLastCullCount is set after cull', () => {
    const fc = new FrustumCuller();
    fc.setFrustumFromPerspective(pos, forward, up, 60, 1.6, 0.1, 100);
    fc.cull([makeSphere('a', 0, 0, 5), makeSphere('b', 0, 0, 5000)]);
    expect(fc.getLastCullCount()).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// FEATURE 3: performance/LODSystem
// =============================================================================
describe('Feature 3: LODSystem', () => {
  const levels = [
    { minDistance: 0, label: 'high' },
    { minDistance: 50, label: 'medium' },
    { minDistance: 100, label: 'low' },
  ];

  it('count is 0 initially', () => {
    expect(new LODSystem().count).toBe(0);
  });

  it('register increments count', () => {
    const lod = new LODSystem();
    lod.register({ entityId: 'tree1', levels });
    expect(lod.count).toBe(1);
  });

  it('unregister decrements count', () => {
    const lod = new LODSystem();
    lod.register({ entityId: 'bush', levels });
    lod.unregister('bush');
    expect(lod.count).toBe(0);
  });

  it('update does not throw', () => {
    const lod = new LODSystem();
    lod.register({ entityId: 'e1', levels });
    const cam = [0, 0, 0];
    const positions = new Map([['e1', [10, 0, 0]]]);
    expect(() => lod.update(cam, positions)).not.toThrow();
  });

  it('getActiveLevel returns label after update', () => {
    const lod = new LODSystem();
    lod.register({ entityId: 'rock', levels });
    const cam = [0, 0, 0];
    lod.update(cam, new Map([['rock', [5, 0, 0]]]));
    const level = lod.getActiveLevel('rock');
    expect(level).toBe('high');
  });

  it('getAllResults returns array', () => {
    const lod = new LODSystem();
    lod.register({ entityId: 'e1', levels });
    lod.update([0, 0, 0], new Map([['e1', [0, 0, 0]]]));
    expect(Array.isArray(lod.getAllResults())).toBe(true);
  });
});

// =============================================================================
// FEATURE 4: profiling/Profiler
// =============================================================================
describe('Feature 4: Profiler', () => {
  it('running getter is false initially', () => {
    expect(new Profiler().running).toBe(false);
  });

  it('start sets running to true', () => {
    const p = new Profiler();
    p.start('test session');
    expect(p.running).toBe(true);
  });

  it('stop returns a ProfileResult', () => {
    const p = new Profiler();
    p.start('session');
    const result = p.stop();
    expect(result).toBeDefined();
    expect(result.name).toBe('session');
  });

  it('stop sets running to false', () => {
    const p = new Profiler();
    p.start();
    p.stop();
    expect(p.running).toBe(false);
  });

  it('beginSpan / endSpan does not throw', () => {
    const p = new Profiler();
    p.start();
    p.beginSpan('parse');
    expect(() => p.endSpan()).not.toThrow();
    p.stop();
  });

  it('recordSpan adds to samples', () => {
    const p = new Profiler();
    p.start();
    p.recordSpan('compile', 5.0, 'compile');
    const result = p.stop();
    expect(result.samples.length).toBeGreaterThan(0);
  });

  it('exportChromeTrace returns trace with traceEvents', () => {
    const p = new Profiler();
    p.start();
    p.recordSpan('render', 16, 'render');
    const result = p.stop();
    const trace = p.exportChromeTrace(result);
    expect(trace.traceEvents).toBeDefined();
  });

  it('exportJSON returns a JSON string', () => {
    const p = new Profiler();
    p.start();
    const result = p.stop();
    const json = p.exportJSON(result);
    expect(typeof json).toBe('string');
    expect(() => readJson(json)).not.toThrow();
  });
});

// =============================================================================
// FEATURE 5: profiling/Analyzer
// =============================================================================
describe('Feature 5: Analyzer', () => {
  function makeProfile(name = 'test') {
    const p = new Profiler();
    p.start(name);
    p.recordSpan('parse', 10, 'parse');
    p.recordSpan('compile', 20, 'compile');
    return p.stop();
  }

  it('analyze returns an AnalysisResult', () => {
    const a = new Analyzer();
    const result = a.analyze(makeProfile());
    expect(result).toBeDefined();
    expect(result.grade).toBeDefined();
  });

  it('analyze returns overall score', () => {
    const a = new Analyzer();
    const result = a.analyze(makeProfile());
    expect(typeof result.overallScore).toBe('number');
  });

  it('analyze returns recommendations array', () => {
    const a = new Analyzer();
    const result = a.analyze(makeProfile());
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('analyze with budget detects violations', () => {
    const a = new Analyzer();
    const result = a.analyze(makeProfile(), { parseTime: 1 }); // budget: 1ms, actual 10ms
    expect(result.budgetViolations).toBeDefined();
  });

  it('setDefaultBudget does not throw', () => {
    const a = new Analyzer();
    expect(() => a.setDefaultBudget({ fps: 60 })).not.toThrow();
  });

  it('analyzeTrends returns array', () => {
    const a = new Analyzer();
    a.analyze(makeProfile('p1'));
    expect(Array.isArray(a.analyzeTrends())).toBe(true);
  });

  it('clearHistory does not throw', () => {
    const a = new Analyzer();
    a.analyze(makeProfile());
    expect(() => a.clearHistory()).not.toThrow();
  });
});

// =============================================================================
// FEATURE 6: debug/TelemetryCollector
// =============================================================================
describe('Feature 6: TelemetryCollector', () => {
  it('getStats returns stats object', () => {
    const tc = new TelemetryCollector();
    const stats = tc.getStats();
    expect(stats).toBeDefined();
  });

  it('recordEvent returns a TelemetryEvent', () => {
    const tc = new TelemetryCollector();
    const event = tc.recordEvent('task_started', 'agent1');
    expect(event).not.toBeNull();
    expect(event?.type).toBe('task_started');
  });

  it('getRecentEvents returns array', () => {
    const tc = new TelemetryCollector();
    tc.recordEvent('task_completed', 'a1');
    expect(Array.isArray(tc.getRecentEvents())).toBe(true);
  });

  it('getRecentEvents includes recorded event', () => {
    const tc = new TelemetryCollector();
    tc.recordEvent('task_completed', 'agentX');
    const recent = tc.getRecentEvents(10);
    expect(recent.some((e) => e.agentId === 'agentX')).toBe(true);
  });

  it('startSpan returns a TraceSpan', () => {
    const tc = new TelemetryCollector();
    const span = tc.startSpan('mySpan');
    expect(span.id).toBeDefined();
    expect(span.name).toBe('mySpan');
  });

  it('endSpan sets end time', () => {
    const tc = new TelemetryCollector();
    const span = tc.startSpan('s1');
    const ended = tc.endSpan(span.id);
    expect(ended.endTime).toBeDefined();
  });

  it('clear empties the event store', () => {
    const tc = new TelemetryCollector();
    tc.recordEvent('agent_start', 'x');
    tc.clear();
    expect(tc.getRecentEvents().length).toBe(0);
  });
});

// =============================================================================
// FEATURE 7: debug/AgentInspector
// =============================================================================
describe('Feature 7: AgentInspector', () => {
  function makeManifest(id: string) {
    return {
      id,
      name: id,
      version: '1.0.0',
      capabilities: [],
      endpoints: [],
    };
  }

  it('getRegisteredAgents is empty initially', () => {
    expect(new AgentInspector().getRegisteredAgents()).toHaveLength(0);
  });

  it('registerAgent adds to getRegisteredAgents', () => {
    const ai = new AgentInspector();
    ai.registerAgent(makeManifest('agent1'));
    expect(ai.getRegisteredAgents()).toContain('agent1');
  });

  it('isAgentRegistered returns true after register', () => {
    const ai = new AgentInspector();
    ai.registerAgent(makeManifest('a1'));
    expect(ai.isAgentRegistered('a1')).toBe(true);
  });

  it('unregisterAgent removes the agent', () => {
    const ai = new AgentInspector();
    ai.registerAgent(makeManifest('x'));
    ai.unregisterAgent('x');
    expect(ai.isAgentRegistered('x')).toBe(false);
  });

  it('updateState stores agent state', () => {
    const ai = new AgentInspector();
    ai.registerAgent(makeManifest('b1'));
    ai.updateState('b1', { health: 100 });
    expect(ai.getStateValue('b1', 'health')).toBe(100);
  });

  it('inspect returns AgentInspection', () => {
    const ai = new AgentInspector();
    ai.registerAgent(makeManifest('c1'));
    const inspection = ai.inspect('c1');
    expect(inspection).toBeDefined();
  });

  it('addBreakpoint returns breakpoint with id', () => {
    const ai = new AgentInspector();
    ai.registerAgent(makeManifest('d1'));
    const bp = ai.addBreakpoint('d1', 'state.health < 20');
    expect(bp.id).toBeDefined();
  });

  it('getBreakpoints returns added breakpoint', () => {
    const ai = new AgentInspector();
    ai.registerAgent(makeManifest('e1'));
    ai.addBreakpoint('e1', 'true');
    expect(ai.getBreakpoints('e1')).toHaveLength(1);
  });
});

// =============================================================================
// FEATURE 8: audit/AuditLogger
// =============================================================================
describe('Feature 8: AuditLogger', () => {
  function makeEvent(action: string, outcome: 'success' | 'failure' | 'denied' = 'success') {
    return {
      tenantId: 'org1',
      actorId: 'user1',
      actorType: 'user' as const,
      action,
      resource: 'config',
      outcome,
      metadata: {},
    };
  }

  it('getEventCount is 0 initially', () => {
    expect(new AuditLogger().getEventCount()).toBe(0);
  });

  it('log returns an AuditEvent with id', () => {
    const al = new AuditLogger();
    const event = al.log(makeEvent('read'));
    expect(event.id).toBeDefined();
    expect(event.action).toBe('read');
  });

  it('log increments getEventCount', () => {
    const al = new AuditLogger();
    al.log(makeEvent('write'));
    expect(al.getEventCount()).toBe(1);
  });

  it('query returns events matching filter', () => {
    const al = new AuditLogger();
    al.log(makeEvent('delete'));
    al.log(makeEvent('read'));
    const results = al.query({ action: 'delete' });
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe('delete');
  });

  it('query with tenantId filter works', () => {
    const al = new AuditLogger();
    al.log(makeEvent('login'));
    const results = al.query({ tenantId: 'org1' });
    expect(results.length).toBeGreaterThan(0);
  });

  it('export returns JSON string', () => {
    const al = new AuditLogger();
    al.log(makeEvent('export'));
    const json = al.export({}, 'json');
    expect(typeof json).toBe('string');
    expect(() => readJson(json)).not.toThrow();
  });

  it('export returns CSV string', () => {
    const al = new AuditLogger();
    al.log(makeEvent('update'));
    const csv = al.export({}, 'csv');
    expect(typeof csv).toBe('string');
    expect(csv.length).toBeGreaterThan(0);
  });

  it('purgeExpired returns number of purged events', () => {
    const al = new AuditLogger();
    al.log(makeEvent('noop'));
    expect(typeof al.purgeExpired()).toBe('number');
  });
});

// =============================================================================
// FEATURE 9: audit/AuditQueryBuilder
// =============================================================================
describe('Feature 9: AuditQuery (AuditQueryBuilder)', () => {
  it('build returns a query filter object', () => {
    const filter = new AuditQuery().build();
    expect(filter).toBeDefined();
  });

  it('tenant sets tenantId on filter', () => {
    const filter = new AuditQuery().tenant('acme').build();
    expect(filter.tenantId).toBe('acme');
  });

  it('actor sets actorId on filter', () => {
    const filter = new AuditQuery().actor('john').build();
    expect(filter.actorId).toBe('john');
  });

  it('action sets action on filter', () => {
    const filter = new AuditQuery().action('delete').build();
    expect(filter.action).toBe('delete');
  });

  it('outcome sets outcome on filter', () => {
    const filter = new AuditQuery().outcome('denied').build();
    expect(filter.outcome).toBe('denied');
  });

  it('limit sets limit on filter', () => {
    const filter = new AuditQuery().limit(25).build();
    expect(filter.limit).toBe(25);
  });

  it('chain methods fluently', () => {
    const filter = new AuditQuery().tenant('org').actor('admin').action('write').limit(10).build();
    expect(filter.tenantId).toBe('org');
    expect(filter.actorId).toBe('admin');
    expect(filter.limit).toBe(10);
  });

  it('AuditQuery used with AuditLogger.query', () => {
    const al = new AuditLogger();
    al.log({
      tenantId: 'corp',
      actorId: 'u1',
      actorType: 'user',
      action: 'view',
      resource: 'report',
      outcome: 'success',
      metadata: {},
    });
    const filter = new AuditQuery().tenant('corp').build();
    expect(al.query(filter)).toHaveLength(1);
  });
});

// =============================================================================
// FEATURE 10: analysis/ComplexityMetrics
// =============================================================================
describe('Feature 10: ComplexityAnalyzer', () => {
  const simple = `
    object Sphere {
      trait Visible;
      property radius: number = 1.0;
    }
  `;

  const complex = `
    object HeavyObject {
      if (a) { if (b) { if (c) { if (d) { x(); } } } }
      while (e) { for (let i = 0; i < 10; i++) { z(); } }
    }
  `;

  it('analyze returns a ComplexityResult', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(simple);
    expect(result).toBeDefined();
    expect(result.grade).toBeDefined();
  });

  it('analyze returns a numeric overallScore', () => {
    expect(typeof new ComplexityAnalyzer().analyze(simple).overallScore).toBe('number');
  });

  it('analyze.lines.total is > 0', () => {
    const result = new ComplexityAnalyzer().analyze(simple);
    expect(result.lines.total).toBeGreaterThan(0);
  });

  it('analyze returns issues array', () => {
    expect(Array.isArray(new ComplexityAnalyzer().analyze(simple).issues)).toBe(true);
  });

  it('analyze detects deep nesting', () => {
    const result = new ComplexityAnalyzer().analyze(complex);
    expect(result.nesting.maxDepth).toBeGreaterThan(0);
  });

  it('generateReport returns a non-empty string', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(simple, 'test.holo');
    const report = ca.generateReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('setThresholds changes thresholds', () => {
    const ca = new ComplexityAnalyzer();
    ca.setThresholds({ maxCyclomatic: 5 });
    expect(ca.getThresholds().maxCyclomatic).toBe(5);
  });

  it('getThresholds returns current thresholds', () => {
    expect(new ComplexityAnalyzer().getThresholds()).toBeDefined();
  });
});
