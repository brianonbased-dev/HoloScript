/**
 * Testing/QA + Workflow/BPM + i18n/Localization Traits — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { mockHandler } from '../MockTrait';
import { fixtureHandler } from '../FixtureTrait';
import { snapshotTestHandler } from '../SnapshotTestTrait';
import { loadTestHandler } from '../LoadTestTrait';
import { chaosTestHandler } from '../ChaosTestTrait';
import { workflowHandler } from '../WorkflowTrait';
import { approvalHandler } from '../ApprovalTrait';
import { stateMachineHandler } from '../StateMachineTrait';
import { formBuilderHandler } from '../FormBuilderTrait';
import { localeHandler } from '../LocaleTrait';
import { translationHandler } from '../TranslationTrait';
import { rtlHandler } from '../RtlTrait';
import { timezoneHandler } from '../TimezoneTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Testing / QA
// ═══════════════════════════════════════════════════════════════════════════════

describe('MockTrait', () => {
  it('should create and call mock', () => {
    const node = createMockNode('m');
    const ctx = createMockContext();
    attachTrait(mockHandler, node, {}, ctx);
    sendEvent(mockHandler, node, {}, ctx, { type: 'mock:create', name: 'fn', returns: 42 });
    expect(getEventCount(ctx, 'mock:created')).toBe(1);
    sendEvent(mockHandler, node, {}, ctx, { type: 'mock:call', name: 'fn' });
    const r = getLastEvent(ctx, 'mock:called') as any;
    expect(r.returnValue).toBe(42);
  });
  it('should verify call count', () => {
    const node = createMockNode('m');
    const ctx = createMockContext();
    attachTrait(mockHandler, node, {}, ctx);
    sendEvent(mockHandler, node, {}, ctx, { type: 'mock:create', name: 'fn' });
    sendEvent(mockHandler, node, {}, ctx, { type: 'mock:call', name: 'fn' });
    sendEvent(mockHandler, node, {}, ctx, { type: 'mock:verify', name: 'fn', expected: 1 });
    const r = getLastEvent(ctx, 'mock:verified') as any;
    expect(r.pass).toBe(true);
  });
});

describe('FixtureTrait', () => {
  it('should setup and teardown', () => {
    const node = createMockNode('f');
    const ctx = createMockContext();
    attachTrait(fixtureHandler, node, {}, ctx);
    sendEvent(fixtureHandler, node, {}, ctx, {
      type: 'fixture:setup',
      name: 'db',
      data: { id: 1 },
    });
    expect(getEventCount(ctx, 'fixture:ready')).toBe(1);
    sendEvent(fixtureHandler, node, {}, ctx, { type: 'fixture:teardown', name: 'db' });
    expect(getEventCount(ctx, 'fixture:torn_down')).toBe(1);
  });
});

describe('SnapshotTestTrait', () => {
  it('should capture and compare', () => {
    const node = createMockNode('s');
    const ctx = createMockContext();
    attachTrait(snapshotTestHandler, node, {}, ctx);
    sendEvent(snapshotTestHandler, node, {}, ctx, {
      type: 'snapshot:capture',
      name: 'ui',
      value: { x: 1 },
    });
    sendEvent(snapshotTestHandler, node, {}, ctx, {
      type: 'snapshot:compare',
      name: 'ui',
      value: { x: 1 },
    });
    const r = getLastEvent(ctx, 'snapshot:result') as any;
    expect(r.match).toBe(true);
  });
});

describe('LoadTestTrait', () => {
  it('should start and stop', () => {
    const node = createMockNode('l');
    const ctx = createMockContext();
    attachTrait(loadTestHandler, node, {}, ctx);
    sendEvent(loadTestHandler, node, {}, ctx, { type: 'load:start', vus: 50 });
    expect(getEventCount(ctx, 'load:started')).toBe(1);
    sendEvent(loadTestHandler, node, {}, ctx, { type: 'load:request' });
    sendEvent(loadTestHandler, node, {}, ctx, { type: 'load:stop' });
    const r = getLastEvent(ctx, 'load:completed') as any;
    expect(r.requests).toBe(1);
  });
});

describe('ChaosTestTrait', () => {
  it('should inject fault', () => {
    const node = createMockNode('c');
    const ctx = createMockContext();
    attachTrait(chaosTestHandler, node, {}, ctx);
    sendEvent(chaosTestHandler, node, {}, ctx, {
      type: 'chaos:inject',
      fault: 'network_partition',
    });
    const r = getLastEvent(ctx, 'chaos:injected') as any;
    expect(r.fault).toBe('network_partition');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Workflow / BPM
// ═══════════════════════════════════════════════════════════════════════════════

describe('WorkflowTrait', () => {
  it('should create and advance', () => {
    const node = createMockNode('w');
    const ctx = createMockContext();
    attachTrait(workflowHandler, node, {}, ctx);
    sendEvent(workflowHandler, node, {}, ctx, {
      type: 'workflow:create',
      workflowId: 'wf1',
      steps: ['a', 'b', 'c'],
    });
    expect(getEventCount(ctx, 'workflow:created')).toBe(1);
    sendEvent(workflowHandler, node, {}, ctx, { type: 'workflow:advance', workflowId: 'wf1' });
    const r = getLastEvent(ctx, 'workflow:advanced') as any;
    expect(r.step).toBe(1);
  });
});

describe('ApprovalTrait', () => {
  it('should request and approve', () => {
    const node = createMockNode('a');
    const ctx = createMockContext();
    attachTrait(approvalHandler, node, {}, ctx);
    sendEvent(approvalHandler, node, {}, ctx, { type: 'approval:request', requestId: 'r1' });
    expect(getEventCount(ctx, 'approval:requested')).toBe(1);
    sendEvent(approvalHandler, node, {}, ctx, { type: 'approval:approve', requestId: 'r1' });
    expect(getEventCount(ctx, 'approval:approved')).toBe(1);
  });
});

describe('StateMachineTrait', () => {
  it('should transition states', () => {
    const node = createMockNode('sm');
    const ctx = createMockContext();
    attachTrait(stateMachineHandler, node, { initial_state: 'idle' }, ctx);
    sendEvent(stateMachineHandler, node, {}, ctx, { type: 'sm:transition', to: 'active' });
    const r = getLastEvent(ctx, 'sm:transitioned') as any;
    expect(r.from).toBe('idle');
    expect(r.to).toBe('active');
  });
});

describe('FormBuilderTrait', () => {
  it('should create form and add field', () => {
    const node = createMockNode('fb');
    const ctx = createMockContext();
    attachTrait(formBuilderHandler, node, {}, ctx);
    sendEvent(formBuilderHandler, node, {}, ctx, { type: 'form:create', formId: 'f1' });
    sendEvent(formBuilderHandler, node, {}, ctx, {
      type: 'form:add_field',
      formId: 'f1',
      name: 'email',
      fieldType: 'email',
      required: true,
    });
    expect(getEventCount(ctx, 'form:field_added')).toBe(1);
    sendEvent(formBuilderHandler, node, {}, ctx, { type: 'form:submit', formId: 'f1' });
    const r = getLastEvent(ctx, 'form:submitted') as any;
    expect(r.fields).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// i18n / Localization
// ═══════════════════════════════════════════════════════════════════════════════

describe('LocaleTrait', () => {
  it('should switch locale', () => {
    const node = createMockNode('l');
    const ctx = createMockContext();
    attachTrait(
      localeHandler,
      node,
      { default_locale: 'en-US', supported: ['en-US', 'es', 'fr'] },
      ctx
    );
    sendEvent(
      localeHandler,
      node,
      { default_locale: 'en-US', supported: ['en-US', 'es', 'fr'] },
      ctx,
      { type: 'locale:set', locale: 'es' }
    );
    const r = getLastEvent(ctx, 'locale:changed') as any;
    expect(r.from).toBe('en-US');
    expect(r.to).toBe('es');
  });
});

describe('TranslationTrait', () => {
  it('should load and translate', () => {
    const node = createMockNode('t');
    const ctx = createMockContext();
    attachTrait(translationHandler, node, {}, ctx);
    sendEvent(translationHandler, node, { fallback_locale: 'en' }, ctx, {
      type: 'i18n:load',
      locale: 'en',
      messages: { greeting: 'Hello' },
    });
    sendEvent(translationHandler, node, { fallback_locale: 'en' }, ctx, {
      type: 'i18n:translate',
      locale: 'en',
      key: 'greeting',
    });
    const r = getLastEvent(ctx, 'i18n:translated') as any;
    expect(r.text).toBe('Hello');
  });
});

describe('RtlTrait', () => {
  it('should detect RTL locale', () => {
    const node = createMockNode('r');
    const ctx = createMockContext();
    attachTrait(rtlHandler, node, {}, ctx);
    sendEvent(rtlHandler, node, { rtl_locales: ['ar', 'he', 'fa', 'ur'] }, ctx, {
      type: 'rtl:check',
      locale: 'ar-SA',
    });
    const r = getLastEvent(ctx, 'rtl:result') as any;
    expect(r.rtl).toBe(true);
  });
  it('should detect LTR locale', () => {
    const node = createMockNode('r');
    const ctx = createMockContext();
    attachTrait(rtlHandler, node, {}, ctx);
    sendEvent(rtlHandler, node, { rtl_locales: ['ar', 'he', 'fa', 'ur'] }, ctx, {
      type: 'rtl:check',
      locale: 'en-US',
    });
    const r = getLastEvent(ctx, 'rtl:result') as any;
    expect(r.rtl).toBe(false);
  });
});

describe('TimezoneTrait', () => {
  it('should convert timezone', () => {
    const node = createMockNode('tz');
    const ctx = createMockContext();
    attachTrait(timezoneHandler, node, { default_tz: 'UTC' }, ctx);
    sendEvent(timezoneHandler, node, { default_tz: 'UTC' }, ctx, {
      type: 'tz:convert',
      from: 'UTC',
      to: 'America/New_York',
      timestamp: 1710000000,
    });
    const r = getLastEvent(ctx, 'tz:converted') as any;
    expect(r.from).toBe('UTC');
    expect(r.to).toBe('America/New_York');
  });
});
