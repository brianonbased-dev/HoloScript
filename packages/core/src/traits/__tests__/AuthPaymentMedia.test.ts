/**
 * Auth/Identity + Payment + Media/Content Traits — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { jwtHandler } from '../JwtTrait';
import { oauthHandler } from '../OauthTrait';
import { apiKeyHandler } from '../ApiKeyTrait';
import { sessionHandler } from '../SessionTrait';
import { permissionHandler } from '../PermissionTrait';
import { mfaHandler } from '../MfaTrait';
import { stripeHandler } from '../StripeTrait';
import { invoiceHandler } from '../InvoiceTrait';
import { subscriptionHandler } from '../SubscriptionTrait';
import { refundHandler } from '../RefundTrait';
import { walletHandler } from '../WalletTrait';
import { imageResizeHandler } from '../ImageResizeTrait';
import { videoTranscodeHandler } from '../VideoTranscodeTrait';
import { pdfGenerateHandler } from '../PdfGenerateTrait';
import { markdownRenderHandler } from '../MarkdownRenderTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ═══════════════════════════════════════════════════════════════════════════════
// Auth / Identity
// ═══════════════════════════════════════════════════════════════════════════════

describe('JwtTrait', () => {
  it('should issue token', async () => {
    const node = createMockNode('j');
    const ctx = createMockContext();
    attachTrait(jwtHandler, node, {}, ctx);
    sendEvent(jwtHandler, node, {}, ctx, { type: 'jwt:issue', sub: 'user1' });
    
    // Wait for async sign
    await new Promise(r => setTimeout(r, 50));
    
    expect(getEventCount(ctx, 'jwt:issued')).toBe(1);
    const r = getLastEvent(ctx, 'jwt:issued') as any;
    expect(r.sub).toBe('user1');
    expect(typeof r.token).toBe('string');
  });
  
  it('should verify token', async () => {
    const node = createMockNode('j');
    const ctx = createMockContext();
    attachTrait(jwtHandler, node, {}, ctx);
    sendEvent(jwtHandler, node, {}, ctx, { type: 'jwt:issue', sub: 'user1' });
    
    await new Promise(r => setTimeout(r, 50));
    const token = (getLastEvent(ctx, 'jwt:issued') as any).token;
    
    sendEvent(jwtHandler, node, {}, ctx, { type: 'jwt:verify', token });
    
    await new Promise(r => setTimeout(r, 50));
    const r = getLastEvent(ctx, 'jwt:verified') as any;
    expect(r.valid).toBe(true);
    expect(r.sub).toBe('user1');
  });
});

describe('OauthTrait', () => {
  it('should handle callback and issue token', () => {
    const node = createMockNode('o');
    const ctx = createMockContext();
    attachTrait(oauthHandler, node, {}, ctx);
    sendEvent(oauthHandler, node, {}, ctx, {
      type: 'oauth:callback',
      code: 'code123',
      state: 'xyz',
    });
    expect(getEventCount(ctx, 'oauth:token')).toBe(1);
  });
});

describe('ApiKeyTrait', () => {
  it('should generate and validate key', () => {
    const node = createMockNode('ak');
    const ctx = createMockContext();
    attachTrait(apiKeyHandler, node, {}, ctx);
    sendEvent(apiKeyHandler, node, {}, ctx, { type: 'apikey:generate', name: 'test' });
    const gen = getLastEvent(ctx, 'apikey:generated') as any;
    expect(gen.key).toContain('sk_');
    sendEvent(apiKeyHandler, node, {}, ctx, { type: 'apikey:validate', key: gen.key });
    const val = getLastEvent(ctx, 'apikey:validated') as any;
    expect(val.valid).toBe(true);
  });
});

describe('SessionTrait', () => {
  it('should create session', () => {
    const node = createMockNode('s');
    const ctx = createMockContext();
    attachTrait(sessionHandler, node, {}, ctx);
    sendEvent(sessionHandler, node, {}, ctx, { type: 'session:create', userId: 'u1' });
    expect(getEventCount(ctx, 'session:created')).toBe(1);
  });
});

describe('PermissionTrait', () => {
  it('should grant and check', () => {
    const node = createMockNode('p');
    const ctx = createMockContext();
    attachTrait(permissionHandler, node, {}, ctx);
    sendEvent(permissionHandler, node, {}, ctx, {
      type: 'permission:grant',
      userId: 'u1',
      permission: 'admin',
    });
    sendEvent(permissionHandler, node, {}, ctx, {
      type: 'permission:check',
      userId: 'u1',
      permission: 'admin',
    });
    const r = getLastEvent(ctx, 'permission:result') as any;
    expect(r.allowed).toBe(true);
  });
});

describe('MfaTrait', () => {
  it('should enroll and verify', () => {
    const node = createMockNode('m');
    const ctx = createMockContext();
    attachTrait(mfaHandler, node, {}, ctx);
    sendEvent(mfaHandler, node, {}, ctx, { type: 'mfa:enroll', userId: 'u1', method: 'totp' });
    expect(getEventCount(ctx, 'mfa:enrolled')).toBe(1);
    sendEvent(mfaHandler, node, {}, ctx, { type: 'mfa:verify', userId: 'u1', code: '123456' });
    const r = getLastEvent(ctx, 'mfa:verified') as any;
    expect(r.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Payment
// ═══════════════════════════════════════════════════════════════════════════════

describe('StripeTrait', () => {
  it('should charge', () => {
    const node = createMockNode('st');
    const ctx = createMockContext();
    attachTrait(stripeHandler, node, {}, ctx);
    sendEvent(stripeHandler, node, {}, ctx, {
      type: 'stripe:charge',
      amount: 2999,
      customerId: 'c1',
    });
    const r = getLastEvent(ctx, 'stripe:charged') as any;
    expect(r.amount).toBe(2999);
    expect(r.currency).toBe('usd');
  });
});

describe('InvoiceTrait', () => {
  it('should create auto-numbered invoice', () => {
    const node = createMockNode('inv');
    const ctx = createMockContext();
    attachTrait(invoiceHandler, node, {}, ctx);
    sendEvent(invoiceHandler, node, {}, ctx, { type: 'invoice:create', amount: 500 });
    const r = getLastEvent(ctx, 'invoice:created') as any;
    expect(r.invoiceId).toBe('INV-00001');
  });
});

describe('SubscriptionTrait', () => {
  it('should create and cancel subscription', () => {
    const node = createMockNode('sub');
    const ctx = createMockContext();
    attachTrait(subscriptionHandler, node, {}, ctx);
    sendEvent(subscriptionHandler, node, {}, ctx, { type: 'subscription:create', plan: 'pro' });
    const r = getLastEvent(ctx, 'subscription:created') as any;
    expect(r.plan).toBe('pro');
    sendEvent(subscriptionHandler, node, {}, ctx, {
      type: 'subscription:cancel',
      subscriptionId: r.subscriptionId,
    });
    expect(getEventCount(ctx, 'subscription:cancelled')).toBe(1);
  });
});

describe('RefundTrait', () => {
  it('should process refund', () => {
    const node = createMockNode('ref');
    const ctx = createMockContext();
    attachTrait(refundHandler, node, {}, ctx);
    sendEvent(refundHandler, node, {}, ctx, {
      type: 'refund:process',
      chargeId: 'ch_1',
      amount: 100,
      reason: 'defective',
    });
    expect(getEventCount(ctx, 'refund:processed')).toBe(1);
  });
});

describe('WalletTrait (Web3)', () => {
  it('should handle connect event', () => {
    const node = createMockNode('wal');
    const ctx = createMockContext();
    attachTrait(walletHandler, node, {}, ctx);
    sendEvent(walletHandler, node, {}, ctx, { type: 'wallet_connect', provider: 'metamask' });
    expect(getEventCount(ctx, 'wallet_request_connect')).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Media / Content
// ═══════════════════════════════════════════════════════════════════════════════

describe('ImageResizeTrait', () => {
  it('should resize image', () => {
    const node = createMockNode('img');
    const ctx = createMockContext();
    attachTrait(imageResizeHandler, node, {}, ctx);
    sendEvent(imageResizeHandler, node, {}, ctx, {
      type: 'image:resize',
      src: 'photo.jpg',
      width: 800,
      height: 600,
    });
    const r = getLastEvent(ctx, 'image:resized') as any;
    expect(r.width).toBe(800);
  });
});

describe('VideoTranscodeTrait', () => {
  it('should transcode video', () => {
    const node = createMockNode('vid');
    const ctx = createMockContext();
    attachTrait(videoTranscodeHandler, node, {}, ctx);
    sendEvent(videoTranscodeHandler, node, {}, ctx, {
      type: 'video:transcode',
      src: 'clip.mov',
      codec: 'h265',
    });
    const r = getLastEvent(ctx, 'video:transcoded') as any;
    expect(r.codec).toBe('h265');
  });
});

describe('PdfGenerateTrait', () => {
  it('should generate PDF', () => {
    const node = createMockNode('pdf');
    const ctx = createMockContext();
    attachTrait(pdfGenerateHandler, node, {}, ctx);
    sendEvent(pdfGenerateHandler, node, {}, ctx, { type: 'pdf:generate', template: 'invoice' });
    expect(getEventCount(ctx, 'pdf:generated')).toBe(1);
  });
});

describe('MarkdownRenderTrait', () => {
  it('should render markdown to HTML', () => {
    const node = createMockNode('md');
    const ctx = createMockContext();
    attachTrait(markdownRenderHandler, node, {}, ctx);
    sendEvent(markdownRenderHandler, node, {}, ctx, {
      type: 'markdown:render',
      markdown: '# Hello\n**bold**',
    });
    const r = getLastEvent(ctx, 'markdown:rendered') as any;
    expect(r.html).toContain('<h1>Hello</h1>');
    expect(r.html).toContain('<strong>bold</strong>');
  });
});
