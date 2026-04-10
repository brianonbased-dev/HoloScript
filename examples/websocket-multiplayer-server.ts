#!/usr/bin/env node

/**
 * Simple WebSocket Multiplayer Server for HoloScript Testing
 *
 * Usage:
 *   npx tsx examples/websocket-multiplayer-server.ts
 *
 * Then connect clients to: ws://localhost:8080
 */

import { WebSocketServer, WebSocket } from 'ws';

interface ClientMessage {
  type: string;
  roomId?: string;
  entityId?: string;
  data?: unknown;
  timestamp?: number;
}

interface Room {
  clients: Map<string, WebSocket>;
  createdAt: number;
}

const PORT = 8080;
const wss = new WebSocketServer({ port: PORT });

// Room management
const rooms: Map<string, Room> = new Map();
let clientCount = 0;

// Utility functions
function getOrCreateRoom(roomId: string): Room {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      clients: new Map(),
      createdAt: Date.now(),
    });
  }
  return rooms.get(roomId)!;
}

function broadcastToRoom(roomId: string, message: ClientMessage, excludeClient?: WebSocket) {
  const room = rooms.get(roomId);
  if (!room) return;

  // Add server timestamp
  const msg = {
    ...message,
    serverTimestamp: Date.now(),
  };

  const payload = JSON.stringify(msg);

  room.clients.forEach((ws, clientId) => {
    if (ws.readyState === WebSocket.OPEN && ws !== excludeClient) {
      ws.send(payload);
    }
  });
}

function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  const timestamp = new Date().toISOString().split('T')[1];
  const prefix = {
    info: '✓',
    warn: '⚠',
    error: '✗',
  }[level];

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

// WebSocket server events
wss.on('connection', (ws: WebSocket, req) => {
  const clientId = `client-${++clientCount}`;
  const clientIp = req.socket.remoteAddress;

  log(`Connection from ${clientIp} (${clientId})`);

  // Track which rooms this client is in
  const clientRooms: Set<string> = new Set();

  ws.on('message', (data: Buffer) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      const { type, roomId, entityId } = message;

      switch (type) {
        case 'join-room': {
          if (!roomId) {
            ws.send(
              JSON.stringify({
                type: 'error',
                message: 'roomId required for join-room',
              })
            );
            return;
          }

          const room = getOrCreateRoom(roomId);
          room.clients.set(clientId, ws);
          clientRooms.add(roomId);

          // Notify room of new peer
          broadcastToRoom(
            roomId,
            {
              type: 'peer-joined',
              entityId: clientId,
              data: { peerId: clientId, joinedAt: Date.now() },
            },
            ws
          );

          // Send existing peers list to new client
          const peers = Array.from(room.clients.keys()).filter((id) => id !== clientId);
          ws.send(
            JSON.stringify({
              type: 'peers-list',
              data: { peers, roomId, peerId: clientId },
            })
          );

          log(`${clientId} joined room ${roomId} (total: ${room.clients.size})`);
          break;
        }

        case 'leave-room': {
          if (!roomId) return;

          const room = rooms.get(roomId);
          if (room) {
            room.clients.delete(clientId);
            clientRooms.delete(roomId);

            // Notify room of peer departure
            broadcastToRoom(roomId, {
              type: 'peer-left',
              entityId: clientId,
              data: { peerId: clientId, leftAt: Date.now() },
            });

            // Clean up empty rooms
            if (room.clients.size === 0) {
              rooms.delete(roomId);
              log(`Room ${roomId} closed (empty)`);
            } else {
              log(`${clientId} left room ${roomId} (remaining: ${room.clients.size})`);
            }
          }
          break;
        }

        case 'state-sync': {
          // Broadcast state update to all other clients in room
          if (roomId && entityId) {
            broadcastToRoom(
              roomId,
              {
                type: 'state-sync',
                entityId,
                data: message.data,
                fromPeer: clientId,
              },
              ws // Don't echo back to sender
            );
          }
          break;
        }

        case 'message': {
          // Generic message relay
          if (roomId) {
            broadcastToRoom(
              roomId,
              {
                type: 'message',
                data: message.data,
                fromPeer: clientId,
              },
              ws
            );
          }
          break;
        }

        case 'ping': {
          // Respond with pong
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          break;
        }

        default: {
          log(`Unknown message type: ${type}`, 'warn');
        }
      }
    } catch (error) {
      log(`Message parsing error: ${error}`, 'error');
    }
  });

  ws.on('close', () => {
    log(`${clientId} disconnected`);

    // Notify all rooms of departure
    clientRooms.forEach((roomId) => {
      const room = rooms.get(roomId);
      if (room) {
        room.clients.delete(clientId);

        // Notify remaining peers
        broadcastToRoom(roomId, {
          type: 'peer-left',
          entityId: clientId,
          data: { peerId: clientId, leftAt: Date.now() },
        });

        // Clean up empty rooms
        if (room.clients.size === 0) {
          rooms.delete(roomId);
          log(`Room ${roomId} closed (empty)`);
        }
      }
    });
  });

  ws.on('error', (error) => {
    log(`WebSocket error from ${clientId}: ${error.message}`, 'error');
  });
});

wss.on('error', (error) => {
  log(`Server error: ${error.message}`, 'error');
});

// Statistics
setInterval(() => {
  const totalRooms = rooms.size;
  const totalClients = Array.from(rooms.values()).reduce((sum, room) => sum + room.clients.size, 0);
  const avgRoomSize = totalRooms > 0 ? (totalClients / totalRooms).toFixed(1) : 0;

  log(`Stats: ${totalRooms} rooms, ${totalClients} clients, avg size: ${avgRoomSize}`);
}, 30000);

// Startup message
log(`🚀 HoloScript WebSocket Multiplayer Server running on ws://localhost:${PORT}`);
log('Rooms and peers will be listed every 30 seconds');
log('Press Ctrl+C to stop');
log('');
log('Test with: ws://localhost:8080');
log('Example: NetworkedTrait.connectWebSocket("ws://localhost:8080")');
