/**
 * Communication + ML/Inference + DevOps/CI Traits — Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { emailHandler } from '../EmailTrait';
import { smsHandler } from '../SmsTrait';
import { pushNotificationHandler } from '../PushNotificationTrait';
import { slackHandler } from '../SlackTrait';
import { discordHandler } from '../DiscordTrait';
import { mqttPubHandler } from '../MqttPubTrait';
import { sseHandler } from '../SseTrait';
import { modelLoadHandler } from '../ModelLoadTrait';
import { inferenceHandler } from '../InferenceTrait';
import { embeddingHandler } from '../EmbeddingTrait';
import { fineTuneHandler } from '../FineTuneTrait';
import { vectorSearchHandler } from '../VectorSearchTrait';
import { promptTemplateHandler } from '../PromptTemplateTrait';
import { deployHandler } from '../DeployTrait';
import { rollbackHandler } from '../RollbackTrait';
import { canaryHandler } from '../CanaryTrait';
import { featureFlagHandler } from '../FeatureFlagTrait';
import { envConfigHandler } from '../EnvConfigTrait';
import { secretHandler } from '../SecretTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Communication
// ═══════════════════════════════════════════════════════════════════════════════

describe('EmailTrait', () => {
  it('should send and emit email:sent', () => {
    const node = createMockNode('e'); const ctx = createMockContext();
    attachTrait(emailHandler, node, {}, ctx);
    sendEvent(emailHandler, node, {}, ctx, { type: 'email:send', to: 'a@b.com', subject: 'Hi' });
    expect(getEventCount(ctx, 'email:sent')).toBe(1);
  });
  it('should detach cleanly', () => {
    const node = createMockNode('e'); const ctx = createMockContext();
    attachTrait(emailHandler, node, {}, ctx);
    emailHandler.onDetach!(node as any, emailHandler.defaultConfig, ctx as any);
    expect((node as any).__emailState).toBeUndefined();
  });
});

describe('SmsTrait', () => {
  it('should send SMS within length', () => {
    const node = createMockNode('s'); const ctx = createMockContext();
    attachTrait(smsHandler, node, {}, ctx);
    sendEvent(smsHandler, node, {}, ctx, { type: 'sms:send', to: '+1', message: 'hello' });
    expect(getEventCount(ctx, 'sms:sent')).toBe(1);
  });
  it('should reject SMS over max_length', () => {
    const node = createMockNode('s'); const ctx = createMockContext();
    attachTrait(smsHandler, node, { max_length: 5 }, ctx);
    sendEvent(smsHandler, node, { max_length: 5 }, ctx, { type: 'sms:send', to: '+1', message: 'too long msg' });
    expect(getEventCount(ctx, 'sms:error')).toBe(1);
  });
});

describe('PushNotificationTrait', () => {
  it('should send push notification', () => {
    const node = createMockNode('p'); const ctx = createMockContext();
    attachTrait(pushNotificationHandler, node, {}, ctx);
    sendEvent(pushNotificationHandler, node, {}, ctx, { type: 'push:send', token: 'abc', title: 'Test' });
    expect(getEventCount(ctx, 'push:sent')).toBe(1);
  });
});

describe('SlackTrait', () => {
  it('should send slack message', () => {
    const node = createMockNode('sl'); const ctx = createMockContext();
    attachTrait(slackHandler, node, {}, ctx);
    sendEvent(slackHandler, node, {}, ctx, { type: 'slack:send', text: 'hello' });
    expect(getEventCount(ctx, 'slack:sent')).toBe(1);
  });
});

describe('DiscordTrait', () => {
  it('should send discord message', () => {
    const node = createMockNode('d'); const ctx = createMockContext();
    attachTrait(discordHandler, node, {}, ctx);
    sendEvent(discordHandler, node, {}, ctx, { type: 'discord:send', content: 'hello' });
    expect(getEventCount(ctx, 'discord:sent')).toBe(1);
  });
});

describe('MqttPubTrait', () => {
  it('should publish mqtt message', () => {
    const node = createMockNode('m'); const ctx = createMockContext();
    attachTrait(mqttPubHandler, node, {}, ctx);
    sendEvent(mqttPubHandler, node, {}, ctx, { type: 'mqtt:publish', topic: 'sensors/temp', payload: 22 });
    expect(getEventCount(ctx, 'mqtt:published')).toBe(1);
  });
});

describe('SseTrait', () => {
  it('should track clients and broadcast', () => {
    const node = createMockNode('sse'); const ctx = createMockContext();
    attachTrait(sseHandler, node, {}, ctx);
    sendEvent(sseHandler, node, {}, ctx, { type: 'sse:connect', clientId: 'c1' });
    sendEvent(sseHandler, node, {}, ctx, { type: 'sse:broadcast', event: 'update', data: {} });
    const sent = getLastEvent(ctx, 'sse:sent') as any;
    expect(sent.clientCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ML / Inference
// ═══════════════════════════════════════════════════════════════════════════════

describe('ModelLoadTrait', () => {
  it('should load and unload model', () => {
    const node = createMockNode('ml'); const ctx = createMockContext();
    attachTrait(modelLoadHandler, node, {}, ctx);
    sendEvent(modelLoadHandler, node, {}, ctx, { type: 'model:load', modelId: 'gpt4' });
    expect(getEventCount(ctx, 'model:loaded')).toBe(1);
    sendEvent(modelLoadHandler, node, {}, ctx, { type: 'model:unload', modelId: 'gpt4' });
    expect(getEventCount(ctx, 'model:unloaded')).toBe(1);
  });
});

describe('InferenceTrait', () => {
  it('should run inference', () => {
    const node = createMockNode('inf'); const ctx = createMockContext();
    attachTrait(inferenceHandler, node, {}, ctx);
    sendEvent(inferenceHandler, node, {}, ctx, { type: 'inference:run', modelId: 'gpt4', input: 'hello' });
    expect(getEventCount(ctx, 'inference:result')).toBe(1);
  });
});

describe('EmbeddingTrait', () => {
  it('should generate embedding', () => {
    const node = createMockNode('emb'); const ctx = createMockContext();
    attachTrait(embeddingHandler, node, {}, ctx);
    sendEvent(embeddingHandler, node, {}, ctx, { type: 'embedding:generate', input: 'test' });
    const result = getLastEvent(ctx, 'embedding:result') as any;
    expect(result.dimensions).toBe(1536);
  });
});

describe('FineTuneTrait', () => {
  it('should start fine-tuning job', () => {
    const node = createMockNode('ft'); const ctx = createMockContext();
    attachTrait(fineTuneHandler, node, {}, ctx);
    sendEvent(fineTuneHandler, node, {}, ctx, { type: 'finetune:start', modelId: 'base', dataset: 'train.jsonl' });
    expect(getEventCount(ctx, 'finetune:status')).toBe(1);
  });
});

describe('VectorSearchTrait', () => {
  it('should index and search', () => {
    const node = createMockNode('vs'); const ctx = createMockContext();
    attachTrait(vectorSearchHandler, node, {}, ctx);
    sendEvent(vectorSearchHandler, node, {}, ctx, { type: 'vsearch:index', collection: 'docs', docId: 'd1', vector: [1, 0, 0] });
    sendEvent(vectorSearchHandler, node, {}, ctx, { type: 'vsearch:query', collection: 'docs', vector: [1, 0, 0], topK: 5 });
    const result = getLastEvent(ctx, 'vsearch:result') as any;
    expect(result.matches.length).toBe(1);
    expect(result.matches[0].docId).toBe('d1');
  });
});

describe('PromptTemplateTrait', () => {
  it('should register and render templates', () => {
    const node = createMockNode('pt'); const ctx = createMockContext();
    attachTrait(promptTemplateHandler, node, {}, ctx);
    sendEvent(promptTemplateHandler, node, {}, ctx, {
      type: 'prompt:register', templateId: 'greet', template: 'Hello {{name}}!', variables: ['name'],
    });
    sendEvent(promptTemplateHandler, node, {}, ctx, {
      type: 'prompt:render', templateId: 'greet', values: { name: 'World' },
    });
    const result = getLastEvent(ctx, 'prompt:result') as any;
    expect(result.rendered).toBe('Hello World!');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DevOps / CI
// ═══════════════════════════════════════════════════════════════════════════════

describe('DeployTrait', () => {
  it('should start deployment with stages', () => {
    const node = createMockNode('dep'); const ctx = createMockContext();
    attachTrait(deployHandler, node, {}, ctx);
    sendEvent(deployHandler, node, {}, ctx, { type: 'deploy:start', version: '1.0', target: 'prod' });
    const stage = getLastEvent(ctx, 'deploy:stage') as any;
    expect(stage.stage).toBe('prepare');
    expect(stage.status).toBe('started');
  });
});

describe('RollbackTrait', () => {
  it('should trigger rollback', () => {
    const node = createMockNode('rb'); const ctx = createMockContext();
    attachTrait(rollbackHandler, node, {}, ctx);
    sendEvent(rollbackHandler, node, {}, ctx, { type: 'rollback:trigger', targetVersion: 'v0.9' });
    const result = getLastEvent(ctx, 'rollback:complete') as any;
    expect(result.rolledBackTo).toBe('v0.9');
  });
});

describe('CanaryTrait', () => {
  it('should start and promote canary', () => {
    const node = createMockNode('can'); const ctx = createMockContext();
    attachTrait(canaryHandler, node, {}, ctx);
    sendEvent(canaryHandler, node, {}, ctx, { type: 'canary:start', version: '2.0', percentage: 10 });
    expect(getEventCount(ctx, 'canary:status')).toBe(1);
    sendEvent(canaryHandler, node, {}, ctx, { type: 'canary:promote' });
    const status = getLastEvent(ctx, 'canary:status') as any;
    expect(status.percentage).toBe(100);
    expect(status.promoted).toBe(true);
  });
});

describe('FeatureFlagTrait', () => {
  it('should define and evaluate flag', () => {
    const node = createMockNode('ff'); const ctx = createMockContext();
    attachTrait(featureFlagHandler, node, {}, ctx);
    sendEvent(featureFlagHandler, node, {}, ctx, { type: 'flag:define', flagId: 'dark_mode', defaultValue: true });
    sendEvent(featureFlagHandler, node, {}, ctx, { type: 'flag:evaluate', flagId: 'dark_mode' });
    const result = getLastEvent(ctx, 'flag:result') as any;
    expect(result.value).toBe(true);
    expect(result.enabled).toBe(true);
  });
});

describe('EnvConfigTrait', () => {
  it('should set and get config', () => {
    const node = createMockNode('env'); const ctx = createMockContext();
    attachTrait(envConfigHandler, node, {}, ctx);
    sendEvent(envConfigHandler, node, {}, ctx, { type: 'envconfig:set', key: 'PORT', value: 3000 });
    sendEvent(envConfigHandler, node, {}, ctx, { type: 'envconfig:get', key: 'PORT' });
    const result = getLastEvent(ctx, 'envconfig:result') as any;
    expect(result.value).toBe(3000);
  });
});

describe('SecretTrait', () => {
  it('should store and retrieve secret', () => {
    const node = createMockNode('sec'); const ctx = createMockContext();
    attachTrait(secretHandler, node, {}, ctx);
    sendEvent(secretHandler, node, {}, ctx, { type: 'secret:store', secretId: 'api_key', value: 'sk-123' });
    sendEvent(secretHandler, node, {}, ctx, { type: 'secret:retrieve', secretId: 'api_key' });
    const result = getLastEvent(ctx, 'secret:result') as any;
    expect(result.value).toBe('sk-123');
  });
  it('should rotate secret', () => {
    const node = createMockNode('sec'); const ctx = createMockContext();
    attachTrait(secretHandler, node, {}, ctx);
    sendEvent(secretHandler, node, {}, ctx, { type: 'secret:store', secretId: 'key', value: 'old' });
    sendEvent(secretHandler, node, {}, ctx, { type: 'secret:rotate', secretId: 'key', newValue: 'new' });
    expect(getEventCount(ctx, 'secret:rotated')).toBe(1);
    const rotated = getLastEvent(ctx, 'secret:rotated') as any;
    expect(rotated.version).toBe(2);
  });
});
