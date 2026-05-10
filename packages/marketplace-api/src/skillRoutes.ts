/**
 * @fileoverview Skill Marketplace Express Routes
 *
 * REST API endpoints for skill publishing, discovery, purchase, and installation.
 *
 * @module marketplace-api/skillRoutes
 */

import { Router, type Request, type Response } from 'express';
import type {
  SkillSearchQuery,
  SkillPublishRequest,
  SkillCategory,
  SkillTargetPlatform,
  ApiResponse,
  SkillPackage,
  SkillSummary,
  SkillSearchResult,
  SkillPublishResult,
  DownloadStats,
  TraitRating,
} from './types.js';
import {
  SkillMarketplacePaymentError,
  type SkillMarketplaceService,
} from './SkillMarketplaceService.js';
import type { x402PaymentService } from './x402PaymentService.js';

function extractPaymentId(req: Request): string | undefined {
  const headerPaymentId = req.headers['x-payment-id'];
  if (typeof headerPaymentId === 'string' && headerPaymentId.trim()) {
    return headerPaymentId.trim();
  }

  const body = req.body as Record<string, unknown> | undefined;
  const bodyPaymentId = body?.payment_id ?? body?.paymentId;
  if (typeof bodyPaymentId === 'string' && bodyPaymentId.trim()) {
    return bodyPaymentId.trim();
  }

  const queryPaymentId = req.query.payment_id ?? req.query.paymentId;
  if (typeof queryPaymentId === 'string' && queryPaymentId.trim()) {
    return queryPaymentId.trim();
  }

  return undefined;
}

function isPaidSkill(skill: SkillPackage): boolean {
  return skill.pricingModel !== 'free';
}

function getSkillPriceDollars(skill: SkillPackage): number {
  const cents =
    skill.pricingModel === 'subscription'
      ? skill.subscriptionPrice ?? skill.price
      : skill.price;
  return cents / 100;
}

function skillPricingPayload(skill: SkillPackage) {
  return {
    pricingModel: skill.pricingModel,
    price: skill.price,
    subscriptionPrice: skill.subscriptionPrice,
  };
}

function handleSkillPaymentError(
  res: Response,
  error: unknown,
  skill?: SkillPackage
): boolean {
  if (!(error instanceof SkillMarketplacePaymentError)) {
    return false;
  }

  res.status(error.status).json({
    success: false,
    error: { code: error.code, message: error.message },
    ...(skill ? { pricing: skillPricingPayload(skill) } : {}),
  });
  return true;
}

/**
 * Create Express router for skill marketplace endpoints.
 *
 * Routes:
 *   POST   /api/skills/publish        → publishSkill
 *   GET    /api/skills/search         → searchSkills
 *   GET    /api/skills/categories     → getCategories
 *   GET    /api/skills/featured       → getFeaturedSkills
 *   GET    /api/skills/recent         → getRecentSkills
 *   GET    /api/skills/top            → getTopSkills
 *   GET    /api/skills/:id            → getSkill
 *   POST   /api/skills/:id/purchase   → purchaseSkill
 *   GET    /api/skills/:id/download   → getDownloadUrl
 *   POST   /api/skills/:id/install    → installSkill
 *   DELETE /api/skills/:id/install    → uninstallSkill
 *   POST   /api/skills/:id/test       → testSkill
 *   POST   /api/skills/:id/rate       → rateSkill
 *   GET    /api/skills/:id/ratings    → getSkillRatings
 *   GET    /api/skills/:id/stats      → getSkillDownloadStats
 *   DELETE /api/skills/:id            → unpublishSkill
 */
