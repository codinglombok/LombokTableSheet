import { describe, it, test, beforeEach, afterEach } from 'node:test';
import { expect, jest } from './expect';
import { HostEngine } from '../src/engine/host-engine';
import { FormulaEngineError } from '../src/engine/errors';
import { plugin as anovaPlugin } from '../src/plugins/anova-plugin';
import type { AnovaOneWayResult } from '../src/stats/anova';
import enStrings from '../src/i18n/catalogs/en';
import esStrings from '../src/i18n/catalogs/es';
import jaStrings from '../src/i18n/catalogs/ja';

async function buildEngine(): Promise<HostEngine> {
  const engine = new HostEngine();
  engine.registerLanguage('en', enStrings);
  engine.registerLanguage('es', esStrings);
  engine.registerLanguage('ja', jaStrings);
  await engine.loadPlugin(anovaPlugin);
  return engine;
}

describe('ANOVA plugin wired into HostEngine — happy path', () => {
  test('ANOVA_ONEWAY and ANOVA_TWOWAY are both registered after loading one plugin', async () => {
    const engine = await buildEngine();
    expect(engine.listFormulaNames().sort()).toEqual(['ANOVA_ONEWAY', 'ANOVA_TWOWAY']);
  });

  test('ANOVA_ONEWAY produces the same result as calling anovaOneWay() directly', async () => {
    const engine = await buildEngine();
    const groups = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    const result = engine.evalFormula('ANOVA_ONEWAY', ...groups) as AnovaOneWayResult;
    expect(result.f_statistic).toBeGreaterThan(0);
    expect(result.groups).toHaveLength(3);
    expect(result.significant).toBe(result.p_value < result.alpha);
  });

  test('ANOVA_TWOWAY runs through the engine with factor names and alpha', async () => {
    const engine = await buildEngine();
    // 2x2 balanced design, 2 replicates per cell.
    const data = [
      [[1, 2], [3, 4]],
      [[5, 6], [7, 8]],
    ];
    const result = engine.evalFormula('ANOVA_TWOWAY', data, 'Diet', 'Exercise', 0.05);
    expect(result.factor_a.name).toBe('Diet');
    expect(result.factor_b.name).toBe('Exercise');
  });
});

describe('ANOVA plugin wired into HostEngine — localized labels', () => {
  test('getFormulaLabel resolves ANOVA_ONEWAY through formulas.anova_oneway per language', async () => {
    const engine = await buildEngine();
    expect(engine.getFormulaLabel('ANOVA_ONEWAY')).toBe((enStrings as any).formulas.anova_oneway);

    engine.i18n.setLanguage('es');
    expect(engine.getFormulaLabel('ANOVA_ONEWAY')).toBe((esStrings as any).formulas.anova_oneway);

    engine.i18n.setLanguage('ja');
    expect(engine.getFormulaLabel('ANOVA_ONEWAY')).toBe((jaStrings as any).formulas.anova_oneway);
  });

  test('getFormulaLabel resolves ANOVA_TWOWAY the same way', async () => {
    const engine = await buildEngine();
    engine.i18n.setLanguage('es');
    expect(engine.getFormulaLabel('ANOVA_TWOWAY')).toBe((esStrings as any).formulas.anova_twoway);
  });
});

describe('ANOVA plugin wired into HostEngine — localized errors', () => {
  test('too few groups (ANOVA_INSUFFICIENT_GROUPS) is localized via errors.insufficient_data', async () => {
    const engine = await buildEngine();
    let caught: FormulaEngineError | undefined;
    try {
      engine.evalFormula('ANOVA_ONEWAY', [1, 2, 3]); // only 1 group
    } catch (e) {
      caught = e as FormulaEngineError;
    }
    expect(caught).toBeInstanceOf(FormulaEngineError);
    expect(caught!.message).toBe((enStrings as any).errors.insufficient_data);
    // Technical detail preserved for logs, never shown as the user-facing message.
    expect(caught!.cause?.message).toContain('ANOVA_INSUFFICIENT_GROUPS');
  });

  test('an empty group (ANOVA_INSUFFICIENT_DATA) maps to the same localized key', async () => {
    const engine = await buildEngine();
    let caught: FormulaEngineError | undefined;
    try {
      engine.evalFormula('ANOVA_ONEWAY', [1, 2, 3], []); // second group empty
    } catch (e) {
      caught = e as FormulaEngineError;
    }
    expect(caught!.message).toBe((enStrings as any).errors.insufficient_data);
    expect(caught!.cause?.message).toContain('ANOVA_INSUFFICIENT_DATA');
  });

  test('the SAME error is localized differently depending on active language', async () => {
    const engine = await buildEngine();
    engine.i18n.setLanguage('es');
    let caughtEs: FormulaEngineError | undefined;
    try {
      engine.evalFormula('ANOVA_ONEWAY', [1, 2, 3]);
    } catch (e) {
      caughtEs = e as FormulaEngineError;
    }
    expect(caughtEs!.message).toBe((esStrings as any).errors.insufficient_data);
    expect(caughtEs!.message).not.toBe((enStrings as any).errors.insufficient_data);
  });

  test('onFormulaError hook observers receive the localized error, not raw English', async () => {
    const observed: string[] = [];
    const engine = new HostEngine();
    engine.registerLanguage('en', enStrings);
    engine.registerLanguage('ja', jaStrings);
    engine.plugins.register({
      name: 'err-watcher',
      version: '1.0.0',
      capabilities: ['hook-extension'],
      hooks: [{ hook: 'onFormulaError', callback: (_n: string, err: Error) => observed.push(err.message) }],
    });
    await engine.loadPlugin(anovaPlugin);
    engine.i18n.setLanguage('ja');

    expect(() => engine.evalFormula('ANOVA_ONEWAY', [1])).toThrow();
    expect(observed).toEqual([(jaStrings as any).errors.insufficient_data]);
  });
});
