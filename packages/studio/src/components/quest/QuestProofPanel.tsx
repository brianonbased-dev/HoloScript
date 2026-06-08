'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FounderInboxItem } from '../../app/api/quest-proof/inbox/parse';
import type { ProposedAction } from '../../app/api/quest-proof/next-actions/nextActions';
import { ActionTile, StatusStrip, SayOrType, TapTarget, tokens } from '../console';
import { BrittneyVoiceFrontDoor } from './BrittneyVoiceFrontDoor';

import { questProofGuardReason } from '../../lib/questProofGuards';

type Status = 'OK' | 'WARN' | 'FAIL';

// ── Gate stats types (G1b) ────────────────────────────────────────────────────
interface GateStatsData {
  todayProposals: number;
  todayPushed: number;
  todayBounced: number;
  pendingVetting: number;
  last48hProposals: number;
  last48hPushed: number;
}
interface GateAlarm {
  alarm: string;
  reason: string;
  severity: 'warn' | 'critical';
}
interface GateStatsResponse {
  ok: boolean;
  stats: GateStatsData | null;
  alarms: GateAlarm[];
  summary: string;
}

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
  const [taskStatus, setTaskStatus] = useState<string | null>(null);
  const [filingTask, setFilingTask] = useState(false);
  const apiPath = useMemo(() => `${pathPrefix()}/api/quest-proof`, []);
  const taskApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/task`, []);
  const inboxApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/inbox`, []);
  const [inbox, setInbox] = useState<FounderInboxItem[]>([]);
  const nextActionsApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/next-actions`, []);
  const [nextActions, setNextActions] = useState<ProposedAction[]>([]);
  // Gate stats (G1b): counter tile + alarm state
  const gateStatsApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/gate-stats`, []);
  const [gateStats, setGateStats] = useState<GateStatsData | null>(null);
  const [gateAlarms, setGateAlarms] = useState<GateAlarm[]>([]);
  const [gateSummary, setGateSummary] = useState<string>('');
  const [board, setBoard] = useState<Record<string, unknown>[]>([]);
  const [decidingAll, setDecidingAll] = useState(false);
  const boardApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/board`, []);
  const decideApiPath = useMemo(() => `${pathPrefix()}/api/quest-proof/decide`, []);
  // N3 one-tap: chips mid-approval, and chips that just landed an approval (so
  // the tile shows "approved ✓" for a beat before the next poll drops them).
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvedIds, setApprovedIds] = useState<Record<string, true>>({});

  // Founder Board (Slice C): live team board so the founder sees open work.
  const loadBoard = useCallback(async () => {
    if (!clientReady) return;
    const res = await fetchWithTimeout(`${boardApiPath}`, {}, 2500);
    if (!res?.ok) return;
    const data = (await res.json()) as { ok?: boolean; board?: Record<string, unknown> };
    const tasks = Array.isArray(data.board?.tasks) ? data.board.tasks : [];
    setBoard(tasks as Record<string, unknown>[]);
  }, [boardApiPath, clientReady]);

  useEffect(() => {
    if (!clientReady) return undefined;
    void loadBoard();
    const interval = window.setInterval(() => void loadBoard(), 6000);
    return () => window.clearInterval(interval);
  }, [clientReady, loadBoard]);

  const decideAll = useCallback(async () => {
    if (decidingAll || board.length === 0) return;
    const openTasks = board.filter((t) => t.status === 'open');
    if (openTasks.length === 0) return;
    setDecidingAll(true);
    try {
      const res = await fetchWithTimeout(
        decideApiPath,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            taskIds: openTasks.map((t) => String(t.id)),
            action: 'done',
            summary: 'founder-console decide-all',
          }),
        },
        8000
      );
      if (res?.ok) {
        // Optimistically clear open tasks; next poll will reconcile.
        setBoard((prev) => prev.filter((t) => t.status !== 'open'));
      }
    } catch {
      /* transient — the 6s poll will reconcile */
    } finally {
      setDecidingAll(false);
    }
  }, [decidingAll, board, decideApiPath]);

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

  const loadNextActions = useCallback(async () => {
    if (!clientReady) return;
    const res = await fetchWithTimeout(`${nextActionsApiPath}?limit=4`, {}, 2500);
    if (!res?.ok) return;
    const data = (await res.json()) as { ok?: boolean; actions?: ProposedAction[] };
    setNextActions(Array.isArray(data.actions) ? data.actions : []);
  }, [nextActionsApiPath, clientReady]);

  useEffect(() => {
    if (!clientReady) return undefined;
    void loadNextActions();
    const interval = window.setInterval(() => void loadNextActions(), 6000);
    return () => window.clearInterval(interval);
  }, [clientReady, loadNextActions]);

  // Gate stats (G1b): poll /api/quest-proof/gate-stats every 30s (slower than inbox —
  // stats are aggregate counts, not real-time tiles; 30s is fine).
  const loadGateStats = useCallback(async () => {
    if (!clientReady) return;
    const res = await fetchWithTimeout(gateStatsApiPath, {}, 3000);
    if (!res?.ok) return;
    const data = (await res.json()) as GateStatsResponse;
    if (data.ok && data.stats) setGateStats(data.stats);
    if (Array.isArray(data.alarms)) setGateAlarms(data.alarms);
    if (typeof data.summary === 'string') setGateSummary(data.summary);
  }, [gateStatsApiPath, clientReady]);

  useEffect(() => {
    if (!clientReady) return undefined;
    void loadGateStats();
    const interval = window.setInterval(() => void loadGateStats(), 30000);
    return () => window.clearInterval(interval);
  }, [clientReady, loadGateStats]);

  const approveAction = useCallback(
    async (a: ProposedAction) => {
      if (approvingId) return;
      setApprovingId(a.id);
      try {
        const res = await fetchWithTimeout(
          nextActionsApiPath,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: a.taskId, intent: a.intent }),
          },
          4000
        );
        if (res?.ok) {
          setApprovedIds((prev) => ({ ...prev, [a.id]: true }));
          setLastOpened(a.taskId);
          window.setTimeout(() => {
            setNextActions((prev) => prev.filter((x) => x.id !== a.id));
          }, 1200);
        } else if (res?.status === 403 && a.href) {
          window.open(a.href, '_blank', 'noopener,noreferrer');
        }
      } catch {
        /* transient */
      } finally {
        setApprovingId(null);
      }
    },
    [approvingId, nextActionsApiPath]
  );

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

  const fileMessageTask = async (message: string) => {
    const text = message.trim();
    if (!text) {
      setTaskStatus('Write a message first.');
      return;
    }
    setFilingTask(true);
    setTaskStatus('Filing task...');
    const payload = {
      runId,
      message: text,
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
        message: text,
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

        {/* Gate counter tile (G1b) — always rendered when stats are available so the
            founder sees "0 pending" (gate healthy) vs "N pending" vs ALARM.
            An empty inbox with no counter tile would be ambiguous (gate broken? nothing pending?).
            R1: "empty inbox MUST mean nothing-pending, never pipe-broke." */}
        {gateStats !== null && (
          <div
            data-testid="gate-counter-tile"
            style={{
              marginTop: 16,
              border: `1px solid ${gateAlarms.length > 0 ? '#dc2626' : gateStats.pendingVetting > 0 ? '#f59e0b' : '#16a34a'}`,
              borderRadius: 10,
              background: gateAlarms.length > 0 ? '#1f0707' : gateStats.pendingVetting > 0 ? '#1a1000' : '#071a0f',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            {/* Left: icon + label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
              <span style={{ fontSize: 18 }}>
                {gateAlarms.length > 0 ? '🚨' : gateStats.pendingVetting > 0 ? '⏳' : '✅'}
              </span>
              <span
                style={{
                  fontWeight: 900,
                  fontSize: 14,
                  color: gateAlarms.length > 0 ? '#f87171' : gateStats.pendingVetting > 0 ? '#fbbf24' : '#4ade80',
                }}
              >
                Approval Gate
              </span>
            </div>
            {/* Middle: stat chips */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {gateStats.pendingVetting > 0 && (
                <span
                  style={{
                    background: '#78350f',
                    color: '#fde68a',
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {gateStats.pendingVetting} pending vetting
                </span>
              )}
              {gateStats.todayBounced > 0 && (
                <span
                  style={{
                    background: '#450a0a',
                    color: '#fca5a5',
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {gateStats.todayBounced} bounced today
                </span>
              )}
              {gateStats.todayPushed > 0 && (
                <span
                  style={{
                    background: '#052e16',
                    color: '#86efac',
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {gateStats.todayPushed} pushed
                </span>
              )}
              {gateStats.pendingVetting === 0 && gateStats.todayBounced === 0 && gateStats.todayPushed === 0 && (
                <span style={{ color: '#6b7280', fontSize: 12 }}>gate idle — nothing pending</span>
              )}
            </div>
            {/* Right: alarm messages */}
            {gateAlarms.length > 0 && (
              <div style={{ width: '100%', marginTop: 6 }}>
                {gateAlarms.map((a) => (
                  <div
                    key={a.alarm}
                    style={{
                      color: a.severity === 'critical' ? '#fca5a5' : '#fbbf24',
                      fontSize: 11,
                      marginTop: 2,
                      fontFamily: 'monospace',
                    }}
                  >
                    {a.severity === 'critical' ? '🚨' : '⚠️'} {a.alarm}: {a.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
              {inbox.map((item) => {
                // ── Pre-vetted badge + glance render (G2 — holoscript.founder-vetting.v1) ──
                // F.099: show, don't reference. When gate passed, render the badge inline
                // so the founder sees "✅ Pre-vetted · tests GREEN · reviewed by /critic · <glance>"
                // without needing to follow a link or look anything up.
                const vetted = item.preVetted && item.vetting;
                const badgeLabel = vetted
                  ? [
                      'Pre-vetted',
                      item.vetting!.tests === 'GREEN' ? 'tests GREEN' : null,
                      item.vetting!.reviewers.length > 0
                        ? `reviewed by ${item.vetting!.reviewers.join(', ')}`
                        : null,
                      item.vetting!.express ? 'express lane' : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : null;
                const glanceLine = vetted && item.vetting!.glance ? item.vetting!.glance : null;
                return (
                  <div key={item.id} style={{ display: 'grid', gap: 6 }}>
                    {vetted && (
                      <div
                        data-testid={`inbox-vetted-badge-${item.id}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: '#052e16',
                          border: '1px solid #16a34a',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#4ade80',
                        }}
                      >
                        <span style={{ fontSize: 14 }}>✅</span>
                        <span>{badgeLabel}</span>
                        {glanceLine && (
                          <span
                            style={{
                              color: '#86efac',
                              fontWeight: 400,
                              borderLeft: '1px solid #16a34a',
                              paddingLeft: 8,
                              marginLeft: 2,
                            }}
                          >
                            {glanceLine}
                          </span>
                        )}
                      </div>
                    )}
                    <ActionTile
                      key={item.id}
                      label={item.label}
                      sublabel={
                        vetted
                          ? `${item.kind} · ${item.pushedBy} · ${item.state} · holoscript.founder-vetting.v1`
                          : `${item.kind} · ${item.pushedBy} · ${item.state}`
                      }
                      actionLabel="Open"
                      href={item.url}
                      onTap={() => setLastOpened(item.url)}
                      testId={`inbox-${item.id}`}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* N4: BrittneyVoiceFrontDoor — replaces the inline next-actions tile.
            Adds a voice modality: Brittney reads the top actions aloud and
            listens for a spoken ordinal or label to approve. The onApprove
            callback is identical to the tap path; the safety gate is unchanged. */}
        <BrittneyVoiceFrontDoor
          actions={nextActions}
          onApprove={(a) => void approveAction(a)}
          approvingId={approvingId}
          approvedIds={approvedIds}
        />

        {board.length > 0 && (
          <div
            data-testid="board-tile"
            style={{
              marginTop: 16,
              border: '1px solid #b45309',
              borderRadius: 10,
              background: '#1c140b',
              padding: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ color: '#fbbf24', fontWeight: 900, fontSize: 16 }}>Board</span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                {board.length} tasks — tap Decide All to close open work
              </span>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {board.map((task) => (
                <div
                  key={String(task.id)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 48,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #334155',
                    background: '#111827',
                  }}
                >
                  <span style={{ display: 'grid', gap: 2 }}>
                    <span style={{ fontWeight: 700, fontSize: 15 }}>
                      {String(task.title ?? 'Untitled')}
                    </span>
                    <span style={{ color: '#64748b', fontSize: 12 }}>
                      {String(task.status ?? '?')} · P{Number(task.priority ?? 0)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => void decideAll()}
              disabled={decidingAll || board.filter((t) => t.status === 'open').length === 0}
              style={{
                marginTop: 12,
                minHeight: 44,
                border: 0,
                borderRadius: 8,
                color: 'white',
                background: decidingAll ? '#475569' : '#d97706',
                fontWeight: 800,
                fontSize: 15,
                width: '100%',
              }}
            >
              {decidingAll ? 'Deciding...' : 'Decide All'}
            </button>
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
              <ActionTile
                key={`quick-${page.id}`}
                label={`Open ${page.label}`}
                sublabel={page.focus}
                href={target}
                onTap={() => recordLaunch(page, target)}
                actionLabel="Launch"
                testId={`quick-${page.id}`}
              />
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
            <TapTarget onTap={() => void loadReceipts()} testId="refresh-receipts">
              Refresh
            </TapTarget>
          </div>

          <div style={{ marginTop: 12 }}>
            <StatusStrip
              cells={[
                { label: 'Total', value: receiptCount, tone: 'neutral' },
                { label: 'OK', value: counts.OK, tone: 'ok' },
                { label: 'WARN', value: counts.WARN, tone: 'warn' },
                { label: 'FAIL', value: counts.FAIL, tone: 'fail' },
                { label: 'INFO', value: counts.INFO, tone: 'neutral' },
                { label: 'Guarded', value: guardedPageCount, tone: 'neutral' },
              ]}
              testId="receipt-strip"
            />
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
          <SayOrType
            placeholder="Say what is broken, awkward, missing, or worth building next."
            onSubmit={(text) => void fileMessageTask(text)}
            busy={filingTask}
            submitLabel="Add As Task"
            testId="message-task"
          />
          {taskStatus && (
            <div style={{ color: '#bfdbfe', fontSize: 14, marginTop: 8 }}>{taskStatus}</div>
          )}
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
                                  onClick={() => recordLaunch(page, fallbackTarget!)}
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

                      <TapTarget
                        href={target}
                        onTap={() => recordLaunch(page, target)}
                        ariaLabel={
                          guardReason
                            ? `Open guarded fallback for ${page.label}`
                            : `Open ${page.label}`
                        }
                        testId={`open-${page.id}`}
                      >
                        {guardReason ? 'Open Fallback' : 'Open'}
                      </TapTarget>

                      <div
                        style={{
                          display: 'flex',
                          gap: 6,
                          flexWrap: 'wrap',
                          justifyContent: 'flex-end',
                        }}
                      >
                        {(['OK', 'WARN', 'FAIL'] as Status[]).map((status) => (
                          <TapTarget
                            key={status}
                            onTap={() => void mark(page, status)}
                            testId={`mark-${page.id}-${status}`}
                            style={{
                              width: 64,
                              background: statusColor(status),
                              opacity: saving !== null && saving !== page.id ? 0.55 : 1,
                            }}
                          >
                            {saving === page.id ? '...' : status}
                          </TapTarget>
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
            <TapTarget onTap={() => void loadReceipts()} testId="refresh-latest">
              Refresh
            </TapTarget>
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
