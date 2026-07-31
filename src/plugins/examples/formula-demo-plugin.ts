/**
 * @lombok-formulas/demo — Example formula-extension plugin.
 *
 * Registers a custom formula (TITLECASE) via the 'registerFormula' hook,
 * and demonstrates 'beforeFormulaEval' / 'onFormulaError' for lightweight
 * cross-cutting behavior (call logging, error counting) without touching
 * the core formula engine.
 *
 * This is a REFERENCE example — copy this file's shape when building a
 * real plugin. See PLUGIN_DEV_GUIDE.md for the full anatomy walkthrough.
 */

import type { IPlugin } from '../types.js';

function titleCase(input: string): string {
  return input
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export const plugin: IPlugin = {
  name: '@lombok-formulas/demo',
  version: '1.0.0',
  description: 'Adds a TITLECASE() text formula, plus eval logging.',
  author: 'LombokTableSheet',
  license: 'Apache-2.0',
  capabilities: ['formula-extension', 'hook-extension'],

  hooks: [
    {
      hook: 'registerFormula',
      callback: () => ({
        name: 'TITLECASE',
        arity: 1,
        fn: (text: string) => titleCase(String(text)),
      }),
    },
    {
      hook: 'beforeFormulaEval',
      callback: (formula: string) => {
        // Cheap, side-effect-free by design: hook callbacks run inline on
        // the eval path, so anything here should stay O(1) and non-blocking.
        return { formula, seenAt: Date.now() };
      },
    },
    {
      hook: 'onFormulaError',
      callback: (formula: string, error: Error) => {
        // eslint-disable-next-line no-console
        console.warn(`[@lombok-formulas/demo] "${formula}" failed: ${error.message}`);
      },
    },
  ],

  async init(_engine: unknown) {
    // Real plugins would register with the host engine here, e.g.
    // engine.formulas.register('TITLECASE', titleCase). Kept as a no-op
    // in this standalone example since hooks already cover registration.
  },
};

export default plugin;
