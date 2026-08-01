/**
 * LombokTableSheet i18n Framework Types
 * 6 languages: EN, ES, FR, DE, ZH (Simplified), JA (Japanese)
 */

export type Language = 'en' | 'es' | 'fr' | 'de' | 'zh' | 'ja';

export interface PluralRules {
  /** Return plural form index (0 = singular, 1 = plural, etc.) based on count */
  getPluralForm(count: number): number;
  /** Number of plural forms for this language (most have 1-2, some have 6) */
  nPlurals: number;
}

export interface FormattingOptions {
  locale: Language;
  decimal?: string;
  thousands?: string;
  dateFormat?: string; // 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
  timeFormat?: string; // 'HH:mm:ss' | '24h' | '12h'
}

export interface TranslationKey {
  [key: string]: string | { [pluralForm: number]: string };
}

export interface LanguageStrings {
  // UI elements
  ui: {
    ok: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    add: string;
    close: string;
    yes: string;
    no: string;
    loading: string;
    error: string;
    success: string;
    warning: string;
  };

  // Messages
  messages: {
    welcome: string;
    goodbye: string;
    'no_data_available': string;
    'operation_successful': string;
    'operation_failed': string;
    'confirm_delete': string;
    'unsaved_changes': string;
  };

  // Formulas & Stats (ANOVA support)
  formulas: {
    'anova_oneway': string;
    'anova_twoway': string;
    'sum': string;
    'average': string;
    'count': string;
    'min': string;
    'max': string;
  };

  // Pluralization rules
  plurals: {
    [key: string]: { [pluralForm: number]: string };
  };

  // Validation & errors
  errors: {
    'invalid_input': string;
    'empty_field': string;
    'out_of_range': string;
    'duplicate_value': string;
    'insufficient_data': string;
    'formula_error': string;
  };
}

export interface I18nOptions {
  defaultLanguage: Language;
  fallbackLanguage: Language;
  formatNumbers: boolean;
  formatDates: boolean;
  pluralization: boolean;
}

/** Number/date presentation defaults carried by each catalog. */
export interface CatalogFormatting {
  decimal_separator: string;
  thousands_separator: string;
  date_format: string;
  time_format: string;
}

/**
 * The on-disk shape of a language catalog (src/i18n/catalogs/<lang>.ts).
 *
 * Deliberately looser than `LanguageStrings`: `t()` resolves dot-notation
 * paths at runtime, so the manager only needs to know that the namespaces
 * exist and hold string maps. Keeping this permissive means adding a new
 * namespace to the catalogs does not require a type change here.
 */
export interface LanguageCatalog {
  language_code: string;
  language_name: string;
  direction: 'ltr' | 'rtl';
  plural_forms: number;
  ui: Record<string, string>;
  messages: Record<string, string>;
  formulas: Record<string, string>;
  errors: Record<string, string>;
  /** Ordered plural forms: index 0 = zero, 1 = singular, 2+ = plural. */
  plurals: Record<string, string[]>;
  formatting: CatalogFormatting;
}
