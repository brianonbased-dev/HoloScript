/**
 * discordWebhook.ts — Discord Webhook Integration for Real-Time Reaction Triggers
 *
 * MEME-009: Discord reaction triggers
 * Priority: Medium | Estimate: 10 hours
 *
 * Features:
 * - Discord webhook server connection
 * - Real-time reaction event listening
 * - Emoji reaction parsing
 * - Character animation triggering
 * - WebSocket-based real-time updates
 * - Multi-channel support
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DiscordWebhookConfig {
  /**
   * Discord webhook URL (optional - can also use bot token)
   */
  webhookUrl?: string;

  /**
   * Discord bot token (for listening to reactions)
   */
  botToken?: string;

  /**
   * Channel IDs to monitor for reactions
   */
  channelIds?: string[];

  /**
   * Enable reaction event listening
   */
  enableReactions?: boolean;

  /**
   * Reaction cooldown (ms) to prevent spam
   */
  reactionCooldown?: number;

  /**
   * Auto-start listener on initialization
   */
  autoStart?: boolean;
}

export interface DiscordReaction {
  emoji: string;
  emojiName: string;
  userId: string;
  userName: string;
  channelId: string;
  messageId: string;
  timestamp: number;
}

export interface ReactionTrigger {
  emoji: string;
  action: string; // 'pose', 'animation', 'emoji-burst', 'sound'
  value: string; // pose ID, animation name, etc.
  cooldown?: number;
}

export type ReactionCallback = (reaction: DiscordReaction) => void;

// ─── Discord Webhook Manager ─────────────────────────────────────────────────

export class DiscordWebhookManager {
  private config: Required<DiscordWebhookConfig>;
  private isConnected: boolean = false;
  private isListening: boolean = false;
  private reactionCallbacks: ReactionCallback[] = [];
  private lastReactionTime: Map<string, number> = new Map();
  private triggers: Map<string, ReactionTrigger> = new Map();

  // WebSocket or EventSource for real-time updates
  private eventSource: EventSource | null = null;
  private ws: WebSocket | null = null;

  // Polling fallback
  private pollingInterval: NodeJS.Timeout | null = null;

  constructor(config: DiscordWebhookConfig = {}) {
    this.config = {
      webhookUrl: config.webhookUrl || '',
      botToken: config.botToken || '',
      channelIds: config.channelIds || [],
      enableReactions: config.enableReactions ?? true,
      reactionCooldown: config.reactionCooldown ?? 1000, // 1 second default
      autoStart: config.autoStart ?? false,
    };

    if (this.config.autoStart) {
      this.start();
    }

  }

  /**
   * Start listening for Discord reactions
   */
  start(): void {
    if (this.isListening) {
      console.warn('[DiscordWebhook] Already listening');
      return;
    }

    this.isListening = true;

    // Try WebSocket connection first (best for real-time)
    if (this.config.botToken) {
      this.connectWebSocket();
    }
    // Fallback to polling if no bot token
    else if (this.config.webhookUrl) {
      this.startPolling();
    } else {
      console.warn('[DiscordWebhook] No bot token or webhook URL provided');
    }

  }

  /**
   * Stop listening for Discord reactions
   */
  stop(): void {
    this.isListening = false;

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.isConnected = false;
  }

