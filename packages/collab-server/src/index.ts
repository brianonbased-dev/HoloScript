import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';

export { createCollabServer };

interface CollabServerOptions {
  port?: number;
  onRoomChange?: (roomId: string, size: number) => void;
}

function createCollabServer(opts: CollabServerOptions = {}) {
  const { port = 4999, onRoomChange } = opts;

  type Room = Set<WebSocket>;
  const rooms = new Map<string, Room>();

  const httpServer = createServer((_req: IncomingMessage, res: ServerResponse) => {
    if (_req.url === '/health') {
      const stats = Object.fromEntries(Array.from(rooms.entries()).map(([id, r]) => [id, r.size]));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', rooms: stats }));
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  const wss = new WebSocketServer({ server: httpServer, path: '/collab' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const base = `ws://localhost:${port}`;
    const url = new URL(req.url ?? '/', base);
    const roomId = url.searchParams.get('room') ?? 'default';

    let room = rooms.get(roomId);
    if (!room) {
      room = new Set();
      rooms.set(roomId, room);
    }
    room.add(ws);
    onRoomChange?.(roomId, room.size);

    ws.on('message', (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === 'ping') return;

      const payload = JSON.stringify(msg);
      for (const peer of room!) {
        if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(payload);
      }
    });

    ws.on('close', () => {
      room!.delete(ws);
      if (room!.size === 0) rooms.delete(roomId);
      onRoomChange?.(roomId, room!.size);
    });

    ws.on('error', () => {
      room!.delete(ws);
    });
  });

  httpServer.listen(port);
  return { httpServer, wss };
}
