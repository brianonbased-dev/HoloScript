/**
 * MessagingTrait — v4.0
 *
 * Chat app integration for HoloScript scenes.
 * Connect Telegram/Slack/Discord bots to your spatial world.
 * Natural language commands → trait events → scene changes.
 *
 * Platforms:
 *  - Telegram: Bot API (long polling or webhook)
 *  - Slack: Events API
 *  - Discord: REST + Gateway (simplified)
 *
 * Events emitted:
 *  messaging_connected    { node, platform, botId }
 *  message_received       { node, platform, chat, user, text, messageId }
 *  command_parsed         { node, platform, command, args, chat }
 *  message_sent           { node, platform, chat, messageId }
 *  messaging_error        { node, platform, error }
 *  messaging_disconnected { node, platform }
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type MessagingPlatform = 'telegram' | 'slack' | 'discord';

export interface IncomingMessage {
  id: string;
  platform: MessagingPlatform;
  chatId: string;
  userId: string;
  username: string;
  text: string;
  replyToId?: string;
  timestamp: number;
}

export interface ParsedCommand {
  name: string;
  args: string[];
  raw: string;
}

export interface MessagingConfig {
  /** Messaging platform */
  platform: MessagingPlatform;
  /** Bot token */
  token: string;
  /** Command prefix (e.g. '/') */
  command_prefix: string;
  /** Allowed user IDs (empty = all) */
  allowed_users: string[];
  /** Poll interval for Telegram long-polling (ms) */
  poll_interval_ms: number;
  /** Webhook URL (overrides polling) */
  webhook_url: string;
  /** Auto-reply on unrecognized commands */
  auto_reply_unknown: boolean;
  /** Default loading message */
  thinking_message: string;
}

export interface MessagingState {
  isConnected: boolean;
  platform: MessagingPlatform;
  botId: string | null;
  botUsername: string | null;
  lastUpdateId: number;
  pollTimer: ReturnType<typeof setInterval> | null;
  messageQueue: IncomingMessage[];
  totalReceived: number;
  totalSent: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: MessagingConfig = {
  platform: 'telegram',
  token: '',
  command_prefix: '/',
  allowed_users: [],
  poll_interval_ms: 2000,
  webhook_url: '',
  auto_reply_unknown: true,
  thinking_message: '🔮 Processing your request…',
};

// ─── Platform adapters ────────────────────────────────────────────────────────

const TELEGRAM_API = (token: string) => `https://api.telegram.org/bot${token}`;

async function telegramGetMe(token: string): Promise<{ id: number; username: string }> {
  const res = await fetch(`${TELEGRAM_API(token)}/getMe`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getMe failed: ${data.description}`);
  return { id: data.result.id, username: data.result.username };
}

async function telegramGetUpdates(token: string, offset: number, timeout = 5): Promise<any[]> {
  const res = await fetch(`${TELEGRAM_API(token)}/getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=["message"]`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram getUpdates failed: ${data.description}`);
  return data.result ?? [];
}

async function telegramSendMessage(token: string, chatId: string, text: string, replyToId?: string): Promise<string> {
  const body: Record<string, unknown> = { chat_id: chatId, text, parse_mode: 'Markdown' };
  if (replyToId) body['reply_to_message_id'] = replyToId;
  const res = await fetch(`${TELEGRAM_API(token)}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram sendMessage failed: ${data.description}`);
  return String(data.result.message_id);
}

async function slackSendMessage(token: string, channel: string, text: string): Promise<string> {
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ channel, text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack sendMessage failed: ${data.error}`);
  return data.ts;
}

async function discordSendMessage(token: string, channelId: string, text: string): Promise<string> {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bot ${token}` },
    body: JSON.stringify({ content: text }),
  });
  const data = await res.json();
  if (res.status >= 400) throw new Error(`Discord sendMessage failed: ${data.message}`);
  return data.id;
}

// ─── Command parser ───────────────────────────────────────────────────────────

function parseCommand(text: string, prefix: string): ParsedCommand | null {
  if (!text.startsWith(prefix)) return null;
  const withoutPrefix = text.slice(prefix.length).trim();
  const parts = withoutPrefix.split(/\s+/);
  const name = parts[0]?.toLowerCase();
  if (!name) return null;
  return { name, args: parts.slice(1), raw: text };
}

