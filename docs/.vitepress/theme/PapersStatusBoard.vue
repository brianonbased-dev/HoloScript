<script setup>
import { ref, computed, onMounted } from 'vue';
import { withBase } from 'vitepress';

// Live papers-status board for the 17-paper program. Reads
// docs/public/papers-status.json (built by scripts/build-papers-status-manifest.mjs,
// which runs the ai-ecosystem rebuilder against disk-truth .tex files).

const data = ref(null);
const loadError = ref(null);
const loading = ref(true);
const selectedRowId = ref(null);

onMounted(async () => {
  try {
    const url = withBase('/papers-status.json');
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data.value = await res.json();
  } catch (err) {
    loadError.value = err.message || String(err);
  } finally {
    loading.value = false;
  }
});

const PILLAR_LABELS = {
  novelty: 'Novelty',
  rtxBench: 'RTX Bench',
  fullLoop: 'Full-Loop Demo',
  ablation: 'Ablation',
  userStudy: 'User Study',
  threatModel: 'Threat Model',
  anchorOts: 'OTS Anchor',
  anchorBase: 'Base Anchor',
  venueFit: 'Venue Fit',
  citations: 'Citations',
  empClaims: 'Emp. Claims',
};

const TOKEN_CLASS = {
  '✅': 'cell-green',
  '⚠️': 'cell-amber',
  '❌': 'cell-red',
  '➖': 'cell-na',
};

const TOKEN_NAME = {
  '✅': 'GREEN',
  '⚠️': 'AMBER',
  '❌': 'RED',
  '➖': 'N/A',
};

