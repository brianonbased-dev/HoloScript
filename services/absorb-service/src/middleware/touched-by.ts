import type { NextFunction, Request, Response } from 'express';

const HEADER_NAME = 'X-Holo-Touched-By';
const MAX_HEADER_LENGTH = 256;
const HANDLE_PATTERN = /^[A-Za-z0-9._-]+$/;
const BAKED_DEFAULT = 'claude1,cursor1,gemini1,copilot1';

let cachedHandles: string | null = null;

function sanitizeHandleList(raw: string): string {
  return raw
    .split(',')
    .map((h) => h.trim())
    .filter((h) => h.length > 0 && HANDLE_PATTERN.test(h))
    .join(',')
    .slice(0, MAX_HEADER_LENGTH);
}

function loadHandles(): string {
  if (cachedHandles !== null) return cachedHandles;
  const fromEnv = process.env.HOLO_TOUCHED_BY;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    cachedHandles = sanitizeHandleList(fromEnv);
    return cachedHandles;
  }
  cachedHandles = sanitizeHandleList(BAKED_DEFAULT);
  return cachedHandles;
}

export function touchedByMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const handles = loadHandles();
  if (handles.length > 0) {
    res.setHeader(HEADER_NAME, handles);
  }
  next();
}

export function _resetTouchedByCacheForTest(): void {
  cachedHandles = null;
}
