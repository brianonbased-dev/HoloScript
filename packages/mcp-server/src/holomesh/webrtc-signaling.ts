import { WebSocketServer, WebSocket } from 'ws';
import type http from 'http';

export class WebRTCSignalingServer {
  private wss: WebSocketServer;
  private peers = new Map<string, WebSocket>();

  constructor(server: http.Server, path: string = '/webrtc-signaling') {
    this.wss = new WebSocketServer({ noServer: true });

    this.wss.on('connection', (ws: WebSocket) => {
      let currentPeerId: string | null = null;

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);

          if (data.type === 'identify' && data.peerId) {
            currentPeerId = data.peerId;
            this.peers.set(currentPeerId as string, ws);
            return;
          }

          if (data.type === 'signal' && data.targetId && currentPeerId) {
            const targetWs = this.peers.get(data.targetId);
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
              targetWs.send(message.toString()); // Forward raw payload
            } else {
              console.warn(
                `[SignalingServer] Target peer ${data.targetId} not found or disconnected`
              );
            }
            return;
          }
        } catch (error) {
          console.error(`[SignalingServer] Error processing message:`, error);
        }
      });

      ws.on('close', () => {
        if (currentPeerId) {
          this.peers.delete(currentPeerId);
        }
      });

      ws.on('error', (err) => {
        console.error(`[SignalingServer] Error on peer socket:`, err);
        if (currentPeerId) {
          this.peers.delete(currentPeerId);
        }
      });
    });

    server.on('upgrade', (request, socket, head) => {
      if (request.url === path) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });
  }
}
