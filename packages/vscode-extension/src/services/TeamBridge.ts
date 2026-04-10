/**
 * TeamBridge — Connects VS Code agents to the HoloMesh team board.
 * Runs as a background service in the VS Code extension lifecycle.
 * Handles: heartbeat, board reading, mode awareness, task tracking.
 */

import * as vscode from 'vscode';

interface BoardResponse {
  mode?: string;
  tasks?: Array<{ id: string; status: string; claimed_by?: string }>;
  agents?: Array<{ name: string; status: string }>;
  [key: string]: unknown;
}

export class TeamBridge {
  private static instance: TeamBridge;

  private statusBarItem: vscode.StatusBarItem | undefined;
  private heartbeatInterval: ReturnType<typeof setInterval> | undefined;
  private pollInterval: ReturnType<typeof setInterval> | undefined;
  private currentMode = 'unknown';
  private claimedTaskCount = 0;
  private disposed = false;

  private constructor() {}

  static getInstance(): TeamBridge {
    if (!TeamBridge.instance) {
      TeamBridge.instance = new TeamBridge();
    }
    return TeamBridge.instance;
  }

  /**
   * Start the TeamBridge background service.
   * Creates status bar item, sends initial presence, and starts polling loops.
   */
  activate(context: vscode.ExtensionContext): void {
    this.disposed = false;

    // Create status bar item (far right, low priority)
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      50
    );
    this.statusBarItem.tooltip = 'HoloMesh Team Status';
    this.statusBarItem.command = 'holoscript.team.showBoard';
    this.updateStatusBar();
    this.statusBarItem.show();
    context.subscriptions.push(this.statusBarItem);

    // Register show-board command
    context.subscriptions.push(
      vscode.commands.registerCommand('holoscript.team.showBoard', () => {
        const url = this.getOrchestratorUrl();
        const teamId = this.getTeamId();
        vscode.env.openExternal(
          vscode.Uri.parse(`${url}/api/holomesh/team/${teamId}`)
        );
      })
    );

    // Fire-and-forget initial presence
    this.sendHeartbeat();

    // Fire-and-forget initial board poll
    this.pollBoard();

    // Heartbeat every 60 seconds
    this.heartbeatInterval = setInterval(() => {
      if (!this.disposed) {
        this.sendHeartbeat();
      }
    }, 60_000);

    // Board poll every 5 minutes
    this.pollInterval = setInterval(() => {
      if (!this.disposed) {
        this.pollBoard();
      }
    }, 300_000);
  }

  /**
   * Clean up intervals and status bar on extension deactivation.
   */
  deactivate(): void {
    this.disposed = true;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    if (this.statusBarItem) {
      this.statusBarItem.dispose();
      this.statusBarItem = undefined;
    }
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  private getOrchestratorUrl(): string {
    const config = vscode.workspace.getConfiguration('holoscript.mcp');
    return config.get<string>(
      'orchestratorUrl',
      'https://mcp-orchestrator-production-45f9.up.railway.app'
    );
  }

  private getApiKey(): string {
    const config = vscode.workspace.getConfiguration('holoscript.mcp');
    return config.get<string>('apiKey', '');
  }

  private getTeamId(): string {
    const config = vscode.workspace.getConfiguration('holoscript.team');
    return config.get<string>('id', 'team_d141a6972eac1e9d');
  }

  private getAgentName(): string {
    const config = vscode.workspace.getConfiguration('holoscript.team');
    return config.get<string>('agentName', 'vscode-agent');
  }

  /**
   * POST presence heartbeat to the team endpoint.
   * Fire-and-forget — errors are silently logged.
   */
  private sendHeartbeat(): void {
    const url = this.getOrchestratorUrl();
    const teamId = this.getTeamId();
    const apiKey = this.getApiKey();
    const agentName = this.getAgentName();

    const endpoint = `${url}/api/holomesh/team/${teamId}/presence`;
    const body = JSON.stringify({
      agent_name: agentName,
      ide_type: 'vscode',
      timestamp: new Date().toISOString(),
      status: 'active',
    });

    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    }).catch((err) => {
      console.warn('[TeamBridge] Heartbeat failed:', err?.message ?? err);
    });
  }

  /**
   * GET the team board, extract mode and task counts, update status bar.
   * Fire-and-forget — errors are silently logged.
   */
  private pollBoard(): void {
    const url = this.getOrchestratorUrl();
    const teamId = this.getTeamId();
    const apiKey = this.getApiKey();
    const agentName = this.getAgentName();

    const endpoint = `${url}/api/holomesh/team/${teamId}`;

    fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-mcp-api-key': apiKey,
      },
      signal: AbortSignal.timeout(10_000),
    })
      .then((res) => {
        if (!res.ok) {
          console.warn('[TeamBridge] Board poll returned', res.status);
          return null;
        }
        return res.json() as Promise<BoardResponse>;
      })
      .then((board) => {
        if (!board || this.disposed) return;

        // Extract mode
        if (board.mode) {
          this.currentMode = board.mode;
        }

        // Count tasks claimed by this agent
        if (Array.isArray(board.tasks)) {
          this.claimedTaskCount = board.tasks.filter(
            (t) => t.claimed_by === agentName && t.status !== 'done'
          ).length;
        }

        this.updateStatusBar();
      })
      .catch((err) => {
        console.warn('[TeamBridge] Board poll failed:', err?.message ?? err);
      });
  }

  /**
   * Update the status bar text with current mode and task count.
   */
  private updateStatusBar(): void {
    if (!this.statusBarItem) return;

    const modeIcons: Record<string, string> = {
      build: '$(tools)',
      audit: '$(search)',
      research: '$(book)',
      review: '$(eye)',
      unknown: '$(radio-tower)',
    };

    const icon = modeIcons[this.currentMode] ?? modeIcons['unknown'];
    const taskSuffix =
      this.claimedTaskCount > 0 ? ` | ${this.claimedTaskCount} tasks` : '';

    this.statusBarItem.text = `${icon} ${this.currentMode}${taskSuffix}`;
  }
}
