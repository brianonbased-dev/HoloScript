/**
 * HoloScript Multiplayer Signaling Server Example
 *
 * A simple Node.js WebSocket server for signaling and relay.
 * This is a reference implementation for development/testing.
 *
 * Usage:
 *   npm install ws
 *   node server.js
 *
 * The server will listen on ws://localhost:8080
 */

import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 8080;
const DEBUG = process.env.DEBUG === 'true';

// State
const clients = new Map(); // peerId -> { ws, roomId }
const rooms = new Map(); // roomId -> { peers: Set<peerId>, hostId, createdAt }
let peerCounter = 0;

// Generate unique IDs
function generatePeerId() {
  return `peer_${Date.now().toString(36)}_${(++peerCounter).toString(36)}`;
}

function generateRoomId() {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
}

// Send message to client
function send(ws, message) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

// Broadcast to room (except sender)
function broadcastToRoom(roomId, message, excludePeerId) {
  const room = rooms.get(roomId);
  if (!room) return;

  for (const peerId of room.peers) {
    if (peerId !== excludePeerId) {
      const client = clients.get(peerId);
      if (client) {
        send(client.ws, message);
      }
    }
  }
}

// Handle client joining a room
function handleJoin(client, requestedRoomId) {
  // Leave current room if in one
  if (client.roomId) {
    handleLeave(client);
  }

  const roomId = requestedRoomId || generateRoomId();

  // Get or create room
  let room = rooms.get(roomId);
  if (!room) {
    room = {
      peers: new Set(),
      hostId: client.peerId,
      createdAt: Date.now(),
    };
    rooms.set(roomId, room);
    if (DEBUG) console.log(`Room created: ${roomId}`);
  }

  // Add client to room
  room.peers.add(client.peerId);
  client.roomId = roomId;

  // Send existing peers list
  const existingPeers = Array.from(room.peers).filter((p) => p !== client.peerId);
  send(client.ws, {
    type: 'existing-peers',
    roomId,
    peers: existingPeers,
    hostId: room.hostId,
  });

  // Notify other peers
  broadcastToRoom(
    roomId,
    {
      type: 'peer-joined',
      peerId: client.peerId,
      roomId,
    },
    client.peerId
  );

  if (DEBUG) console.log(`${client.peerId} joined room ${roomId}`);
}

// Handle client leaving room
function handleLeave(client) {
  if (!client.roomId) return;

  const room = rooms.get(client.roomId);
  if (room) {
    room.peers.delete(client.peerId);

    // Notify other peers
    broadcastToRoom(client.roomId, {
      type: 'peer-left',
      peerId: client.peerId,
    });

    // Handle host migration
    if (room.hostId === client.peerId && room.peers.size > 0) {
      room.hostId = Array.from(room.peers)[0];
      broadcastToRoom(client.roomId, {
        type: 'host-changed',
        newHostId: room.hostId,
      });
    }

    // Delete empty room
    if (room.peers.size === 0) {
      rooms.delete(client.roomId);
      if (DEBUG) console.log(`Room deleted: ${client.roomId}`);
    }
  }

  if (DEBUG) console.log(`${client.peerId} left room ${client.roomId}`);
  client.roomId = null;
}

// Handle messages
function handleMessage(client, data) {
  let message;
  try {
    message = JSON.parse(data);
  } catch (e) {
    console.error('Failed to parse message:', e);
    return;
  }

  switch (message.type) {
    case 'join':
      handleJoin(client, message.roomId);
      break;

    case 'leave':
      handleLeave(client);
      break;

    case 'ping':
      send(client.ws, { type: 'pong', timestamp: Date.now() });
      break;

    case 'offer':
    case 'answer':
    case 'ice-candidate':
      // Forward WebRTC signaling to target peer
      if (message.targetId) {
        const target = clients.get(message.targetId);
        if (target) {
          send(target.ws, { ...message, senderId: client.peerId });
        }
      }
      break;

    case 'relay':
    case 'sync':
    case 'spawn':
    case 'despawn':
    case 'ownership':
    case 'rpc':
    case 'state':
      // Relay to all peers in room
      if (client.roomId) {
        broadcastToRoom(client.roomId, { ...message, senderId: client.peerId }, client.peerId);
      }
      break;

    default:
      if (DEBUG) console.log(`Unknown message type: ${message.type}`);
  }
}

// Create WebSocket server
const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws) => {
  const peerId = generatePeerId();
  const client = { peerId, roomId: null, ws };
  clients.set(peerId, client);

  console.log(`Client connected: ${peerId}`);

  // Send welcome message
  send(ws, { type: 'welcome', peerId });

  ws.on('message', (data) => {
    handleMessage(client, data.toString());
  });

  ws.on('close', () => {
    handleLeave(client);
    clients.delete(peerId);
    console.log(`Client disconnected: ${peerId}`);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for ${peerId}:`, err);
  });
});

// Server stats endpoint
setInterval(() => {
  if (DEBUG) {
    console.log(`Stats: ${clients.size} clients, ${rooms.size} rooms`);
  }
}, 30000);

console.log(`HoloScript signaling server running on ws://localhost:${PORT}`);
console.log('Press Ctrl+C to stop');
