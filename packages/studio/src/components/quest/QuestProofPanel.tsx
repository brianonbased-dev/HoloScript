'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FounderInboxItem } from '../../app/api/quest-proof/inbox/parse';

import { questProofGuardReason } from '../../lib/questProofGuards';

type Status = 'OK' | 'WARN' | 'FAIL';

interface ProofPage {
  id: string;
  label: string;
  path: string;
  focus: string;
  group: 'Core XR' | 'Creation' | 'Simulation' | 'Capture';
  visualStatus: 'Ready' | 'Caution' | 'Skip';
  visualNote: string;
}

export interface ReceiptSummary {
  receivedAt: string;
  pageId: string;
  status: Status | 'INFO';
  label: string;
  detail: string;
  url?: string | null;
}

interface ReceiptApiResponse {
  count?: number;
  path?: string;
  receipts?: ReceiptSummary[];
}

type ReceiptCounts = Record<ReceiptSummary['status'], number>;

const EMPTY_COUNTS: ReceiptCounts = {
  OK: 0,
  WARN: 0,
  FAIL: 0,
  INFO: 0,
};

export function countReceipts(receipts: ReceiptSummary[]): ReceiptCounts {
  return receipts.reduce<ReceiptCounts>(
    (counts, receipt) => ({
      ...counts,
      [receipt.status]: counts[receipt.status] + 1,
    }),
    { ...EMPTY_COUNTS }
  );
}

export function latestReceiptsByPage(receipts: ReceiptSummary[]): Record<string, ReceiptSummary> {
  return receipts.reduce<Record<string, ReceiptSummary>>((latest, receipt) => {
    const previous = latest[receipt.pageId];
    if (!previous || Date.parse(receipt.receivedAt) >= Date.parse(previous.receivedAt)) {
      latest[receipt.pageId] = receipt;
    }
    return latest;
  }, {});
}

const PROOF_PAGES: ProofPage[] = [
  {
    id: 'quest-probe',
    label: 'Quest Probe',
    path: '/quest-probe',
    focus: 'WebXR, hands, passthrough, mic, fetch',
    group: 'Core XR',
    visualStatus: 'Ready',
    visualNote: 'Renders cleanly in local visual sweep.',
  },
  {
    id: 'examples/no-app-webxr',
    label: 'No-App WebXR',
    path: '/examples/no-app-webxr',
    focus: 'Enter VR, scene render, publish cube',
    group: 'Core XR',
    visualStatus: 'Ready',
    visualNote: 'Renders 3D preview and launch copy.',
  },
  {
    id: 'creator',
    label: 'Creator',
    path: '/creator',
    focus: 'Authoring layout, mobile/headset controls',
    group: 'Creation',
    visualStatus: 'Caution',
    visualNote: 'Guarded by proxy until authenticated desktop state is available.',
  },
  {
    id: 'create',
    label: 'Create',
    path: '/create',
    focus: 'Scene creation flow and input ergonomics',
    group: 'Creation',
    visualStatus: 'Caution',
    visualNote: 'Guarded by proxy until the editor first viewport stabilizes.',
  },
  {
    id: 'playground',
    label: 'Playground',
    path: '/playground',
    focus: 'Editor density and headset readability',
    group: 'Creation',
    visualStatus: 'Caution',
    visualNote: 'Renders after wait, but logs resource errors.',
  },
  {
    id: 'playground/locomotion',
    label: 'Locomotion',
    path: '/playground/locomotion',
    focus: 'Movement controls and comfort hints',
    group: 'Simulation',
    visualStatus: 'Caution',
    visualNote: 'Guarded by proxy until the locomotion first viewport is deterministic.',
  },
  {
    id: 'avatar',
    label: 'Avatar',
    path: '/avatar',
    focus: 'Humanoid surface and pose plausibility',
    group: 'Simulation',
    visualStatus: 'Caution',
    visualNote: 'Visually renders, but logs resource errors.',
  },
  {
    id: 'scan-room',
    label: 'Scan Room',
    path: '/scan-room',
    focus: 'Room-scale workflow and permission clarity',
    group: 'Capture',
    visualStatus: 'Ready',
    visualNote: 'Loads after a longer wait; use normally.',
  },
  {
    id: 'webcam-gaze-demo',
    label: 'Gaze Demo',
    path: '/webcam-gaze-demo',
    focus: 'Camera permissions and fallback copy',
    group: 'Capture',
    visualStatus: 'Ready',
    visualNote: 'Renders gaze UI and controls.',
  },
  {
    id: 'vibe',
    label: 'Vibe',
    path: '/vibe',
    focus: 'Generative flow on headset browser',
    group: 'Creation',
    visualStatus: 'Caution',
    visualNote: 'Renders after wait, but logs resource errors.',
  },
];

