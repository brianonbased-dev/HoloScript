/**
 * Invite Routes — Agent-first player onboarding
 *
 * GET  /api/hololand/invite/:token        — landing page data (agent name, expiry, claimed)
 * POST /api/hololand/invite/:token/claim  — claim: provision player + link to agent
 */

import type http from 'http';
import { json, parseJsonBody } from '../utils';
import { inviteStore } from '../state';
import { playerStore } from '../state';

export async function handleInviteRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {

  // GET /api/hololand/invite/:token
  const infoMatch = pathname.match(/^\/api\/hololand\/invite\/([^/]+)$/);
  if (infoMatch && method === 'GET') {
    const token = infoMatch[1];
    const invite = await inviteStore.get(token);

    if (!invite) {
      json(res, 404, { error: 'Invite not found' });
      return true;
    }

    if (inviteStore.isExpired(invite)) {
      json(res, 410, { error: 'Invite has expired' });
      return true;
    }

    // Return safe subset — don't expose internal IDs to unclaimed callers
    json(res, 200, {
      token: invite.token,
      agentId: invite.agentId,
      agentName: invite.agentName,
      agentHandle: invite.agentHandle,
      worldId: invite.worldId,
      claimed: inviteStore.isClaimed(invite),
      claimedAt: invite.claimedAt,
      expiresAt: invite.expiresAt,
    });
    return true;
  }

  // POST /api/hololand/invite/:token/claim
  const claimMatch = pathname.match(/^\/api\/hololand\/invite\/([^/]+)\/claim$/);
  if (claimMatch && method === 'POST') {
    const token = claimMatch[1];
    const invite = await inviteStore.get(token);

    if (!invite) {
      json(res, 404, { error: 'Invite not found' });
      return true;
    }

    if (inviteStore.isExpired(invite)) {
      json(res, 410, { error: 'This invite has expired. Ask your agent to generate a new one.' });
      return true;
    }

    if (inviteStore.isClaimed(invite)) {
      json(res, 409, { error: 'This invite has already been claimed.' });
      return true;
    }

    const body = await parseJsonBody(req);
    const playerName = (body?.name as string | undefined)?.trim();
    const walletAddress = (body?.walletAddress as string | undefined)?.trim();

    if (!playerName) {
      json(res, 400, { error: 'name is required' });
      return true;
    }

    // Provision the player
    const playerId = `player_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const player = {
      id: playerId,
      name: playerName,
      walletAddress: walletAddress || undefined,
      worldId: invite.worldId || undefined,
      status: 'active' as const,
      createdAt: now,
      modifiedAt: now,
    };

    playerStore.set(playerId, player);

    // Mark invite claimed
    const claimed = {
      ...invite,
      claimedAt: now,
      playerId,
      playerName,
    };
    await inviteStore.set(claimed);

    json(res, 200, {
      success: true,
      playerId,
      playerName,
      agentId: invite.agentId,
      agentName: invite.agentName,
      worldId: invite.worldId,
      message: `Welcome to HoloLand, ${playerName}. Your agent ${invite.agentName} is waiting.`,
    });
    return true;
  }

  return false;
}
