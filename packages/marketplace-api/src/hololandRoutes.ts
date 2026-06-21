import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { x402PaymentReceipt } from './x402PaymentService.js';
import {
  parseCreateVrrTwinInput,
  VRRTwinService,
  VrrProtocolPublishError,
  VrrTwinInputError,
  type VrrTwinRecord,
} from './VRRTwinService.js';

interface RevenueSplit {
  creator: { address: string; amount: number };
  platform: { amount: number };
  agent: { address: string; amount: number } | null;
}

export interface HololandPaymentService {
  requirePayment(config: { price: number; asset: string; network: string }): RequestHandler;
  facilitatorCallback(req: Request, res: Response): Promise<void>;
  processRevenueSplit(amount: number, creatorAddress: string, agentAddress?: string): RevenueSplit;
}

export interface QuestGenerationService {
  createQuest(params: { businessId: string; narrative?: string }): Promise<{
    id: string;
    holoscript: string;
  }>;
}

export interface StoryWeaverService {
  mintBook(params: { worldId: string }): Promise<{ nft_id: string }>;
}

export interface HololandRoutesOptions {
  vrrTwinService?: VRRTwinService;
  questGenerationService?: QuestGenerationService;
  storyWeaverService?: StoryWeaverService;
}

const defaultQuestGenerationService: QuestGenerationService = {
  createQuest: async (params) => ({
    id: `quest_${Date.now()}`,
    holoscript: `composition "quest_${params.businessId}_${Date.now()}" { ... }`,
  }),
};

const defaultStoryWeaverService: StoryWeaverService = {
  mintBook: async (_params) => ({
    nft_id: `nft_${Date.now()}`,
  }),
};

