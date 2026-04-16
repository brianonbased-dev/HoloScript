import { Router, Request, Response, NextFunction } from 'express';
import { x402PaymentService } from './x402PaymentService.js';

// Dummy services for compilation
const VRRTwinService = {
  create: async (params: any) => ({
    id: `vrr_twin_${Date.now()}`,
    holoscript: `composition "vrr_twin_${params.business_id}" { zone#${params.business_id} @vrr_twin @reality_mirror { } }`
  })
};

const QuestGenerationService = {
  createQuest: async (params: any) => ({
    id: `quest_${Date.now()}`,
    holoscript: `composition "quest_${Date.now()}" { ... }`
  })
};

const StoryWeaverService = {
  mintBook: async (params: any) => ({
    nft_id: `nft_${Date.now()}`
  })
};

export function createHololandRoutes(paymentService: x402PaymentService): Router {
  const router = Router();

  // Middleware factory for x402
  const x402Middleware = (config: { price: number; asset: string; network?: string }) => 
    paymentService.requirePayment({ network: 'base', ...config });

  // POST /api/payments/x402/callback
  router.post('/payments/x402/callback', async (req: Request, res: Response, next: NextFunction) => {
    paymentService.facilitatorCallback(req, res).catch(next);
  });

  // POST /api/create-vrr-twin (x402-protected) - Business creates VRR twin
  router.post('/create-vrr-twin', x402Middleware({ price: 500, asset: 'USDC' }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { business_id, geo_location, inventory_api } = req.body;
      const vrr_twin = await VRRTwinService.create({
        business_id,
        geo_location,
        sync_apis: { inventory: inventory_api }
      });
      res.json({ success: true, vrr_twin_id: vrr_twin.id, config: vrr_twin.holoscript });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/create-quest (x402-protected) - AI agent creates quest
  router.post('/create-quest', x402Middleware({ price: 50, asset: 'USDC' }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { business_id, narrative } = req.body;
      const quest = await QuestGenerationService.createQuest({ business_id, narrative });
      res.json({ success: true, quest_id: quest.id, config: quest.holoscript });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/mint-story_weaver-book (x402-protected) - Mint AI-generated world as NFT
  router.post('/mint-story_weaver-book', x402Middleware({ price: 10, asset: 'USDC' }), async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { world_id } = req.body;
      const result = await StoryWeaverService.mintBook({ world_id });
      res.json({ success: true, nft_id: result.nft_id });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/business/:id/vrr-twin - Retrieve VRR twin configuration
  router.get('/business/:id/vrr-twin', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      res.json({ success: true, vrr_twin_id: `vrr_twin_${id}`, config: `composition "vrr_twin_${id}" {}` });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/agent/:id/quests - List AI-generated quests
  router.get('/agent/:id/quests', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      res.json({ success: true, agent_id: id, quests: [] });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
