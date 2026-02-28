/**
 * Version Control for Workflows
 *
 * Git-based versioning system for workflow files
 */

import type { AgentWorkflow } from './orchestrationStore';

export interface WorkflowCommit {
  id: string;
  workflowId: string;
  message: string;
  timestamp: number;
  author: {
    name: string;
    email: string;
  };
  snapshot: {
    nodes: any[];
    edges: any[];
    metadata: Record<string, any>;
  };
  hash: string; // Git commit SHA
  parentHash?: string; // Parent commit SHA
}

export interface WorkflowDiff {
  type: 'added' | 'removed' | 'modified';
  path: string;
  oldValue?: any;
  newValue?: any;
}

export interface VersionControlClient {
  /**
   * Commit workflow to version history
   */
  commit(workflow: AgentWorkflow, message: string): Promise<WorkflowCommit>;

  /**
   * Get commit history for workflow
   */
  getHistory(workflowId: string, limit?: number): Promise<WorkflowCommit[]>;

  /**
   * Get diff between two commits
   */
  getDiff(commitA: string, commitB: string): Promise<WorkflowDiff[]>;

  /**
   * Revert workflow to a previous commit
   */
  revert(workflowId: string, commitId: string): Promise<AgentWorkflow>;

  /**
   * Create a new branch
   */
  createBranch(workflowId: string, branchName: string, fromCommit?: string): Promise<void>;

  /**
   * List branches for workflow
   */
  getBranches(workflowId: string): Promise<string[]>;

  /**
   * Merge branch into main
   */
  mergeBranch(workflowId: string, branchName: string): Promise<WorkflowCommit>;
}

/**
 * In-memory version control implementation
 * (In production, this would integrate with Git via MCP or API)
 */
export class LocalVersionControl implements VersionControlClient {
  private commits: Map<string, WorkflowCommit[]> = new Map();
  private branches: Map<string, string[]> = new Map();

  async commit(workflow: AgentWorkflow, message: string): Promise<WorkflowCommit> {
    const workflowId = workflow.id;
    const history = this.commits.get(workflowId) || [];

    const commit: WorkflowCommit = {
      id: `commit_${Date.now()}`,
      workflowId,
      message,
      timestamp: Date.now(),
      author: {
        name: 'User', // TODO: Get from auth
        email: 'user@example.com',
      },
      snapshot: {
        nodes: workflow.nodes,
        edges: workflow.edges,
        metadata: workflow.metadata || {},
      },
      hash: this.generateHash(workflow),
      parentHash: history.length > 0 ? history[history.length - 1].hash : undefined,
    };

    history.push(commit);
    this.commits.set(workflowId, history);

    return commit;
  }

  async getHistory(workflowId: string, limit = 50): Promise<WorkflowCommit[]> {
    const history = this.commits.get(workflowId) || [];
    return history.slice(-limit).reverse();
  }

  async getDiff(commitA: string, commitB: string): Promise<WorkflowDiff[]> {
    // Find commits
    let commitAData: WorkflowCommit | undefined;
    let commitBData: WorkflowCommit | undefined;

    for (const history of this.commits.values()) {
      const foundA = history.find((c) => c.id === commitA);
      const foundB = history.find((c) => c.id === commitB);
      if (foundA) commitAData = foundA;
      if (foundB) commitBData = foundB;
    }

    if (!commitAData || !commitBData) {
      throw new Error('Commit not found');
    }

    // Compute diff
    const diffs: WorkflowDiff[] = [];

    // Check node differences
    const nodesA = new Map(commitAData.snapshot.nodes.map((n) => [n.id, n]));
    const nodesB = new Map(commitBData.snapshot.nodes.map((n) => [n.id, n]));

    // Added nodes
    for (const [id, node] of nodesB) {
      if (!nodesA.has(id)) {
        diffs.push({ type: 'added', path: `nodes.${id}`, newValue: node });
      } else if (JSON.stringify(nodesA.get(id)) !== JSON.stringify(node)) {
        diffs.push({
          type: 'modified',
          path: `nodes.${id}`,
          oldValue: nodesA.get(id),
          newValue: node,
        });
      }
    }

    // Removed nodes
    for (const [id, node] of nodesA) {
      if (!nodesB.has(id)) {
        diffs.push({ type: 'removed', path: `nodes.${id}`, oldValue: node });
      }
    }

    // Check edge differences
    const edgesA = new Map(commitAData.snapshot.edges.map((e) => [e.id, e]));
    const edgesB = new Map(commitBData.snapshot.edges.map((e) => [e.id, e]));

    // Added edges
    for (const [id, edge] of edgesB) {
      if (!edgesA.has(id)) {
        diffs.push({ type: 'added', path: `edges.${id}`, newValue: edge });
      }
    }

    // Removed edges
    for (const [id, edge] of edgesA) {
      if (!edgesB.has(id)) {
        diffs.push({ type: 'removed', path: `edges.${id}`, oldValue: edge });
      }
    }

    return diffs;
  }

  async revert(workflowId: string, commitId: string): Promise<AgentWorkflow> {
    const history = this.commits.get(workflowId) || [];
    const commit = history.find((c) => c.id === commitId);

    if (!commit) {
      throw new Error('Commit not found');
    }

    // Return workflow snapshot from commit
    return {
      id: workflowId,
      name: `Reverted to ${commit.message}`,
      nodes: commit.snapshot.nodes,
      edges: commit.snapshot.edges,
      metadata: commit.snapshot.metadata,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  async createBranch(workflowId: string, branchName: string, fromCommit?: string): Promise<void> {
    const branches = this.branches.get(workflowId) || ['main'];
    if (!branches.includes(branchName)) {
      branches.push(branchName);
      this.branches.set(workflowId, branches);
    }
  }

  async getBranches(workflowId: string): Promise<string[]> {
    return this.branches.get(workflowId) || ['main'];
  }

  async mergeBranch(workflowId: string, branchName: string): Promise<WorkflowCommit> {
    // Simplified merge - just create a merge commit
    const history = this.commits.get(workflowId) || [];
    const latestCommit = history[history.length - 1];

    if (!latestCommit) {
      throw new Error('No commits found');
    }

    const mergeCommit: WorkflowCommit = {
      ...latestCommit,
      id: `merge_${Date.now()}`,
      message: `Merge branch '${branchName}' into main`,
      timestamp: Date.now(),
      hash: this.generateHash(latestCommit.snapshot as any),
    };

    history.push(mergeCommit);
    this.commits.set(workflowId, history);

    return mergeCommit;
  }

  private generateHash(workflow: AgentWorkflow | { nodes: any[]; edges: any[]; metadata: any }): string {
    // Simple hash generation (in production, use proper SHA)
    const content = JSON.stringify(workflow);
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }
}

// Singleton instance
let versionControlInstance: VersionControlClient | null = null;

export function getVersionControl(): VersionControlClient {
  if (!versionControlInstance) {
    versionControlInstance = new LocalVersionControl();
  }
  return versionControlInstance;
}

export function setVersionControl(client: VersionControlClient) {
  versionControlInstance = client;
}