function isUserAllowed(userId: string, allowedUsers: string[]): boolean {
  return allowedUsers.length === 0 || allowedUsers.includes(userId);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const messagingHandler = {
  defaultConfig: DEFAULT_CONFIG,

  async onAttach(node: any, config: MessagingConfig, ctx: any): Promise<void> {
    if (!config.token) {
      ctx.emit('messaging_error', { node, platform: config.platform, error: 'No token configured' });
      return;
    }

    const state: MessagingState = {
      isConnected: false,
      platform: config.platform,
      botId: null,
      botUsername: null,
      lastUpdateId: 0,
      pollTimer: null,
      messageQueue: [],
      totalReceived: 0,
      totalSent: 0,
    };
    node.__messagingState = state;

    try {
      if (config.platform === 'telegram') {
        const me = await telegramGetMe(config.token);
        state.botId = String(me.id);
        state.botUsername = me.username;
        state.isConnected = true;

        if (!config.webhook_url) {
          // Long polling
          state.pollTimer = setInterval(
            () => this._pollTelegram(state, node, config, ctx),
            config.poll_interval_ms
          );
        }
      } else {
        // Slack / Discord — webhook-based, just mark ready
        state.isConnected = true;
        state.botId = 'webhook';
      }

      ctx.emit('messaging_connected', { node, platform: config.platform, botId: state.botId, botUsername: state.botUsername });
    } catch (err: any) {
      ctx.emit('messaging_error', { node, platform: config.platform, error: err.message });
    }
  },

  onDetach(node: any, _config: MessagingConfig, ctx: any): void {
    const state: MessagingState | undefined = node.__messagingState;
    if (!state) return;
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.isConnected = false;
    ctx.emit('messaging_disconnected', { node, platform: state.platform });
    delete node.__messagingState;
  },

  onEvent(node: any, config: MessagingConfig, ctx: any, event: any): void {
    const state: MessagingState | undefined = node.__messagingState;
    if (!state?.isConnected) return;

    switch (event.type) {
      case 'message_send': {
        const { chatId, text, replyToId } = event.payload ?? {};
        if (!chatId || !text) return;
        this._sendMessage(state, node, config, ctx, chatId, text, replyToId);
        break;
      }

      case 'message_incoming': {
        // Injected externally (webhook handler or test)
        const msg = event.payload as IncomingMessage;
        if (msg) this._handleIncoming(state, node, config, ctx, msg);
        break;
      }

      case 'messaging_stats':
        ctx.emit('messaging_stats', {
          node,
          platform: state.platform,
          botId: state.botId,
          totalReceived: state.totalReceived,
          totalSent: state.totalSent,
          connected: state.isConnected,
        });
        break;
    }
  },

  onUpdate(_node: any, _config: MessagingConfig, _ctx: any, _dt: number): void { /* polling via timer */ },

  _handleIncoming(state: MessagingState, node: any, config: MessagingConfig, ctx: any, msg: IncomingMessage): void {
    state.totalReceived++;

    if (!isUserAllowed(msg.userId, config.allowed_users)) return;

    ctx.emit('message_received', {
      node, platform: msg.platform, chat: msg.chatId, user: msg.userId,
      username: msg.username, text: msg.text, messageId: msg.id,
    });

    const command = parseCommand(msg.text, config.command_prefix);
    if (!command) return;

    ctx.emit('command_parsed', {
      node, platform: msg.platform, command: command.name, args: command.args, chat: msg.chatId,
    });

    // Send "thinking" message for long operations
    if (config.thinking_message) {
      this._sendMessage(state, node, config, ctx, msg.chatId, config.thinking_message, msg.id);
    }

    // Re-emit as domain event for other traits to handle
    ctx.emit(`command_${command.name}`, {
      node, chat: msg.chatId, user: msg.userId, args: command.args, replyTo: msg.id,
    });
  },

  _sendMessage(state: MessagingState, node: any, config: MessagingConfig, ctx: any, chatId: string, text: string, replyToId?: string): void {
    state.totalSent++;
    const sendFn: Promise<string> =
      config.platform === 'telegram' ? telegramSendMessage(config.token, chatId, text, replyToId) :
      config.platform === 'slack'    ? slackSendMessage(config.token, chatId, text) :
      discordSendMessage(config.token, chatId, text);

    sendFn.then(messageId => {
      ctx.emit('message_sent', { node, platform: config.platform, chat: chatId, messageId });
    }).catch((err: Error) => {
      ctx.emit('messaging_error', { node, platform: config.platform, error: err.message });
    });
  },

  _pollTelegram(state: MessagingState, node: any, config: MessagingConfig, ctx: any): void {
    telegramGetUpdates(config.token, state.lastUpdateId + 1).then(updates => {
      for (const update of updates) {
        state.lastUpdateId = Math.max(state.lastUpdateId, update.update_id);
        const msg = update.message;
        if (!msg?.text) continue;
        const incoming: IncomingMessage = {
          id: String(msg.message_id),
          platform: 'telegram',
          chatId: String(msg.chat.id),
          userId: String(msg.from?.id ?? 'unknown'),
          username: msg.from?.username ?? msg.from?.first_name ?? 'unknown',
          text: msg.text,
          timestamp: msg.date * 1000,
        };
        this._handleIncoming(state, node, config, ctx, incoming);
      }
    }).catch(() => { /* silent poll failure */ });
  },
} as const;
