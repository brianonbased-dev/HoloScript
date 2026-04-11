/** @culture Trait — Locale-aware cultural norms applied at compile-time.
 *
 * ```hsplus
 * @culture { locale: "ja-JP" dateFormat: "yyyy/MM/dd" textDirection: "ltr" numberFormat: "1,234.56" }
 * ```
 * @trait culture
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type TextDirection = 'ltr' | 'rtl' | 'auto';
export type CalendarSystem = 'gregorian' | 'islamic' | 'hebrew' | 'chinese' | 'japanese' | 'thai_buddhist';
export type MeasurementSystem = 'metric' | 'imperial' | 'us_customary';

export interface CultureConfig {
  locale: string;
  dateFormat: string;
  timeFormat: '12h' | '24h';
  numberFormat: string;
  currencyCode: string;
  currencySymbolPosition: 'prefix' | 'suffix';
  textDirection: TextDirection;
  calendar: CalendarSystem;
  measurement: MeasurementSystem;
  firstDayOfWeek: 0 | 1 | 6;
  pluralRules: 'one_other' | 'one_few_many_other' | 'one_two_few_many_other';
  honorificRequired: boolean;
  colorSemantics: Record<string, string>;
}

export interface CultureState {
  isApplied: boolean;
  warningsEmitted: string[];
  transformsApplied: number;
}

const defaultConfig: CultureConfig = {
  locale: 'en-US', dateFormat: 'MM/dd/yyyy', timeFormat: '12h', numberFormat: '1,234.56',
  currencyCode: 'USD', currencySymbolPosition: 'prefix', textDirection: 'ltr',
  calendar: 'gregorian', measurement: 'us_customary', firstDayOfWeek: 0,
  pluralRules: 'one_other', honorificRequired: false, colorSemantics: {}
};

export function createCultureHandler(): TraitHandler<CultureConfig> {
  return { name: 'culture', defaultConfig,
    onAttach(n: HSPlusNode, c: CultureConfig, ctx: TraitContext) {
      n.__cultureState = { isApplied: true, warningsEmitted: [], transformsApplied: 0 };
      ctx.emit?.('culture:applied', { locale: c.locale, direction: c.textDirection, calendar: c.calendar });
    },
    onDetach(n: HSPlusNode, _c: CultureConfig, ctx: TraitContext) { delete n.__cultureState; ctx.emit?.('culture:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: CultureConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__cultureState as CultureState | undefined; if (!s) return;
      if (e.type === 'culture:validate_text') {
        const text = (e.payload?.text as string) ?? '';
        const warnings: string[] = [];
        if (c.textDirection === 'rtl' && /[a-zA-Z]{10,}/.test(text)) warnings.push('Long LTR text in RTL locale');
        if (c.honorificRequired && !/Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|-san|-sama|-sensei/.test(text)) warnings.push('Missing honorific in locale requiring formal address');
        if (warnings.length > 0) { s.warningsEmitted.push(...warnings); ctx.emit?.('culture:validation_warnings', { warnings }); }
        else ctx.emit?.('culture:validation_passed');
      }
      if (e.type === 'culture:format_date') {
        const date = new Date((e.payload?.date as string) ?? Date.now());
        ctx.emit?.('culture:formatted_date', { format: c.dateFormat, locale: c.locale, iso: date.toISOString() });
        s.transformsApplied++;
      }
      if (e.type === 'culture:format_number') {
        const num = (e.payload?.value as number) ?? 0;
        ctx.emit?.('culture:formatted_number', { value: num, locale: c.locale, format: c.numberFormat });
        s.transformsApplied++;
      }
    },
  };
}
