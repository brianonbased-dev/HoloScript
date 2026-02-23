/**
 * Performance Dashboard Panel
 *
 * VS Code WebviewViewProvider for real-time performance monitoring.
 * Displays FPS, memory, parse/compile time graphs and recommendations.
 */

import * as vscode from 'vscode';
import * as path from 'path';

export interface PerformanceMetrics {
  parse: {
    avgTime: number;
    p95Time: number;
    throughput: number;
  };
  compile: {
    avgTime: number;
    p95Time: number;
    outputSize: number;
  };
  runtime: {
    fps: number;
    frameTime: number;
    gpuTime: number;
    memoryUsage: number;
  };
  network: {
    latency: number;
    bandwidth: number;
    packetLoss: number;
  };
}

export interface Recommendation {
  severity: 'info' | 'warning' | 'critical';
  category: 'rendering' | 'memory' | 'network' | 'code';
  message: string;
  action?: string;
  documentation?: string;
}

export interface AlertThreshold {
  metric: string;
  warning: number;
  critical: number;
  higherIsBetter: boolean;
}

export const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  { metric: 'fps', warning: 55, critical: 45, higherIsBetter: true },
  { metric: 'memory', warning: 192, critical: 256, higherIsBetter: false },
  { metric: 'parseTime', warning: 30, critical: 50, higherIsBetter: false },
  { metric: 'compileTime', warning: 60, critical: 100, higherIsBetter: false },
  { metric: 'latency', warning: 50, critical: 100, higherIsBetter: false },
];

export class PerformancePanel implements vscode.WebviewViewProvider {
  public static readonly viewType = 'holoscript.performanceDashboard';

