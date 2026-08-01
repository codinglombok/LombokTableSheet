/**
 * Bundled catalogs for I18nManager — EN, ES, FR, DE, ZH, JA.
 *
 * These are separate from `src/i18n/locales/` (the flat 30-locale UI-string
 * catalog used by the older `t()` helper). This set is namespaced
 * (ui / messages / formulas / errors / plurals) and carries pluralization
 * and number/date formatting metadata, which the flat catalog does not.
 * Both ship; pick whichever surface a consumer needs.
 */

import type { Language, LanguageCatalog } from '../types.js';
import type { I18nManager } from '../manager.js';

import en from './en.js';
import es from './es.js';
import fr from './fr.js';
import de from './de.js';
import zh from './zh.js';
import ja from './ja.js';

export const catalogs: Record<Language, LanguageCatalog> = { en, es, fr, de, zh, ja };

export const bundledLanguages: readonly Language[] = ['en', 'es', 'fr', 'de', 'zh', 'ja'];

/** Register every bundled catalog on a manager. Returns the same manager. */
export function registerBundledCatalogs(manager: I18nManager): I18nManager {
  for (const lang of bundledLanguages) {
    manager.registerLanguage(lang, catalogs[lang]);
  }
  return manager;
}

export { en, es, fr, de, zh, ja };
