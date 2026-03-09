/**
 * Request ID Middleware
 *
 * Generates a UUID v4 for each incoming request and attaches it
 * to the request and response headers. Enables end-to-end request
 * tracing across services.
 *
 * SOC 2 CC7.1: Unique request identification for audit trail.
 */

import type { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) ?? uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
