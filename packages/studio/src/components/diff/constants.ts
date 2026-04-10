import type { DiffStatus } from './types';

export const STATUS_COLOR: Record<DiffStatus, string> = {
  added: 'text-green-400',
  removed: 'text-red-400',
  modified: 'text-amber-400',
  unchanged: 'text-studio-muted',
};

export const STATUS_BG: Record<DiffStatus, string> = {
  added: 'bg-green-950/40 border-green-800/40',
  removed: 'bg-red-950/40 border-red-800/40',
  modified: 'bg-amber-950/40 border-amber-800/40',
  unchanged: 'bg-studio-panel border-studio-border',
};

export const STATUS_BADGE: Record<DiffStatus, string> = {
  added: 'bg-green-900/60 text-green-300',
  removed: 'bg-red-900/60 text-red-300',
  modified: 'bg-amber-900/60 text-amber-300',
  unchanged: 'bg-studio-panel text-studio-muted',
};

export const LINE_BG: Record<string, string> = {
  added: 'bg-green-950/60 border-l-2 border-green-500',
  removed: 'bg-red-950/60 border-l-2 border-red-500',
  same: '',
};

export const LINE_COLOR: Record<string, string> = {
  added: 'text-green-300',
  removed: 'text-red-300',
  same: 'text-studio-muted/80',
};

export const LINE_PREFIX: Record<string, string> = {
  added: '+',
  removed: '-',
  same: ' ',
};