  /**
   * Connect via WebSocket (requires Discord Gateway)
   */
  private connectWebSocket(): void {
    // In a real implementation, this would connect to Discord Gateway
    // For now, we'll use a mock WebSocket for demonstration


    // Mock WebSocket URL (in production, use Discord Gateway)
    const mockWsUrl = 'ws://localhost:8080/discord-gateway';

    try {
      this.ws = new WebSocket(mockWsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;

        // Send authentication
        if (this.ws) {
          this.ws.send(
            JSON.stringify({
              op: 2,
              d: {
                token: this.config.botToken,
                intents: 1 << 10, // GUILD_MESSAGE_REACTIONS
                properties: {
                  os: 'browser',
                  browser: 'holoscript',
                  device: 'holoscript',
                },
              },
            })
          );
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleGatewayMessage(data);
        } catch (error) {
          console.error('[DiscordWebhook] Failed to parse message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[DiscordWebhook] WebSocket error:', error);
      };

      this.ws.onclose = () => {
        this.isConnected = false;

        // Auto-reconnect after 5 seconds
        if (this.isListening) {
          setTimeout(() => {
            this.connectWebSocket();
          }, 5000);
        }
      };
    } catch (error) {
      console.error('[DiscordWebhook] Failed to create WebSocket:', error);
      // Fallback to polling
      this.startPolling();
    }
  }

  /**
   * Handle Discord Gateway messages
   */
  private handleGatewayMessage(data: { op?: number; t?: string; d?: Record<string, unknown> }): void {
    // Handle heartbeat
    if (data.op === 10) {
      const heartbeatInterval = data.d.heartbeat_interval;
      setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ op: 1, d: null }));
        }
      }, heartbeatInterval);
    }

    // Handle MESSAGE_REACTION_ADD event
    if (data.t === 'MESSAGE_REACTION_ADD') {
      const reactionData = data.d;
      this.handleReaction({
        emoji: reactionData.emoji.name || reactionData.emoji.id,
        emojiName: reactionData.emoji.name || 'custom',
        userId: reactionData.user_id,
        userName: 'DiscordUser',
        channelId: reactionData.channel_id,
        messageId: reactionData.message_id,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Start polling for reactions (fallback method)
   */
  private startPolling(): void {

    this.pollingInterval = setInterval(() => {
      // In a real implementation, this would poll Discord API for new reactions
      // For now, we'll use a mock implementation
      this.checkForNewReactions();
    }, 2000); // Poll every 2 seconds
  }

  /**
   * Check for new reactions (polling fallback)
   */
  private async checkForNewReactions(): Promise<void> {
    // Mock implementation
    // In production, this would make API calls to Discord REST API
    // GET /channels/{channel.id}/messages/{message.id}/reactions/{emoji}
  }

  /**
   * Handle incoming reaction
   */
  private handleReaction(reaction: DiscordReaction): void {
    // Check cooldown
    const cooldownKey = `${reaction.userId}-${reaction.emoji}`;
    const lastTime = this.lastReactionTime.get(cooldownKey) || 0;
    const now = Date.now();

    if (now - lastTime < this.config.reactionCooldown) {
      return;
    }

    this.lastReactionTime.set(cooldownKey, now);

    // Trigger callbacks
    this.reactionCallbacks.forEach((callback) => {
      try {
        callback(reaction);
      } catch (error) {
        console.error('[DiscordWebhook] Callback error:', error);
      }
    });

    // Check for registered triggers
    const trigger = this.triggers.get(reaction.emoji);
    if (trigger) {
      this.executeTrigger(trigger, reaction);
    }
  }

  /**
   * Execute trigger action
   */
  private executeTrigger(trigger: ReactionTrigger, reaction: DiscordReaction): void {
    // Dispatch custom event for trait system
    const event = new CustomEvent('discord-reaction-trigger', {
      detail: {
        trigger,
        reaction,
      },
    });
    window.dispatchEvent(event);
  }

  /**
   * Register reaction trigger
   */
  registerTrigger(emoji: string, action: string, value: string, cooldown?: number): void {
    this.triggers.set(emoji, {
      emoji,
      action,
      value,
      cooldown,
    });

  }

  /**
   * Unregister reaction trigger
   */
  unregisterTrigger(emoji: string): void {
    this.triggers.delete(emoji);
  }

  /**
   * Get all registered triggers
   */
  getTriggers(): ReactionTrigger[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Subscribe to reaction events
   */
  onReaction(callback: ReactionCallback): () => void {
    this.reactionCallbacks.push(callback);

    return () => {
      const index = this.reactionCallbacks.indexOf(callback);
      if (index > -1) {
        this.reactionCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Send message to Discord (via webhook)
   */
  async sendMessage(content: string, embeds?: Array<Record<string, unknown>>): Promise<boolean> {
    if (!this.config.webhookUrl) {
      console.error('[DiscordWebhook] No webhook URL configured');
      return false;
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content,
          embeds,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      console.error('[DiscordWebhook] Failed to send message:', error);
      return false;
    }
  }

  /**
   * Simulate reaction for testing
   */
  simulateReaction(emoji: string, userName: string = 'TestUser'): void {
    this.handleReaction({
      emoji,
      emojiName: emoji,
      userId: 'test-user-id',
      userName,
      channelId: 'test-channel',
      messageId: 'test-message',
      timestamp: Date.now(),
    });
  }

  /**
   * Get connection status
   */
  getStatus(): {
    isConnected: boolean;
    isListening: boolean;
    triggerCount: number;
    lastReactionTime: number | null;
  } {
    const times = Array.from(this.lastReactionTime.values());
    const lastReactionTime = times.length > 0 ? Math.max(...times) : null;

    return {
      isConnected: this.isConnected,
      isListening: this.isListening,
      triggerCount: this.triggers.size,
      lastReactionTime,
    };
  }

  /**
   * Dispose manager
   */
  dispose(): void {
    this.stop();
    this.reactionCallbacks = [];
    this.triggers.clear();
    this.lastReactionTime.clear();
  }
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/**
 * React hook for Discord webhook integration
 */
export function useDiscordWebhook(config?: DiscordWebhookConfig) {
  const [manager, setManager] = React.useState<DiscordWebhookManager | null>(null);
  const [isConnected, setIsConnected] = React.useState(false);
  const [lastReaction, setLastReaction] = React.useState<DiscordReaction | null>(null);
  const [triggers, setTriggers] = React.useState<ReactionTrigger[]>([]);

  React.useEffect(() => {
    const webhookManager = new DiscordWebhookManager(config);

    // Subscribe to reactions
    const unsubscribe = webhookManager.onReaction((reaction) => {
      setLastReaction(reaction);
    });

    // Update connection status every second
    const statusInterval = setInterval(() => {
      const status = webhookManager.getStatus();
      setIsConnected(status.isConnected);
      setTriggers(webhookManager.getTriggers());
    }, 1000);

    setManager(webhookManager);

    return () => {
      unsubscribe();
      clearInterval(statusInterval);
      webhookManager.dispose();
    };
  }, [config?.botToken, config?.webhookUrl]);

  const registerTrigger = React.useCallback(
    (emoji: string, action: string, value: string, cooldown?: number) => {
      manager?.registerTrigger(emoji, action, value, cooldown);
      setTriggers(manager?.getTriggers() || []);
    },
    [manager]
  );

  const unregisterTrigger = React.useCallback(
    (emoji: string) => {
      manager?.unregisterTrigger(emoji);
      setTriggers(manager?.getTriggers() || []);
    },
    [manager]
  );

  const simulateReaction = React.useCallback(
    (emoji: string, userName?: string) => {
      manager?.simulateReaction(emoji, userName);
    },
    [manager]
  );

  const sendMessage = React.useCallback(
    (content: string, embeds?: Array<Record<string, unknown>>) => {
      return manager?.sendMessage(content, embeds) || Promise.resolve(false);
    },
    [manager]
  );

  return {
    manager,
    isConnected,
    lastReaction,
    triggers,
    registerTrigger,
    unregisterTrigger,
    simulateReaction,
    sendMessage,
  };
}

// Lazy React import
let React: typeof import('react');
if (typeof window !== 'undefined') {
  React = require('react');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default DiscordWebhookManager;

// ─── Emoji Mapping ───────────────────────────────────────────────────────────

/**
 * Default emoji → action mappings
 */
export const DEFAULT_EMOJI_TRIGGERS: Record<string, { action: string; value: string }> = {
  '🔥': { action: 'pose', value: 'flex' },
  '💀': { action: 'pose', value: 'dab' },
  '😂': { action: 'emoji-burst', value: '😂' },
  '❤️': { action: 'emoji-burst', value: '❤️' },
  '💎': { action: 'pose', value: 'griddy' },
  '🚀': { action: 'emoji-burst', value: '🚀' },
  '💯': { action: 'pose', value: 't-pose' },
  '👀': { action: 'pose', value: 'thinking' },
  '🎉': { action: 'emoji-burst', value: '🎉' },
  '⚡': { action: 'pose', value: 'floss' },
};
