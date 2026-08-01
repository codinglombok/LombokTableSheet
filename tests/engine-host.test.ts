import { describe, it, test, beforeEach, afterEach } from 'node:test';
import { expect, jest } from './expect';
import { HostEngine } from '../src/engine/host-engine';
import { FormulaEngineError } from '../src/engine/errors';
import type { IPlugin } from '../src/plugins/types';
import enStrings from '../src/i18n/catalogs/en';
import esStrings from '../src/i18n/catalogs/es';

function echoPlugin(name = 'echo'): IPlugin {
  return {
    name,
    version: '1.0.0',
    capabilities: ['formula-extension'],
    hooks: [{
      hook: 'registerFormula',
      callback: () => ({ name: 'ECHO', arity: 1, fn: (x: unknown) => x }),
    }],
  };
}

describe('HostEngine — plugin loading + formula table', () => {
  let engine: HostEngine;
  beforeEach(() => {
    engine = new HostEngine();
    engine.registerLanguage('en', enStrings);
  });

  test('loadPlugin registers the plugin AND populates the formula table', async () => {
    await engine.loadPlugin(echoPlugin());
    expect(engine.plugins.exists('echo')).toBe(true);
    expect(engine.hasFormula('ECHO')).toBe(true);
    expect(engine.listFormulaNames()).toEqual(['ECHO']);
  });

  test('evalFormula calls through to the plugin-provided fn', async () => {
    await engine.loadPlugin(echoPlugin());
    expect(engine.evalFormula('ECHO', 42)).toBe(42);
  });

  test('evalFormula on unknown formula throws a localized FormulaEngineError', async () => {
    expect(() => engine.evalFormula('NOPE')).toThrow(FormulaEngineError);
    try {
      engine.evalFormula('NOPE');
    } catch (e) {
      expect((e as FormulaEngineError).message).toContain('Invalid input'); // en locale string
      expect((e as FormulaEngineError).formulaName).toBe('NOPE');
    }
  });

  test('disablePlugin removes its formulas from the table; enablePlugin restores them', async () => {
    await engine.loadPlugin(echoPlugin());
    expect(engine.hasFormula('ECHO')).toBe(true);

    engine.disablePlugin('echo');
    expect(engine.hasFormula('ECHO')).toBe(false);

    engine.enablePlugin('echo');
    expect(engine.hasFormula('ECHO')).toBe(true);
  });

  test('unloadPlugin removes its formulas and calls destroy()', async () => {
    const destroySpy = jest.fn();
    const plugin = echoPlugin();
    plugin.destroy = destroySpy;
    await engine.loadPlugin(plugin);
    await engine.unloadPlugin('echo');
    expect(destroySpy).toHaveBeenCalledTimes(1);
    expect(engine.hasFormula('ECHO')).toBe(false);
    expect(engine.plugins.exists('echo')).toBe(false);
  });

  test('init(engine) receives the HostEngine instance itself', async () => {
    let received: unknown;
    const plugin: IPlugin = {
      name: 'init-probe',
      version: '1.0.0',
      capabilities: [],
      init: (eng: unknown) => { received = eng; },
    };
    await engine.loadPlugin(plugin);
    expect(received).toBe(engine);
  });

  test('a failed plugin.register (e.g. bad dependency) leaves the formula table untouched', async () => {
    await engine.loadPlugin(echoPlugin());
    const before = engine.listFormulaNames();

    const badPlugin: IPlugin = {
      name: 'bad',
      version: '1.0.0',
      capabilities: [],
      dependencies: { 'does-not-exist': '^1.0.0' },
    };
    await expect(engine.loadPlugin(badPlugin)).rejects.toThrow(/is not registered/);
    expect(engine.listFormulaNames()).toEqual(before);
  });

  test('a malformed registerFormula return value is ignored, not crashed on', async () => {
    const badFormulaPlugin: IPlugin = {
      name: 'malformed',
      version: '1.0.0',
      capabilities: ['formula-extension'],
      hooks: [
        { hook: 'registerFormula', callback: () => ({ noName: true }) }, // missing name/fn
        { hook: 'registerFormula', callback: () => ({ name: 'OK', fn: () => 1 }) },
      ],
    };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await engine.loadPlugin(badFormulaPlugin as unknown as IPlugin);
    expect(engine.listFormulaNames()).toEqual(['OK']);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('malformed value'));
    warnSpy.mockRestore();
  });
});

