/**
 * Cloud deployment types for HoloScript Studio
 *
 * Deploy workflows to serverless platforms:
 * - AWS Lambda
 * - Cloudflare Workers
 * - Vercel Edge Functions
 * - Deno Deploy
 */

// ── Deployment Targets ────────────────────────────────────────────────────────

export type CloudProvider = 'aws-lambda' | 'cloudflare-workers' | 'vercel-edge' | 'deno-deploy';

export interface DeploymentTarget {
  provider: CloudProvider;
  region?: string;
  runtime?: string;
  memory?: number; // MB
  timeout?: number; // seconds
  environment?: Record<string, string>;
}

// ── Deployment Configuration ──────────────────────────────────────────────────

export interface DeploymentConfig {
  /** Deployment name (unique identifier) */
  name: string;

  /** Workflow ID to deploy */
  workflowId: string;

  /** Target platform */
  target: DeploymentTarget;

  /** API endpoint path (e.g., '/api/workflows/my-workflow') */
  endpoint?: string;

  /** Authentication method */
  auth?: {
    type: 'api-key' | 'jwt' | 'oauth' | 'none';
    config?: Record<string, any>;
  };

  /** Scheduled execution (cron expression) */
  schedule?: string;

  /** Webhook triggers */
  webhooks?: Array<{
    source: string;
    event: string;
  }>;

  /** Environment variables */
  env?: Record<string, string>;

  /** Tags for organization */
  tags?: Record<string, string>;
}

// ── Deployment Status ─────────────────────────────────────────────────────────

export type DeploymentStatus =
  | 'pending'      // Queued for deployment
  | 'building'     // Compiling workflow
  | 'deploying'    // Uploading to cloud
  | 'active'       // Successfully deployed and running
  | 'failed'       // Deployment failed
  | 'archived';    // Disabled/removed

export interface Deployment {
  id: string;
  name: string;
  workflowId: string;
  target: DeploymentTarget;
  status: DeploymentStatus;
  endpoint: string;
  createdAt: number;
  updatedAt: number;
  deployedAt?: number;
  version: number;
  config: DeploymentConfig;
  error?: string;
}

// ── Execution Logs ────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ExecutionLog {
  id: string;
  deploymentId: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  metadata?: Record<string, any>;
  duration?: number;
  statusCode?: number;
}

export interface ExecutionMetrics {
  deploymentId: string;
  totalExecutions: number;
  successCount: number;
  errorCount: number;
  avgDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  lastExecutionAt?: number;
}

// ── Deployment Analytics ──────────────────────────────────────────────────────

export interface DeploymentAnalytics {
  deploymentId: string;
  period: '1h' | '24h' | '7d' | '30d';
  executions: number;
  errors: number;
  avgLatency: number;
  costEstimate?: number; // USD
  dataTransferred?: number; // bytes
  timeSeriesData: Array<{
    timestamp: number;
    executions: number;
    errors: number;
    avgLatency: number;
  }>;
}

// ── Billing Information ───────────────────────────────────────────────────────

export interface BillingInfo {
  userId: string;
  currentPeriodStart: number;
  currentPeriodEnd: number;
  totalExecutions: number;
  totalCost: number; // USD
  breakdown: Array<{
    deploymentId: string;
    deploymentName: string;
    executions: number;
    cost: number;
  }>;
  limits: {
    maxExecutionsPerMonth: number;
    maxConcurrentDeployments: number;
    maxDeploymentsTotal: number;
  };
}

// ── API Responses ─────────────────────────────────────────────────────────────

export interface DeploymentResponse {
  deployment: Deployment;
  endpoint: string;
  apiKey?: string;
}

export interface ExecutionResponse {
  executionId: string;
  status: 'success' | 'error';
  result?: any;
  error?: string;
  duration: number;
  logs: ExecutionLog[];
}

export interface DeploymentListResponse {
  deployments: Deployment[];
  total: number;
  page: number;
  limit: number;
}
