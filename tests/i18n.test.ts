import { test } from 'node:test';
import assert from 'node:assert/strict';
import { I18n, t, catalog, localesList } from '../src/i18n/index';

const EXPECTED_KEYS = ['export', 'import', 'addRow', 'addColumn', 'search', 'save', 'cancel', 'delete', 'edit', 'close'];

test('localesList reports at least 24 major-language locales', () => {
  assert.ok(localesList.length >= 24, `expected at least 24 locales, got ${localesList.length}`);
  assert.ok(localesList.includes('en'));
  assert.ok(localesList.includes('zh'));
  assert.ok(localesList.includes('ar'));
  assert.ok(localesList.includes('hi'));
  assert.ok(localesList.includes('es'));
});

test('every locale in the catalog has all expected keys, non-empty', () => {
  for (const code of localesList) {
    const entry = catalog[code];
    assert.ok(entry, `locale ${code} should exist in catalog`);
    for (const key of EXPECTED_KEYS) {
      assert.ok(entry![key], `locale ${code} is missing a translation for '${key}'`);
      assert.notEqual(entry![key], '', `locale ${code}.${key} should not be an empty string`);
    }
  }
});

test('t() resolves a known key for a known locale', () => {
  assert.equal(t('en', 'export'), 'Export');
  assert.equal(t('id', 'search'), 'Cari');
  assert.equal(t('ja', 'save'), '保存');
});

test('t() falls back to English for an unsupported locale', () => {
  assert.equal(t('xx', 'export'), 'Export');
});

test('t() falls back to the key itself for an unknown key', () => {
  assert.equal(t('en', 'totallyUnknownKey'), 'totallyUnknownKey');
});

test('t() handles BCP-47 locale tags with region subtags', () => {
  assert.equal(t('pt-BR', 'export'), catalog.pt!.export);
  assert.equal(t('zh-CN', 'search'), catalog.zh!.search);
});

test('I18n.isRtl is true for Arabic, Hebrew, Persian; false otherwise', () => {
  assert.equal(new I18n('ar-EG').isRtl(), true);
  assert.equal(new I18n('he-IL').isRtl(), true);
  assert.equal(new I18n('fa-IR').isRtl(), true);
  assert.equal(new I18n('en-US').isRtl(), false);
  assert.equal(new I18n('zh-CN').isRtl(), false);
});

test('I18n.formatNumber uses locale-appropriate separators', () => {
  const en = new I18n('en-US');
  assert.equal(en.formatNumber(1234.5), '1,234.5');
  const de = new I18n('de-DE');
  assert.equal(de.formatNumber(1234.5), '1.234,5');
});

test('I18n.formatCell handles null, boolean, number, and string uniformly', () => {
  const i18n = new I18n('en-US');
  assert.equal(i18n.formatCell(null), '');
  assert.equal(i18n.formatCell(true), 'TRUE');
  assert.equal(i18n.formatCell(false), 'FALSE');
  assert.equal(i18n.formatCell(1000), '1,000');
  assert.equal(i18n.formatCell('hello'), 'hello');
});
