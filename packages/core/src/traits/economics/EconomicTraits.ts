/**
 * Economic Primitive Traits: Tradeable, Depreciating, BondingCurved, TaxableWealth
 * @version 1.0.0
 */
export type Currency = string;
export interface PriceQuote { amount: number; currency: Currency; timestamp: number; expiresAt: number; }
export interface TradeReceipt { tradeId: string; seller: string; buyer: string; assetId: string; price: PriceQuote; completedAt: number; status: 'completed'|'escrowed'|'refunded'|'cancelled'; }

export class TradeableTrait {
  public readonly traitName = 'Tradeable';
  private basePrice: number; private currency: Currency; private requireEscrow: boolean;
  private currentOwner = ''; private history: TradeReceipt[] = [];
  private escrow: { buyer: string; price: PriceQuote } | null = null;
  private lastTrade = 0; private cooldown: number;
  constructor(cfg: { basePrice?: number; currency?: Currency; requireEscrow?: boolean; cooldown?: number } = {}) {
    this.basePrice = cfg.basePrice ?? 100; this.currency = cfg.currency ?? 'credits';
    this.requireEscrow = cfg.requireEscrow ?? true; this.cooldown = cfg.cooldown ?? 0;
  }
  setOwner(id: string) { this.currentOwner = id; }
  getOwner() { return this.currentOwner; }
  canTrade(): { allowed: boolean; reason?: string } {
    if (this.escrow) return { allowed: false, reason: 'In escrow' };
    if (this.cooldown > 0 && (Date.now()-this.lastTrade)/1000 < this.cooldown) return { allowed: false, reason: 'Cooldown' };
    return { allowed: true };
  }
  initiateTrade(buyer: string, price: PriceQuote): TradeReceipt {
    const r: TradeReceipt = { tradeId: `t_${Date.now()}`, seller: this.currentOwner, buyer, assetId: '', price, completedAt: Date.now(), status: this.requireEscrow ? 'escrowed' : 'completed' };
    if (!this.requireEscrow) { this.currentOwner = buyer; this.lastTrade = Date.now(); }
    else this.escrow = { buyer, price };
    this.history.push(r); return r;
  }
  confirmEscrow(): TradeReceipt|null {
    if (!this.escrow) return null;
    const r = this.history[this.history.length-1];
    this.currentOwner = this.escrow.buyer; this.escrow = null; this.lastTrade = Date.now();
    r.status = 'completed'; r.completedAt = Date.now(); return r;
  }
  getHistory() { return [...this.history]; }
}

export class DepreciatingTrait {
  public readonly traitName = 'Depreciating';
  private initialValue: number; private rate: number; private model: 'linear'|'exponential'|'step';
  private minValue: number; private stepInterval: number; private stepAmount: number; private createdAt: number;
  constructor(cfg: { initialValue?: number; rate?: number; model?: 'linear'|'exponential'|'step'; minValue?: number; stepInterval?: number; stepAmount?: number } = {}) {
    this.initialValue = cfg.initialValue ?? 1000; this.rate = cfg.rate ?? 0.0001;
    this.model = cfg.model ?? 'exponential'; this.minValue = cfg.minValue ?? 0;
    this.stepInterval = cfg.stepInterval ?? 3600; this.stepAmount = cfg.stepAmount ?? 10;
    this.createdAt = Date.now();
  }
  getCurrentValue(now?: number): number {
    const elapsed = ((now ?? Date.now()) - this.createdAt) / 1000;
    let v: number;
    switch (this.model) {
      case 'linear': v = this.initialValue - this.rate * elapsed; break;
      case 'exponential': v = this.initialValue * Math.exp(-this.rate * elapsed); break;
      case 'step': v = this.initialValue - Math.floor(elapsed/this.stepInterval) * this.stepAmount; break;
      default: v = this.initialValue;
    }
    return Math.max(v, this.minValue);
  }
}

export type CurveType = 'linear'|'quadratic'|'sigmoid'|'logarithmic';

export class BondingCurvedTrait {
  public readonly traitName = 'BondingCurved';
  private curveType: CurveType; private steepness: number; private reserveRatio: number;
  private supply: number; private reserve: number;
  constructor(cfg: { curveType?: CurveType; steepness?: number; reserveRatio?: number; initialSupply?: number } = {}) {
    this.curveType = cfg.curveType ?? 'quadratic'; this.steepness = cfg.steepness ?? 1;
    this.reserveRatio = cfg.reserveRatio ?? 0.5; this.supply = cfg.initialSupply ?? 1000;
    this.reserve = 0;
  }
  getPrice(supply?: number): number {
    const s = supply ?? this.supply;
    switch (this.curveType) {
      case 'linear': return this.steepness * s;
      case 'quadratic': return this.steepness * s * s;
      case 'sigmoid': return this.steepness / (1 + Math.exp(-s/1000));
      case 'logarithmic': return this.steepness * Math.log(s+1);
      default: return s;
    }
  }
  buy(amount: number) { let cost=0; for(let i=0;i<amount;i++) cost+=this.getPrice(this.supply+i); this.supply+=amount; this.reserve+=cost*this.reserveRatio; return{cost,newSupply:this.supply}; }
  sell(amount: number) { let rev=0; for(let i=0;i<amount;i++) rev+=this.getPrice(this.supply-i-1); rev*=this.reserveRatio; this.supply-=amount; this.reserve-=rev; return{revenue:rev,newSupply:this.supply}; }
  getSupply() { return this.supply; }
  getReserve() { return this.reserve; }
}

export interface TaxBracket { min: number; max: number; rate: number; }
export class TaxableWealthTrait {
  public readonly traitName = 'TaxableWealth';
  private brackets: TaxBracket[]; private exemption: number; private totalCollected=0; private lastCollection=Date.now(); private interval: number;
  constructor(cfg: { brackets?: TaxBracket[]; exemption?: number; interval?: number } = {}) {
    this.brackets = cfg.brackets ?? [{ min:0,max:1000,rate:0 },{ min:1000,max:10000,rate:0.05 },{ min:10000,max:100000,rate:0.10 },{ min:100000,max:Infinity,rate:0.15 }];
    this.exemption = cfg.exemption ?? 100; this.interval = cfg.interval ?? 86400;
  }
  calculateTax(wealth: number): number {
    if (wealth <= this.exemption) return 0;
    let tax=0; for(const b of this.brackets) { if(wealth > b.min) tax += (Math.min(wealth,b.max)-b.min)*b.rate; } return tax;
  }
  collectTax(wealth: number) { const t=this.calculateTax(wealth); this.totalCollected+=t; this.lastCollection=Date.now(); return{taxAmount:t,netWealth:wealth-t}; }
  getEffectiveRate(w: number) { return w>0 ? this.calculateTax(w)/w : 0; }
  getTotalCollected() { return this.totalCollected; }
  isDue() { return (Date.now()-this.lastCollection)/1000 >= this.interval; }
}