const GROUPS: ProofPage['group'][] = ['Core XR', 'Creation', 'Simulation', 'Capture'];

function defaultRunId(): string {
  return `${new Date().toISOString().slice(0, 10)}-quest-proof`;
}

function currentRunId(): string {
  if (typeof window === 'undefined') return defaultRunId();
  return new URLSearchParams(window.location.search).get('runId') ?? defaultRunId();
}

function pathPrefix(): string {
  if (typeof window === 'undefined') return '';
  const tunnel = window.location.pathname.match(/^\/t\/[^/]+/);
  if (tunnel) return tunnel[0];
  if (window.location.pathname.startsWith('/live/')) return '/live';
  return '';
}

export function proofPathWithRunId(path: string, runId: string, prefix = ''): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const separator = normalizedPath.includes('?') ? '&' : '?';
  return `${prefix}${normalizedPath}${separator}runId=${encodeURIComponent(runId)}`;
}

function withRunId(path: string, runId: string): string {
  return proofPathWithRunId(path, runId, pathPrefix());
}

function explicitFallbackPath(page: ProofPage): string | null {
  const reason = questProofGuardReason(page.path);
  if (!reason) return null;
  const query = new URLSearchParams({ target: page.path, reason });
  return `/quest-proof/unavailable?${query.toString()}`;
}

function viewport() {
  if (typeof window === 'undefined') return null;
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    orientation: screen.orientation?.type ?? null,
    crossOriginIsolated: self.crossOriginIsolated === true,
  };
}

