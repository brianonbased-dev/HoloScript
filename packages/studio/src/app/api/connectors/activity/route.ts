export const maxDuration = 300;

/**
 * GET /api/connectors/activity — Real-time activity stream (SSE)
 *
 * Server-Sent Events stream for connector activity updates.
 * Clients receive events when connectors perform actions (deploy, merge PR, etc.).
 *
 * Event format:
 *   data: {"serviceId":"github","action":"PR #42 merged","status":"success","timestamp":"2026-03-21T..."}
 *
 * @module api/connectors/activity
 */

import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger';

// In-memory event emitter for connector activity
// In production, this would be replaced with Redis pub/sub or similar
class ActivityEmitter {
  private listeners: Set<(event: ActivityEvent) => void> = new Set();

  emit(event: ActivityEvent) {
    this.listeners.forEach((listener) => listener(event));
  }

  subscribe(listener: (event: ActivityEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export interface ActivityEvent {
  serviceId: string;
  action: string;
  status: 'success' | 'error' | 'pending';
  timestamp: string;
  metadata?: Record<string, any>;
}

// Global emitter instance (shared across all connections)
const activityEmitter = new ActivityEmitter();

export async function GET(req: NextRequest) {
  // Create a TransformStream for SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Send initial connection message
  const initialMessage = `data: ${JSON.stringify({
    serviceId: 'system',
    action: 'Connected to activity stream',
    status: 'success',
    timestamp: new Date().toISOString(),
  })}\n\n`;

  await writer.write(encoder.encode(initialMessage));

  // Subscribe to activity events
  const unsubscribe = activityEmitter.subscribe((event) => {
    const message = `data: ${JSON.stringify(event)}\n\n`;
    writer.write(encoder.encode(message)).catch((err) => {
      logger.error('[api/connectors/activity] Write error:', err);
    });
  });

  // Keep connection alive with periodic heartbeats
  const heartbeatInterval = setInterval(() => {
    const heartbeat = `: heartbeat ${Date.now()}\n\n`;
    writer.write(encoder.encode(heartbeat)).catch((err) => {
      logger.error('[api/connectors/activity] Heartbeat error:', err);
      clearInterval(heartbeatInterval);
    });
  }, 30000); // Every 30 seconds

  // Cleanup on connection close
  req.signal.addEventListener('abort', () => {
    clearInterval(heartbeatInterval);
    unsubscribe();
    writer.close().catch((err) => logger.warn('Swallowed error caught:', err));
  });

  // Return SSE response
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable buffering for nginx
    },
  });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
