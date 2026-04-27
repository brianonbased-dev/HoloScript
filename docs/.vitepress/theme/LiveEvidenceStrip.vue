<script setup>
import { ref, computed, onMounted } from 'vue';
import { withBase } from 'vitepress';

// Live evidence strip on the homepage. Reads docs/public/live-evidence.json
// (built by scripts/build-live-evidence-manifest.mjs). Three tiles:
//   A — Fleet:  agents online / $ spent / commits last 24h
//   B — Anchor: last paper anchored on Base (clickable to BaseScan)
//   C — Commit: most recent non-bot non-merge commit (clickable to GitHub)
//
// Documentarian voice (F.004): show what was built, not what to buy. Every
// number is verifiable via the linked primary source. No marketing copy.

const data = ref(null);
const loadError = ref(null);
const loading = ref(true);

onMounted(async () => {
  try {
    const url = withBase('/live-evidence.json');
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data.value = await res.json();
  } catch (err) {
    loadError.value = err.message || String(err);
  } finally {
    loading.value = false;
  }
});

const generatedAtIso = computed(() => data.value?.generatedAt ?? '');
const ageHours = computed(() => {
  if (!data.value?.generatedAt) return Number.POSITIVE_INFINITY;
  return (Date.now() - new Date(data.value.generatedAt).getTime()) / 3_600_000;
});
const isStale = computed(() => ageHours.value > 12);
const ageLabel = computed(() => {
  const h = ageHours.value;
  if (!Number.isFinite(h)) return '';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min ago`;
  if (h < 24) return `${Math.round(h)} h ago`;
  return `${Math.floor(h / 24)} d ago`;
});

const fleet = computed(() => data.value?.tiles?.fleet ?? null);
const anchor = computed(() => data.value?.tiles?.anchor ?? null);
const commit = computed(() => data.value?.tiles?.commit ?? null);

// Pre-compute base-prefixed paths in script scope so SSR doesn't choke on
// withBase() in template (it's unreliable at template eval time in some
// VitePress SSR configurations).
const provenanceHref = withBase('/provenance');
const papersStatusHref = withBase('/papers/status');

function fmtUsd(n) {
  if (typeof n !== 'number') return '$0';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
</script>

<template>
  <section class="live-evidence-strip" v-if="!loading">
    <div v-if="loadError" class="strip-error">
      <span>live-evidence manifest unreachable: {{ loadError }}</span>
    </div>

    <div v-else class="strip-grid">
      <!-- Tile A: Fleet -->
      <div class="tile">
        <div class="tile-label">Fleet, last 24 h</div>
        <div v-if="fleet" class="tile-value">
          <span class="tile-num">{{ fleet.agentsLast24h }}</span>
          <span class="tile-unit">{{ fleet.agentsLast24h === 1 ? 'agent' : 'agents' }}</span>
          <span class="tile-sep">·</span>
          <span class="tile-num">{{ fmtUsd(fleet.spendUsd24h) }}</span>
          <span class="tile-unit">spent</span>
          <span class="tile-sep">·</span>
          <span class="tile-num">{{ fleet.commitsLast24h }}</span>
          <span class="tile-unit">{{ fleet.commitsLast24h === 1 ? 'commit' : 'commits' }}</span>
        </div>
        <div v-else class="tile-empty">no fleet data</div>
      </div>

      <!-- Tile B: Last paper anchored -->
      <div class="tile">
        <div class="tile-label">Last paper anchored on Base</div>
        <div v-if="anchor && anchor.txHash" class="tile-value">
          <a :href="anchor.basescanUrl" target="_blank" rel="noopener" class="tile-link">
            <span class="tile-mono">{{ anchor.fileName }}</span>
            <span class="tile-sep">·</span>
            <span class="tile-mono">sha {{ anchor.fileSha256Short }}…</span>
            <span class="tile-sep">·</span>
            <span class="tile-mono">block {{ anchor.blockNumber }}</span>
          </a>
          <span class="tile-time">{{ anchor.relativeTime }}</span>
        </div>
        <div v-else class="tile-empty">no anchor receipts found</div>
      </div>

      <!-- Tile C: Last commit -->
      <div class="tile">
        <div class="tile-label">Last commit</div>
        <div v-if="commit && commit.hash" class="tile-value">
          <a :href="commit.githubUrl" target="_blank" rel="noopener" class="tile-link">
            <span class="tile-mono">{{ commit.repo }} {{ commit.hashShort }}</span>
          </a>
          <span class="tile-time">{{ commit.relativeTime }}</span>
          <div class="tile-subject">{{ commit.subject }}</div>
        </div>
        <div v-else class="tile-empty">no commits found</div>
      </div>
    </div>

    <div class="strip-footer">
      <span class="footer-meta">
        Refreshed {{ ageLabel }}
        <span v-if="isStale" class="stale-flag">· data older than 12 h, manifest auto-refresh runs every 6 h</span>
      </span>
      <span class="footer-links">
        <a :href="provenanceHref">/provenance</a>
        ·
        <a :href="papersStatusHref">/papers/status</a>
        ·
        <a href="https://github.com/brianonbased-dev/HoloScript" target="_blank" rel="noopener">HoloScript</a>
        ·
        <a href="https://github.com/brianonbased-dev/ai-ecosystem" target="_blank" rel="noopener">ai-ecosystem</a>
      </span>
    </div>
  </section>
</template>

<style scoped>
.live-evidence-strip {
  width: 100%;
  background: rgba(0, 0, 0, 0.35);
  border-bottom: 1px solid rgba(120, 220, 232, 0.15);
  padding: 14px 0 10px 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: #e0e6ee;
}

.strip-grid {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  display: grid;
  grid-template-columns: 1fr 1.4fr 1.4fr;
  gap: 24px;
  align-items: start;
}

.tile {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.tile-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #8b94a3;
  font-weight: 500;
}

.tile-value {
  font-size: 13px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: baseline;
}

.tile-num {
  font-weight: 600;
  color: #f0f4fa;
}

.tile-unit {
  color: #b0bac9;
}

.tile-sep {
  color: #4a5366;
  margin: 0 2px;
}

.tile-mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
  color: #f0f4fa;
}

.tile-link {
  color: inherit;
  text-decoration: none;
  border-bottom: 1px dotted rgba(120, 220, 232, 0.3);
  transition: border-color 0.15s ease;
}

.tile-link:hover {
  border-bottom-color: rgba(120, 220, 232, 0.8);
}

.tile-time {
  color: #8b94a3;
  font-size: 12px;
  margin-left: 6px;
}

.tile-subject {
  font-size: 12px;
  color: #b0bac9;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.tile-empty {
  font-size: 12px;
  color: #6b7585;
  font-style: italic;
}

.strip-footer {
  max-width: 1200px;
  margin: 10px auto 0 auto;
  padding: 8px 24px 0 24px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #6b7585;
  flex-wrap: wrap;
  gap: 8px;
}

.footer-meta {
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

.stale-flag {
  color: #d4a05c;
}

.footer-links a {
  color: #8b94a3;
  text-decoration: none;
}

.footer-links a:hover {
  color: #c0d4e8;
}

.strip-error {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  font-size: 12px;
  color: #d4a05c;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}

@media (max-width: 768px) {
  .strip-grid {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .strip-footer {
    flex-direction: column;
    align-items: flex-start;
  }
  .tile-subject {
    white-space: normal;
  }
}
</style>
