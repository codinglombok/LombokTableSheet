export { Workbook, Sheet, Cell, CellValue, CellRef, Merge, ColumnType } from './core/model.js';
export { splitByRows, splitByColumns, splitBySheet, merge, ConflictStrategy } from './core/splitMerge.js';
export { decodeCsv, encodeCsv, ImportResult, ImportWarning } from './formats/csv.js';
export { decodeJson, encodeJson, encodeMarkdown } from './formats/json.js';
export { decodeXlsx, encodeXlsx } from './formats/xlsx.js';
export { decodeHtml, encodeHtml } from './formats/html.js';
export { TemplateRegistry, defaultTemplates, TableTemplate } from './templates/registry.js';
export { I18n, t, catalog, localesList } from './i18n/index.js';
export { LombokTable, TableOptions } from './adapters/dom.js';
export { LombokSheet, SheetOptions } from './adapters/sheet.js';
export {
  parseFormula, evaluate, makeSheetResolver, extractDependencies,
  parseCellRef, cellRefName, FormulaError, FormulaValue, Node as FormulaNode,
} from './core/formula.js';
export { TransactionalSheet, Transaction, CellEdit, CommitResult } from './core/transaction.js';
export {
  PluginRegistry, pluginRegistry, PluginLoader, PluginError, ALL_HOOK_NAMES,
  parseVersion, compareVersions, satisfies,
} from './plugins/index.js';
export type {
  IPlugin, HookName, HookDefinition, PluginCapability,
  PluginMetadata, PluginRegistryEntry, RegisterOptions, ParsedVersion,
} from './plugins/index.js';
export { I18nManager, createI18n, getI18n } from './i18n/manager.js';
export { catalogs, bundledLanguages, registerBundledCatalogs } from './i18n/catalogs/index.js';
export type {
  Language, I18nOptions, LanguageCatalog, LanguageStrings,
  CatalogFormatting, FormattingOptions, PluralRules,
} from './i18n/types.js';
export {
  anovaOneWay, anovaTwoWay, fDistPValue, incompleteBeta, logGamma, round4,
} from './stats/anova.js';
export type {
  AnovaGroupStats, AnovaOneWayResult, AnovaTwoWayResult, AnovaFactorResult,
} from './stats/anova.js';
export { HostEngine } from './engine/host-engine.js';
export { FormulaEngineError } from './engine/errors.js';
export type { FormulaDef } from './engine/formula-types.js';
export { plugin as anovaPlugin } from './plugins/anova-plugin.js';
