<script setup>
import { ref, computed, onMounted } from 'vue';

/**
 * Lotus Flower — Server-gated petal visualization
 *
 * Architecture (per W.GOLD.001 and task_1777249882300_kusu):
 *   - The VitePress page is a static build deployed to GitHub Pages.
 *   - The data comes from mcp.holoscript.net/api/lotus (server-gated).
 *   - Authenticated (team-tier Bearer) → Mode-A: full disclosure (paper_id, venue, measured, claimed).
 *   - Unauthenticated → Mode-B: anonymous bloom (index, state, color only).
 *   - The client renders identically in both modes — no "if authed, show extra" branch.
 *   - The server determines disclosure. An attacker who tampers with the client
 *     cannot reveal private fields because the bytes were never sent.
 *
 * Mode detection: the X-Lotus-Mode response header (A or B) tells the client
 * which shape to expect, so we can render tooltips (Mode-A) or just colors (Mode-B).
 */

const LOTUS_API_URL = 'https://mcp.holoscript.net/api/lotus';

const loading = ref(true);
const loadError = ref(null);
const mode = ref('B'); // 'A' or 'B' — set from X-Lotus-Mode header
const petals = ref([]);
const readiness = ref({ fullPetals: 0, totalPetals: 16 });
const metadata = ref({ snapshot_at: '', petal_count: 0 });

// Bloom state colors (mirrors MCP server BLOOM_COLORS)
const BLOOM_COLORS = {
  sealed: '#6b7280',
  budding: '#f59e0b',
  blooming: '#3b82f6',
  full: '#10b981',
  wilted: '#ef4444',
};

const BLOOM_LABELS = {
  sealed: 'Sealed — no draft yet',
  budding: 'Budding — draft with stubs',
  blooming: 'Blooming — substantive draft, anchors or benchmarks pending',
  full: 'Full bloom — complete and dual-anchored',
  wilted: 'Wilted — retracted or provenance break',
};

const BLOOM_ORDER = ['full', 'blooming', 'budding', 'sealed', 'wilted'];