export function createSkillMarketplaceRoutes(
  service: SkillMarketplaceService,
  paymentService?: x402PaymentService
): Router {
  const router = Router();

  // ─── Publishing ────────────────────────────────────────────────────────────

  router.post('/publish', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const request = req.body as SkillPublishRequest;
      const result = await service.publishSkill(request, token);
      const response: ApiResponse<SkillPublishResult> = { success: true, data: result };
      res.status(201).json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Publish failed';
      res.status(400).json({ success: false, error: { code: 'PUBLISH_FAILED', message } });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      await service.unpublishSkill(req.params.id, token);
      res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unpublish failed';
      res.status(400).json({ success: false, error: { code: 'UNPUBLISH_FAILED', message } });
    }
  });

  // ─── Discovery ─────────────────────────────────────────────────────────────

  router.get('/search', async (req, res) => {
    try {
      const query: SkillSearchQuery = {
        q: req.query.q as string,
        category: req.query.category as SkillCategory,
        targetPlatform: req.query.platform as SkillTargetPlatform | undefined,
        author: req.query.author as string,
        pricingModel: req.query.pricing as SkillSearchQuery['pricingModel'],
        maxPrice: req.query.maxPrice ? Number(req.query.maxPrice) : undefined,
        verified:
          req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : undefined,
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
        sortBy: (req.query.sortBy as SkillSearchQuery['sortBy']) || 'relevance',
        sortOrder: (req.query.sortOrder as SkillSearchQuery['sortOrder']) || 'desc',
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Math.min(Number(req.query.limit), 100) : 20,
      };
      const result = await service.searchSkills(query);
      const response: ApiResponse<SkillSearchResult> = { success: true, data: result };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      res.status(500).json({ success: false, error: { code: 'SEARCH_FAILED', message } });
    }
  });

  router.get('/categories', async (_req, res) => {
    try {
      const categories = await service.getCategories();
      res.json({ success: true, data: categories });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get categories';
      res.status(500).json({ success: false, error: { code: 'CATEGORIES_FAILED', message } });
    }
  });

  router.get('/featured', async (req, res) => {
    try {
      const category = req.query.category as SkillCategory | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const skills = await service.getFeaturedSkills(category, limit);
      const response: ApiResponse<SkillSummary[]> = { success: true, data: skills };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed';
      res.status(500).json({ success: false, error: { code: 'FEATURED_FAILED', message } });
    }
  });

  router.get('/recent', async (req, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const skills = await service.getRecentSkills(limit);
      res.json({ success: true, data: skills });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed';
      res.status(500).json({ success: false, error: { code: 'RECENT_FAILED', message } });
    }
  });

  router.get('/top', async (req, res) => {
    try {
      const sortBy = (req.query.sortBy as 'downloads' | 'rating' | 'installs') || 'downloads';
      const limit = req.query.limit ? Number(req.query.limit) : 10;
      const skills = await service.getTopSkills(sortBy, limit);
      res.json({ success: true, data: skills });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed';
      res.status(500).json({ success: false, error: { code: 'TOP_FAILED', message } });
    }
  });

  // ─── Individual Skill ──────────────────────────────────────────────────────

  router.get('/:id', async (req, res) => {
    try {
      const version = req.query.version as string | undefined;
      const skill = await service.getSkill(req.params.id, version);
      const response: ApiResponse<SkillPackage> = { success: true, data: skill };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Not found';
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message } });
    }
  });

  // ─── Purchase & Download ───────────────────────────────────────────────────

  router.post('/:id/purchase', async (req, res) => {
    let skill: SkillPackage | undefined;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const paymentId = extractPaymentId(req);
      skill = await service.getSkill(req.params.id);

      if (isPaidSkill(skill) && !paymentId && paymentService) {
        paymentService.return402Response(res, {
          payment_id: `x402_skill_${req.params.id}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
          price: getSkillPriceDollars(skill),
          asset: 'USDC',
          network: 'base',
          facilitator: 'https://cdp.coinbase.com/x402',
          content_id: req.params.id,
        });
        return;
      }

      const result = await service.purchaseSkill(req.params.id, token, paymentId);
      res.json({ success: true, data: result });
    } catch (error) {
      if (handleSkillPaymentError(res, error, skill)) return;
      const message = error instanceof Error ? error.message : 'Purchase failed';
      res.status(400).json({ success: false, error: { code: 'PURCHASE_FAILED', message } });
    }
  });

  router.get('/:id/download', async (req, res) => {
    let skill: SkillPackage | undefined;
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const paymentId = extractPaymentId(req);
      skill = await service.getSkill(req.params.id);
      const result = await service.getDownloadUrl(req.params.id, token, paymentId);
      await service.recordSkillDownload(req.params.id);
      res.json({ success: true, data: result });
    } catch (error) {
      if (handleSkillPaymentError(res, error, skill)) return;
      const message = error instanceof Error ? error.message : 'Download failed';
      res.status(400).json({ success: false, error: { code: 'DOWNLOAD_FAILED', message } });
    }
  });

  // ─── Install ───────────────────────────────────────────────────────────────

  router.post('/:id/install', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const { workspacePath } = req.body as { workspacePath: string };
      const result = await service.installSkill(req.params.id, workspacePath, token);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Install failed';
      res.status(400).json({ success: false, error: { code: 'INSTALL_FAILED', message } });
    }
  });

  router.delete('/:id/install', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const { workspacePath } = req.body as { workspacePath: string };
      await service.uninstallSkill(req.params.id, workspacePath, token);
      res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Uninstall failed';
      res.status(400).json({ success: false, error: { code: 'UNINSTALL_FAILED', message } });
    }
  });

  // ─── Testing ───────────────────────────────────────────────────────────────

  router.post('/:id/test', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const { prompt } = req.body as { prompt: string };
      const result = await service.testSkill(req.params.id, prompt, token);
      res.json({ success: true, data: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test failed';
      res.status(400).json({ success: false, error: { code: 'TEST_FAILED', message } });
    }
  });

  // ─── Ratings ───────────────────────────────────────────────────────────────

  router.post('/:id/rate', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const { rating, review } = req.body as { rating: number; review?: string };
      await service.rateSkill(req.params.id, rating, review, token);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Rate failed';
      res.status(400).json({ success: false, error: { code: 'RATE_FAILED', message } });
    }
  });

  router.get('/:id/ratings', async (req, res) => {
    try {
      const page = req.query.page ? Number(req.query.page) : 1;
      const ratings = await service.getSkillRatings(req.params.id, page);
      res.json({ success: true, data: ratings });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed';
      res.status(500).json({ success: false, error: { code: 'RATINGS_FAILED', message } });
    }
  });

  // ─── Stats ─────────────────────────────────────────────────────────────────

  router.get('/:id/stats', async (req, res) => {
    try {
      const stats = await service.getSkillDownloadStats(req.params.id);
      res.json({ success: true, data: stats });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed';
      res.status(500).json({ success: false, error: { code: 'STATS_FAILED', message } });
    }
  });

  return router;
}