const generatedAtIso = computed(() => data.value?.generatedAt ?? '');
const generatedAtUtc = computed(() => {
  if (!data.value?.generatedAt) return '';
  try {
    return new Date(data.value.generatedAt).toUTCString().replace(' GMT', ' UTC');
  } catch {
    return data.value.generatedAt;
  }
});
const ageHours = computed(() => {
  if (!data.value?.generatedAt) return 0;
  try {
    return (Date.now() - new Date(data.value.generatedAt).getTime()) / 3_600_000;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
});
const isStale = computed(() => ageHours.value > 24);

const selected = computed(() => {
  if (!data.value || !selectedRowId.value) return null;
  return data.value.papers.find((p) => p.rowId === selectedRowId.value) ?? null;
});

function selectRow(rowId) {
  selectedRowId.value = selectedRowId.value === rowId ? null : rowId;
}

function close() {
  selectedRowId.value = null;
}

function shortDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

function commitUrl(hash) {
  return `https://github.com/brianonbased-dev/ai-ecosystem/commit/${hash}`;
}

function scriptCommitUrl(hash) {
  return hash ? `https://github.com/brianonbased-dev/ai-ecosystem/commit/${hash}` : null;
}
</script>

<template>
  <div class="papers-page">
    <header class="papers-header">
      <h1>Papers — Live Status</h1>
      <p class="papers-sub">
        Disk-grounded status of every paper in the HoloScript research program.
        Each cell is a structural grep of the underlying <code>.tex</code> file
        on the ai-ecosystem repository — present headings, citations, anchor
        sidecars, hardware references. Cells reflect what the file contains,
        not what reviewers will think of it.
      </p>
      <p class="papers-sub">
        The data feed is regenerated from disk by
        <a
          href="https://github.com/brianonbased-dev/ai-ecosystem/blob/main/scripts/paper-audit-matrix-auto-rebuild.mjs"
          target="_blank"
          rel="noopener"
          ><code>scripts/paper-audit-matrix-auto-rebuild.mjs</code></a
        >
        — the same script that maintains
        <a
          href="https://github.com/brianonbased-dev/ai-ecosystem/blob/main/research/paper-audit-matrix.md"
          target="_blank"
          rel="noopener"
          ><code>research/paper-audit-matrix.md</code></a
        >. Refreshing the page does not refresh the data; the manifest is
        committed to git and a banner appears below if it is older than 24
        hours.
      </p>
    </header>

    <div v-if="loading" class="papers-loading">Loading papers-status.json…</div>
    <div v-else-if="loadError" class="papers-error">
      Failed to load papers-status.json: {{ loadError }}
    </div>

    <template v-else-if="data">
      <section class="papers-summary">
        <div class="papers-meta">
          <span>Manifest generated {{ generatedAtUtc }}</span>
          <span class="papers-sep">•</span>
          <span>Schema <code>{{ data.schema }}</code></span>
          <template v-if="data.scriptCommit">
            <span class="papers-sep">•</span>
            <span>
              Script
              <a :href="scriptCommitUrl(data.scriptCommit)" target="_blank" rel="noopener">
                <code>{{ data.scriptCommit.slice(0, 8) }}</code>
              </a>
            </span>
          </template>
        </div>

        <div v-if="isStale" class="papers-stale-banner">
          This data feed is {{ Math.round(ageHours) }} hours old. Disk truth
          may have drifted since the last refresh. Re-run
          <code>node scripts/build-papers-status-manifest.mjs</code> in
          HoloScript to refresh.
        </div>

        <div class="papers-totals">
          <div class="papers-total-card">
            <div class="papers-total-num">{{ data.totals.papers }}</div>
            <div class="papers-total-lbl">papers tracked</div>
          </div>
          <div class="papers-total-card cell-green">
            <div class="papers-total-num">{{ data.totals.cellsByToken['✅'] }}</div>
            <div class="papers-total-lbl">GREEN cells</div>
          </div>
          <div class="papers-total-card cell-amber">
            <div class="papers-total-num">{{ data.totals.cellsByToken['⚠️'] }}</div>
            <div class="papers-total-lbl">AMBER cells</div>
          </div>
          <div class="papers-total-card cell-red">
            <div class="papers-total-num">{{ data.totals.cellsByToken['❌'] }}</div>
            <div class="papers-total-lbl">RED cells</div>
          </div>
          <div class="papers-total-card cell-na">
            <div class="papers-total-num">{{ data.totals.cellsByToken['➖'] }}</div>
            <div class="papers-total-lbl">N/A cells</div>
          </div>
        </div>
      </section>

      <section class="papers-heatmap">
        <div class="papers-heatmap-scroll">
          <table class="papers-table">
            <thead>
              <tr>
                <th class="paper-col">Paper</th>
                <th class="target-col">Target</th>
                <th
                  v-for="k in data.pillars"
                  :key="k"
                  class="pillar-col"
                >
                  {{ PILLAR_LABELS[k] || k }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="p in data.papers"
                :key="p.rowId"
                :class="{ 'row-active': selectedRowId === p.rowId, 'row-retired': p.retired }"
                @click="selectRow(p.rowId)"
              >
                <td class="paper-col">
                  <div class="paper-title">{{ p.title }}</div>
                  <div class="paper-meta">
                    #{{ p.rowId }} · {{ p.loc }} LOC
                    <span v-if="p.retired" class="retired-tag">retired</span>
                  </div>
                </td>
                <td class="target-col">{{ p.target }}</td>
                <td
                  v-for="k in data.pillars"
                  :key="k"
                  class="pillar-cell"
                >
                  <span
                    :class="['cell', TOKEN_CLASS[(p.pillars[k] && p.pillars[k].token) || '➖']]"
                    :title="(p.pillars[k] && p.pillars[k].evidence) || ''"
                    :aria-label="`${PILLAR_LABELS[k] || k}: ${TOKEN_NAME[(p.pillars[k] && p.pillars[k].token) || '➖']} — ${(p.pillars[k] && p.pillars[k].evidence) || ''}`"
                  >{{ (p.pillars[k] && p.pillars[k].token) || '➖' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="papers-legend">
        <h3>Legend</h3>
        <div class="legend-row">
          <span v-for="(label, token) in TOKEN_NAME" :key="token" class="legend-item">
            <span :class="['cell', TOKEN_CLASS[token]]">{{ token }}</span>
            <span class="legend-label">{{ label }}</span>
          </span>
        </div>
        <p class="legend-note">
          Cell values are derived from a structural grep of each
          <code>.tex</code> file (present headings, anchor sidecars, citation
          directives). They reflect file structure, not content quality.
          Click a row for evidence per pillar and recent commit history.
        </p>
      </section>
    </template>

    <!-- Detail panel -->
    <div v-if="selected" class="paper-detail-overlay" @click="close">
      <div class="paper-detail" @click.stop>
        <button type="button" class="detail-close" @click="close" aria-label="Close detail panel">×</button>
        <div class="detail-row-id">
          Paper {{ selected.rowId }}
          <span v-if="selected.retired" class="retired-tag">retired (folded)</span>
        </div>
        <h2 class="detail-title">{{ selected.title }}</h2>
        <div class="detail-target">{{ selected.target }}</div>

        <div class="detail-stats">
          <div class="detail-stat">
            <div class="detail-stat-lbl">LOC</div>
            <div class="detail-stat-num">{{ selected.loc }}</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-lbl">sha256</div>
            <div class="detail-stat-num"><code>{{ selected.sha256Prefix }}</code></div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-lbl">OTS</div>
            <div class="detail-stat-num">{{ (selected.pillars.anchorOts && selected.pillars.anchorOts.token) || '—' }}</div>
          </div>
          <div class="detail-stat">
            <div class="detail-stat-lbl">Base</div>
            <div class="detail-stat-num">{{ (selected.pillars.anchorBase && selected.pillars.anchorBase.token) || '—' }}</div>
          </div>
        </div>

        <div class="detail-section">
          <h3>Pillars</h3>
          <ul class="detail-pillars">
            <li v-for="k in data.pillars" :key="k">
              <span :class="['cell', TOKEN_CLASS[(selected.pillars[k] && selected.pillars[k].token) || '➖']]">{{ (selected.pillars[k] && selected.pillars[k].token) || '➖' }}</span>
              <div class="detail-pillar-body">
                <div class="detail-pillar-name">{{ PILLAR_LABELS[k] || k }}</div>
                <div class="detail-pillar-evidence">{{ (selected.pillars[k] && selected.pillars[k].evidence) || '' }}</div>
              </div>
            </li>
          </ul>
        </div>

        <div class="detail-section">
          <h3>Recent commits</h3>
          <div v-if="!selected.recentCommits || selected.recentCommits.length === 0" class="detail-empty">
            No git history available for this file.
          </div>
          <ul v-else class="detail-commits">
            <li v-for="c in selected.recentCommits" :key="c.hash">
              <a :href="commitUrl(c.hash)" target="_blank" rel="noopener"><code>{{ c.hash.slice(0, 8) }}</code></a>
              <span class="detail-commit-date">{{ shortDate(c.isoDate) }}</span>
              <span class="detail-commit-subject">{{ c.subject }}</span>
            </li>
          </ul>
        </div>

        <div class="detail-actions">
          <a :href="selected.githubUrl" target="_blank" rel="noopener" class="detail-action-btn">
            View .tex on GitHub
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.papers-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
  color: #d4d4d8;
}
.papers-header h1 {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
  color: #fff;
  border: none;
}
.papers-sub {
  color: #a1a1aa;
  max-width: 64rem;
  font-size: 0.95rem;
  line-height: 1.55;
  margin: 0.5rem 0;
}
.papers-sub a {
  color: #67e8f9;
  text-decoration: none;
}
.papers-sub a:hover {
  text-decoration: underline;
}
.papers-sub code {
  background: rgba(103, 232, 249, 0.08);
  color: #67e8f9;
  padding: 0.05em 0.4em;
  border-radius: 4px;
  font-size: 0.85em;
}

.papers-loading,
.papers-error {
  margin: 2rem 0;
  padding: 1rem;
  border-radius: 8px;
  text-align: center;
}
.papers-error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.papers-summary {
  margin: 1.5rem 0;
}
.papers-meta {
  font-size: 0.85rem;
  color: #71717a;
  margin-bottom: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.papers-meta a {
  color: #67e8f9;
  text-decoration: none;
}
.papers-meta a:hover {
  text-decoration: underline;
}
.papers-sep {
  color: #3f3f46;
}
.papers-stale-banner {
  background: rgba(251, 191, 36, 0.1);
  border: 1px solid rgba(251, 191, 36, 0.3);
  color: #fcd34d;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  font-size: 0.9rem;
  margin: 0.75rem 0;
}
.papers-stale-banner code {
  background: rgba(251, 191, 36, 0.15);
  color: #fcd34d;
  padding: 0.05em 0.4em;
  border-radius: 4px;
}
.papers-totals {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}
.papers-total-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.papers-total-card.cell-green { background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.35); }
.papers-total-card.cell-amber { background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.35); }
.papers-total-card.cell-red   { background: rgba(239, 68, 68, 0.1);  border-color: rgba(239, 68, 68, 0.35);  }
.papers-total-card.cell-na    { background: rgba(120, 120, 120, 0.08); border-color: rgba(120, 120, 120, 0.3); }
.papers-total-num {
  font-size: 1.4rem;
  font-weight: 600;
  color: #fff;
}
.papers-total-lbl {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #a1a1aa;
  margin-top: 0.2rem;
}

.papers-heatmap {
  margin: 2rem 0;
}
.papers-heatmap-scroll {
  overflow-x: auto;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.papers-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.papers-table thead th {
  background: rgba(255, 255, 255, 0.04);
  color: #a1a1aa;
  text-transform: uppercase;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  padding: 0.6rem 0.6rem;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  white-space: nowrap;
}
.papers-table thead th.paper-col,
.papers-table thead th.target-col {
  text-align: left;
}
.papers-table tbody tr {
  cursor: pointer;
  transition: background 120ms;
}
.papers-table tbody tr:hover { background: rgba(255, 255, 255, 0.04); }
.papers-table tbody tr.row-active { background: rgba(103, 232, 249, 0.08); }
.papers-table tbody tr.row-retired .paper-title { color: #a1a1aa; }
.papers-table tbody td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  vertical-align: middle;
}
.papers-table tbody td.paper-col {
  position: sticky;
  left: 0;
  background: var(--vp-c-bg, #1b1b1f);
  z-index: 1;
}
.paper-title {
  font-weight: 600;
  color: #fff;
}
.paper-meta {
  font-size: 0.75rem;
  color: #71717a;
  font-family: var(--vp-font-family-mono, monospace);
  margin-top: 0.1rem;
}
.target-col { white-space: nowrap; color: #d4d4d8; }
.pillar-cell { text-align: center; }

.cell {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  font-family: var(--vp-font-family-mono, monospace);
  font-size: 0.95rem;
  border: 1px solid;
}
.cell-green { background: rgba(34, 197, 94, 0.18); border-color: rgba(34, 197, 94, 0.5); color: #86efac; }
.cell-amber { background: rgba(251, 191, 36, 0.18); border-color: rgba(251, 191, 36, 0.5); color: #fcd34d; }
.cell-red   { background: rgba(239, 68, 68, 0.18);  border-color: rgba(239, 68, 68, 0.5);  color: #fca5a5; }
.cell-na    { background: rgba(120, 120, 120, 0.12); border-color: rgba(120, 120, 120, 0.4); color: #a1a1aa; }

.retired-tag {
  display: inline-block;
  background: rgba(120, 120, 120, 0.18);
  color: #a1a1aa;
  font-size: 0.65rem;
  padding: 0.05em 0.45em;
  border-radius: 4px;
  margin-left: 0.4em;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.papers-legend {
  margin: 2rem 0;
}
.papers-legend h3 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #a1a1aa;
  border: none;
  padding: 0;
  margin: 0 0 0.6rem;
}
.legend-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
  color: #d4d4d8;
}
.legend-note {
  margin-top: 0.75rem;
  font-size: 0.8rem;
  color: #71717a;
  max-width: 60rem;
}

/* Detail overlay */
.paper-detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 2rem 1rem;
  overflow-y: auto;
}
.paper-detail {
  position: relative;
  background: var(--vp-c-bg, #1b1b1f);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  padding: 1.5rem 1.5rem 2rem;
  max-width: 56rem;
  width: 100%;
  margin: 1rem 0;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
}
.detail-close {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: #a1a1aa;
  cursor: pointer;
  line-height: 1;
  padding: 0.2rem 0.5rem;
}
.detail-close:hover { color: #fff; }
.detail-row-id {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #71717a;
  margin-bottom: 0.25rem;
}
.detail-title {
  font-size: 1.6rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.25rem;
  border: none;
  padding: 0;
}
.detail-target {
  color: #a1a1aa;
  font-size: 0.9rem;
}
.detail-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.5rem;
  margin: 1.25rem 0;
}
.detail-stat {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 0.5rem 0.75rem;
}
.detail-stat-lbl {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #71717a;
}
.detail-stat-num {
  margin-top: 0.2rem;
  font-family: var(--vp-font-family-mono, monospace);
  color: #67e8f9;
}
.detail-section { margin: 1.25rem 0; }
.detail-section h3 {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #a1a1aa;
  border: none;
  padding: 0;
  margin: 0 0 0.6rem;
}
.detail-pillars {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.detail-pillars li {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  font-size: 0.9rem;
}
.detail-pillar-body { flex: 1; }
.detail-pillar-name { color: #fff; font-weight: 500; }
.detail-pillar-evidence { color: #a1a1aa; font-size: 0.8rem; margin-top: 0.1rem; }

.detail-commits {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.85rem;
}
.detail-commits li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: baseline;
}
.detail-commits a code {
  color: #67e8f9;
  font-family: var(--vp-font-family-mono, monospace);
}
.detail-commit-date { color: #71717a; font-family: var(--vp-font-family-mono, monospace); font-size: 0.75rem; }
.detail-commit-subject { color: #d4d4d8; font-size: 0.85rem; }
.detail-empty { color: #71717a; font-size: 0.85rem; }

.detail-actions {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.detail-action-btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #67e8f9;
  text-decoration: none;
  font-size: 0.85rem;
}
.detail-action-btn:hover { background: rgba(103, 232, 249, 0.1); }

@media (max-width: 640px) {
  .papers-page { padding: 1rem 0.75rem 3rem; }
  .papers-header h1 { font-size: 1.5rem; }
  .papers-totals { grid-template-columns: repeat(2, 1fr); }
}
</style>
