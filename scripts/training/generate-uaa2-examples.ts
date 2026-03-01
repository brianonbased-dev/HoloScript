#!/usr/bin/env tsx
/**
 * uAA2-Service Training Examples Generator
 * Generates ~20,000 examples covering:
 * - Agent registration & lifecycle
 * - IDEA protocol (Initialize, Discover, Execute, Affirm)
 * - MCP tool calls
 * - Monitoring & metrics
 * - Advanced patterns
 */

import { TrainingExample } from '../../.ai-ecosystem/scripts/enhanced-generator-v3-template';

const allExamples: TrainingExample[] = [];

// ============================================================================
// AGENT REGISTRATION PATTERNS (5,000 examples)
// ============================================================================

const AGENT_TYPES = ['research', 'build', 'test', 'deploy', 'monitor', 'security'];
const CAPABILITIES = ['web_search', 'code_analysis', 'test_execution', 'deployment', 'monitoring'];

function generateAgentRegistration(): TrainingExample {
  const agentType = AGENT_TYPES[Math.floor(Math.random() * AGENT_TYPES.length)];
  const capabilities = CAPABILITIES.slice(0, Math.floor(Math.random() * 3) + 1);

  return {
    instruction: `Create a uAA2 agent registration for a ${agentType} agent`,
    input: '',
    output: `// Register ${agentType} agent with uAA2 service
const agent = await fetch('/api/agent/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: '${agentType}',
    name: '${agentType}-agent-\${Date.now()}',
    capabilities: ${JSON.stringify(capabilities)},
    config: {
      maxConcurrent: 5,
      timeout: 30000,
      retryAttempts: 3
    }
  })
});

const { agentId } = await agent.json();
console.log('Agent registered:', agentId);`
  };
}

for (let i = 0; i < 5000; i++) {
  allExamples.push(generateAgentRegistration());
}

// ============================================================================
// IDEA PROTOCOL PATTERNS (5,000 examples)
// ============================================================================

function generateIDEAProtocol(): TrainingExample {
  const task = ['research', 'implement', 'test', 'deploy'][Math.floor(Math.random() * 4)];

  return {
    instruction: `Write a complete IDEA protocol workflow for ${task} task`,
    input: '',
    output: `// IDEA Protocol: ${task.toUpperCase()} Task
// I - Initialize
const context = await fetch('/api/agent/global-context').then(r => r.json());
const agentId = await registerAgent({ type: '${task}', context });

// D - Discover
const tools = await fetch('/api/tools', {
  headers: { 'x-agent-id': agentId }
}).then(r => r.json());

const relevantTools = tools.filter(t =>
  t.categories.includes('${task}')
);

// E - Execute
const results = [];
for (const tool of relevantTools) {
  const result = await fetch('/api/tools/call', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-id': agentId
    },
    body: JSON.stringify({
      tool: tool.name,
      args: tool.defaultArgs
    })
  }).then(r => r.json());

  results.push(result);
}

// A - Affirm
await fetch('/api/agent/complete', {
  method: 'POST',
  body: JSON.stringify({
    agentId,
    results,
    status: 'success',
    metrics: {
      toolsUsed: relevantTools.length,
      duration: Date.now() - startTime
    }
  })
});`
  };
}

for (let i = 0; i < 5000; i++) {
  allExamples.push(generateIDEAProtocol());
}

// ============================================================================
// MCP TOOL CALL PATTERNS (5,000 examples)
// ============================================================================

const MCP_SERVERS = ['brittney-hololand', 'holoscript-language', 'uaa2-service', 'semantic-search-hub'];
const MCP_TOOLS = {
  'brittney-hololand': ['generate_scene', 'validate_holoscript', 'render_preview'],
  'holoscript-language': ['parse', 'compile', 'analyze'],
  'uaa2-service': ['register_agent', 'execute_task', 'get_metrics'],
  'semantic-search-hub': ['search_knowledge', 'add_pattern', 'get_session_context']
};

function generateMCPToolCall(): TrainingExample {
  const server = MCP_SERVERS[Math.floor(Math.random() * MCP_SERVERS.length)];
  const tools = MCP_TOOLS[server];
  const tool = tools[Math.floor(Math.random() * tools.length)];

  return {
    instruction: `Call the ${tool} tool from ${server} MCP server`,
    input: '',
    output: `// MCP Tool Call: ${server}/${tool}
const result = await fetch('http://localhost:5567/tools/call', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-mcp-api-key': process.env.MCP_API_KEY
  },
  body: JSON.stringify({
    server: '${server}',
    tool: '${tool}',
    args: {
      // Tool-specific arguments
      input: 'example input',
      options: {
        verbose: true
      }
    }
  })
});

const data = await result.json();
console.log('Tool result:', data);`
  };
}

