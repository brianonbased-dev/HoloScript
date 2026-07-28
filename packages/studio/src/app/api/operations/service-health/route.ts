import { NextRequest, NextResponse } from 'next/server';
import { fetchHoloMeshJson } from '../../../../lib/holomesh-proxy';

const DEFAULT_TEAM = process.env.HOLOMESH_TEAM_ID ?? 'team_1777834718247_unr35n';

interface BoardTask {
  id?: string;
  title?: string;
  description?: string | null;
  status?: string;
  tags?: string[] | null;
  updatedAt?: string | null;
  completedAt?: string | null;
  timestamp?: string | null;
  createdAt?: string | null;
  summary?: string | null;
  verificationEvidence?: string | null;
  verification_evidence?: string | null;
}

interface BoardResponse {
  tasks?: BoardTask[];
  board?: {
    open?: BoardTask[];
    claimed?: BoardTask[];
    inProgress?: BoardTask[];
    blocked?: BoardTask[];
  };
}

interface DoneResponse {
  recent?: BoardTask[];
  tasks?: BoardTask[];
}

function flattenBoardTasks(boardData: BoardResponse | null): BoardTask[] {
  if (Array.isArray(boardData?.tasks)) return boardData.tasks;
  const board = boardData?.board ?? {};
  return [
    ...(Array.isArray(board.open) ? board.open : []),
    ...(Array.isArray(board.claimed) ? board.claimed : []),
    ...(Array.isArray(board.inProgress) ? board.inProgress : []),
    ...(Array.isArray(board.blocked) ? board.blocked : []),
  ];
}

function taskText(task: BoardTask): string {
  return [
    task.title,
    task.description,
    task.summary,
    task.verificationEvidence,
    task.verification_evidence,
  ]
    .filter(Boolean)
    .join('\n');
}

function isServiceHealthTask(task: BoardTask): boolean {
  const title = String(task.title || '').toLowerCase();
  const text = taskText(task).toLowerCase();
  const tags = Array.isArray(task.tags) ? task.tags.map((tag) => String(tag).toLowerCase()) : [];
  return (
    title.includes('[service-health]') ||
    title.includes('service health sweep') ||
    text.includes('[service-health]') ||
    tags.includes('service-health') ||
    tags.includes('automation:a-047-service-health-sweep')
  );
}

function taskTime(task?: BoardTask): string | undefined {
  return task?.updatedAt ?? task?.completedAt ?? task?.timestamp ?? task?.createdAt ?? undefined;
}

function parseDegradedServices(task?: BoardTask): string[] {
  if (!task) return [];
  const text = taskText(task);
  const degradedLine = text.match(/Degraded services:\s*([^\n]+)/i)?.[1]?.trim();
  if (degradedLine && !/^none$/i.test(degradedLine)) {
    return degradedLine
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const rows = [...text.matchAll(/^([^:\n]+):\s*live=.*?ok=no\s*$/gim)]
    .map((match) => match[1]?.trim())
    .filter((item): item is string => Boolean(item));
  return [...new Set(rows)];
}

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId') || DEFAULT_TEAM;
  const board = await fetchHoloMeshJson<BoardResponse>(
    `/api/holomesh/team/${encodeURIComponent(teamId)}/board?limit=500`,
    req
  );
  if (!board.ok) {
    return NextResponse.json(
      { ok: false, error: `board ${board.status}`, teamId },
      { status: board.status >= 400 ? board.status : 502 }
    );
  }

  const done = await fetchHoloMeshJson<DoneResponse>(
    `/api/holomesh/team/${encodeURIComponent(teamId)}/board/done?limit=20&offset=0`,
    req
  );

  const active = flattenBoardTasks(board.data)
    .filter((task) => isServiceHealthTask(task) && task.status !== 'done')
    .sort((a, b) => new Date(taskTime(b) ?? 0).getTime() - new Date(taskTime(a) ?? 0).getTime());
  const recentDone = (done.data?.recent ?? done.data?.tasks ?? [])
    .filter(isServiceHealthTask)
    .sort((a, b) => new Date(taskTime(b) ?? 0).getTime() - new Date(taskTime(a) ?? 0).getTime());

  const latest = active[0] ?? recentDone[0];
  const degradedServices = parseDegradedServices(latest);
  const details = latest
    ? taskText(latest)
        .split(/\r?\n/)
        .filter((line) => /live=|deploy=/.test(line))
    : [];
  const state =
    active.length > 0
      ? 'degraded'
      : latest
        ? degradedServices.length
          ? 'degraded'
          : 'ok'
        : 'unknown';

  return NextResponse.json({
    ok: true,
    teamId,
    status: {
      state,
      latest,
      activeCount: active.length,
      degradedServices,
      details,
      updatedAt: taskTime(latest),
      source: active.length > 0 ? 'active-board' : latest ? 'done-log' : 'board',
    },
  });
}