onMounted(async () => {
  try {
    // Try with Bearer token from hash/cookie if available (Mode-A path)
    // Default: no auth → Mode-B
    const token = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token')
      : null;

    const headers = { 'Accept': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(LOTUS_API_URL, { headers, cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const lotusMode = res.headers.get('X-Lotus-Mode') || 'B';
    mode.value = lotusMode;

    const data = await res.json();
    petals.value = lotusMode === 'A'
      ? Object.values(data.petals) // Mode-A: keyed by paper_id
      : data.petals;               // Mode-B: array
    readiness.value = data.readiness;
    metadata.value = data.metadata;
  } catch (err) {
    loadError.value = err.message || String(err);
  } finally {
    loading.value = false;
  }
});

const sortedPetals = computed(() => {
  if (!petals.value.length) return [];
  // Mode-B: already sorted by index
  if (mode.value === 'B') return [...petals.value].sort((a, b) => a.index - b.index);
  // Mode-A: sort by bloom state, then by paper_id
  return [...petals.value].sort((a, b) => {
    const order = { full: 0, blooming: 1, budding: 2, sealed: 3, wilted: 4 };
    return (order[a.state] ?? 3) - (order[b.state] ?? 3) || (a.paper_id || '').localeCompare(b.paper_id || '');
  });
});

const stateCounts = computed(() => {
  const counts = { full: 0, blooming: 0, budding: 0, sealed: 0, wilted: 0 };
  for (const p of petals.value) {
    counts[p.state] = (counts[p.state] || 0) + 1;
  }
  return counts;
});

// SVG petal layout: 16 petals arranged in 2 rings of 8
const petalPositions = computed(() => {
  const positions = [];
  const innerCount = 8;
  const outerCount = 8;

  for (let i = 0; i < innerCount; i++) {
    const angle = (i * 360) / innerCount - 90; // start from top
    positions.push({ ring: 'inner', index: i, angle, cx: 200 + 90 * Math.cos(angle * Math.PI / 180), cy: 200 + 90 * Math.sin(angle * Math.PI / 180) });
  }
  for (let i = 0; i < outerCount; i++) {
    const angle = (i * 360) / outerCount - 90 + 22.5; // offset by half-step
    positions.push({ ring: 'outer', index: innerCount + i, angle, cx: 200 + 145 * Math.cos(angle * Math.PI / 180), cy: 200 + 145 * Math.sin(angle * Math.PI / 180) });
  }
  return positions;
});

function petalLabel(p) {
  if (mode.value === 'A') {
    return p.paper_id || `Petal ${p.index ?? 0}`;
  }
  return `Petal ${(p.index ?? 0) + 1}`;
}

function petalDetails(p) {
  if (mode.value === 'A') {
    const lines = [p.venue || '', p.reason || ''];
    if (p.measured) {
      lines.push(`Stubs: ${p.measured.stubCount}, Benchmarks pending: ${p.measured.benchmarkTodoCount}`);
      const anchors = [];
      if (p.measured.otsAnchored) anchors.push('OTS');
      if (p.measured.baseAnchored) anchors.push('Base');
      lines.push(`Anchors: ${anchors.length > 0 ? anchors.join(' + ') : 'none'}`);
    }
    return lines.filter(Boolean).join('\n');
  }
  return BLOOM_LABELS[p.state] || '';
}
</script>

<template>
  <div class="lotus-page">
    <header class="lotus-header">
      <h1>The Lotus</h1>
      <p class="lotus-sub">
        16 papers. One algebra. One verifiable chain from source notation to rendered pixel.
      </p>
      <p class="lotus-sub">
        Each petal represents a paper in the HoloScript research program.
        Bloom state is derived from real evidence — draft content, anchor
        receipts, and benchmark results — not self-reported status.
      </p>
    </header>

    <div v-if="loading" class="lotus-loading">
      <div class="lotus-spinner"></div>
      Loading bloom state&hellip;
    </div>

    <div v-else-if="loadError" class="lotus-error">
      Failed to load lotus data: {{ loadError }}
    </div>

    <template v-else>
      <section class="lotus-summary">
        <div class="lotus-meta">
          <span v-if="metadata.snapshot_at">Evidence as of {{ metadata.snapshot_at }}</span>
          <span v-if="mode === 'A'" class="lotus-mode-badge lotus-mode-a">
            Full disclosure (authenticated)
          </span>
          <span v-else class="lotus-mode-badge lotus-mode-b">
            Anonymous bloom
          </span>
        </div>

        <div class="lotus-totals">
          <div class="lotus-total-card">
            <div class="lotus-total-num">{{ readiness.totalPetals }}</div>
            <div class="lotus-total-lbl">total petals</div>
          </div>
          <div class="lotus-total-card lotus-total-full">
            <div class="lotus-total-num">{{ readiness.fullPetals }}</div>
            <div class="lotus-total-lbl">full bloom</div>
          </div>
          <div class="lotus-total-card">
            <div class="lotus-total-num">{{ readiness.totalPetals - readiness.fullPetals }}</div>
            <div class="lotus-total-lbl">in progress</div>
          </div>
        </div>

        <div class="lotus-legend">
          <span v-for="state in BLOOM_ORDER" :key="state" class="lotus-legend-item">
            <span class="lotus-legend-dot" :style="{ background: BLOOM_COLORS[state] }"></span>
            {{ state }} ({{ stateCounts[state] || 0 }})
          </span>
        </div>
      </section>

      <section class="lotus-visualization">
        <svg viewBox="0 0 400 400" class="lotus-svg" role="img" aria-label="Lotus flower visualization">
          <!-- Center -->
          <circle cx="200" cy="200" r="28" fill="none" stroke="#6366f1" stroke-width="2" opacity="0.6" />
          <text x="200" y="204" text-anchor="middle" fill="#6366f1" font-size="10" font-weight="600">
            {{ readiness.fullPetals }}/{{ readiness.totalPetals }}
          </text>

          <!-- Petals -->
          <g v-for="(p, i) in sortedPetals" :key="i">
            <ellipse
              :cx="petalPositions[i]?.cx ?? 200"
              :cy="petalPositions[i]?.cy ?? 200"
              rx="22"
              :ry="petalPositions[i]?.ring === 'outer' ? 42 : 34"
              :fill="BLOOM_COLORS[p.state] || '#6b7280'"
              :transform="`rotate(${petalPositions[i]?.angle ?? 0}, ${petalPositions[i]?.cx ?? 200}, ${petalPositions[i]?.cy ?? 200})`"
              opacity="0.85"
              class="lotus-petal"
            >
              <title>{{ petalLabel(p) }}: {{ p.state }}{{ petalDetails(p) ? '\n' + petalDetails(p) : '' }}</title>
            </ellipse>
          </g>
        </svg>
      </section>

      <section class="lotus-petal-list">
        <h2>Petal Details</h2>
        <div v-for="(p, i) in sortedPetals" :key="i" class="lotus-petal-card" :class="'lotus-state-' + p.state">
          <div class="lotus-petal-header">
            <span class="lotus-petal-dot" :style="{ background: BLOOM_COLORS[p.state] }"></span>
            <span class="lotus-petal-name">{{ petalLabel(p) }}</span>
            <span class="lotus-petal-state">{{ p.state }}</span>
          </div>
          <div v-if="mode === 'A' && p.venue" class="lotus-petal-venue">{{ p.venue }}</div>
          <div v-if="p.reason" class="lotus-petal-reason">{{ p.reason }}</div>
          <div v-if="mode === 'A' && p.measured" class="lotus-petal-measured">
            <span v-if="p.measured.hasDraft">draft</span>
            <span v-if="p.measured.stubCount">{{ p.measured.stubCount }} stub{{ p.measured.stubCount > 1 ? 's' : '' }}</span>
            <span v-if="p.measured.benchmarkTodoCount">{{ p.measured.benchmarkTodoCount }} benchmark{{ p.measured.benchmarkTodoCount > 1 ? 's' : '' }} pending</span>
            <span v-if="p.measured.otsAnchored">OTS anchored</span>
            <span v-if="p.measured.baseAnchored">Base anchored</span>
          </div>
        </div>
      </section>

      <footer class="lotus-footer">
        <p>
          Bloom state is a pure function of verifiable evidence — draft content,
          anchor receipts, and benchmark results — not self-reported claims.
          The Lotus Genesis Trigger fires when all 16 petals reach full bloom.
        </p>
        <p v-if="mode === 'B'" class="lotus-anon-note">
          You are viewing the anonymous bloom visualization. Team members can
          authenticate to see paper identifiers and detailed progress.
        </p>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.lotus-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  font-family: var(--vp-font-family-base);
  color: var(--vp-c-text-1);
}

.lotus-header h1 {
  font-size: 2.4rem;
  margin: 0 0 1rem;
  background: linear-gradient(135deg, #6b7280 0%, #3b82f6 30%, #10b981 60%, #f59e0b 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.lotus-sub {
  color: var(--vp-c-text-2);
  line-height: 1.55;
  margin: 0.4rem 0;
}

.lotus-loading,
.lotus-error {
  margin: 2rem 0;
  padding: 1rem 1.25rem;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 8px;
  color: var(--vp-c-text-2);
}
.lotus-error {
  border-color: #ef4444;
  color: #ef4444;
}

.lotus-spinner {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid var(--vp-c-divider);
  border-top-color: #6366f1;
  border-radius: 50%;
  animation: lotus-spin 0.8s linear infinite;
  margin-right: 0.5rem;
  vertical-align: middle;
}
@keyframes lotus-spin {
  to { transform: rotate(360deg); }
}

.lotus-summary { margin: 2rem 0 1.5rem; }

.lotus-meta {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.lotus-mode-badge {
  font-size: 0.75rem;
  padding: 2px 10px;
  border-radius: 999px;
  font-family: var(--vp-font-family-mono);
}
.lotus-mode-a {
  background: rgba(99, 102, 241, 0.15);
  color: #6366f1;
  border: 1px solid #6366f1;
}
.lotus-mode-b {
  background: rgba(107, 114, 128, 0.12);
  color: #6b7280;
  border: 1px solid #6b7280;
}

.lotus-totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.lotus-total-card {
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}
.lotus-total-full {
  border-color: #10b981;
  background: rgba(16, 185, 129, 0.08);
}

.lotus-total-num {
  font-size: 1.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-brand-1);
  line-height: 1.1;
}
.lotus-total-full .lotus-total-num {
  color: #10b981;
}

.lotus-total-lbl {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin-top: 0.25rem;
}

.lotus-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.lotus-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
}

.lotus-legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.lotus-visualization {
  display: flex;
  justify-content: center;
  margin: 2rem 0;
}

.lotus-svg {
  width: 100%;
  max-width: 420px;
  height: auto;
}

.lotus-petal {
  transition: opacity 0.2s, transform 0.2s;
  cursor: pointer;
}
.lotus-petal:hover {
  opacity: 1 !important;
  stroke: var(--vp-c-text-1);
  stroke-width: 1.5;
}

.lotus-petal-list {
  margin-top: 2rem;
}
.lotus-petal-list h2 {
  font-size: 1.3rem;
  margin: 0 0 1rem;
}

.lotus-petal-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  margin-bottom: 0.5rem;
  background: var(--vp-c-bg);
  border-left: 3px solid;
}
.lotus-state-full    { border-left-color: #10b981; }
.lotus-state-blooming { border-left-color: #3b82f6; }
.lotus-state-budding { border-left-color: #f59e0b; }
.lotus-state-sealed  { border-left-color: #6b7280; }
.lotus-state-wilted  { border-left-color: #ef4444; }

.lotus-petal-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.lotus-petal-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.lotus-petal-name {
  font-weight: 600;
  font-size: 0.95rem;
  flex: 1;
}

.lotus-petal-state {
  font-size: 0.8rem;
  font-family: var(--vp-font-family-mono);
  text-transform: uppercase;
  padding: 1px 8px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
}

.lotus-petal-venue {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin-top: 0.25rem;
}

.lotus-petal-reason {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
  margin-top: 0.2rem;
}

.lotus-petal-measured {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.35rem;
}
.lotus-petal-measured span {
  font-size: 0.75rem;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
}

.lotus-footer {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  line-height: 1.55;
}
.lotus-footer p {
  margin: 0.5rem 0;
}
.lotus-anon-note {
  font-style: italic;
  opacity: 0.8;
}

@media (max-width: 720px) {
  .lotus-totals {
    grid-template-columns: 1fr 1fr;
  }
  .lotus-header h1 {
    font-size: 1.8rem;
  }
}
</style>