function receiptTime(value: string): string {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return value;
  return new Date(time).toISOString().replace('T', ' ').slice(0, 19);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 3500
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

export function QuestProofPanel() {
  const [runId, setRunId] = useState(defaultRunId);
  const [clientReady, setClientReady] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [receiptCount, setReceiptCount] = useState(0);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [receiptLoadState, setReceiptLoadState] = useState<'loading' | 'ready' | 'unavailable'>(
    'loading'
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState('');
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [filingTask, setFilingTask] = useState(false);
  const apiPath = useMemo(() => `${pathPrefix()}/api/quest-proof`, []);
  const taskApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/task`, []);
  const inboxApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/inbox`, []);
  const [inbox, setInbox] = useState<FounderInboxItem[]>([]);

  useEffect(() => {
    setRunId(currentRunId());
    setClientReady(true);
  }, []);

  const loadReceipts = useCallback(async () => {
    if (!clientReady) return;
    const res = await fetchWithTimeout(`${apiPath}?runId=${encodeURIComponent(runId)}`, {}, 2500);
    if (!res?.ok) {
      setReceiptLoadState('unavailable');
      return;
    }
    const data = (await res.json()) as ReceiptApiResponse;
    const nextReceipts = data.receipts ?? [];
    setReceipts(nextReceipts);
    setReceiptCount(data.count ?? nextReceipts.length);
    setReceiptPath(data.path ?? null);
    setReceiptLoadState('ready');
  }, [apiPath, clientReady, runId]);

  useEffect(() => {
    if (!clientReady) return undefined;
    void loadReceipts();
    const interval = window.setInterval(() => void loadReceipts(), 6000);
    return () => window.clearInterval(interval);
  }, [clientReady, loadReceipts]);

  // Founder Inbox (F.085): poll artifacts agents PUSHED to the founder so he
  // opens them here instead of typing URLs into his Quest.
  const loadInbox = useCallback(async () => {
    if (!clientReady) return;
    const res = await fetchWithTimeout(`${inboxApiPath}?limit=25`, {}, 2500);
    if (!res?.ok) return;
    const data = (await res.json()) as { ok?: boolean; items?: FounderInboxItem[] };
    setInbox(Array.isArray(data.items) ? data.items : []);
  }, [inboxApiPath, clientReady]);

  useEffect(() => {
    if (!clientReady) return undefined;
    void loadInbox();
    const interval = window.setInterval(() => void loadInbox(), 6000);
    return () => window.clearInterval(interval);
  }, [clientReady, loadInbox]);

  const counts = useMemo(() => countReceipts(receipts), [receipts]);
  const latestByPage = useMemo(() => latestReceiptsByPage(receipts), [receipts]);
  const latestReceipt = receipts[receipts.length - 1];
  const guardedPageCount = useMemo(
    () => PROOF_PAGES.filter((page) => questProofGuardReason(page.path)).length,
    []
  );

  const mark = async (page: ProofPage, status: Status) => {
    setSaving(page.id);
    const payload = {
      runId,
      pageId: page.id,
      status,
      label: `${page.label} manual headset proof`,
      detail: notes[page.id] || page.focus,
      url: withRunId(page.path, runId),
      userAgent: navigator.userAgent,
      viewport: viewport(),
      checks: { focus: page.focus, manual: true },
    };
    const posted = await fetchWithTimeout(apiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((res) => res?.ok === true);
    if (!posted) {
      const query = new URLSearchParams({
        record: '1',
        runId,
        pageId: page.id,
        status,
        label: payload.label,
        detail: payload.detail,
        url: payload.url,
        userAgent: payload.userAgent,
      });
      await fetchWithTimeout(`${apiPath}?${query.toString()}`, { cache: 'no-store' }, 2500);
    }
    setSaving(null);
    await loadReceipts();
  };

  const recordLaunch = (page: ProofPage, target: string) => {
    setLastOpened(page.id);
    const guardReason = questProofGuardReason(page.path);
    const query = new URLSearchParams({
      record: '1',
      runId,
      pageId: page.id,
      status: 'INFO',
      label: guardReason
        ? `${page.label} guarded fallback opened from dashboard`
        : `${page.label} launched from dashboard`,
      detail: guardReason ? `${page.focus}; unavailable fallback: ${guardReason}` : page.focus,
      url: target,
      userAgent: navigator.userAgent,
    });
    void fetchWithTimeout(
      `${apiPath}?${query.toString()}`,
      { cache: 'no-store', keepalive: true },
      1200
    ).then(() => void loadReceipts());
  };

  const fileMessageTask = async () => {
    const message = taskMessage.trim();
    if (!message) {
      setTaskStatus('Write a message first.');
      return;
    }
    setFilingTask(true);
    setTaskStatus('Filing task...');
    const payload = {
      runId,
      message,
      pageId: 'quest-proof-dashboard',
      url: window.location.href,
      userAgent: navigator.userAgent,
      viewport: viewport(),
    };
    const postResult = await fetchWithTimeout(
      taskApiPath,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      20000
    ).then((res) =>
      res?.ok ? (res.json() as Promise<{ taskId?: string; title?: string }>) : null
    );
    let result = postResult;
    if (!result) {
      const query = new URLSearchParams({
        record: '1',
        runId,
        message,
        pageId: payload.pageId,
        url: payload.url,
        userAgent: payload.userAgent,
      });
      result = await fetchWithTimeout(
        `${taskApiPath}?${query.toString()}`,
        { cache: 'no-store' },
        25000
      ).then((res) =>
        res?.ok ? (res.json() as Promise<{ taskId?: string; title?: string }>) : null
      );
    }
    setFilingTask(false);
    if (result?.taskId) {
      setTaskStatus(`Filed ${result.taskId}`);
      setTaskMessage('');
      return;
    }
    setTaskStatus(result?.title ? `Filed task: ${result.title}` : 'Task filing failed.');
  };

  const statusColor = (status: Status | 'INFO') =>
    status === 'OK'
      ? '#22c55e'
      : status === 'WARN'
        ? '#f59e0b'
        : status === 'FAIL'
          ? '#ef4444'
          : '#60a5fa';

  const visualStatusColor = (status: ProofPage['visualStatus']) =>
    status === 'Ready' ? '#22c55e' : status === 'Caution' ? '#f59e0b' : '#ef4444';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#0b1020',
        color: '#e5e7eb',
        padding: 16,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <section style={{ maxWidth: 1040, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>Quest Proof Dashboard</h1>
            <p style={{ margin: 0, color: '#9ca3af', fontSize: 14 }}>
              Launch every headset proof page from here. Use browser Back to return and mark the
              result.
            </p>
          </div>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, color: '#9ca3af' }}>
            Run ID
            <input
              value={runId}
              onChange={(e) => setRunId(e.target.value)}
              style={{
                width: 260,
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid #334155',
                background: '#111827',
                color: '#e5e7eb',
              }}
            />
          </label>
        </div>

        {inbox.length > 0 && (
          <div
            data-testid="founder-inbox"
            style={{
              marginTop: 16,
              border: '1px solid #1f6feb',
              borderRadius: 10,
              background: '#0d1b3a',
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#60a5fa', fontWeight: 900, fontSize: 16 }}>Inbox</span>
              <span
                style={{
                  background: '#1f6feb',
                  color: '#fff',
                  borderRadius: 999,
                  padding: '2px 10px',
                  fontSize: 13,
                  fontWeight: 800,
                }}
              >
                {inbox.length}
              </span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>pushed to you by agents</span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {inbox.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setLastOpened(item.url)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 64,
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#111827',
                    color: '#e5e7eb',
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ display: 'grid', gap: 2 }}>
                    <span style={{ fontWeight: 800, fontSize: 16 }}>{item.label}</span>
                    <span style={{ color: '#64748b', fontSize: 12 }}>
                      {item.kind} · {item.pushedBy}
                    </span>
                  </span>
                  <span
                    style={{
                      background: '#1f6feb',
                      color: '#fff',
                      borderRadius: 8,
                      padding: '10px 18px',
                      fontWeight: 900,
                      fontSize: 15,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Open
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}
        >
          {PROOF_PAGES.slice(0, 2).map((page) => {
            const target = withRunId(page.path, runId);
            return (
              <a
                key={`quick-${page.id}`}
                href={target}
                onClick={() => recordLaunch(page, target)}
                style={{
                  display: 'block',
                  minHeight: 74,
                  border: '1px solid #334155',
                  borderRadius: 8,
                  background: lastOpened === page.id ? '#1d4ed8' : '#172554',
                  color: 'white',
                  padding: 14,
                  textAlign: 'left',
                  textDecoration: 'none',
                  fontWeight: 800,
                  fontSize: 16,
                }}
              >
                Open {page.label}
                <span
                  style={{
                    display: 'block',
                    color: '#bfdbfe',
                    fontSize: 13,
                    fontWeight: 500,
                    marginTop: 4,
                  }}
                >
                  {page.focus}
                </span>
              </a>
            );
          })}
        </div>

        <section
          aria-label="Current receipt summary"
          style={{
            marginTop: 16,
            border: '1px solid #243044',
            background: '#0f172a',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2 style={{ fontSize: 17, margin: 0 }}>Current Receipts</h2>
              <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
                {receiptLoadState === 'unavailable'
                  ? 'Receipt API is unavailable from this headset route; manual marks will still try the GET fallback.'
                  : latestReceipt
                    ? `Latest ${latestReceipt.status} from ${latestReceipt.pageId} at ${receiptTime(
                        latestReceipt.receivedAt
                      )}.`
                    : 'No live receipts have landed for this run yet.'}
              </p>
            </div>
            <button
              onClick={() => void loadReceipts()}
              style={{
                minHeight: 40,
                background: '#334155',
                color: 'white',
                border: 0,
                borderRadius: 6,
                padding: '8px 12px',
                fontWeight: 700,
              }}
            >
              Refresh
            </button>
          </div>
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(128px, 1fr))',
              gap: 8,
            }}
          >
            {[
              ['Total', receiptCount, '#e2e8f0'],
              ['OK', counts.OK, statusColor('OK')],
              ['WARN', counts.WARN, statusColor('WARN')],
              ['FAIL', counts.FAIL, statusColor('FAIL')],
              ['INFO', counts.INFO, statusColor('INFO')],
              ['Guarded', guardedPageCount, '#67e8f9'],
            ].map(([label, value, color]) => (
              <div
                key={label}
                style={{
                  minHeight: 64,
                  border: '1px solid #1f2937',
                  borderRadius: 8,
                  background: '#111827',
                  padding: 10,
                }}
              >
                <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>{label}</div>
                <div style={{ color: String(color), fontSize: 22, fontWeight: 900 }}>
                  {String(value)}
                </div>
              </div>
            ))}
          </div>
          {receiptPath && (
            <code
              style={{
                display: 'block',
                marginTop: 10,
                color: '#64748b',
                fontSize: 11,
                wordBreak: 'break-word',
              }}
            >
              {receiptPath}
            </code>
          )}
        </section>

        <section
          style={{
            marginTop: 16,
            border: '1px solid #315174',
            background: '#0f1b33',
            borderRadius: 8,
            padding: 12,
          }}
        >
          <h2 style={{ fontSize: 17, margin: '0 0 8px', color: '#dbeafe' }}>Message To Task</h2>
          <textarea
            value={taskMessage}
            onChange={(e) => setTaskMessage(e.target.value)}
            placeholder="Say what is broken, awkward, missing, or worth building next."
            style={{
              width: '100%',
              minHeight: 86,
              resize: 'vertical',
              borderRadius: 8,
              border: '1px solid #3b82f6',
              background: '#08111f',
              color: '#f8fafc',
              padding: 12,
              fontSize: 16,
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 10,
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={() => void fileMessageTask()}
              disabled={filingTask}
              style={{
                minHeight: 48,
                minWidth: 180,
                border: 0,
                borderRadius: 8,
                color: 'white',
                background: filingTask ? '#475569' : '#16a34a',
                fontWeight: 800,
                fontSize: 15,
              }}
            >
              {filingTask ? 'Filing...' : 'Add As Task'}
            </button>
            {taskStatus && <span style={{ color: '#bfdbfe', fontSize: 14 }}>{taskStatus}</span>}
          </div>
        </section>

        {GROUPS.map((group) => (
          <section key={group} style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 16, margin: '0 0 8px', color: '#cbd5e1' }}>{group}</h2>
            <div style={{ display: 'grid', gap: 10 }}>
              {PROOF_PAGES.filter((page) => page.group === group).map((page) => {
                const target = withRunId(page.path, runId);
                const guardReason = questProofGuardReason(page.path);
                const fallbackPath = explicitFallbackPath(page);
                const fallbackTarget = fallbackPath ? withRunId(fallbackPath, runId) : null;
                const latest = latestByPage[page.id];
                return (
                  <article
                    key={page.id}
                    style={{
                      border: '1px solid #243044',
                      background: '#111827',
                      borderRadius: 8,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                        gap: 10,
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ color: '#e5e7eb', fontWeight: 800, fontSize: 16 }}>
                          {page.label}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 5 }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              padding: '3px 8px',
                              borderRadius: 999,
                              background: '#020617',
                              color: visualStatusColor(page.visualStatus),
                              fontSize: 12,
                              fontWeight: 800,
                            }}
                          >
                            {page.visualStatus}
                          </div>
                          {guardReason && (
                            <div
                              style={{
                                display: 'inline-flex',
                                padding: '3px 8px',
                                borderRadius: 999,
                                background: '#083344',
                                color: '#67e8f9',
                                fontSize: 12,
                                fontWeight: 800,
                              }}
                            >
                              Guarded fallback
                            </div>
                          )}
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 4 }}>
                          {page.focus}
                        </div>
                        <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 4 }}>
                          {page.visualNote}
                        </div>
                        {guardReason && (
                          <div
                            style={{
                              color: '#bae6fd',
                              fontSize: 12,
                              marginTop: 6,
                              lineHeight: 1.45,
                            }}
                          >
                            Proxy fallback: {guardReason}
                            {fallbackTarget && (
                              <>
                                {' '}
                                <a
                                  href={fallbackTarget}
                                  onClick={() => recordLaunch(page, fallbackTarget)}
                                  style={{ color: '#67e8f9', fontWeight: 800 }}
                                >
                                  Open explicit fallback
                                </a>
                              </>
                            )}
                          </div>
                        )}
                        <div
                          style={{
                            color: latest ? statusColor(latest.status) : '#64748b',
                            fontSize: 12,
                            fontWeight: 700,
                            marginTop: 6,
                          }}
                        >
                          {latest
                            ? `Latest receipt: ${latest.status} - ${latest.label}: ${latest.detail}`
                            : 'No current-run receipt yet.'}
                        </div>
                        <code
                          style={{
                            display: 'block',
                            color: '#64748b',
                            fontSize: 11,
                            marginTop: 5,
                            wordBreak: 'break-word',
                          }}
                        >
                          {target}
                        </code>
                        {fallbackTarget && (
                          <code
                            style={{
                              display: 'block',
                              color: '#64748b',
                              fontSize: 11,
                              marginTop: 3,
                              wordBreak: 'break-word',
                            }}
                          >
                            Fallback {fallbackTarget}
                          </code>
                        )}
                      </div>
                      <a
                        href={target}
                        onClick={() => recordLaunch(page, target)}
                        aria-label={
                          guardReason
                            ? `Open guarded fallback for ${page.label}`
                            : `Open ${page.label}`
                        }
                        style={{
                          display: 'grid',
                          placeItems: 'center',
                          minHeight: 48,
                          border: 0,
                          borderRadius: 8,
                          color: 'white',
                          textDecoration: 'none',
                          background:
                            page.visualStatus === 'Skip'
                              ? '#475569'
                              : lastOpened === page.id
                                ? '#1d4ed8'
                                : '#2563eb',
                          fontWeight: 800,
                          fontSize: 15,
                          cursor: 'pointer',
                        }}
                      >
                        {guardReason ? 'Open Fallback' : 'Open'}
                      </a>
                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          flexWrap: 'wrap',
                          justifyContent: 'flex-end',
                        }}
                      >
                        {(['OK', 'WARN', 'FAIL'] as Status[]).map((status) => (
                          <button
                            key={status}
                            onClick={() => void mark(page, status)}
                            disabled={saving !== null}
                            style={{
                              width: 64,
                              minHeight: 40,
                              border: 0,
                              borderRadius: 6,
                              color: 'white',
                              background: statusColor(status),
                              fontWeight: 700,
                              opacity: saving !== null && saving !== page.id ? 0.55 : 1,
                            }}
                          >
                            {saving === page.id ? '...' : status}
                          </button>
                        ))}
                      </div>
                    </div>
                    <textarea
                      value={notes[page.id] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [page.id]: e.target.value }))}
                      placeholder="Observed issue, pass note, or repro detail"
                      style={{
                        marginTop: 10,
                        width: '100%',
                        minHeight: 54,
                        resize: 'vertical',
                        borderRadius: 6,
                        border: '1px solid #334155',
                        background: '#0f172a',
                        color: '#e5e7eb',
                        padding: 8,
                      }}
                    />
                  </article>
                );
              })}
            </div>
          </section>
        ))}

        <section style={{ marginTop: 18, borderTop: '1px solid #243044', paddingTop: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 10,
            }}
          >
            <h2 style={{ fontSize: 17, margin: 0 }}>Latest Receipts</h2>
            <button
              onClick={() => void loadReceipts()}
              style={{
                background: '#334155',
                color: 'white',
                border: 0,
                borderRadius: 6,
                padding: '8px 12px',
              }}
            >
              Refresh
            </button>
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
            {receipts
              .slice(-12)
              .reverse()
              .map((receipt, index) => (
                <div
                  key={`${receipt.receivedAt}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '92px minmax(120px, 180px) 1fr',
                    gap: 8,
                    fontSize: 13,
                    borderBottom: '1px solid #1f2937',
                    paddingBottom: 7,
                  }}
                >
                  <span style={{ color: statusColor(receipt.status), fontWeight: 700 }}>
                    {receipt.status}
                  </span>
                  <span style={{ color: '#cbd5e1' }}>{receipt.pageId}</span>
                  <span style={{ color: '#9ca3af', wordBreak: 'break-word' }}>
                    {receipt.label}: {receipt.detail}
                  </span>
                </div>
              ))}
            {receipts.length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 13 }}>No receipts yet for this run.</div>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
