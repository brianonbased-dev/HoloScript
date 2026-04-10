/**
 * Workspace API Routes
 *
 * Express router for team workspace management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { workspaceService, WorkspaceServiceError } from '../workspace/WorkspaceService.js';
import type {
  CreateWorkspaceRequest,
  UpdateWorkspaceRequest,
  InviteMemberRequest,
  SetSecretRequest,
  WorkspaceRole,
} from '../types.js';

// ============================================================================
// Request Validation Schemas
// ============================================================================

const CreateWorkspaceSchema = z.object({
  name: z.string().min(2).max(64),
  displayName: z.string().max(128).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(['public', 'private']).optional(),
});

const UpdateWorkspaceSchema = z.object({
  displayName: z.string().max(128).optional(),
  description: z.string().max(500).optional(),
  settings: z
    .object({
      visibility: z.enum(['public', 'private']).optional(),
      formatter: z
        .object({
          tabWidth: z.number().min(1).max(8).optional(),
          useTabs: z.boolean().optional(),
          printWidth: z.number().min(40).max(200).optional(),
          trailingComma: z.boolean().optional(),
        })
        .optional(),
      linter: z
        .object({
          rules: z.record(z.enum(['off', 'warn', 'error'])).optional(),
          extends: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

const InviteMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'developer', 'viewer']),
});

const UpdateRoleSchema = z.object({
  role: z.enum(['admin', 'developer', 'viewer']),
});

const SetSecretSchema = z.object({
  name: z.string().regex(/^[A-Z_][A-Z0-9_]*$/),
  value: z.string().min(1).max(10000),
});

// ============================================================================
// Middleware
// ============================================================================

interface AuthenticatedRequest extends Request {
  userId?: string;
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // In production, validate JWT token from Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // For now, extract user ID from a simple token format
  // In production, verify JWT and extract userId
  const token = authHeader.slice(7);
  req.userId = token; // Simplified - should be JWT payload

  next();
}

function validate<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: result.error.issues,
      });
    }
    req.body = result.data;
    next();
  };
}

function handleError(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof WorkspaceServiceError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }

  console.error('Unexpected error:', err);
  res.status(500).json({ error: 'Internal server error' });
}

// ============================================================================
// Routes
// ============================================================================

export function createWorkspaceRouter(): Router {
  const router = Router();

  // Apply auth to all routes
  router.use(requireAuth);

  // --------------------------------
  // Workspace CRUD
  // --------------------------------

  /**
   * POST /workspaces - Create a new workspace
   */
  router.post(
    '/',
    validate(CreateWorkspaceSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const workspace = await workspaceService.createWorkspace(
          req.body as CreateWorkspaceRequest,
          req.userId!
        );
        res.status(201).json(workspace);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * GET /workspaces - List user's workspaces
   */
  router.get('/', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspaces = await workspaceService.listUserWorkspaces(req.userId!);
      res.json({ workspaces });
    } catch (err) {
      next(err);
    }
  });

  /**
   * GET /workspaces/:id - Get workspace details
   */
  router.get('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const workspace = await workspaceService.getWorkspace(req.params.id, req.userId!);
      res.json(workspace);
    } catch (err) {
      next(err);
    }
  });

  /**
   * PUT /workspaces/:id - Update workspace
   */
  router.put(
    '/:id',
    validate(UpdateWorkspaceSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const workspace = await workspaceService.updateWorkspace(
          req.params.id,
          req.body as UpdateWorkspaceRequest,
          req.userId!
        );
        res.json(workspace);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * DELETE /workspaces/:id - Delete workspace
   */
  router.delete('/:id', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      await workspaceService.deleteWorkspace(req.params.id, req.userId!);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------
  // Members
  // --------------------------------

  /**
   * GET /workspaces/:id/members - List members
   */
  router.get(
    '/:id/members',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const members = await workspaceService.getMembers(req.params.id, req.userId!);
        res.json({ members });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /workspaces/:id/members - Invite member
   */
  router.post(
    '/:id/members',
    validate(InviteMemberSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const member = await workspaceService.inviteMember(
          req.params.id,
          req.body as InviteMemberRequest,
          req.userId!
        );
        res.status(201).json(member);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * PUT /workspaces/:id/members/:userId - Update member role
   */
  router.put(
    '/:id/members/:userId',
    validate(UpdateRoleSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const member = await workspaceService.updateMemberRole(
          req.params.id,
          req.params.userId,
          req.body.role as WorkspaceRole,
          req.userId!
        );
        res.json(member);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * DELETE /workspaces/:id/members/:userId - Remove member
   */
  router.delete(
    '/:id/members/:userId',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await workspaceService.removeMember(req.params.id, req.params.userId, req.userId!);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------
  // Secrets
  // --------------------------------

  /**
   * GET /workspaces/:id/secrets - List secrets (names only)
   */
  router.get(
    '/:id/secrets',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const secrets = await workspaceService.listSecrets(req.params.id, req.userId!);
        res.json({ secrets });
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * POST /workspaces/:id/secrets - Set secret
   */
  router.post(
    '/:id/secrets',
    validate(SetSecretSchema),
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const result = await workspaceService.setSecret(
          req.params.id,
          req.body as SetSecretRequest,
          req.userId!
        );
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  /**
   * DELETE /workspaces/:id/secrets/:name - Delete secret
   */
  router.delete(
    '/:id/secrets/:name',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        await workspaceService.deleteSecret(req.params.id, req.params.name, req.userId!);
        res.status(204).send();
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------
  // Activity
  // --------------------------------

  /**
   * GET /workspaces/:id/activity - Get activity feed
   */
  router.get(
    '/:id/activity',
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const feed = await workspaceService.getActivityFeed(
          req.params.id,
          req.userId!,
          limit,
          offset
        );
        res.json(feed);
      } catch (err) {
        next(err);
      }
    }
  );

  // Error handler
  router.use(handleError);

  return router;
}

export const workspacesRouter = createWorkspaceRouter();
