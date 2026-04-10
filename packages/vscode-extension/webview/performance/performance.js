/**
 * Performance Dashboard Webview Script (Enhanced with Chart.js)
 *
 * Handles real-time chart rendering using Chart.js, user interactions,
 * alert thresholds configuration, and VS Code messaging.
 */

(function () {
  const vscode = acquireVsCodeApi();

  // State management
  let state = {
    isProfiling: false,
    history: [],
    budget: {},
    thresholds: [
      { metric: 'fps', warning: 55, critical: 45, higherIsBetter: true },
      { metric: 'memory', warning: 192, critical: 256, higherIsBetter: false },
      { metric: 'parseTime', warning: 30, critical: 50, higherIsBetter: false },
      { metric: 'compileTime', warning: 60, critical: 100, higherIsBetter: false },
    ],
    charts: {},
    maxDataPoints: 50,
  };

  // DOM Elements
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const exportBtn = document.getElementById('export-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const fpsValue = document.getElementById('fps-value');
  const memoryValue = document.getElementById('memory-value');
  const parseValue = document.getElementById('parse-value');
  const compileValue = document.getElementById('compile-value');
  const fpsStatus = document.getElementById('fps-status');
  const memoryStatus = document.getElementById('memory-status');
  const parseStatus = document.getElementById('parse-status');
  const compileStatus = document.getElementById('compile-status');
  const recommendationsList = document.getElementById('recommendations-list');
  const summarySection = document.getElementById('summary-section');
  const summaryContent = document.getElementById('summary-content');
  const thresholdsModal = document.getElementById('thresholds-modal');

  // Chart.js configuration
  const chartConfig = {
    type: 'line',
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: true, mode: 'index', intersect: false },
      },
      scales: {
        x: { display: false },
        y: {
          display: true,
          grid: { color: 'rgba(255,255,255,0.1)' },
          ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
        },
      },
      elements: {
        point: { radius: 0 },
        line: { tension: 0.3, borderWidth: 2 },
      },
    },
  };

  // Colors
  const colors = {
    good: '#3fb950',
    warning: '#d29922',
    critical: '#f85149',
    line: 'rgba(88, 166, 255, 1)',
    fill: 'rgba(88, 166, 255, 0.2)',
  };

  // Initialize charts
  function initCharts() {
    const createChart = (canvasId, label, min, max, color = colors.line) => {
      const ctx = document.getElementById(canvasId);
      if (!ctx) return null;

      return new Chart(ctx, {
        ...chartConfig,
        data: {
          labels: Array(state.maxDataPoints).fill(''),
          datasets: [
            {
              label,
              data: [],
              borderColor: color,
              backgroundColor: color.replace('1)', '0.2)'),
              fill: true,
            },
          ],
        },
        options: {
          ...chartConfig.options,
          scales: {
            ...chartConfig.options.scales,
            y: {
              ...chartConfig.options.scales.y,
              min,
              max,
              suggestedMin: min,
              suggestedMax: max,
            },
          },
        },
      });
    };

    state.charts.fps = createChart('fps-chart', 'FPS', 0, 70);
    state.charts.memory = createChart('memory-chart', 'Memory (MB)', 0, 300);
    state.charts.parse = createChart('parse-chart', 'Parse Time (ms)', 0, 100);
    state.charts.compile = createChart('compile-chart', 'Compile Time (ms)', 0, 200);
  }

  // Event Listeners
  startBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'startProfiling' });
  });

  stopBtn.addEventListener('click', () => {
    vscode.postMessage({ command: 'stopProfiling' });
  });

  exportBtn.addEventListener('click', () => {
    showExportMenu();
  });

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      showThresholdsModal();
    });
  }

  // Modal controls
  const closeModalBtn = document.getElementById('close-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      thresholdsModal.style.display = 'none';
    });
  }

  const saveThresholdsBtn = document.getElementById('save-thresholds');
  if (saveThresholdsBtn) {
    saveThresholdsBtn.addEventListener('click', () => {
      saveThresholds();
    });
  }

  const resetThresholdsBtn = document.getElementById('reset-thresholds');
  if (resetThresholdsBtn) {
    resetThresholdsBtn.addEventListener('click', () => {
      resetThresholds();
    });
  }

  // Message Handler
  window.addEventListener('message', (event) => {
    const message = event.data;

    switch (message.type) {
      case 'initialState':
        handleInitialState(message);
        break;
      case 'profilingStarted':
        handleProfilingStarted();
        break;
      case 'profilingStopped':
        handleProfilingStopped(message);
        break;
      case 'metricsUpdate':
        handleMetricsUpdate(message);
        break;
      case 'historyCleared':
        handleHistoryCleared();
        break;
      case 'historyLoaded':
        handleHistoryLoaded(message);
        break;
      case 'budgetUpdated':
        state.budget = message.budget;
        break;
      case 'thresholdsUpdated':
        state.thresholds = message.thresholds;
        populateThresholdsForm();
        break;
    }
  });

  function handleInitialState(message) {
    state.isProfiling = message.isProfiling;
    state.history = message.history || [];
    state.budget = message.budget || {};
    state.thresholds = message.thresholds || state.thresholds;

    updateButtons();
    initCharts();

    // Rebuild charts from history
    if (state.history.length > 0) {
      const recentHistory = state.history.slice(-state.maxDataPoints);
      recentHistory.forEach((metrics) => {
        addDataToCharts(metrics);
      });
    }
  }

  function handleProfilingStarted() {
    state.isProfiling = true;
    updateButtons();
    clearChartData();
    summarySection.style.display = 'none';

    recommendationsList.innerHTML = `
      <div class="recommendation info">
        <i class="codicon codicon-loading codicon-modifier-spin"></i>
        <span>Profiling in progress...</span>
      </div>
    `;
  }

  function handleProfilingStopped(message) {
    state.isProfiling = false;
    updateButtons();

    if (message.summary) {
      displaySummary(message.summary);
    }

    if (message.summary?.recommendations) {
      displayRecommendations(message.summary.recommendations);
    }
  }

  function handleHistoryLoaded(message) {
    state.history = message.history || [];
    clearChartData();
    const recentHistory = state.history.slice(-state.maxDataPoints);
    recentHistory.forEach((metrics) => {
      addDataToCharts(metrics);
    });
  }

  function handleMetricsUpdate(message) {
    const metrics = message.metrics;

    // Update values with threshold-based status
    updateMetricWithThreshold(fpsValue, fpsStatus, metrics.runtime.fps, 'fps', 'fps');
    updateMetricWithThreshold(
      memoryValue,
      memoryStatus,
      metrics.runtime.memoryUsage / 1024 / 1024,
      'memory',
      'MB'
    );
    updateMetricWithThreshold(parseValue, parseStatus, metrics.parse.avgTime, 'parseTime', 'ms');
    updateMetricWithThreshold(
      compileValue,
      compileStatus,
      metrics.compile.avgTime,
      'compileTime',
      'ms'
    );

    // Add to charts
    addDataToCharts(metrics);
  }

  function handleHistoryCleared() {
    clearChartData();
  }

  function updateButtons() {
    startBtn.disabled = state.isProfiling;
    stopBtn.disabled = !state.isProfiling;

    if (state.isProfiling) {
      startBtn.innerHTML = '<i class="codicon codicon-loading codicon-modifier-spin"></i> Running';
    } else {
      startBtn.innerHTML = '<i class="codicon codicon-play"></i> Start';
    }
  }

  function getThreshold(metricName) {
    return (
      state.thresholds.find((t) => t.metric === metricName) || {
        warning: 50,
        critical: 100,
        higherIsBetter: false,
      }
    );
  }

  function updateMetricWithThreshold(element, statusElement, value, metricName, unit) {
    element.textContent = value.toFixed(1) + ' ' + unit;

    const threshold = getThreshold(metricName);
    let status;

    if (threshold.higherIsBetter) {
      if (value >= threshold.warning) status = 'good';
      else if (value >= threshold.critical) status = 'warning';
      else status = 'critical';
    } else {
      if (value <= threshold.warning) status = 'good';
      else if (value <= threshold.critical) status = 'warning';
      else status = 'critical';
    }

    statusElement.className = 'metric-status ' + status;
    statusElement.innerHTML =
      status === 'good'
        ? '<i class="codicon codicon-check"></i>'
        : status === 'warning'
          ? '<i class="codicon codicon-warning"></i>'
          : '<i class="codicon codicon-error"></i>';

    // Update chart color based on status
    updateChartColor(metricName, status);
  }

  function updateChartColor(metricName, status) {
    const chartMap = {
      fps: 'fps',
      memory: 'memory',
      parseTime: 'parse',
      compileTime: 'compile',
    };

    const chartKey = chartMap[metricName];
    if (state.charts[chartKey]) {
      const color = colors[status] || colors.line;
      state.charts[chartKey].data.datasets[0].borderColor = color;
      state.charts[chartKey].data.datasets[0].backgroundColor = color.replace(/[\d.]+\)$/, '0.2)');
    }
  }

  function addDataToCharts(metrics) {
    if (!state.charts.fps) return;

    // Add data points
    addDataPoint(state.charts.fps, metrics.runtime.fps);
    addDataPoint(state.charts.memory, metrics.runtime.memoryUsage / 1024 / 1024);
    addDataPoint(state.charts.parse, metrics.parse.avgTime);
    addDataPoint(state.charts.compile, metrics.compile.avgTime);

    // Update all charts
    Object.values(state.charts).forEach((chart) => {
      if (chart) chart.update('none');
    });
  }

  function addDataPoint(chart, value) {
    if (!chart) return;

    chart.data.datasets[0].data.push(value);
    chart.data.labels.push('');

    // Limit data points
    if (chart.data.datasets[0].data.length > state.maxDataPoints) {
      chart.data.datasets[0].data.shift();
      chart.data.labels.shift();
    }
  }

  function clearChartData() {
    Object.values(state.charts).forEach((chart) => {
      if (chart) {
        chart.data.datasets[0].data = [];
        chart.data.labels = [];
        chart.update('none');
      }
    });
  }

  function displayRecommendations(recommendations) {
    if (!recommendations || recommendations.length === 0) {
      recommendationsList.innerHTML = `
        <div class="recommendation info">
          <i class="codicon codicon-check"></i>
          <span>No issues detected</span>
        </div>
      `;
      return;
    }

    recommendationsList.innerHTML = recommendations
      .map((rec) => {
        const icon =
          rec.severity === 'critical'
            ? 'error'
            : rec.severity === 'warning'
              ? 'warning'
              : rec.severity === 'info'
                ? 'info'
                : 'lightbulb';

        return `
        <div class="recommendation ${rec.severity}">
          <i class="codicon codicon-${icon}"></i>
          <div class="recommendation-content">
            <span class="recommendation-message">${rec.message}</span>
            ${rec.action ? `<span class="recommendation-action">${rec.action}</span>` : ''}
          </div>
        </div>
      `;
      })
      .join('');
  }

  function displaySummary(summary) {
    summarySection.style.display = 'block';

    summaryContent.innerHTML = `
      <div class="summary-grid">
        <div class="summary-item">
          <span class="summary-label">Samples</span>
          <span class="summary-value">${summary.samplesCollected}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Avg Parse</span>
          <span class="summary-value">${summary.parse?.avgTime || '--'} ms</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Avg Compile</span>
          <span class="summary-value">${summary.compile?.avgTime || '--'} ms</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Avg FPS</span>
          <span class="summary-value">${summary.runtime?.avgFps || '--'}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Peak Memory</span>
          <span class="summary-value">${summary.runtime?.maxMemory || '--'}</span>
        </div>
      </div>
    `;
  }

  function showExportMenu() {
    const menu = document.createElement('div');
    menu.className = 'export-menu';
    menu.innerHTML = `
      <button class="export-option" data-format="json">
        <i class="codicon codicon-json"></i> Export JSON
      </button>
      <button class="export-option" data-format="csv">
        <i class="codicon codicon-table"></i> Export CSV
      </button>
      <button class="export-option" data-format="chrome">
        <i class="codicon codicon-browser"></i> Export Chrome Trace
      </button>
      <button class="export-option" data-action="load">
        <i class="codicon codicon-folder-opened"></i> Load History
      </button>
    `;

    menu.querySelectorAll('.export-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const format = btn.dataset.format;

        if (action === 'load') {
          vscode.postMessage({ command: 'loadHistory' });
        } else if (format === 'csv') {
          vscode.postMessage({ command: 'exportCSV' });
        } else {
          vscode.postMessage({ command: 'exportProfile', format });
        }
        menu.remove();
      });
    });

    // Position near export button
    const rect = exportBtn.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.top = rect.bottom + 5 + 'px';
    menu.style.right = '10px';

    document.body.appendChild(menu);

    // Close on click outside
    setTimeout(() => {
      document.addEventListener(
        'click',
        (e) => {
          if (!menu.contains(e.target) && e.target !== exportBtn) {
            menu.remove();
          }
        },
        { once: true }
      );
    }, 0);
  }

  function showThresholdsModal() {
    populateThresholdsForm();
    thresholdsModal.style.display = 'flex';
  }

  function populateThresholdsForm() {
    const form = document.getElementById('thresholds-form');
    if (!form) return;

    const metricLabels = {
      fps: 'FPS',
      memory: 'Memory (MB)',
      parseTime: 'Parse Time (ms)',
      compileTime: 'Compile Time (ms)',
      latency: 'Network Latency (ms)',
    };

    form.innerHTML = state.thresholds
      .map(
        (t) => `
      <div class="threshold-row" data-metric="${t.metric}">
        <label class="threshold-label">${metricLabels[t.metric] || t.metric}</label>
        <div class="threshold-inputs">
          <div class="input-group">
            <label>Warning</label>
            <input type="number" class="threshold-warning" value="${t.warning}" step="1">
          </div>
          <div class="input-group">
            <label>Critical</label>
            <input type="number" class="threshold-critical" value="${t.critical}" step="1">
          </div>
          <div class="input-group">
            <label>
              <input type="checkbox" class="threshold-higher" ${t.higherIsBetter ? 'checked' : ''}>
              Higher is better
            </label>
          </div>
        </div>
      </div>
    `
      )
      .join('');
  }

  function saveThresholds() {
    const rows = document.querySelectorAll('.threshold-row');
    rows.forEach((row) => {
      const metric = row.dataset.metric;
      const warning = parseFloat(row.querySelector('.threshold-warning').value);
      const critical = parseFloat(row.querySelector('.threshold-critical').value);
      const higherIsBetter = row.querySelector('.threshold-higher').checked;

      vscode.postMessage({
        command: 'setThreshold',
        threshold: { metric, warning, critical, higherIsBetter },
      });
    });

    thresholdsModal.style.display = 'none';
  }

  function resetThresholds() {
    state.thresholds = [
      { metric: 'fps', warning: 55, critical: 45, higherIsBetter: true },
      { metric: 'memory', warning: 192, critical: 256, higherIsBetter: false },
      { metric: 'parseTime', warning: 30, critical: 50, higherIsBetter: false },
      { metric: 'compileTime', warning: 60, critical: 100, higherIsBetter: false },
      { metric: 'latency', warning: 50, critical: 100, higherIsBetter: false },
    ];
    populateThresholdsForm();
  }

  // Initialize
  vscode.postMessage({ command: 'ready' });
})();