  private _view?: vscode.WebviewView;
  private _extensionUri: vscode.Uri;
  private _isProfiling: boolean = false;
  private _metricsHistory: PerformanceMetrics[] = [];
  private _maxHistorySize: number = 100;
  private _updateInterval?: NodeJS.Timeout;
  private _historyFilePath: string;
  private _thresholds: AlertThreshold[];

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    this._historyFilePath = path.join(extensionUri.fsPath, '.holoscript-perf-history.json');
    this._thresholds = this.loadThresholds();
    this.loadPersistedHistory();
  }

  /**
   * Called when the view becomes visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'webview', 'performance'),
        vscode.Uri.joinPath(this._extensionUri, 'media'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from the webview
    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'startProfiling':
          this.startProfiling();
          break;
        case 'stopProfiling':
          this.stopProfiling();
          break;
        case 'exportProfile':
          this.exportProfile(message.format);
          break;
        case 'clearHistory':
          this.clearHistory();
          break;
        case 'setBudget':
          this.setBudget(message.budget);
          break;
        case 'setThreshold':
          this.setThreshold(message.threshold);
          break;
        case 'exportCSV':
          this.exportCSV();
          break;
        case 'loadHistory':
          this.loadHistoryFromFile();
          break;
        case 'ready':
          this.sendInitialState();
          break;
      }
    });

    // Clean up when view is disposed
    webviewView.onDidDispose(() => {
      if (this._updateInterval) {
        clearInterval(this._updateInterval);
      }
    });
  }

  /**
   * Start profiling session
   */
  public startProfiling(): void {
    if (this._isProfiling) return;

    this._isProfiling = true;
    this._metricsHistory = [];

    // Start collecting metrics
    this._updateInterval = setInterval(() => {
      this.collectAndSendMetrics();
    }, 100); // 10 updates per second

    this.sendToWebview({
      type: 'profilingStarted',
      timestamp: Date.now(),
    });

    vscode.window.showInformationMessage('HoloScript: Profiling started');
  }

  /**
   * Stop profiling and return results
   */
  public stopProfiling(): void {
    if (!this._isProfiling) return;

    this._isProfiling = false;

    if (this._updateInterval) {
      clearInterval(this._updateInterval);
      this._updateInterval = undefined;
    }

    const summary = this.generateSummary();

    this.sendToWebview({
      type: 'profilingStopped',
      summary,
      history: this._metricsHistory,
    });

    vscode.window.showInformationMessage('HoloScript: Profiling stopped');

    // Persist history after profiling
    this.persistHistory();
  }

  /**
   * Set alert threshold
   */
  public setThreshold(threshold: AlertThreshold): void {
    const index = this._thresholds.findIndex((t) => t.metric === threshold.metric);
    if (index >= 0) {
      this._thresholds[index] = threshold;
    } else {
      this._thresholds.push(threshold);
    }

    vscode.workspace
      .getConfiguration('holoscript')
      .update('alertThresholds', this._thresholds, true);
    this.sendToWebview({ type: 'thresholdsUpdated', thresholds: this._thresholds });
  }

  /**
   * Load thresholds from settings
   */
  private loadThresholds(): AlertThreshold[] {
    const config = vscode.workspace.getConfiguration('holoscript');
    return config.get<AlertThreshold[]>('alertThresholds') || DEFAULT_THRESHOLDS;
  }

  /**
   * Persist metrics history to disk
   */
  private async persistHistory(): Promise<void> {
    try {
      const data = {
        timestamp: new Date().toISOString(),
        history: this._metricsHistory.slice(-500), // Keep last 500 entries
      };
      await vscode.workspace.fs.writeFile(
        vscode.Uri.file(this._historyFilePath),
        Buffer.from(JSON.stringify(data, null, 2))
      );
    } catch (error) {
      console.error('Failed to persist history:', error);
    }
  }

  /**
   * Load persisted history from disk
   */
  private async loadPersistedHistory(): Promise<void> {
    try {
      const uri = vscode.Uri.file(this._historyFilePath);
      const data = await vscode.workspace.fs.readFile(uri);
      const parsed = JSON.parse(Buffer.from(data).toString('utf8'));
      if (parsed.history && Array.isArray(parsed.history)) {
        this._metricsHistory = parsed.history;
      }
    } catch (_error) {
      // File doesn't exist or is invalid - start fresh
      this._metricsHistory = [];
    }
  }

  /**
   * Load history from user-selected file
   */
  private async loadHistoryFromFile(): Promise<void> {
    const uri = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { JSON: ['json'] },
      title: 'Load Performance History',
    });

    if (uri && uri[0]) {
      try {
        const data = await vscode.workspace.fs.readFile(uri[0]);
        const parsed = JSON.parse(Buffer.from(data).toString('utf8'));
        if (parsed.history || parsed.metricsHistory) {
          this._metricsHistory = parsed.history || parsed.metricsHistory;
          this.sendToWebview({ type: 'historyLoaded', history: this._metricsHistory });
          vscode.window.showInformationMessage(
            `Loaded ${this._metricsHistory.length} history entries`
          );
        }
      } catch (_error) {
        vscode.window.showErrorMessage('Failed to load history file');
      }
    }
  }

  /**
   * Export to CSV format
   */
  public async exportCSV(): Promise<void> {
    if (this._metricsHistory.length === 0) {
      vscode.window.showWarningMessage('No metrics to export');
      return;
    }

    const headers = [
      'timestamp',
      'parse_avg_time',
      'parse_p95_time',
      'parse_throughput',
      'compile_avg_time',
      'compile_p95_time',
      'compile_output_size',
      'fps',
      'frame_time',
      'gpu_time',
      'memory_usage_mb',
      'network_latency',
      'network_bandwidth',
      'packet_loss',
    ].join(',');

    const rows = this._metricsHistory.map((m, i) =>
      [
        new Date(Date.now() - (this._metricsHistory.length - i) * 100).toISOString(),
        m.parse.avgTime.toFixed(2),
        m.parse.p95Time.toFixed(2),
        m.parse.throughput.toFixed(0),
        m.compile.avgTime.toFixed(2),
        m.compile.p95Time.toFixed(2),
        m.compile.outputSize.toFixed(0),
        m.runtime.fps.toFixed(1),
        m.runtime.frameTime.toFixed(2),
        m.runtime.gpuTime.toFixed(2),
        (m.runtime.memoryUsage / 1024 / 1024).toFixed(2),
        m.network.latency.toFixed(1),
        m.network.bandwidth.toFixed(1),
        m.network.packetLoss.toFixed(3),
      ].join(',')
    );

    const csvContent = [headers, ...rows].join('\n');
    const fileName = `holoscript-perf-${Date.now()}.csv`;

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(fileName),
      filters: { CSV: ['csv'] },
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(csvContent));
      vscode.window.showInformationMessage(`CSV exported to ${uri.fsPath}`);
    }
  }

  /**
   * Export profile data
   */
  public async exportProfile(format: 'json' | 'chrome'): Promise<void> {
    const summary = this.generateSummary();
    let content: string;
    let fileName: string;

    if (format === 'chrome') {
      content = this.generateChromeTrace();
      fileName = `holoscript-profile-${Date.now()}.json`;
    } else {
      content = JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          metricsHistory: this._metricsHistory,
          summary,
        },
        null,
        2
      );
      fileName = `holoscript-profile-${Date.now()}.json`;
    }

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(fileName),
      filters: {
        JSON: ['json'],
      },
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content));
      vscode.window.showInformationMessage(`Profile exported to ${uri.fsPath}`);

      if (format === 'chrome') {
        const openAction = await vscode.window.showInformationMessage(
          'Profile exported in Chrome DevTools format. Open in browser?',
          'Open chrome://tracing Instructions'
        );
        if (openAction) {
          vscode.env.openExternal(
            vscode.Uri.parse(
              'https://www.chromium.org/developers/how-tos/trace-event-profiling-tool/'
            )
          );
        }
      }
    }
  }

  /**
   * Clear metrics history
   */
  public clearHistory(): void {
    this._metricsHistory = [];
    this.sendToWebview({ type: 'historyCleared' });
  }

  /**
   * Set performance budget
   */
  public setBudget(budget: Partial<PerformanceMetrics>): void {
    // Store in workspace settings
    vscode.workspace.getConfiguration('holoscript').update('performanceBudget', budget, true);
    this.sendToWebview({ type: 'budgetUpdated', budget });
  }

  /**
   * Update metrics manually (called from other parts of extension)
   */
  public updateMetrics(metrics: Partial<PerformanceMetrics>): void {
    const fullMetrics = this.mergeWithDefaults(metrics);
    this._metricsHistory.push(fullMetrics);

    if (this._metricsHistory.length > this._maxHistorySize) {
      this._metricsHistory.shift();
    }

    if (this._view?.visible) {
      this.sendToWebview({
        type: 'metricsUpdate',
        metrics: fullMetrics,
        timestamp: Date.now(),
      });
    }
  }

  private collectAndSendMetrics(): void {
    // In a real implementation, this would collect actual metrics
    // For now, we simulate with mock data that includes some variance
    const metrics: PerformanceMetrics = {
      parse: {
        avgTime: 10 + Math.random() * 5,
        p95Time: 15 + Math.random() * 8,
        throughput: 50000 + Math.random() * 10000,
      },
      compile: {
        avgTime: 25 + Math.random() * 10,
        p95Time: 40 + Math.random() * 15,
        outputSize: 1024 + Math.random() * 512,
      },
      runtime: {
        fps: 58 + Math.random() * 4,
        frameTime: 16.67 + Math.random() * 2,
        gpuTime: 8 + Math.random() * 4,
        memoryUsage: 128 * 1024 * 1024 + Math.random() * 32 * 1024 * 1024,
      },
      network: {
        latency: 20 + Math.random() * 30,
        bandwidth: 100 + Math.random() * 50,
        packetLoss: Math.random() * 0.5,
      },
    };

    this.updateMetrics(metrics);
  }

  private sendInitialState(): void {
    const budget = vscode.workspace.getConfiguration('holoscript').get('performanceBudget');

    this.sendToWebview({
      type: 'initialState',
      isProfiling: this._isProfiling,
      history: this._metricsHistory,
      budget: budget || {},
      thresholds: this._thresholds,
    });
  }

  private sendToWebview(message: unknown): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private mergeWithDefaults(partial: Partial<PerformanceMetrics>): PerformanceMetrics {
    return {
      parse: partial.parse || { avgTime: 0, p95Time: 0, throughput: 0 },
      compile: partial.compile || { avgTime: 0, p95Time: 0, outputSize: 0 },
      runtime: partial.runtime || { fps: 0, frameTime: 0, gpuTime: 0, memoryUsage: 0 },
      network: partial.network || { latency: 0, bandwidth: 0, packetLoss: 0 },
    };
  }

  private generateSummary(): Record<string, unknown> {
    if (this._metricsHistory.length === 0) {
      return { message: 'No metrics collected' };
    }

    const parseAvg =
      this._metricsHistory.reduce((sum, m) => sum + m.parse.avgTime, 0) /
      this._metricsHistory.length;
    const compileAvg =
      this._metricsHistory.reduce((sum, m) => sum + m.compile.avgTime, 0) /
      this._metricsHistory.length;
    const fpsAvg =
      this._metricsHistory.reduce((sum, m) => sum + m.runtime.fps, 0) / this._metricsHistory.length;
    const memoryMax = Math.max(...this._metricsHistory.map((m) => m.runtime.memoryUsage));

    const recommendations = this.generateRecommendations(parseAvg, compileAvg, fpsAvg, memoryMax);

    return {
      samplesCollected: this._metricsHistory.length,
      parse: {
        avgTime: parseAvg.toFixed(2),
        minTime: Math.min(...this._metricsHistory.map((m) => m.parse.avgTime)).toFixed(2),
        maxTime: Math.max(...this._metricsHistory.map((m) => m.parse.avgTime)).toFixed(2),
      },
      compile: {
        avgTime: compileAvg.toFixed(2),
        minTime: Math.min(...this._metricsHistory.map((m) => m.compile.avgTime)).toFixed(2),
        maxTime: Math.max(...this._metricsHistory.map((m) => m.compile.avgTime)).toFixed(2),
      },
      runtime: {
        avgFps: fpsAvg.toFixed(1),
        minFps: Math.min(...this._metricsHistory.map((m) => m.runtime.fps)).toFixed(1),
        maxMemory: (memoryMax / 1024 / 1024).toFixed(2) + ' MB',
      },
      recommendations,
    };
  }

  private generateRecommendations(
    parseAvg: number,
    compileAvg: number,
    fpsAvg: number,
    memoryMax: number
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    if (parseAvg > 50) {
      recommendations.push({
        severity: 'warning',
        category: 'code',
        message: `Parse time averaging ${parseAvg.toFixed(1)}ms - consider using incremental parsing`,
        action: 'Enable incremental parser in settings',
      });
    }

    if (compileAvg > 100) {
      recommendations.push({
        severity: 'warning',
        category: 'code',
        message: `Compile time averaging ${compileAvg.toFixed(1)}ms - consider using Rust/WASM parser`,
        action: 'Switch to high-performance parser',
        documentation: 'https://holoscript.net/docs/performance/rust-parser',
      });
    }

    if (fpsAvg < 55) {
      recommendations.push({
        severity: 'critical',
        category: 'rendering',
        message: `FPS averaging ${fpsAvg.toFixed(1)} - below 60 FPS target`,
        action: 'Enable LOD and culling optimizations',
      });
    }

    if (memoryMax > 256 * 1024 * 1024) {
      recommendations.push({
        severity: 'warning',
        category: 'memory',
        message: `Memory peaked at ${(memoryMax / 1024 / 1024).toFixed(1)}MB`,
        action: 'Consider lazy loading assets and using object pooling',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        severity: 'info',
        category: 'code',
        message: 'Performance is excellent - no issues detected',
      });
    }

    return recommendations;
  }

  private generateChromeTrace(): string {
    const traceEvents: Array<{
      name: string;
      cat: string;
      ph: string;
      ts: number;
      dur?: number;
      pid: number;
      tid: number;
      args?: Record<string, unknown>;
    }> = [];

    const pid = 1;
    const tid = 1;
    let timestamp = 0;

    // Add metadata
    traceEvents.push({
      name: 'process_name',
      cat: '__metadata',
      ph: 'M',
      ts: 0,
      pid,
      tid: 0,
      args: { name: 'HoloScript Performance' },
    });

    // Convert metrics history to trace events
    for (const metrics of this._metricsHistory) {
      const duration = 100000; // 100ms in microseconds

      // Parse event
      traceEvents.push({
        name: 'Parse',
        cat: 'parse',
        ph: 'X',
        ts: timestamp,
        dur: metrics.parse.avgTime * 1000,
        pid,
        tid,
        args: { throughput: metrics.parse.throughput },
      });

      // Compile event
      traceEvents.push({
        name: 'Compile',
        cat: 'compile',
        ph: 'X',
        ts: timestamp + metrics.parse.avgTime * 1000,
        dur: metrics.compile.avgTime * 1000,
        pid,
        tid,
        args: { outputSize: metrics.compile.outputSize },
      });

      // Memory counter
      traceEvents.push({
        name: 'Memory',
        cat: 'memory',
        ph: 'C',
        ts: timestamp,
        pid,
        tid,
        args: {
          heapUsed: metrics.runtime.memoryUsage,
        },
      });

      // FPS counter
      traceEvents.push({
        name: 'FPS',
        cat: 'runtime',
        ph: 'C',
        ts: timestamp,
        pid,
        tid,
        args: {
          fps: metrics.runtime.fps,
        },
      });

      timestamp += duration;
    }

    return JSON.stringify(
      {
        traceEvents,
        metadata: {
          'clock-domain': 'CHROME_TRACE_CLOCK_DOMAIN',
          'process-name': 'HoloScript Profiler',
          'product-version': '3.4.0',
          'trace-capture-datetime': new Date().toISOString(),
        },
      },
      null,
      2
    );
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'performance', 'performance.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview', 'performance', 'performance.css')
    );
    const codiconsUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this._extensionUri,
        'node_modules',
        '@vscode',
        'codicons',
        'dist',
        'codicon.css'
      )
    );

    const nonce = this.getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net; font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <link href="${codiconsUri}" rel="stylesheet">
  <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <title>Performance Dashboard</title>
