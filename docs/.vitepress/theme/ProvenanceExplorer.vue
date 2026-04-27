<script setup>
import { ref, computed, onMounted } from 'vue';
import { withBase } from 'vitepress';

const manifest = ref(null);
const loadError = ref(null);
const loading = ref(true);
const expanded = ref(new Set());
const filterBucket = ref('all');
const filterGroup = ref('all');
const search = ref('');

onMounted(async () => {
  try {
    const url = withBase('/provenance-manifest.json');
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    manifest.value = await res.json();
  } catch (err) {
    loadError.value = err.message || String(err);
  } finally {
    loading.value = false;
  }
});

const filteredEntries = computed(() => {
  if (!manifest.value) return [];
  const q = search.value.trim().toLowerCase();
  return manifest.value.entries.filter((e) => {
    if (filterBucket.value !== 'all' && e.bucket !== filterBucket.value) return false;
    if (filterGroup.value !== 'all' && e.group !== filterGroup.value) return false;
    if (q) {
      const hay = (e.sourcePath + ' ' + (e.txHash || '') + ' ' + (e.tag || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
});

const bucketLabel = {
  bitcoin_base: 'Bitcoin + Base confirmed',
  base_only_pending_btc: 'Base confirmed, Bitcoin pending',
  base_only: 'Base only',
  drifted: 'Drifted (file amended since anchor)',
};

const bucketColor = {
  bitcoin_base: '#00ffaa',
  base_only_pending_btc: '#ffcc00',
  base_only: '#88aaff',
  drifted: '#ff4488',
};

function toggle(idx) {
  if (expanded.value.has(idx)) {
    expanded.value.delete(idx);
  } else {
    expanded.value.add(idx);
  }
  // trigger reactivity on Set
  expanded.value = new Set(expanded.value);
}

function shortHash(h, head = 10, tail = 6) {
  if (!h) return '';
  if (h.length <= head + tail + 1) return h;
  return h.slice(0, head) + '…' + h.slice(-tail);
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toUTCString().replace(' GMT', ' UTC');
}

function githubRawUrl(sourcePath) {
  return (
    'https://github.com/brianonbased-dev/ai-ecosystem/blob/main/research/' +
    encodeURI(sourcePath)
  );
}

function githubBaseJsonUrl(sourcePath) {
  return (
    'https://github.com/brianonbased-dev/ai-ecosystem/blob/main/research/' +
    encodeURI(sourcePath) +
    '.base.json'
  );
}

function githubOtsUrl(sourcePath) {
  return (
    'https://github.com/brianonbased-dev/ai-ecosystem/blob/main/research/' +
    encodeURI(sourcePath) +
    '.ots'
  );
}

const verifyScriptUrl =
  'https://github.com/brianonbased-dev/ai-ecosystem/blob/main/scripts/verify_provenance.py';

function copyText(t) {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(t);
  }
}
</script>

<template>
  <div class="prov-page">
    <header class="prov-header">
      <h1>Live Provenance Explorer</h1>
      <p class="prov-sub">
        Every load-bearing artifact in the HoloScript research program is
        anchored to two independent public ledgers: the Bitcoin blockchain
        (via OpenTimestamps) and Base mainnet (an Ethereum L2). Both receipts
        are committed to the open-source repository alongside the file they
        prove.
      </p>
      <p class="prov-sub">
        This page reads a manifest generated from those receipts. Every claim
        on this page is verifiable against the original public sources —
        BaseScan, mempool.space, and the ai-ecosystem GitHub repo. The
        canonical verifier is
        <a :href="verifyScriptUrl" target="_blank" rel="noopener"
          ><code>scripts/verify_provenance.py</code></a
        >; the page below mirrors what that script reports.
      </p>
    </header>

    <div v-if="loading" class="prov-loading">Loading manifest…</div>
    <div v-else-if="loadError" class="prov-error">
      Failed to load manifest: {{ loadError }}
    </div>

    <template v-else-if="manifest">
      <section class="prov-summary">
        <div class="prov-meta">
          <span>Manifest generated {{ fmtDate(manifest.generatedAt) }}</span>
          <span class="prov-sep">•</span>
          <span>Source: <code>{{ manifest.sourceRepo }}</code></span>
        </div>

        <div class="prov-totals">
          <div class="prov-total-card">
            <div class="prov-total-num">{{ manifest.counts.receipts }}</div>
            <div class="prov-total-lbl">anchored receipts</div>
          </div>
          <div class="prov-total-card">
            <div class="prov-total-num">{{ manifest.counts.baseReceipts }}</div>
            <div class="prov-total-lbl">Base L2 receipts</div>
          </div>
          <div class="prov-total-card">
            <div class="prov-total-num">{{ manifest.counts.otsReceipts }}</div>
            <div class="prov-total-lbl">OpenTimestamps receipts</div>
          </div>
        </div>

        <div class="prov-buckets">
          <button
            class="prov-bucket"
            :class="{ active: filterBucket === 'all' }"
            @click="filterBucket = 'all'"
          >
            All <span class="prov-bucket-count">{{ manifest.counts.receipts }}</span>
          </button>
          <button
            v-for="(label, key) in bucketLabel"
            :key="key"
            class="prov-bucket"
            :class="{ active: filterBucket === key }"
            :style="{
              borderColor:
                filterBucket === key ? bucketColor[key] : 'var(--vp-c-divider)',
            }"
            @click="filterBucket = key"
          >
            <span
              class="prov-bucket-dot"
              :style="{ background: bucketColor[key] }"
            ></span>
            {{ label }}
            <span class="prov-bucket-count">{{ manifest.counts.buckets[key] || 0 }}</span>
          </button>
        </div>

        <div class="prov-filter-row">
          <select v-model="filterGroup" class="prov-filter-select">
            <option value="all">All groups</option>
            <option v-for="(n, g) in manifest.counts.groups" :key="g" :value="g">
              {{ g }} ({{ n }})
            </option>
          </select>
          <input
            v-model="search"
            class="prov-filter-search"
            type="text"
            placeholder="Filter by path, tx hash, or tag…"
          />
        </div>

        <div class="prov-notes">
          <strong>How statuses are determined.</strong> A receipt is
          <em>Bitcoin + Base confirmed</em> when the Base L2 transaction is
          mined and the OpenTimestamps receipt is older than 48 hours
          (Bitcoin calendars witness new receipts within ~24h).
          <em>Base confirmed, Bitcoin pending</em> means the Base L2 anchor
          is on-chain but the Bitcoin attestation has not yet been observed
          (typical for receipts under 48h old). <em>Drifted</em> means the
          file's current SHA-256 no longer matches the receipt — this is
          not a tampering signal; it means the file was amended after the
          anchor. The prior receipt remains on-chain as evidence of the
          prior content state, and a new anchor round re-establishes the
          canonical triple.
        </div>
      </section>

      <section class="prov-list">
        <div
          v-for="(e, idx) in filteredEntries"
          :key="e.sourcePath + ':' + (e.txHash || idx)"
          class="prov-card"
          :class="['bucket-' + e.bucket, { open: expanded.has(idx) }]"
        >
          <header class="prov-card-head" @click="toggle(idx)">
            <div class="prov-card-path">
              <span
                class="prov-status-pip"
                :style="{ background: bucketColor[e.bucket] }"
                :title="bucketLabel[e.bucket]"
              ></span>
              <code class="prov-card-pathcode">{{ e.sourcePath }}</code>
            </div>
            <div class="prov-card-summary">
              <span class="prov-tag">{{ e.tag }}</span>
              <span class="prov-card-block">block {{ e.blockNumber }}</span>
              <span class="prov-card-when">{{ fmtDate(e.anchoredAtIso) }}</span>
              <span class="prov-card-toggle" aria-hidden="true">
                {{ expanded.has(idx) ? '−' : '+' }}
              </span>
            </div>
          </header>

          <div v-if="expanded.has(idx)" class="prov-card-body">
            <dl class="prov-dl">
              <dt>Source file</dt>
              <dd>
                <a
                  :href="githubRawUrl(e.sourcePath)"
                  target="_blank"
                  rel="noopener"
                  ><code>research/{{ e.sourcePath }}</code></a
                >
              </dd>

              <dt>Receipt SHA-256</dt>
              <dd>
                <code class="prov-mono">{{ e.receiptFileSha256 }}</code>
              </dd>

              <dt>Current SHA-256</dt>
              <dd v-if="!e.sourceExists">
                <em>source file not present in current snapshot</em>
              </dd>
              <dd v-else>
                <code class="prov-mono">{{ e.currentSha256 }}</code>
                <span v-if="e.drift === true" class="prov-drift-flag">
                  drift detected
                </span>
                <span v-else-if="e.drift === false" class="prov-match-flag">
                  match
                </span>
              </dd>

              <dt>Base L2 transaction</dt>
              <dd>
                <a
                  :href="e.basescanUrl"
                  target="_blank"
                  rel="noopener"
                  class="prov-link-prim"
                >
                  {{ shortHash(e.txHash, 14, 10) }}
                </a>
                <button class="prov-copy" @click="copyText(e.txHash)">
                  copy
                </button>
              </dd>

              <dt>Base block</dt>
              <dd>
                <a
                  :href="
                    'https://basescan.org/block/' + e.blockNumber
                  "
                  target="_blank"
                  rel="noopener"
                  >{{ e.blockNumber }}</a
                >
                <span v-if="e.gasUsed">
                  · {{ e.gasUsed }} gas used
                </span>
              </dd>

              <dt>Wallet</dt>
              <dd>
                <a
                  :href="'https://basescan.org/address/' + e.wallet"
                  target="_blank"
                  rel="noopener"
                >
                  <code>{{ e.wallet }}</code>
                </a>
              </dd>

              <dt>OpenTimestamps receipt</dt>
              <dd>
                <a
                  :href="githubOtsUrl(e.sourcePath)"
                  target="_blank"
                  rel="noopener"
                  ><code>{{ e.sourcePath }}.ots</code></a
                >
                <span class="prov-ots-status">
                  · {{ e.otsStatus.replace(/_/g, ' ').toLowerCase() }}
                </span>
              </dd>

              <dt>Base receipt JSON</dt>
              <dd>
                <a
                  :href="githubBaseJsonUrl(e.sourcePath)"
                  target="_blank"
                  rel="noopener"
                  ><code>{{ e.sourcePath }}.base.json</code></a
                >
              </dd>

              <dt>Verify locally</dt>
              <dd>
                <code class="prov-cmd"
                  >python scripts/verify_provenance.py research/{{ e.sourcePath }}</code
                >
                <button
                  class="prov-copy"
                  @click="
                    copyText(
                      'python scripts/verify_provenance.py research/' +
                        e.sourcePath,
                    )
                  "
                >
                  copy
                </button>
              </dd>
            </dl>
          </div>
        </div>

        <div v-if="filteredEntries.length === 0" class="prov-empty">
          No receipts match the current filter.
        </div>
      </section>

      <footer class="prov-footer">
        <p>
          The receipts referenced on this page were broadcast from
          <a
            href="https://basescan.org/address/0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3"
            target="_blank"
            rel="noopener"
            ><code>0x0C57…660E3</code></a
          >
          (Trezor-controlled). The OpenTimestamps receipts are independently
          witnessed by three public calendars that aggregate into the Bitcoin
          blockchain. Both ledgers are external to the project — neither the
          founder nor any agent can amend or back-date the public record.
        </p>
        <p>
          The full anchor-round ledgers are committed in
          <a
            href="https://github.com/brianonbased-dev/ai-ecosystem/tree/main/research/anchor-rounds"
            target="_blank"
            rel="noopener"
            ><code>research/anchor-rounds/</code></a
          >. This page is regenerated from
          <code>docs/public/provenance-manifest.json</code> on every site
          rebuild; the manifest is itself produced by
          <code>scripts/build-provenance-manifest.mjs</code> walking the
          ai-ecosystem research tree.
        </p>
      </footer>
    </template>
  </div>
</template>

<style scoped>
.prov-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
  font-family: var(--vp-font-family-base);
  color: var(--vp-c-text-1);
}

.prov-header h1 {
  font-size: 2.4rem;
  margin: 0 0 1rem;
  background: linear-gradient(135deg, #00ffff 0%, #ff00ff 50%, #ffff00 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.prov-sub {
  color: var(--vp-c-text-2);
  line-height: 1.55;
  margin: 0.4rem 0;
}

.prov-loading,
.prov-error {
  margin: 2rem 0;
  padding: 1rem 1.25rem;
  border: 1px dashed var(--vp-c-divider);
  border-radius: 8px;
  color: var(--vp-c-text-2);
}
.prov-error {
  border-color: #ff4488;
  color: #ff4488;
}

.prov-summary {
  margin: 2rem 0 1.5rem;
}

.prov-meta {
  font-size: 0.85rem;
  color: var(--vp-c-text-3);
  margin-bottom: 1rem;
}
.prov-meta code {
  background: var(--vp-c-bg-soft);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.85em;
}
.prov-sep {
  margin: 0 0.5rem;
}

.prov-totals {
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}
.prov-total-card {
  padding: 1rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
}
.prov-total-num {
  font-size: 1.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-brand-1);
  line-height: 1.1;
}
.prov-total-lbl {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  margin-top: 0.25rem;
}

.prov-buckets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.prov-bucket {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  border-radius: 999px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.prov-bucket:hover {
  background: var(--vp-c-bg-soft);
}
.prov-bucket.active {
  background: var(--vp-c-bg-soft);
  border-width: 1.5px;
}
.prov-bucket-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.prov-bucket-count {
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-3);
  font-size: 0.8rem;
  margin-left: 0.15rem;
}

.prov-filter-row {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}
.prov-filter-select,
.prov-filter-search {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.9rem;
  font-family: inherit;
}
.prov-filter-search {
  flex: 1 1 240px;
  min-width: 180px;
}

.prov-notes {
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border-left: 3px solid var(--vp-c-brand-1);
  padding: 0.85rem 1rem;
  border-radius: 0 6px 6px 0;
  line-height: 1.55;
}

.prov-list {
  margin-top: 1.5rem;
}

.prov-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  margin-bottom: 0.6rem;
  background: var(--vp-c-bg);
  transition: border-color 0.12s, background 0.12s;
}
.prov-card:hover {
  border-color: var(--vp-c-divider-hover, var(--vp-c-divider));
}
.prov-card.open {
  background: var(--vp-c-bg-soft);
}

.prov-card-head {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.85rem 1rem;
  cursor: pointer;
  user-select: none;
}

.prov-card-path {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.prov-status-pip {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.prov-card-pathcode {
  font-size: 0.92rem;
  word-break: break-all;
  color: var(--vp-c-text-1);
}

.prov-card-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem 0.9rem;
  font-size: 0.8rem;
  color: var(--vp-c-text-2);
  padding-left: 1.4rem;
}
.prov-tag {
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  padding: 1px 8px;
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
}
.prov-card-block {
  font-variant-numeric: tabular-nums;
}
.prov-card-when {
  color: var(--vp-c-text-3);
}
.prov-card-toggle {
  margin-left: auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}

.prov-card-body {
  padding: 0 1rem 1rem;
  border-top: 1px solid var(--vp-c-divider);
}

.prov-dl {
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: 0.4rem 1rem;
  margin: 0.85rem 0 0;
  font-size: 0.9rem;
}
.prov-dl dt {
  color: var(--vp-c-text-3);
  font-size: 0.82rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding-top: 2px;
}
.prov-dl dd {
  margin: 0;
  word-break: break-all;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
.prov-mono {
  font-family: var(--vp-font-family-mono);
  font-size: 0.82rem;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg-soft);
  padding: 1px 6px;
  border-radius: 3px;
}
.prov-cmd {
  font-family: var(--vp-font-family-mono);
  font-size: 0.85rem;
  background: var(--vp-c-bg-alt, var(--vp-c-bg-soft));
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-1);
}
.prov-link-prim {
  font-family: var(--vp-font-family-mono);
}
.prov-copy {
  font-size: 0.75rem;
  padding: 2px 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-2);
  border-radius: 4px;
  cursor: pointer;
}
.prov-copy:hover {
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}
.prov-drift-flag {
  background: rgba(255, 68, 136, 0.18);
  color: #ff4488;
  border: 1px solid #ff4488;
  font-size: 0.75rem;
  padding: 1px 8px;
  border-radius: 999px;
}
.prov-match-flag {
  background: rgba(0, 255, 170, 0.14);
  color: #00b58a;
  border: 1px solid #00b58a;
  font-size: 0.75rem;
  padding: 1px 8px;
  border-radius: 999px;
}
.prov-ots-status {
  color: var(--vp-c-text-3);
  font-size: 0.85em;
}

.prov-empty {
  padding: 2rem;
  text-align: center;
  color: var(--vp-c-text-3);
  border: 1px dashed var(--vp-c-divider);
  border-radius: 8px;
}

.prov-footer {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-2);
  font-size: 0.9rem;
  line-height: 1.55;
}
.prov-footer p {
  margin: 0.5rem 0;
}

@media (max-width: 720px) {
  .prov-totals {
    grid-template-columns: 1fr 1fr;
  }
  .prov-dl {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }
  .prov-dl dt {
    margin-top: 0.6rem;
  }
  .prov-card-summary {
    padding-left: 0;
  }
  .prov-header h1 {
    font-size: 1.8rem;
  }
}
</style>
