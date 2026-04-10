// HoloScript Marketplace Webview Script

(function () {
  'use strict';

  // VS Code API
  const vscode = acquireVsCodeApi();

  // State
  let traits = [];
  let selectedTraitId = null;
  let currentCategory = '';
  let isLoading = false;

  // DOM Elements
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const traitList = document.getElementById('trait-list');
  const traitDetails = document.getElementById('trait-details');
  const closeDetailsBtn = document.getElementById('close-details');
  const refreshBtn = document.getElementById('refresh-btn');
  const openWebBtn = document.getElementById('open-web-btn');
  const resultCount = document.getElementById('result-count');
  const apiStatus = document.getElementById('api-status');
  const loadingIndicator = traitList.querySelector('.loading-indicator');
  const emptyState = traitList.querySelector('.empty-state');
  const categoryBtns = document.querySelectorAll('.category-btn');

  // Initialize
  init();

  function init() {
    // Event listeners
    searchInput.addEventListener('input', debounce(handleSearch, 300));
    clearSearchBtn.addEventListener('click', clearSearch);
    closeDetailsBtn.addEventListener('click', closeDetails);
    refreshBtn.addEventListener('click', refresh);
    openWebBtn.addEventListener('click', () => openExternal('http://localhost:3000'));

    // Keyboard shortcuts
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (searchInput.value) {
          clearSearch();
        } else if (selectedTraitId) {
          closeDetails();
        }
      }
    });

    // Category filters
    categoryBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        currentCategory = btn.dataset.category;
        categoryBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        vscode.postMessage({
          command: 'filterByCategory',
          category: currentCategory,
        });
      });
    });

    // Message handler
    window.addEventListener('message', handleMessage);

    // Restore state
    const state = vscode.getState();
    if (state) {
      traits = state.traits || [];
      selectedTraitId = state.selectedTraitId;
      searchInput.value = state.searchQuery || '';
      renderTraits();
    }
  }

  function handleMessage(event) {
    const message = event.data;

    switch (message.command) {
      case 'loading':
        isLoading = message.loading;
        updateLoadingState();
        break;

      case 'searchResults':
        traits = message.traits || [];
        resultCount.textContent = `${message.total} trait${message.total !== 1 ? 's' : ''}`;
        renderTraits();
        saveState();
        break;

      case 'traitDetails':
        renderDetails(message.trait);
        break;

      case 'installing':
        updateInstallButton(message.traitId, message.installing);
        break;

      case 'error':
        showError(message.message);
        break;
    }
  }

  function handleSearch() {
    const query = searchInput.value.trim();
    clearSearchBtn.style.display = query ? 'block' : 'none';
    vscode.postMessage({
      command: 'search',
      query: query,
    });
  }

  function clearSearch() {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    handleSearch();
    searchInput.focus();
  }

  function refresh() {
    vscode.postMessage({ command: 'refresh' });
  }

  function closeDetails() {
    selectedTraitId = null;
    traitDetails.style.display = 'none';
    document
      .querySelectorAll('.trait-card.selected')
      .forEach((c) => c.classList.remove('selected'));
    saveState();
  }

  function selectTrait(traitId) {
    selectedTraitId = traitId;
    document.querySelectorAll('.trait-card').forEach((c) => {
      c.classList.toggle('selected', c.dataset.traitId === traitId);
    });
    traitDetails.style.display = 'block';
    saveState();
    vscode.postMessage({
      command: 'selectTrait',
      traitId: traitId,
    });
  }

  function installTrait(traitId, version) {
    vscode.postMessage({
      command: 'installTrait',
      traitId: traitId,
      version: version,
    });
  }

  function copyToClipboard(text) {
    vscode.postMessage({
      command: 'copyToClipboard',
      text: text,
    });
  }

  function openExternal(url) {
    vscode.postMessage({
      command: 'openExternal',
      url: url,
    });
  }

  function updateLoadingState() {
    loadingIndicator.style.display = isLoading ? 'flex' : 'none';
    if (isLoading) {
      emptyState.style.display = 'none';
    }
  }

  function updateInstallButton(traitId, installing) {
    const btn = document.querySelector(`[data-install-btn="${traitId}"]`);
    if (btn) {
      btn.disabled = installing;
      btn.innerHTML = installing
        ? '<span class="codicon codicon-loading codicon-modifier-spin"></span> Installing...'
        : '<span class="codicon codicon-cloud-download"></span> Install';
    }
  }

  function renderTraits() {
    // Remove existing cards
    traitList.querySelectorAll('.trait-card').forEach((c) => c.remove());

    if (traits.length === 0 && !isLoading) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    traits.forEach((trait) => {
      const card = createTraitCard(trait);
      traitList.appendChild(card);
    });
  }

  function createTraitCard(trait) {
    const card = document.createElement('div');
    card.className = 'trait-card' + (trait.id === selectedTraitId ? ' selected' : '');
    card.dataset.traitId = trait.id;

    const category = trait.category || 'utility';
    const downloads = formatNumber(trait.downloads || 0);
    const rating = (trait.rating || 0).toFixed(1);

    card.innerHTML = `
      <div class="trait-card-header">
        <div class="trait-icon ${category}">📦</div>
        <div class="trait-info">
          <div class="trait-name">${escapeHtml(trait.name)}</div>
          <div class="trait-author">by ${escapeHtml(trait.author?.username || 'unknown')}</div>
        </div>
      </div>
      <div class="trait-description">${escapeHtml(trait.description || '')}</div>
      <div class="trait-meta">
        <span class="trait-stat">
          <span class="codicon codicon-cloud-download"></span>
          ${downloads}
        </span>
        <span class="trait-stat">
          <span class="codicon codicon-star-full"></span>
          ${rating}
        </span>
        <span class="trait-stat">
          v${escapeHtml(trait.version)}
        </span>
      </div>
      ${
        trait.verified || trait.official
          ? `
        <div class="trait-badges">
          ${trait.verified ? '<span class="badge verified">Verified</span>' : ''}
          ${trait.official ? '<span class="badge official">Official</span>' : ''}
        </div>
      `
          : ''
      }
    `;

    card.addEventListener('click', () => selectTrait(trait.id));
    return card;
  }

  function renderDetails(trait) {
    if (!trait) return;

    const content = traitDetails.querySelector('.details-content');
    const category = trait.category || 'utility';
    const downloads = formatNumber(trait.downloads || 0);
    const rating = (trait.rating || 0).toFixed(1);
    const dependencies = Object.entries(trait.dependencies || {});
    const keywords = trait.keywords || [];

    content.innerHTML = `
      <div class="details-header">
        <div class="details-icon trait-icon ${category}">📦</div>
        <div class="details-title">
          <h2>${escapeHtml(trait.name)}</h2>
          <div class="details-author">by ${escapeHtml(trait.author?.username || 'unknown')}</div>
          <div class="details-version">v${escapeHtml(trait.version)}</div>
        </div>
      </div>

      <div class="details-actions">
        <button 
          class="btn btn-primary" 
          data-install-btn="${trait.id}"
          onclick="window.marketplaceApi.install('${trait.id}', '${trait.version}')"
        >
          <span class="codicon codicon-cloud-download"></span>
          Install
        </button>
        <button 
          class="btn btn-secondary"
          onclick="window.marketplaceApi.openExternal('http://localhost:3000/traits/${encodeURIComponent(trait.id)}')"
        >
          <span class="codicon codicon-link-external"></span>
          View
        </button>
      </div>

      <div class="details-description">${escapeHtml(trait.description || 'No description available.')}</div>

      <div class="details-stats">
        <div class="stat-item">
          <div class="stat-value">${downloads}</div>
          <div class="stat-label">Downloads</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${rating}</div>
          <div class="stat-label">Rating</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${trait.versions?.length || 1}</div>
          <div class="stat-label">Versions</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${trait.ratingCount || 0}</div>
          <div class="stat-label">Reviews</div>
        </div>
      </div>

      <div class="details-section">
        <h3>Install Command</h3>
        <div class="install-command">
          <code>holo trait add ${escapeHtml(trait.name)}</code>
          <button onclick="window.marketplaceApi.copy('holo trait add ${escapeHtml(trait.name)}')">
            <span class="codicon codicon-copy"></span>
          </button>
        </div>
      </div>

      ${
        dependencies.length > 0
          ? `
        <div class="details-section">
          <h3>Dependencies (${dependencies.length})</h3>
          <div class="dependency-list">
            ${dependencies
              .map(
                ([name, version]) => `
              <span class="dependency-tag">${escapeHtml(name)}@${escapeHtml(version)}</span>
            `
              )
              .join('')}
          </div>
        </div>
      `
          : ''
      }

      ${
        keywords.length > 0
          ? `
        <div class="details-section">
          <h3>Keywords</h3>
          <div class="keyword-list">
            ${keywords.map((k) => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('')}
          </div>
        </div>
      `
          : ''
      }

      ${
        trait.repository
          ? `
        <div class="details-section">
          <h3>Repository</h3>
          <a 
            href="#" 
            onclick="window.marketplaceApi.openExternal('${escapeHtml(trait.repository)}')"
            style="color: var(--accent); text-decoration: none; font-size: 12px;"
          >
            ${escapeHtml(trait.repository)}
          </a>
        </div>
      `
          : ''
      }
    `;
  }

  function showError(message) {
    apiStatus.textContent = 'Error';
    apiStatus.style.color = 'var(--vscode-errorForeground)';
    console.error('Marketplace error:', message);
  }

  function saveState() {
    vscode.setState({
      traits: traits,
      selectedTraitId: selectedTraitId,
      searchQuery: searchInput.value,
    });
  }

  // Utility functions
  function debounce(fn, delay) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Expose API for inline handlers
  window.marketplaceApi = {
    install: installTrait,
    copy: copyToClipboard,
    openExternal: openExternal,
  };
})();
