/**
 * LombokTableSheet I18n Manager
 * Handles language switching, string localization, pluralization, number/date formatting
 */

import type { Language, I18nOptions, LanguageCatalog } from './types.js';

type StringKey = string;

export class I18nManager {
  private currentLanguage: Language = 'en';
  private fallbackLanguage: Language = 'en';
  private strings: Map<Language, any> = new Map();
  private options: I18nOptions;

  constructor(options: Partial<I18nOptions> = {}) {
    this.options = {
      defaultLanguage: 'en',
      fallbackLanguage: 'en',
      formatNumbers: true,
      formatDates: true,
      pluralization: true,
      ...options,
    };
    this.currentLanguage = this.options.defaultLanguage;
    this.fallbackLanguage = this.options.fallbackLanguage;
  }

  /**
   * Register a language with its translations
   */
  registerLanguage(lang: Language, strings: LanguageCatalog): void {
    if (!this.isValidLanguage(lang)) {
      throw new Error(`Invalid language code: ${lang}`);
    }
    this.strings.set(lang, strings);
  }

  /**
   * Set current active language
   */
  setLanguage(lang: Language): boolean {
    if (!this.strings.has(lang)) {
      console.warn(`Language '${lang}' not registered. Falling back to '${this.fallbackLanguage}'`);
      this.currentLanguage = this.fallbackLanguage;
      return false;
    }
    this.currentLanguage = lang;
    return true;
  }

  /**
   * Get current active language
   */
  getLanguage(): Language {
    return this.currentLanguage;
  }

  /**
   * Get list of available languages
   */
  getAvailableLanguages(): Language[] {
    return Array.from(this.strings.keys()) as Language[];
  }

  /**
   * Get a translated string
   * @param key Dot-notation key path (e.g., 'ui.ok', 'messages.welcome')
   * @param variables Optional replacement variables for %key patterns
   */
  t(key: StringKey, variables?: Record<string, any>): string {
    const value = this.getNestedValue(key, this.currentLanguage);
    if (value === null) return key; // Fallback: return key if translation not found

    let result = typeof value === 'string' ? value : String(value);

    // Replace variables
    if (variables) {
      Object.entries(variables).forEach(([k, v]) => {
        result = result.replace(`%${k}`, String(v));
      });
    }

    return result;
  }

  /**
   * Get a pluralized string
   * @param key Dot-notation key to plurals object
   * @param count Number to determine plural form
   * @param variables Optional replacement variables
   */
  tp(key: StringKey, count: number, variables?: Record<string, any>): string {
    if (!this.options.pluralization) {
      return this.t(key, variables);
    }

    const pluralForms = this.getNestedValue(key, this.currentLanguage);
    if (!Array.isArray(pluralForms)) {
      return this.t(key, variables);
    }

    // Get the appropriate plural form, but cap it at available array length
    let pluralFormIndex = this.getPluralForm(count);
    pluralFormIndex = Math.min(pluralFormIndex, pluralForms.length - 1);
    
    const value = pluralForms[pluralFormIndex] || pluralForms[0];
    let result = typeof value === 'string' ? value : String(value);

    // Replace %n with count
    result = result.replace('%n', String(count));

    // Replace variables
    if (variables) {
      Object.entries(variables).forEach(([k, v]) => {
        result = result.replace(`%${k}`, String(v));
      });
    }

    return result;
  }

  /**
   * Format a number according to current language
   */
  formatNumber(value: number, decimals?: number): string {
    if (!this.options.formatNumbers) {
      return String(value);
    }

    const lang = this.currentLanguage;
    const formatting = this.strings.get(lang)?.formatting || {};
    const decimal = formatting.decimal_separator || '.';
    const thousands = formatting.thousands_separator || ',';

    const str = decimals !== undefined 
      ? value.toFixed(decimals) 
      : String(value);

    const parts = str.split('.');
    const intPart = parts[0] ?? '0';
    const decPart = parts[1];

    // Add thousands separators
    const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousands);
    
    return decPart !== undefined 
      ? intFormatted + decimal + decPart 
      : intFormatted;
  }

  /**
   * Format a date according to current language
   */
  formatDate(date: Date, format?: string): string {
    if (!this.options.formatDates) {
      return date.toISOString().slice(0, 10);
    }

    const lang = this.currentLanguage;
    const formatting = this.strings.get(lang)?.formatting || {};
    const dateFormat = format || formatting.date_format || 'YYYY-MM-DD';

    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();

    return dateFormat
      .replace('DD', d)
      .replace('MM', m)
      .replace('YYYY', String(y));
  }

  /**
   * Format a time according to current language
   */
  formatTime(date: Date, format?: string): string {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    const s = date.getSeconds().toString().padStart(2, '0');

    // Determine format (explicit parameter takes precedence)
    const timeFormat = format || '24h'; // Default to 24h

    if (timeFormat === '24h') {
      return `${h}:${m}:${s}`;
    }

    // 12h format
    const hour12 = (parseInt(h) % 12 || 12).toString().padStart(2, '0');
    const suffix = parseInt(h) >= 12 ? 'PM' : 'AM';
    return `${hour12}:${m}:${s} ${suffix}`;
  }

  /**
   * Get language metadata
   */
  getLanguageInfo(lang?: Language): { code: Language; name: string; nPlurals: number } {
    const target = lang || this.currentLanguage;
    const strings = this.strings.get(target);
    return {
      code: target,
      name: strings?.language_name || target,
      nPlurals: strings?.plural_forms || 2,
    };
  }

  /**
   * Internal: Get value from nested object using dot notation
   */
  private getNestedValue(key: StringKey, lang: Language): any {
    const strings = this.strings.get(lang);
    if (!strings) return null;

    const keys = key.split('.');
    let current = strings;

    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return null;
      }
    }

    return current;
  }

  /**
   * Internal: Get plural form index based on count
   * English/Spanish/French/German pluralization:
   *   0: zero form (count === 0)
   *   1: singular form (count === 1)
   *   2: plural form (count > 1)
   */
  private getPluralForm(count: number): number {
    if (count === 0) return 0;
    if (count === 1) return 1;
    return 2;
  }

  /**
   * Internal: Validate language code
   */
  private isValidLanguage(lang: any): lang is Language {
    return ['en', 'es', 'fr', 'de', 'zh', 'ja'].includes(lang);
  }
}

// Singleton instance
let instance: I18nManager | null = null;

export function createI18n(options?: Partial<I18nOptions>): I18nManager {
  instance = new I18nManager(options);
  return instance;
}

export function getI18n(): I18nManager {
  if (!instance) {
    instance = new I18nManager();
  }
  return instance;
}
