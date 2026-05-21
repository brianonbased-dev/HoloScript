'use client';

import { useEffect, useMemo, useState } from 'react';

type Status = 'OK' | 'WARN' | 'FAIL';

interface ProofPage {
  id: string;
  label: string;
  path: string;
  fallbackPath?: string;
  focus: string;
  group: 'Core XR' | 'Creation' | 'Simulation' | 'Capture';
  visualStatus: 'Ready' | 'Caution' | 'Skip';
  visualNote: string;
}

interface ReceiptSummary {
  receivedAt: string;
  pageId: string;
  status: Status | 'INFO';
  label: string;
  detail: string;
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
    visualStatus: 'Ready',
    visualNote: 'Renders a sign-in-required surface when unauthenticated.',
  },
  {
    id: 'create',
    label: 'Create',
    path: '/create',
    fallbackPath:
      '/quest-proof/unavailable?target=create&reason=Create%20is%20not%20stable%20enough%20for%20headset%20proof%20yet.',
    focus: 'Scene creation flow and input ergonomics',
    group: 'Creation',
    visualStatus: 'Caution',
    visualNote: 'Launches to an explicit unavailable page until the editor stabilizes.',
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
    fallbackPath:
      '/quest-proof/unavailable?target=playground%2Flocomotion&reason=Locomotion%20preview%20timed%20out%20in%20visual%20preflight.',
    focus: 'Movement controls and comfort hints',
    group: 'Simulation',
    visualStatus: 'Caution',
    visualNote: 'Launches to an explicit unavailable page until the preview stabilizes.',
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

function withRunId(path: string, runId: string): string {
  const prefix = pathPrefix();
  const separator = path.includes('?') ? '&' : '?';
  return `${prefix}${path}${separator}runId=${encodeURIComponent(runId)}`;
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
  const [runId, setRunId] = useState(currentRunId);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [receipts, setReceipts] = useState<ReceiptSummary[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [lastOpened, setLastOpened] = useState<string | null>(null);
  const [taskMessage, setTaskMessage] = useState('');
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [filingTask, setFilingTask] = useState(false);
  const apiPath = useMemo(() => `${pathPrefix()}/api/quest-proof`, []);
  const taskApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/task`, []);

  const loadReceipts = async () => {
    const res = await fetchWithTimeout(`${apiPath}?runId=${encodeURIComponent(runId)}`, {}, 2500);
    if (!res?.ok) return;
    const data = (await res.json()) as { receipts?: ReceiptSummary[] };
    setReceipts(data.receipts ?? []);
  };

  useEffect(() => {
    void loadReceipts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

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
    const query = new URLSearchParams({
      record: '1',
      runId,
      pageId: page.id,
      status: 'INFO',
      label: `${page.label} launched from dashboard`,
      detail: page.focus,
      url: target,
      userAgent: navigator.userAgent,
    });
    void fetchWithTimeout(`${apiPath}?${query.toString()}`, { cache: 'no-store', keepalive: true }, 1200);
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
    const postResult = await fetchWithTimeout(taskApiPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 20000).then((res) =>
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

        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 10,
          }}
        >
          {PROOF_PAGES.slice(0, 2).map((page) => {
            const target = withRunId(page.fallbackPath ?? page.path, runId);
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
                const target = withRunId(page.fallbackPath ?? page.path, runId);
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
                      gridTemplateColumns: 'minmax(180px, 1fr) minmax(120px, 170px) auto',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ color: '#e5e7eb', fontWeight: 800, fontSize: 16 }}>
                        {page.label}
                      </div>
                      <div
                        style={{
                          display: 'inline-flex',
                          marginTop: 5,
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
                      <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>
                        {page.focus}
                      </div>
                      <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 4 }}>
                        {page.visualNote}
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
                        {withRunId(page.path, runId)}
                      </code>
                    </div>
                    <a
                      href={target}
                      onClick={() => recordLaunch(page, target)}
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
                      {page.fallbackPath ? 'Open Note' : 'Open'}
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
