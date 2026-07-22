import { CellValue } from '../core/model.js';
import locales, { supportedLocales } from './locales/index.js';

/** Thin wrapper over Intl.* so a future non-JS port has one clear surface to reimplement. */
export class I18n {
  locale: string;
  constructor(locale = 'en-US') {
    this.locale = locale;
  }

  formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.locale, opts).format(value);
  }

  formatCurrency(value: number, currency: string): string {
    return new Intl.NumberFormat(this.locale, { style: 'currency', currency }).format(value);
  }

  formatDate(value: Date, opts?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.locale, opts).format(value);
  }

  formatCell(value: CellValue): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') return this.formatNumber(value);
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    return String(value);
  }

  isRtl(): boolean {
    const rtlLangs = ['ar', 'he', 'fa', 'ur'];
    const primary = (this.locale.split('-')[0] ?? this.locale).toLowerCase();
    return rtlLangs.includes(primary);
  }
}

/**
 * UI-string catalog covering the app chrome (not cell data, which uses Intl
 * directly via I18n above). 30 locales — see src/i18n/locales/*.ts, one file
 * per language. These are best-effort translations of common UI terms, not
 * professionally certified; corrections are welcome (see USAGE.md).
 */
export const catalog: Record<string, Record<string, string>> = locales;

/** ISO 639-1 codes for every locale with a catalog entry. */
export const localesList: string[] = supportedLocales;

export function t(locale: string, key: string): string {
  const lang = (locale.split('-')[0] ?? locale).toLowerCase();
  return catalog[lang]?.[key] ?? catalog.en?.[key] ?? key;
}
