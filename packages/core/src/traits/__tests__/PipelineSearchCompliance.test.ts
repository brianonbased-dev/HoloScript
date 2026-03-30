/**
 * Data Pipeline + Notification + Search + Compliance — Unit Tests
 */
import { describe, it, expect } from 'vitest';
import { etlHandler } from '../EtlTrait';
import { batchJobHandler } from '../BatchJobTrait';
import { dataTransformHandler } from '../DataTransformTrait';
import { schemaMigrateHandler } from '../SchemaMigrateTrait';
import { dataQualityHandler } from '../DataQualityTrait';
import { webhookOutHandler } from '../WebhookOutTrait';
import { pagerdutyHandler } from '../PagerdutyTrait';
import { slackAlertHandler } from '../SlackAlertTrait';
import { fullTextSearchHandler } from '../FullTextSearchTrait';
import { facetedSearchHandler } from '../FacetedSearchTrait';
import { autocompleteHandler } from '../AutocompleteTrait';
import { gdprHandler } from '../GdprTrait';
import { dataRetentionHandler } from '../DataRetentionTrait';
import { consentManagementHandler } from '../ConsentManagementTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Data Pipeline / ETL
// ═══════════════════════════════════════════════════════════════════════════════

describe('EtlTrait', () => {
  it('should extract, transform, load', () => {
    const node = createMockNode('e');
    const ctx = createMockContext();
    attachTrait(etlHandler, node, {}, ctx);
    sendEvent(etlHandler, node, {}, ctx, { type: 'etl:extract', pipelineId: 'p1', records: 500 });
    expect(getEventCount(ctx, 'etl:extracted')).toBe(1);
    sendEvent(etlHandler, node, {}, ctx, { type: 'etl:transform', pipelineId: 'p1' });
    expect(getEventCount(ctx, 'etl:transformed')).toBe(1);
    sendEvent(etlHandler, node, {}, ctx, { type: 'etl:load', pipelineId: 'p1' });
    const r = getLastEvent(ctx, 'etl:loaded') as any;
    expect(r.records).toBe(500);
  });
});

describe('BatchJobTrait', () => {
  it('should submit and complete', () => {
    const node = createMockNode('b');
    const ctx = createMockContext();
    attachTrait(batchJobHandler, node, {}, ctx);
    sendEvent(batchJobHandler, node, {}, ctx, { type: 'batch:submit', jobId: 'j1' });
    expect(getEventCount(ctx, 'batch:queued')).toBe(1);
    sendEvent(batchJobHandler, node, {}, ctx, { type: 'batch:complete', jobId: 'j1' });
    expect(getEventCount(ctx, 'batch:completed')).toBe(1);
  });
});

describe('DataTransformTrait', () => {
  it('should apply transform', () => {
    const node = createMockNode('t');
    const ctx = createMockContext();
    attachTrait(dataTransformHandler, node, {}, ctx);
    sendEvent(dataTransformHandler, node, {}, ctx, { type: 'transform:apply', mapping: 'flatten' });
    const r = getLastEvent(ctx, 'transform:applied') as any;
    expect(r.mapping).toBe('flatten');
  });
});

describe('SchemaMigrateTrait', () => {
  it('should migrate up and down', () => {
    const node = createMockNode('m');
    const ctx = createMockContext();
    attachTrait(schemaMigrateHandler, node, {}, ctx);
    sendEvent(schemaMigrateHandler, node, {}, ctx, { type: 'migrate:up', version: 2 });
    expect((getLastEvent(ctx, 'migrate:applied') as any).version).toBe(2);
    sendEvent(schemaMigrateHandler, node, {}, ctx, { type: 'migrate:down' });
    expect((getLastEvent(ctx, 'migrate:rolled_back') as any).version).toBe(0);
  });
});