</head>
<body>
  <div class="dashboard">
    <header class="dashboard-header">
      <h2>Performance Dashboard</h2>
      <div class="controls">
        <button id="start-btn" class="primary-btn">
          <i class="codicon codicon-play"></i> Start
        </button>
        <button id="stop-btn" class="secondary-btn" disabled>
          <i class="codicon codicon-debug-stop"></i> Stop
        </button>
        <button id="export-btn" class="secondary-btn">
          <i class="codicon codicon-export"></i> Export
        </button>
        <button id="settings-btn" class="secondary-btn">
          <i class="codicon codicon-settings-gear"></i> Thresholds
        </button>
      </div>
    </header>

    <section class="metrics-grid">
      <div class="metric-card" id="fps-card">
        <div class="metric-header">
          <span class="metric-title">FPS</span>
          <span class="metric-status" id="fps-status"></span>
        </div>
        <div class="metric-value" id="fps-value">--</div>
        <canvas id="fps-chart"></canvas>
      </div>

      <div class="metric-card" id="memory-card">
        <div class="metric-header">
          <span class="metric-title">Memory</span>
          <span class="metric-status" id="memory-status"></span>
        </div>
        <div class="metric-value" id="memory-value">--</div>
        <canvas id="memory-chart"></canvas>
      </div>

      <div class="metric-card" id="parse-card">
        <div class="metric-header">
          <span class="metric-title">Parse Time</span>
          <span class="metric-status" id="parse-status"></span>
        </div>
        <div class="metric-value" id="parse-value">--</div>
        <canvas id="parse-chart"></canvas>
      </div>

      <div class="metric-card" id="compile-card">
        <div class="metric-header">
          <span class="metric-title">Compile Time</span>
          <span class="metric-status" id="compile-status"></span>
        </div>
        <div class="metric-value" id="compile-value">--</div>
        <canvas id="compile-chart"></canvas>
      </div>
    </section>

    <section class="recommendations-section">
      <h3><i class="codicon codicon-lightbulb"></i> Recommendations</h3>
      <div id="recommendations-list" class="recommendations-list">
        <div class="recommendation info">
          <i class="codicon codicon-info"></i>
          <span>Start profiling to see performance recommendations</span>
        </div>
      </div>
    </section>

    <section class="summary-section" id="summary-section" style="display: none;">
      <h3><i class="codicon codicon-graph"></i> Summary</h3>
      <div id="summary-content" class="summary-content"></div>
    </section>

    <!-- Thresholds Modal -->
    <div id="thresholds-modal" class="modal" style="display: none;">
      <div class="modal-content">
        <div class="modal-header">
          <h3>Alert Thresholds</h3>
          <button id="close-modal" class="icon-btn"><i class="codicon codicon-close"></i></button>
        </div>
        <div class="modal-body" id="thresholds-form">
          <!-- Populated by JS -->
        </div>
        <div class="modal-footer">
          <button id="save-thresholds" class="primary-btn">Save</button>
          <button id="reset-thresholds" class="secondary-btn">Reset to Default</button>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

/**
 * Register performance panel commands
 */
export function registerPerformanceCommands(
  context: vscode.ExtensionContext,
  panel: PerformancePanel
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('holoscript.performance.startProfiling', () => {
      panel.startProfiling();
    }),
    vscode.commands.registerCommand('holoscript.performance.stopProfiling', () => {
      panel.stopProfiling();
    }),
    vscode.commands.registerCommand('holoscript.performance.exportProfile', () => {
      panel.exportProfile('json');
    }),
    vscode.commands.registerCommand('holoscript.performance.exportChromeTrace', () => {
      panel.exportProfile('chrome');
    })
  );
}