describe('HostEngine — hook dispatch around evalFormula', () => {
  test('beforeFormulaEval and afterFormulaEval fire on a successful call', async () => {
    const before: unknown[] = [];
    const after: unknown[] = [];
    const observer: IPlugin = {
      name: 'observer',
      version: '1.0.0',
      capabilities: ['hook-extension'],
      hooks: [
        { hook: 'beforeFormulaEval', callback: (name: string, args: unknown[]) => before.push([name, args]) },
        { hook: 'afterFormulaEval', callback: (name: string, result: unknown) => after.push([name, result]) },
      ],
    };
    const engine = new HostEngine();
    engine.registerLanguage('en', enStrings);
    await engine.loadPlugin(observer);
    await engine.loadPlugin(echoPlugin());

    engine.evalFormula('ECHO', 'hi');
    expect(before).toEqual([['ECHO', ['hi']]]);
    expect(after).toEqual([['ECHO', 'hi']]);
  });

  test('onFormulaError fires with the LOCALIZED error, not the raw one', async () => {
    const errors: unknown[] = [];
    const observer: IPlugin = {
      name: 'error-observer',
      version: '1.0.0',
      capabilities: ['hook-extension'],
      hooks: [{ hook: 'onFormulaError', callback: (name: string, err: Error) => errors.push([name, err.message]) }],
    };
    const throwingPlugin: IPlugin = {
      name: 'thrower',
      version: '1.0.0',
      capabilities: ['formula-extension'],
      hooks: [{
        hook: 'registerFormula',
        callback: () => ({
          name: 'BOOM',
          fn: () => { throw new Error('SOME_CODE: raw technical detail'); },
        }),
      }],
    };
    const engine = new HostEngine();
    engine.registerLanguage('en', enStrings);
    await engine.loadPlugin(observer);
    await engine.loadPlugin(throwingPlugin);

    expect(() => engine.evalFormula('BOOM')).toThrow(FormulaEngineError);
    // Generic fallback template ("Formula error: %error") filled with the
    // raw thrown message — NOT the raw error object/message on its own.
    expect(errors).toEqual([['BOOM', 'Formula error: SOME_CODE: raw technical detail']]);
  });
});

describe('HostEngine — i18n language switching affects labels and errors', () => {
  test('getFormulaLabel resolves through the active language', async () => {
    const engine = new HostEngine();
    engine.registerLanguage('en', enStrings);
    engine.registerLanguage('es', esStrings);

    const plugin: IPlugin = {
      name: 'labeled',
      version: '1.0.0',
      capabilities: ['formula-extension'],
      hooks: [{
        hook: 'registerFormula',
        callback: () => ({ name: 'SUM2', labelKey: 'formulas.sum', fn: (a: number, b: number) => a + b }),
      }],
    };
    await engine.loadPlugin(plugin);

    expect(engine.getFormulaLabel('SUM2')).toBe((enStrings as any).formulas.sum);
    engine.i18n.setLanguage('es');
    expect(engine.getFormulaLabel('SUM2')).toBe((esStrings as any).formulas.sum);
  });

  test('getFormulaLabel falls back to the bare name when no labelKey was declared', async () => {
    const engine = new HostEngine();
    engine.registerLanguage('en', enStrings);
    await engine.loadPlugin(echoPlugin());
    expect(engine.getFormulaLabel('ECHO')).toBe('ECHO');
  });
});
