# Lesson 3.6: Agent Communication

In this lesson, you'll learn how agents communicate securely in HoloScript's v3.1 messaging system.

## Learning Objectives

By the end of this lesson, you will:

- Implement secure agent-to-agent messaging
- Use pub/sub patterns for broadcast communication
- Create communication channels with access control
- Handle message routing and delivery guarantees

## Communication Architecture

HoloScript v3.1 provides multiple communication patterns:

```
┌─────────────────────────────────────────────────────────────┐
│                  Communication Layer                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Direct     │  │   Pub/Sub    │  │   Channel    │       │
│  │   Messaging  │  │   Topics     │  │   Groups     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Message Router                          │   │
│  └─────────────────────────────────────────────────────┘   │
│         │                 │                 │               │
│         ▼                 ▼                 ▼               │
│  ┌─────────┐       ┌─────────┐       ┌─────────┐           │
│  │ Agent A │       │ Agent B │       │ Agent C │           │
│  └─────────┘       └─────────┘       └─────────┘           │
└─────────────────────────────────────────────────────────────┘
```

## Direct Messaging

Send messages directly between agents:

```typescript
import { AgentMessenger, Message } from '@holoscript/core';

// Create messenger for an agent
const messenger = new AgentMessenger(agentId, {
  encryption: 'aes-256-gcm',
  signing: true,
});

// Send a direct message
const message: Message = {
  to: 'agent-002',
  type: 'task-request',
  payload: {
    action: 'analyze',
    data: { file: 'main.ts' },
  },
  priority: 'normal',
  requiresAck: true,
};

const response = await messenger.send(message);
console.log(`Response: ${response.payload}`);

// Handle incoming messages
messenger.on('message', async (msg) => {
  console.log(`From ${msg.from}: ${msg.type}`);

  // Process and respond
  const result = await processMessage(msg);
  await messenger.reply(msg, result);
});
```

## Pub/Sub Topics

Broadcast messages to interested agents:

```typescript
import { PubSub, Topic } from '@holoscript/core';

// Create pub/sub system
const pubsub = new PubSub({
  persistence: 'memory',
  maxRetention: 3600000, // 1 hour
});

// Create a topic
const alertTopic = pubsub.createTopic('system.alerts', {
  retention: 'until-acknowledged',
  maxSubscribers: 100,
});

// Subscribe to topic
alertTopic.subscribe(agentId, async (message) => {
  console.log(`Alert: ${message.payload.level} - ${message.payload.text}`);

  if (message.payload.level === 'critical') {
    await escalate(message);
  }
});

// Publish to topic
alertTopic.publish({
  level: 'warning',
  text: 'High memory usage detected',
  source: 'monitor-agent',
  timestamp: Date.now(),
});
```

## Communication Channels

Create dedicated channels for groups:

```typescript
import { Channel, ChannelConfig } from '@holoscript/core';

// Create a channel
const channel = new Channel('code-review-team', {
  maxMembers: 10,
  accessControl: 'invite-only',
  messageHistory: 100,
  encryption: true,
});

// Join channel
await channel.join(agentId, { role: 'reviewer' });

// Send to channel
channel.broadcast({
  type: 'review-request',
  payload: {
    prId: 'PR-123',
    files: ['src/main.ts'],
    urgency: 'high',
  },
});

// Listen for channel messages
channel.on('message', (msg) => {
  console.log(`[${channel.name}] ${msg.from}: ${msg.type}`);
});

// Channel events
channel.on('member:joined', (memberId, role) => {
  console.log(`${memberId} joined as ${role}`);
});

channel.on('member:left', (memberId) => {
  console.log(`${memberId} left the channel`);
});
```

## Message Routing

Configure custom routing rules:

```typescript
import { MessageRouter, RoutingRule } from '@holoscript/core';

const router = new MessageRouter();

// Route by message type
router.addRule({
  match: { type: 'code-review' },
  route: { to: 'review-team-channel' },
});

// Route by priority
router.addRule({
  match: { priority: 'critical' },
  route: {
    to: ['on-call-agent', 'backup-agent'],
    strategy: 'first-available',
  },
});

// Route with transformation
router.addRule({
  match: { type: 'raw-data' },
  transform: (msg) => ({
    ...msg,
    type: 'processed-data',
    payload: transform(msg.payload),
  }),
  route: { to: 'data-processor' },
});

// Conditional routing
router.addRule({
  match: (msg) => msg.payload.size > 1000000,
  route: { to: 'bulk-processor' },
});
```

## Delivery Guarantees

Ensure reliable message delivery:

```typescript
import { ReliableMessenger } from '@holoscript/core';

const messenger = new ReliableMessenger({
  retryPolicy: {
    maxRetries: 3,
    backoff: 'exponential',
    initialDelay: 1000,
  },
  deliveryGuarantee: 'at-least-once',
  timeout: 30000,
});

// Send with confirmation
try {
  const receipt = await messenger.sendReliable({
    to: 'critical-agent',
    type: 'important-task',
    payload: data,
  });

  console.log(`Delivered at ${receipt.deliveredAt}`);
  console.log(`Acknowledged: ${receipt.acknowledged}`);
} catch (error) {
  if (error.code === 'DELIVERY_FAILED') {
    console.error(`Failed after ${error.attempts} attempts`);
    await handleFailedDelivery(error.message);
  }
}
```

## Secure Messaging

Implement end-to-end encryption:

```typescript
import { SecureChannel, KeyExchange } from '@holoscript/core';

// Perform key exchange
const keyExchange = new KeyExchange();
const { publicKey, privateKey } = await keyExchange.generateKeyPair();

// Share public key with other agents
await registry.updateAgent(agentId, { publicKey });

// Create secure channel
const secureChannel = new SecureChannel({
  ownPrivateKey: privateKey,
  peerPublicKey: await getPeerPublicKey('agent-002'),
  algorithm: 'x25519-xsalsa20-poly1305',
});

// Send encrypted message
const encrypted = await secureChannel.encrypt({
  type: 'sensitive-data',
  payload: { secret: 'confidential info' },
});

await messenger.send({
  to: 'agent-002',
  type: 'encrypted',
  payload: encrypted,
});

// Receive and decrypt
messenger.on('message', async (msg) => {
  if (msg.type === 'encrypted') {
    const decrypted = await secureChannel.decrypt(msg.payload);
    console.log('Decrypted:', decrypted);
  }
});
```

## Complete Example: Team Communication

Here's a complete team communication setup:

```holoscript
composition "TeamWorkspace" {
  config {
    communication: {
      encryption: "aes-256-gcm"
      persistence: "redis"
      max_message_size: "1MB"
    }
  }

  // Team lead agent
  template "TeamLead" {
    @agent {
      type: "coordinator"
      capabilities: ["delegation", "monitoring"]
    }

    @messaging {
      channels: ["team-main", "alerts"]
      direct_messaging: true
    }

    action delegateTask(task, agentId) {
      send(agentId, {
        type: "task-assignment",
        payload: task
      })
    }

    action broadcastUpdate(update) {
      channel("team-main").broadcast({
        type: "team-update",
        payload: update
      })
    }
  }

  // Worker agent
  template "Worker" {
    @agent {
      type: "worker"
      capabilities: ["execution"]
    }

    @messaging {
      channels: ["team-main"]
      direct_messaging: true
    }

    on message(msg) {
      if (msg.type == "task-assignment") {
        executeTask(msg.payload)
      }
    }

    action reportProgress(taskId, progress) {
      send("team-lead", {
        type: "progress-update",
        payload: { taskId, progress }
      })
    }
  }

  // Instantiate team
  object "Lead" using "TeamLead" {}
  object "Worker1" using "Worker" {}
  object "Worker2" using "Worker" {}
  object "Worker3" using "Worker" {}
}
```

## Message Patterns

### Request-Response

```typescript
// Requester
const response = await messenger.request({
  to: 'service-agent',
  type: 'query',
  payload: { query: 'SELECT * FROM data' },
  timeout: 5000,
});

// Responder
messenger.onRequest('query', async (request) => {
  const results = await executeQuery(request.payload.query);
  return { results };
});
```

### Fire-and-Forget

```typescript
// No response expected
messenger.fire({
  to: 'logger-agent',
  type: 'log',
  payload: { level: 'info', message: 'Task started' },
});
```

### Scatter-Gather

```typescript
// Send to multiple agents, collect responses
const responses = await messenger.scatter({
  to: ['agent-1', 'agent-2', 'agent-3'],
  type: 'vote',
  payload: { proposal: 'new-feature' },
  timeout: 10000,
  minResponses: 2,
});

const approved = responses.filter((r) => r.payload.vote === 'yes').length > responses.length / 2;
```

## Exercise: Build a Chat System

Create a multi-agent chat system with:

1. Direct messages between agents
2. Public channels for team discussions
3. Private channels with invite-only access
4. Message history and search
5. Presence detection (online/offline/busy)

## Summary

In this lesson you learned:

- **Direct Messaging**: Point-to-point agent communication
- **Pub/Sub**: Topic-based broadcast messaging
- **Channels**: Group communication with access control
- **Routing**: Custom message routing rules
- **Security**: End-to-end encryption and signing

## Next Steps

- [Lesson 3.7: Spatial Context](./07-spatial-context.md)
- [Lesson 3.8: Consensus Mechanisms](./08-consensus.md)