export function createHololandRoutes(
  paymentService: HololandPaymentService,
  options: HololandRoutesOptions = {}
): Router {
  const router = Router();
  const vrrTwinService = options.vrrTwinService ?? new VRRTwinService();
  const questGenerationService = options.questGenerationService ?? defaultQuestGenerationService;
  const storyWeaverService = options.storyWeaverService ?? defaultStoryWeaverService;

  // Middleware factory for x402
  const x402Middleware = (config: { price: number; asset: string; network?: string }) =>
    paymentService.requirePayment({ network: 'base', ...config });

  // POST /api/payments/x402/callback
  router.post(
    '/payments/x402/callback',
    async (req: Request, res: Response, next: NextFunction) => {
      paymentService.facilitatorCallback(req, res).catch(next);
    }
  );

  // POST /api/create-vrr-twin (x402-protected) - Business creates VRR twin
  router.post(
    '/create-vrr-twin',
    x402Middleware({ price: 500, asset: 'USDC' }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const input = parseCreateVrrTwinInput(req.body);
        const result = await vrrTwinService.create(input);
        const paymentReceipt = getPaymentReceipt(req);
        const revenueSplit = paymentService.processRevenueSplit(
          paymentReceipt?.amount ?? 500,
          input.creatorAddress ?? result.twin.creatorAddress ?? input.businessId,
          input.agentAddress ?? result.twin.agentAddress
        );
        res.json({
          success: true,
          vrr_twin_id: result.twin.id,
          config: result.holoscript,
          vrr_twin: serializeTwin(result.twin),
          protocol_publish: result.protocolPublish,
          revenue_split: revenueSplit,
          x402_receipt: paymentReceipt ? summarizePaymentReceipt(paymentReceipt) : undefined,
        });
      } catch (err) {
        handleVrrTwinError(err, res, next);
      }
    }
  );

  // POST /api/create-quest (x402-protected) - AI agent creates quest
  router.post(
    '/create-quest',
    x402Middleware({ price: 50, asset: 'USDC' }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = asRecord(req.body);
        const businessId =
          stringBody(body, 'business_id') ?? stringBody(body, 'businessId') ?? 'unknown_business';
        const narrative = stringBody(body, 'narrative');
        const quest = await questGenerationService.createQuest({ businessId, narrative });
        res.json({ success: true, quest_id: quest.id, config: quest.holoscript });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /api/mint-story_weaver-book (x402-protected) - Mint AI-generated world as NFT
  router.post(
    '/mint-story_weaver-book',
    x402Middleware({ price: 10, asset: 'USDC' }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const body = asRecord(req.body);
        const worldId = stringBody(body, 'world_id') ?? stringBody(body, 'worldId') ?? 'unknown';
        const result = await storyWeaverService.mintBook({ worldId });
        res.json({ success: true, nft_id: result.nft_id });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /api/business/:id/vrr-twin - Retrieve VRR twin configuration
  router.get('/business/:id/vrr-twin', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = firstQueryString(req.params.id) ?? '';
      const twin = await vrrTwinService.getByBusinessId(id);
      if (!twin) {
        res.status(404).json({
          success: false,
          error: {
            code: 'VRR_TWIN_NOT_FOUND',
            message: `No VRR twin found for business ${id}`,
          },
        });
        return;
      }
      res.json({
        success: true,
        vrr_twin_id: twin.id,
        config: twin.holoscript,
        vrr_twin: serializeTwin(twin),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/vrr-twins - Query VRR twins by business or location radius
  router.get('/vrr-twins', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const businessId = firstQueryString(req.query.business_id ?? req.query.businessId);
      const lat = queryNumber(req, ['lat', 'latitude']);
      const lng = queryNumber(req, ['lng', 'lon', 'longitude']);
      const radiusMeters = queryNumber(req, ['radius_m', 'radiusMeters', 'radius']);
      const twins = await vrrTwinService.query({
        ...(businessId ? { businessId } : {}),
        ...(lat !== undefined ? { lat } : {}),
        ...(lng !== undefined ? { lng } : {}),
        ...(radiusMeters !== undefined ? { radiusMeters } : {}),
      });
      res.json({
        success: true,
        total: twins.length,
        vrr_twins: twins.map(serializeTwin),
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/vrr-twins/:id - Retrieve a stored VRR twin by twin id
  router.get('/vrr-twins/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const twinId = firstQueryString(req.params.id) ?? '';
      const twin = await vrrTwinService.getById(twinId);
      if (!twin) {
        res.status(404).json({
          success: false,
          error: { code: 'VRR_TWIN_NOT_FOUND', message: `No VRR twin found for ${twinId}` },
        });
        return;
      }
      res.json({
        success: true,
        vrr_twin_id: twin.id,
        config: twin.holoscript,
        vrr_twin: serializeTwin(twin),
      });
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

function handleVrrTwinError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof VrrTwinInputError) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_VRR_TWIN_INPUT',
        message: error.message,
        issues: error.issues,
      },
    });
    return;
  }

  if (error instanceof VrrProtocolPublishError) {
    res.status(502).json({
      success: false,
      error: {
        code: 'VRR_PROTOCOL_PUBLISH_FAILED',
        message: error.message,
        protocol_publish: error.receipt,
      },
    });
    return;
  }

  next(error);
}

function serializeTwin(twin: VrrTwinRecord): Record<string, unknown> {
  return {
    id: twin.id,
    business_id: twin.businessId,
    display_name: twin.displayName,
    geo_anchor: twin.geoAnchor,
    captures: twin.captures,
    sync_apis: twin.syncApis,
    protocol: twin.protocol,
    created_at: twin.createdAt,
    updated_at: twin.updatedAt,
    creator_address: twin.creatorAddress,
    agent_address: twin.agentAddress,
  };
}

function getPaymentReceipt(req: Request): x402PaymentReceipt | undefined {
  return (req as Request & { paymentReceipt?: x402PaymentReceipt }).paymentReceipt;
}

function summarizePaymentReceipt(receipt: x402PaymentReceipt): Record<string, unknown> {
  return {
    payment_id: receipt.payment_id,
    transaction_hash: receipt.transaction_hash,
    amount: receipt.amount,
    asset: receipt.asset,
    network: receipt.network,
    content_id: receipt.content_id,
    access_granted: receipt.access_granted,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringBody(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function firstQueryString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  if (Array.isArray(value)) return firstQueryString(value[0]);
  return undefined;
}

function queryNumber(req: Request, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = firstQueryString(req.query[key]);
    if (!value) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
