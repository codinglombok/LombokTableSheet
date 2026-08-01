/**
 * @lombok-formulas/anova — wires the WS-5 ANOVA implementation into the
 * plugin system as two formulas: ANOVA_ONEWAY and ANOVA_TWOWAY.
 *
 * This plugin has NO direct dependency on I18nManager — it declares
 * `labelKey` / `errorCodeMap` (see src/engine/formula-types.ts) and lets
 * HostEngine resolve those against whichever language is active. That's
 * the actual integration contract between WS-4 and WS-5: anova.ts's
 * existing error codes (ANOVA_INSUFFICIENT_GROUPS, ANOVA_INSUFFICIENT_DATA)
 * and the locale files' pre-existing `formulas.anova_oneway` /
 * `formulas.anova_twoway` / `errors.insufficient_data` keys were defined
 * in earlier sessions but never connected until now.
 */

import type { IPlugin } from './types.js';
import type { FormulaDef } from '../engine/formula-types.js';
import { anovaOneWay, anovaTwoWay } from '../stats/anova.js';

// Both of anova.ts's precondition errors are "not enough data" cases from
// the user's point of view — there is no separate locale string for
// "too few groups" vs "a group is empty", so both map to the same
// errors.insufficient_data key. The original English detail is preserved
// on FormulaEngineError.cause for logs/devtools.
const ANOVA_ERROR_MAP: Record<string, string> = {
  ANOVA_INSUFFICIENT_GROUPS: 'errors.insufficient_data',
  ANOVA_INSUFFICIENT_DATA: 'errors.insufficient_data',
};

const oneWayDef: FormulaDef = {
  name: 'ANOVA_ONEWAY',
  arity: -1,
  labelKey: 'formulas.anova_oneway',
  errorCodeMap: ANOVA_ERROR_MAP,
  fn: (...groups: number[][]) => anovaOneWay(groups),
};

const twoWayDef: FormulaDef = {
  name: 'ANOVA_TWOWAY',
  arity: -1,
  labelKey: 'formulas.anova_twoway',
  errorCodeMap: ANOVA_ERROR_MAP,
  fn: (data: number[][][], factorAName?: string, factorBName?: string, alpha?: number) =>
    anovaTwoWay(data, factorAName, factorBName, alpha),
};

export const plugin: IPlugin = {
  name: '@lombok-formulas/anova',
  version: '1.0.0',
  description: 'ANOVA one-way and two-way formulas (WS-5), localized via WS-4 i18n keys.',
  author: 'LombokTableSheet',
  license: 'Apache-2.0',
  capabilities: ['formula-extension'],

  hooks: [
    { hook: 'registerFormula', callback: () => oneWayDef },
    { hook: 'registerFormula', callback: () => twoWayDef },
  ],
};

export default plugin;