for (let i = 0; i < 5000; i++) {
  allExamples.push(generateMCPToolCall());
}

// ============================================================================
// MONITORING & METRICS (3,000 examples)
// ============================================================================

function generateMonitoring(): TrainingExample {
  const metrics = ['cpu_usage', 'memory_usage', 'request_rate', 'error_rate', 'latency'];
  const metric = metrics[Math.floor(Math.random() * metrics.length)];

  return {
    instruction: `Create a monitoring service that tracks ${metric}`,
    input: '',
    output: `// Monitoring Service: ${metric}
import { EventEmitter } from 'events';

class ${metric.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}Monitor extends EventEmitter {
  private metrics: number[] = [];
  private threshold = { warning: 80, critical: 95 };

  record(value: number): void {
    this.metrics.push(value);

    // Keep last 100 readings
    if (this.metrics.length > 100) {
      this.metrics.shift();
    }

    // Check thresholds
    if (value >= this.threshold.critical) {
      this.emit('alert', {
        severity: 'critical',
        metric: '${metric}',
        value,
        timestamp: new Date()
      });
    } else if (value >= this.threshold.warning) {
      this.emit('alert', {
        severity: 'warning',
        metric: '${metric}',
        value,
        timestamp: new Date()
      });
    }

    // Send to telemetry
    this.emit('metric', {
      name: '${metric}',
      value,
      timestamp: new Date()
    });
  }

  getAverage(): number {
    return this.metrics.reduce((a, b) => a + b, 0) / this.metrics.length;
  }

  getMax(): number {
    return Math.max(...this.metrics);
  }
}

export const monitor = new ${metric.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join('')}Monitor();`
  };
}

for (let i = 0; i < 3000; i++) {
  allExamples.push(generateMonitoring());
}

// ============================================================================
// ADVANCED PATTERNS (2,000 examples)
// ============================================================================

const PATTERNS = ['circuit_breaker', 'rate_limiter', 'retry_logic', 'fallback'];

function generateAdvancedPattern(): TrainingExample {
  const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];

  const code = {
    circuit_breaker: `// Circuit Breaker Pattern
class CircuitBreaker {
  private failures = 0;
  private threshold = 5;
  private timeout = 60000;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private nextAttempt = 0;

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.timeout;
    }
  }
}`,
    rate_limiter: `// Rate Limiter Pattern
class RateLimiter {
  private requests: number[] = [];
  private limit = 100;
  private window = 60000; // 1 minute

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Remove old requests
    this.requests = this.requests.filter(t => now - t < this.window);

    if (this.requests.length >= this.limit) {
      const oldestRequest = this.requests[0];
      const waitTime = this.window - (now - oldestRequest);
      throw new Error(\`Rate limit exceeded. Retry in \${waitTime}ms\`);
    }

    this.requests.push(now);
    return fn();
  }

  getRemaining(): number {
    return this.limit - this.requests.length;
  }
}`,
    retry_logic: `// Retry Logic Pattern
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i < maxRetries - 1) {
        // Exponential backoff
        await new Promise(resolve =>
          setTimeout(resolve, delay * Math.pow(2, i))
        );
      }
    }
  }

  throw lastError!;
}`,
    fallback: `// Fallback Pattern
async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>
): Promise<T> {
  try {
    return await primary();
  } catch (primaryError) {
    console.warn('Primary failed, using fallback:', primaryError);

    try {
      return await fallback();
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      throw new Error('Both primary and fallback failed');
    }
  }
}`
  };

  return {
    instruction: `Implement ${pattern.replace('_', ' ')} pattern for uAA2 service`,
    input: '',
    output: code[pattern]
  };
}

for (let i = 0; i < 2000; i++) {
  allExamples.push(generateAdvancedPattern());
}

// ============================================================================
// EXPORT
// ============================================================================

console.log(`Generated ${allExamples.length.toLocaleString()} uAA2-service examples`);
console.log('Breakdown:');
console.log(`  Agent Registration: 5,000`);
console.log(`  IDEA Protocol: 5,000`);
console.log(`  MCP Tool Calls: 5,000`);
console.log(`  Monitoring: 3,000`);
console.log(`  Advanced Patterns: 2,000`);

export const UAA2_EXAMPLES = allExamples;
