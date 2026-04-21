/** @public_meeting Trait — City council and public hearing management. @trait public_meeting */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type MeetingType = 'city_council' | 'planning_commission' | 'public_hearing' | 'zoning_board' | 'budget_session' | 'town_hall';
export type MeetingStatus = 'scheduled' | 'in_session' | 'recess' | 'public_comment' | 'voting' | 'adjourned' | 'cancelled';

export interface AgendaItem {
  id: string;
  title: string;
  type: 'presentation' | 'discussion' | 'action' | 'public_comment' | 'vote';
  durationMinutes: number;
  requiresVote: boolean;
}

export interface PublicMeetingConfig {
  meetingType: MeetingType;
  meetingId: string;
  title: string;
  scheduledAt: string; // ISO datetime
  location: string;
  quorumRequired: number;
  membersPresent: number;
  publicCommentMinutesPerSpeaker: number;
  agenda: AgendaItem[];
  streamUrl?: string;
  accessibilityFeatures: string[]; // e.g. ['captioning', 'sign_language', 'hearing_loop']
}

export interface PublicMeetingState {
  status: MeetingStatus;
  quorumMet: boolean;
  currentAgendaItemIndex: number;
  publicSpeakersRegistered: number;
  publicSpeakersHeard: number;
  minutesElapsed: number;
  recordingActive: boolean;
  lastUpdated: string;
}

const defaultConfig: PublicMeetingConfig = {
  meetingType: 'city_council',
  meetingId: '',
  title: '',
  scheduledAt: new Date().toISOString(),
  location: '',
  quorumRequired: 4,
  membersPresent: 0,
  publicCommentMinutesPerSpeaker: 3,
  agenda: [],
  accessibilityFeatures: ['captioning'],
};

export function createPublicMeetingHandler(): TraitHandler<PublicMeetingConfig> {
  return {
    name: 'public_meeting',
    defaultConfig,
    onAttach(node: HSPlusNode, config: PublicMeetingConfig, ctx: TraitContext) {
      node.__meetingState = {
        status: 'scheduled' as MeetingStatus,
        quorumMet: config.membersPresent >= config.quorumRequired,
        currentAgendaItemIndex: 0,
        publicSpeakersRegistered: 0,
        publicSpeakersHeard: 0,
        minutesElapsed: 0,
        recordingActive: false,
        lastUpdated: new Date().toISOString(),
      } satisfies PublicMeetingState;
      ctx.emit?.('meeting:scheduled', { meetingId: config.meetingId, type: config.meetingType });
    },
    onDetach(node: HSPlusNode, _config: PublicMeetingConfig, ctx: TraitContext) {
      delete node.__meetingState;
      ctx.emit?.('meeting:removed');
    },
    onUpdate(node: HSPlusNode, config: PublicMeetingConfig, ctx: TraitContext, delta: number) {
      const s = node.__meetingState as PublicMeetingState | undefined;
      if (!s) return;
      if (s.status === 'in_session' || s.status === 'public_comment') {
        s.minutesElapsed += delta / 60; // delta in seconds
      }
      const quorumMet = config.membersPresent >= config.quorumRequired;
      if (quorumMet !== s.quorumMet) {
        s.quorumMet = quorumMet;
        ctx.emit?.(quorumMet ? 'meeting:quorum_met' : 'meeting:quorum_lost', { meetingId: config.meetingId });
      }
      s.lastUpdated = new Date().toISOString();
    },
    onEvent(node: HSPlusNode, config: PublicMeetingConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__meetingState as PublicMeetingState | undefined;
      if (!s) return;
      switch (event.type) {
        case 'meeting:call_to_order':
          s.status = 'in_session';
          s.recordingActive = true;
          ctx.emit?.('meeting:called_to_order', { meetingId: config.meetingId, quorumMet: s.quorumMet });
          break;
        case 'meeting:open_public_comment':
          s.status = 'public_comment';
          ctx.emit?.('meeting:public_comment_open', { speakersRegistered: s.publicSpeakersRegistered });
          break;
        case 'meeting:register_speaker':
          s.publicSpeakersRegistered++;
          ctx.emit?.('meeting:speaker_registered', { total: s.publicSpeakersRegistered });
          break;
        case 'meeting:next_speaker':
          s.publicSpeakersHeard++;
          ctx.emit?.('meeting:speaker_started', { heard: s.publicSpeakersHeard, remaining: s.publicSpeakersRegistered - s.publicSpeakersHeard });
          break;
        case 'meeting:next_agenda_item':
          if (s.currentAgendaItemIndex < config.agenda.length - 1) {
            s.currentAgendaItemIndex++;
            const item = config.agenda[s.currentAgendaItemIndex];
            ctx.emit?.('meeting:agenda_advanced', { index: s.currentAgendaItemIndex, item: item?.title });
          }
          break;
        case 'meeting:adjourn':
          s.status = 'adjourned';
          s.recordingActive = false;
          ctx.emit?.('meeting:adjourned', { meetingId: config.meetingId, minutesElapsed: Math.round(s.minutesElapsed) });
          break;
      }
    },
  };
}
