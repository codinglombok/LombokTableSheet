import { describe, it, test, beforeEach, afterEach } from 'node:test';
import { expect, jest } from './expect';
import { PluginLoader } from '../src/plugins/loader';
import { PluginError } from '../src/plugins/types';

describe('PluginLoader.loadObject — validation', () => {
  test('accepts a well-formed plugin', () => {
    const p = PluginLoader.loadObject({ name: 'ok', version: '1.0.0', capabilities: [] });
    expect(p.name).toBe('ok');
  });

  test('rejects non-object input', () => {
    // @ts-expect-error intentionally invalid
    expect(() => PluginLoader.loadObject(null)).toThrow(PluginError);
    // @ts-expect-error intentionally invalid
    expect(() => PluginLoader.loadObject('nope')).toThrow(PluginError);
  });

  test('rejects missing name', () => {
    // @ts-expect-error intentionally invalid
    expect(() => PluginLoader.loadObject({ version: '1.0.0', capabilities: [] })).toThrow(/non-empty string "name"/);
  });

  test('rejects malformed version', () => {
    expect(() => PluginLoader.loadObject({ name: 'x', version: 'v1', capabilities: [] }))
      .toThrow(/invalid "version"/);
    expect(() => PluginLoader.loadObject({ name: 'x', version: '1.0', capabilities: [] }))
      .toThrow(/invalid "version"/);
  });

  test('rejects missing capabilities array', () => {
    // @ts-expect-error intentionally invalid
    expect(() => PluginLoader.loadObject({ name: 'x', version: '1.0.0' })).toThrow(/capabilities" array/);
  });

  test('accepts empty capabilities array', () => {
    expect(() => PluginLoader.loadObject({ name: 'x', version: '1.0.0', capabilities: [] })).not.toThrow();
  });

  test('rejects hooks that is not an array', () => {
    expect(() => PluginLoader.loadObject({
      name: 'x', version: '1.0.0', capabilities: [],
      // @ts-expect-error intentionally invalid
      hooks: 'nope',
    })).toThrow(/"hooks" must be an array/);
  });

  test('rejects unknown hook name', () => {
    expect(() => PluginLoader.loadObject({
      name: 'x', version: '1.0.0', capabilities: [],
      // @ts-expect-error intentionally invalid
      hooks: [{ hook: 'notARealHook', callback: () => {} }],
    })).toThrow(/unknown hook "notARealHook"/);
  });

  test('rejects hook with non-function callback', () => {
    expect(() => PluginLoader.loadObject({
      name: 'x', version: '1.0.0', capabilities: [],
      // @ts-expect-error intentionally invalid
      hooks: [{ hook: 'beforeFormulaEval', callback: 'not-a-fn' }],
    })).toThrow(/callback must be a function/);
  });

  test('accepts all 8 valid hook names', () => {
    const hookNames = [
      'beforeFormulaEval', 'afterFormulaEval', 'onFormulaError', 'registerFormula',
      'registerCodec', 'registerChart', 'onPluginLoad', 'onPluginUnload',
    ];
    const hooks = hookNames.map(hook => ({ hook, callback: () => {} }));
    expect(() => PluginLoader.loadObject({
      name: 'x', version: '1.0.0', capabilities: [],
      // @ts-expect-error hook is string here, matches HookName union at runtime
      hooks,
    })).not.toThrow();
  });

  test('accepts semver prerelease version shape', () => {
    expect(() => PluginLoader.loadObject({ name: 'x', version: '1.0.0-beta.1', capabilities: [] })).not.toThrow();
  });
});

describe('PluginLoader.loadFromPath', () => {
  test('rejects a path that does not resolve to a module', async () => {
    await expect(PluginLoader.loadFromPath('./this-module-does-not-exist-xyz'))
      .rejects.toThrow(/Failed to import plugin module/);
  });
});
