import { describe, it, test, beforeEach, afterEach } from 'node:test';
import { expect, jest } from './expect';
/**
 * LombokTableSheet I18n Tests
 * Tests all 6 languages: EN, ES, FR, DE, ZH, JA
 */

import { I18nManager, createI18n, getI18n } from '../src/i18n/manager';
import enStrings from '../src/i18n/catalogs/en';
import esStrings from '../src/i18n/catalogs/es';
import frStrings from '../src/i18n/catalogs/fr';
import deStrings from '../src/i18n/catalogs/de';
import zhStrings from '../src/i18n/catalogs/zh';
import jaStrings from '../src/i18n/catalogs/ja';

describe('I18nManager', () => {
  let i18n: I18nManager;

  beforeEach(() => {
    i18n = new I18nManager({ defaultLanguage: 'en' });
    i18n.registerLanguage('en', enStrings);
    i18n.registerLanguage('es', esStrings);
    i18n.registerLanguage('fr', frStrings);
    i18n.registerLanguage('de', deStrings);
    i18n.registerLanguage('zh', zhStrings);
    i18n.registerLanguage('ja', jaStrings);
  });

  describe('Language Management', () => {
    test('should set and get current language', () => {
      expect(i18n.getLanguage()).toBe('en');
      i18n.setLanguage('es');
      expect(i18n.getLanguage()).toBe('es');
    });

    test('should return list of available languages', () => {
      const langs = i18n.getAvailableLanguages();
      expect(langs).toContain('en');
      expect(langs).toContain('es');
      expect(langs).toContain('fr');
      expect(langs).toContain('de');
      expect(langs).toContain('zh');
      expect(langs).toContain('ja');
      expect(langs.length).toBe(6);
    });

    test('should fallback to fallback language if not registered', () => {
      i18n.setLanguage('it' as any); // Italian not registered
      expect(i18n.getLanguage()).toBe('en'); // Should fallback
    });

    test('should throw on registering invalid language', () => {
      expect(() => {
        i18n.registerLanguage('invalid' as any, {});
      }).toThrow();
    });
  });

  describe('Basic Translation (t)', () => {
    test('should translate simple keys', () => {
      expect(i18n.t('ui.ok')).toBe('OK');
      
      i18n.setLanguage('es');
      expect(i18n.t('ui.ok')).toBe('Aceptar');
      
      i18n.setLanguage('fr');
      expect(i18n.t('ui.ok')).toBe('OK');
      
      i18n.setLanguage('de');
      expect(i18n.t('ui.ok')).toBe('OK');
      
      i18n.setLanguage('zh');
      expect(i18n.t('ui.ok')).toBe('确定');
      
      i18n.setLanguage('ja');
      expect(i18n.t('ui.ok')).toBe('OK');
    });

    test('should translate messages', () => {
      i18n.setLanguage('en');
      expect(i18n.t('messages.welcome')).toBe('Welcome to LombokTableSheet');
      
      i18n.setLanguage('es');
      expect(i18n.t('messages.welcome')).toBe('Bienvenido a LombokTableSheet');
      
      i18n.setLanguage('de');
      expect(i18n.t('messages.welcome')).toBe('Willkommen bei LombokTableSheet');
    });

    test('should translate formula names', () => {
      i18n.setLanguage('en');
      expect(i18n.t('formulas.anova_oneway')).toBe('ANOVA One-Way');
      
      i18n.setLanguage('es');
      expect(i18n.t('formulas.anova_oneway')).toBe('ANOVA de una vía');
      
      i18n.setLanguage('zh');
      expect(i18n.t('formulas.anova_oneway')).toBe('单因素方差分析');
    });

    test('should translate error messages', () => {
      i18n.setLanguage('en');
      expect(i18n.t('errors.empty_field')).toBe('This field is required');
      
      i18n.setLanguage('fr');
      expect(i18n.t('errors.empty_field')).toBe('Ce champ est obligatoire');
    });

    test('should return key if translation not found', () => {
      expect(i18n.t('nonexistent.key')).toBe('nonexistent.key');
    });

    test('should replace variables in translations', () => {
      i18n.setLanguage('en');
      const result = i18n.t('errors.formula_error', { error: 'Division by zero' });
      expect(result).toContain('Division by zero');
    });
  });

  describe('Pluralization (tp)', () => {
    test('should handle singular forms', () => {
      i18n.setLanguage('en');
      expect(i18n.tp('plurals.row_count', 1)).toBe('1 row');
      
      i18n.setLanguage('es');
      expect(i18n.tp('plurals.row_count', 1)).toBe('1 fila');
    });

    test('should handle plural forms', () => {
      i18n.setLanguage('en');
      expect(i18n.tp('plurals.row_count', 5)).toBe('5 rows');
      
      i18n.setLanguage('es');
      expect(i18n.tp('plurals.row_count', 10)).toBe('10 filas');
    });

    test('should handle zero count', () => {
      i18n.setLanguage('en');
      expect(i18n.tp('plurals.row_count', 0)).toBe('No rows');
    });

    test('should work for all languages', () => {
      const languages = ['en', 'es', 'fr', 'de', 'zh', 'ja'] as const;
      languages.forEach(lang => {
        i18n.setLanguage(lang);
        const result = i18n.tp('plurals.selected_items', 3);
        expect(result).toContain('3');
      });
    });

    test('should replace variables in plural strings', () => {
      i18n.setLanguage('en');
      const result = i18n.tp('plurals.changes', 5, { additional: 'info' });
      expect(result).toContain('5 changes');
    });
  });

  describe('Number Formatting', () => {
    test('should format numbers according to locale', () => {
      i18n.setLanguage('en');
      expect(i18n.formatNumber(1234.56)).toBe('1,234.56');
      
      i18n.setLanguage('de');
      expect(i18n.formatNumber(1234.56)).toBe('1.234,56');
      
      i18n.setLanguage('es');
      expect(i18n.formatNumber(1234.56)).toBe('1.234,56');
      
      i18n.setLanguage('fr');
      expect(i18n.formatNumber(1234.56)).toBe('1 234,56');
    });

    test('should handle decimals parameter', () => {
      i18n.setLanguage('en');
      expect(i18n.formatNumber(1234.5678, 2)).toBe('1,234.57');
      expect(i18n.formatNumber(1234, 2)).toBe('1,234.00');
    });

    test('should format large numbers', () => {
      i18n.setLanguage('en');
      expect(i18n.formatNumber(1000000)).toBe('1,000,000');
      
      i18n.setLanguage('de');
      expect(i18n.formatNumber(1000000)).toBe('1.000.000');
    });
  });

  describe('Date Formatting', () => {
    test('should format dates according to locale', () => {
      const date = new Date(2026, 6, 28); // July 28, 2026
      
      i18n.setLanguage('en');
      expect(i18n.formatDate(date)).toBe('07/28/2026');
      
      i18n.setLanguage('es');
      expect(i18n.formatDate(date)).toBe('28/07/2026');
      
      i18n.setLanguage('de');
      expect(i18n.formatDate(date)).toBe('28.07.2026');
      
      i18n.setLanguage('zh');
      expect(i18n.formatDate(date)).toBe('2026-07-28');
    });

    test('should format time in 24h format', () => {
      const date = new Date(2026, 6, 28, 14, 30, 45);
      
      i18n.setLanguage('en');
      expect(i18n.formatTime(date)).toBe('14:30:45');
    });

    test('should format time in 12h format', () => {
      const date = new Date(2026, 6, 28, 14, 30, 45);
      
      i18n.setLanguage('en');
      const time12h = i18n.formatTime(date, '12h');
      expect(time12h).toContain('02:30:45 PM');
    });
  });

  describe('Language Metadata', () => {
    test('should return language info', () => {
      const info = i18n.getLanguageInfo('es');
      expect(info.code).toBe('es');
      expect(info.name).toBe('Español');
      expect(info.nPlurals).toBe(2);
    });

    test('should handle language with 1 plural form', () => {
      const info = i18n.getLanguageInfo('zh');
      expect(info.nPlurals).toBe(1);
    });

    test('should use current language if not specified', () => {
      i18n.setLanguage('ja');
      const info = i18n.getLanguageInfo();
      expect(info.code).toBe('ja');
    });
  });

  describe('Singleton Pattern', () => {
    test('createI18n should create a new instance', () => {
      const i18n1 = createI18n();
      const i18n2 = createI18n();
      // Both should be instances, but not same (new instance created)
      expect(i18n1).toBeDefined();
      expect(i18n2).toBeDefined();
    });

    test('getI18n should return the same instance', () => {
      const i18n1 = getI18n();
      const i18n2 = getI18n();
      expect(i18n1).toBe(i18n2);
    });
  });

  describe('All Languages Cross-Check', () => {
    test('all 6 languages should have required keys', () => {
      const requiredKeys = [
        'ui.ok', 'ui.cancel', 'ui.save',
        'messages.welcome', 'messages.goodbye',
        'formulas.anova_oneway', 'formulas.anova_twoway',
        'errors.invalid_input', 'errors.formula_error'
      ];

      const languages = ['en', 'es', 'fr', 'de', 'zh', 'ja'] as const;
      
      languages.forEach(lang => {
        i18n.setLanguage(lang);
        requiredKeys.forEach(key => {
          const value = i18n.t(key);
          expect(value).not.toBe(key); // Should be translated, not the key itself
          expect(value.length).toBeGreaterThan(0);
        });
      });
    });

    test('plurals should work for all languages', () => {
      const languages = ['en', 'es', 'fr', 'de', 'zh', 'ja'] as const;
      
      languages.forEach(lang => {
        i18n.setLanguage(lang);
        for (let count = 0; count <= 5; count++) {
          const result = i18n.tp('plurals.row_count', count);
          expect(result).toBeDefined();
          expect(result.length).toBeGreaterThan(0);
        }
      });
    });
  });

  describe('Performance', () => {
    test('translation lookup should be fast', () => {
      const iterations = 10000;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        i18n.t('ui.ok');
        i18n.t('messages.welcome');
        i18n.t('errors.invalid_input');
      }
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // Should complete 30k translations in < 100ms
    });

    test('language switching should be fast', () => {
      const iterations = 1000;
      const languages = ['en', 'es', 'fr', 'de', 'zh', 'ja'] as const;
      
      const start = Date.now();
      for (let i = 0; i < iterations; i++) {
        for (const lang of languages) {
          i18n.setLanguage(lang);
        }
      }
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // 6000 switches should complete in < 100ms
    });

    test('number formatting should be fast', () => {
      const iterations = 10000;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        i18n.formatNumber(Math.random() * 1000000, 2);
      }
      
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(200); // Should handle 10k number formats in < 200ms
    });
  });
});