describe('DataQualityTrait', () => {
  it('should check quality', () => {
    const node = createMockNode('q');
    const ctx = createMockContext();
    attachTrait(dataQualityHandler, node, {}, ctx);
    sendEvent(dataQualityHandler, node, {}, ctx, {
      type: 'quality:check',
      rule: 'not_null',
      valid: true,
    });
    const r = getLastEvent(ctx, 'quality:result') as any;
    expect(r.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Notification / Alerting
// ═══════════════════════════════════════════════════════════════════════════════

describe('WebhookOutTrait', () => {
  it('should send webhook', () => {
    const node = createMockNode('w');
    const ctx = createMockContext();
    attachTrait(webhookOutHandler, node, {}, ctx);
    sendEvent(webhookOutHandler, node, { max_retries: 3, timeout_ms: 5000 }, ctx, {
      type: 'webhook:send',
      url: 'https://example.com',
      payload: {},
    });
    expect(getEventCount(ctx, 'webhook:sent')).toBe(1);
  });
});

describe('PagerdutyTrait', () => {
  it('should trigger incident', () => {
    const node = createMockNode('p');
    const ctx = createMockContext();
    attachTrait(pagerdutyHandler, node, {}, ctx);
    sendEvent(pagerdutyHandler, node, { severity: 'critical' }, ctx, {
      type: 'pagerduty:trigger',
      summary: 'Server down',
    });
    const r = getLastEvent(ctx, 'pagerduty:triggered') as any;
    expect(r.severity).toBe('critical');
    expect(r.incidentId).toBe('PD-1');
  });
});

describe('SlackAlertTrait', () => {
  it('should send alert', () => {
    const node = createMockNode('s');
    const ctx = createMockContext();
    attachTrait(slackAlertHandler, node, {}, ctx);
    sendEvent(slackAlertHandler, node, { default_channel: '#alerts' }, ctx, {
      type: 'slack_alert:send',
      message: 'Deploy failed',
    });
    const r = getLastEvent(ctx, 'slack_alert:sent') as any;
    expect(r.channel).toBe('#alerts');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Search
// ═══════════════════════════════════════════════════════════════════════════════

describe('FullTextSearchTrait', () => {
  it('should index and search', () => {
    const node = createMockNode('f');
    const ctx = createMockContext();
    attachTrait(fullTextSearchHandler, node, {}, ctx);
    sendEvent(fullTextSearchHandler, node, { max_results: 50 }, ctx, {
      type: 'fts:index',
      docId: 'd1',
      content: 'HoloScript is powerful',
    });
    sendEvent(fullTextSearchHandler, node, { max_results: 50 }, ctx, {
      type: 'fts:search',
      query: 'powerful',
    });
    const r = getLastEvent(ctx, 'fts:results') as any;
    expect(r.hits).toContain('d1');
  });
});

describe('FacetedSearchTrait', () => {
  it('should add facet', () => {
    const node = createMockNode('f');
    const ctx = createMockContext();
    attachTrait(facetedSearchHandler, node, {}, ctx);
    sendEvent(facetedSearchHandler, node, {}, ctx, {
      type: 'facet:add',
      facet: 'color',
      value: 'red',
    });
    const r = getLastEvent(ctx, 'facet:added') as any;
    expect(r.values).toContain('red');
  });
});

describe('AutocompleteTrait', () => {
  it('should suggest matching terms', () => {
    const node = createMockNode('a');
    const ctx = createMockContext();
    attachTrait(autocompleteHandler, node, {}, ctx);
    sendEvent(autocompleteHandler, node, { max_suggestions: 10, min_chars: 2 }, ctx, {
      type: 'ac:add_term',
      term: 'HoloScript',
    });
    sendEvent(autocompleteHandler, node, { max_suggestions: 10, min_chars: 2 }, ctx, {
      type: 'ac:add_term',
      term: 'HoloLand',
    });
    sendEvent(autocompleteHandler, node, { max_suggestions: 10, min_chars: 2 }, ctx, {
      type: 'ac:suggest',
      query: 'Holo',
    });
    const r = getLastEvent(ctx, 'ac:suggestions') as any;
    expect(r.suggestions).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Compliance / Governance
// ═══════════════════════════════════════════════════════════════════════════════

describe('GdprTrait', () => {
  it('should handle access request', () => {
    const node = createMockNode('g');
    const ctx = createMockContext();
    attachTrait(gdprHandler, node, {}, ctx);
    sendEvent(gdprHandler, node, {}, ctx, {
      type: 'gdpr:access',
      requestId: 'r1',
      subjectId: 'u1',
    });
    expect(getEventCount(ctx, 'gdpr:access_requested')).toBe(1);
  });
  it('should handle erasure request', () => {
    const node = createMockNode('g');
    const ctx = createMockContext();
    attachTrait(gdprHandler, node, {}, ctx);
    sendEvent(gdprHandler, node, {}, ctx, {
      type: 'gdpr:delete',
      requestId: 'r2',
      subjectId: 'u1',
    });
    expect(getEventCount(ctx, 'gdpr:erasure_requested')).toBe(1);
  });
});

describe('DataRetentionTrait', () => {
  it('should set policy', () => {
    const node = createMockNode('r');
    const ctx = createMockContext();
    attachTrait(dataRetentionHandler, node, {}, ctx);
    sendEvent(dataRetentionHandler, node, { default_ttl_days: 90 }, ctx, {
      type: 'retention:set',
      dataType: 'logs',
      ttl_days: 30,
    });
    expect(getEventCount(ctx, 'retention:policy_set')).toBe(1);
  });
});

describe('ConsentManagementTrait', () => {
  it('should grant and check consent', () => {
    const node = createMockNode('c');
    const ctx = createMockContext();
    attachTrait(consentManagementHandler, node, {}, ctx);
    sendEvent(consentManagementHandler, node, {}, ctx, {
      type: 'consent:grant',
      userId: 'u1',
      purpose: 'analytics',
    });
    expect(getEventCount(ctx, 'consent:granted')).toBe(1);
    sendEvent(consentManagementHandler, node, {}, ctx, {
      type: 'consent:check',
      userId: 'u1',
      purpose: 'analytics',
    });
    const r = getLastEvent(ctx, 'consent:status') as any;
    expect(r.granted).toBe(true);
  });
});
