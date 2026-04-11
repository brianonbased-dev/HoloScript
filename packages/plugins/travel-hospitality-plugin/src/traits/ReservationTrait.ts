/** @reservation Trait — Booking and reservation management. @trait reservation */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ReservationStatus = 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export interface ReservationConfig { confirmationNumber: string; guestName: string; roomType: string; checkIn: string; checkOut: string; guests: number; ratePerNight: number; currency: string; specialRequests?: string; }
export interface ReservationState { status: ReservationStatus; totalNights: number; totalCost: number; }

const defaultConfig: ReservationConfig = { confirmationNumber: '', guestName: '', roomType: 'standard', checkIn: '', checkOut: '', guests: 1, ratePerNight: 0, currency: 'USD' };

export function createReservationHandler(): TraitHandler<ReservationConfig> {
  return { name: 'reservation', defaultConfig,
    onAttach(n: HSPlusNode, c: ReservationConfig, ctx: TraitContext) {
      const nights = c.checkIn && c.checkOut ? Math.max(1, Math.ceil((new Date(c.checkOut).getTime() - new Date(c.checkIn).getTime()) / 86400000)) : 1;
      n.__resState = { status: 'pending' as ReservationStatus, totalNights: nights, totalCost: nights * c.ratePerNight };
      ctx.emit?.('reservation:created', { confirmation: c.confirmationNumber, nights });
    },
    onDetach(n: HSPlusNode, _c: ReservationConfig, ctx: TraitContext) { delete n.__resState; ctx.emit?.('reservation:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: ReservationConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__resState as ReservationState | undefined; if (!s) return;
      if (e.type === 'reservation:confirm') { s.status = 'confirmed'; ctx.emit?.('reservation:confirmed'); }
      if (e.type === 'reservation:check_in') { s.status = 'checked_in'; ctx.emit?.('reservation:checked_in'); }
      if (e.type === 'reservation:check_out') { s.status = 'checked_out'; ctx.emit?.('reservation:checked_out', { total: s.totalCost }); }
      if (e.type === 'reservation:cancel') { s.status = 'cancelled'; ctx.emit?.('reservation:cancelled'); }
    },
  };
}
