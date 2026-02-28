'use client';

/**
 * User Cursor Component
 *
 * Renders remote user cursors in collaborative editing
 */

import { MousePointer2 } from 'lucide-react';
import type { UserPresence } from '@/lib/collaboration/types';

export interface UserCursorProps {
  user: UserPresence;
}

export function UserCursor({ user }: UserCursorProps) {
  if (!user.cursor) return null;

  const { x, y } = user.cursor;

  return (
    <div
      className="pointer-events-none fixed z-50 transition-all duration-100"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <MousePointer2
        className="h-5 w-5 drop-shadow-lg"
        style={{
          color: user.user.color,
          fill: user.user.color,
        }}
      />
      <div
        className="mt-1 rounded px-2 py-0.5 text-[10px] font-medium text-white shadow-lg"
        style={{
          backgroundColor: user.user.color,
        }}
      >
        {user.user.name}
      </div>
    </div>
  );
}

/**
 * User Cursors Container
 *
 * Renders all remote user cursors
 */

export interface UserCursorsProps {
  users: UserPresence[];
}

export function UserCursors({ users }: UserCursorsProps) {
  return (
    <>
      {users.map((user) => (
        <UserCursor key={user.user.id} user={user} />
      ))}
    </>
  );
}
