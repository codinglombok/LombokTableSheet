import { describe, it, test, beforeEach, afterEach } from 'node:test';
import { expect, jest } from './expect';
import { PluginRegistry } from '../src/plugins/registry';
import { PluginError } from '../src/plugins/types';
import type { IPlugin } from '../src/plugins/types';

function makePlugin(overrides: Partial<IPlugin> = {}): IPlugin {
  return {
    name: 'demo',
    version: '1.0.0',
    capabilities: [],
    ...overrides,
  };
}

describe('PluginRegistry — register / list / basic lifecycle', () => {
  let reg: PluginRegistry;
  beforeEach(() => { reg = new PluginRegistry(); });

  test('register + list', () => {
    reg.register(makePlugin());
    expect(reg.list()).toHaveLength(1);
    expect(reg.list()[0].name).toBe('demo');
  });

  test('duplicate registration throws PluginError', () => {
    reg.register(makePlugin());
    expect(() => reg.register(makePlugin())).toThrow(PluginError);
    expect(() => reg.register(makePlugin())).toThrow(/already registered/);
  });

  test('rejects plugin with missing name', () => {
    expect(() => reg.register(makePlugin({ name: '' }))).toThrow(/non-empty string "name"/);
  });

  test('rejects plugin with missing version', () => {
    expect(() => reg.register(makePlugin({ version: undefined }))).toThrow(/must have a "version"/);
  });

  test('exists()', () => {
    expect(reg.exists('demo')).toBe(false);
    reg.register(makePlugin());
    expect(reg.exists('demo')).toBe(true);
  });

  test('count()', () => {
    expect(reg.count()).toBe(0);
    reg.register(makePlugin({ name: 'a' }));
    reg.register(makePlugin({ name: 'b' }));
    expect(reg.count()).toBe(2);
  });

  test('get() returns the plugin object', () => {
    const p = makePlugin();
    reg.register(p);
    expect(reg.get('demo')).toBe(p);
    expect(reg.get('missing')).toBeUndefined();
  });

  test('registration order preserved in list()', () => {
    reg.register(makePlugin({ name: 'c' }));
    reg.register(makePlugin({ name: 'a' }));
    reg.register(makePlugin({ name: 'b' }));
    expect(reg.list().map(p => p.name)).toEqual(['c', 'a', 'b']);
  });
});

describe('PluginRegistry — enable / disable', () => {
  let reg: PluginRegistry;
  beforeEach(() => { reg = new PluginRegistry(); });

  test('disable removes plugin from list() but not from registry', () => {
    reg.register(makePlugin());
    reg.disable('demo');
    expect(reg.list()).toHaveLength(0);
    expect(reg.exists('demo')).toBe(true);
    expect(reg.isEnabled('demo')).toBe(false);
  });

  test('re-enable restores it to list()', () => {
    reg.register(makePlugin());
    reg.disable('demo');
    reg.enable('demo');
    expect(reg.list()).toHaveLength(1);
    expect(reg.isEnabled('demo')).toBe(true);
  });

  test('enable/disable on unknown plugin is a silent no-op', () => {
    expect(() => reg.enable('nope')).not.toThrow();
    expect(() => reg.disable('nope')).not.toThrow();
  });

  test('disabled plugin hooks do not run', () => {
    const calls: string[] = [];
    reg.register(makePlugin({
      hooks: [{ hook: 'beforeFormulaEval', callback: () => calls.push('ran') }],
    }));
    reg.disable('demo');
    reg.runHook('beforeFormulaEval');
    expect(calls).toEqual([]);
  });
});

describe('PluginRegistry — unregister', () => {
  let reg: PluginRegistry;
  beforeEach(() => { reg = new PluginRegistry(); });

  test('unregister removes the plugin', () => {
    reg.register(makePlugin());
    reg.unregister('demo');
    expect(reg.exists('demo')).toBe(false);
  });

  test('unregister of unknown plugin is a no-op', () => {
    expect(() => reg.unregister('nope')).not.toThrow();
  });

  test('unregister fires onPluginUnload hook of OTHER plugins', () => {
    const calls: string[] = [];
    reg.register(makePlugin({
      name: 'watcher',
      hooks: [{ hook: 'onPluginUnload', callback: (name: string) => calls.push(name) }],
    }));
    reg.register(makePlugin({ name: 'target' }));
    reg.unregister('target');
    expect(calls).toEqual(['target']);
  });

  test('refuses to unregister a plugin that others still depend on', () => {
    reg.register(makePlugin({ name: 'core', version: '1.0.0' }));
    reg.register(makePlugin({ name: 'consumer', dependencies: { core: '^1.0.0' } }));
    expect(() => reg.unregister('core')).toThrow(/still required by consumer/);
  });

  test('force=true bypasses the dependent check', () => {
    reg.register(makePlugin({ name: 'core', version: '1.0.0' }));
    reg.register(makePlugin({ name: 'consumer', dependencies: { core: '^1.0.0' } }));
    expect(() => reg.unregister('core', true)).not.toThrow();
    expect(reg.exists('core')).toBe(false);
  });

  test('findDependents lists every plugin declaring the dependency', () => {
    reg.register(makePlugin({ name: 'core', version: '1.0.0' }));
    reg.register(makePlugin({ name: 'a', dependencies: { core: '^1.0.0' } }));
    reg.register(makePlugin({ name: 'b', dependencies: { core: '^1.0.0' } }));
    expect(reg.findDependents('core').sort()).toEqual(['a', 'b']);
  });
});

describe('PluginRegistry — dependency resolution', () => {
  let reg: PluginRegistry;
  beforeEach(() => { reg = new PluginRegistry(); });

  test('registers successfully when dependency is present and version satisfies range', () => {
    reg.register(makePlugin({ name: 'core', version: '1.2.0' }));
    expect(() => reg.register(makePlugin({ name: 'ext', dependencies: { core: '^1.0.0' } }))).not.toThrow();
  });

  test('throws when dependency is missing entirely', () => {
    expect(() => reg.register(makePlugin({ name: 'ext', dependencies: { core: '^1.0.0' } })))
      .toThrow(/requires "core@\^1\.0\.0" but it is not registered/);
  });

  test('throws when dependency version does not satisfy range', () => {
    reg.register(makePlugin({ name: 'core', version: '2.0.0' }));
    expect(() => reg.register(makePlugin({ name: 'ext', dependencies: { core: '^1.0.0' } })))
      .toThrow(/registered version is "2\.0\.0"/);
  });

  test('skipDependencyCheck bypasses validation (for test doubles)', () => {
    expect(() => reg.register(
      makePlugin({ name: 'ext', dependencies: { core: '^1.0.0' } }),
      { skipDependencyCheck: true }
    )).not.toThrow();
  });

  test('multiple dependencies all validated', () => {
    reg.register(makePlugin({ name: 'a', version: '1.0.0' }));
    reg.register(makePlugin({ name: 'b', version: '1.0.0' }));
    expect(() => reg.register(makePlugin({
      name: 'combo',
      dependencies: { a: '^1.0.0', b: '^2.0.0' },
    }))).toThrow(/requires "b@\^2\.0\.0"/);
  });

  test('registration order matters: dependency must be registered first', () => {
    // Plugins are registered eagerly in declared order; a plugin cannot
    // depend on something registered later in the same session.
    expect(() => reg.register(makePlugin({ name: 'ext', dependencies: { core: '^1.0.0' } })))
      .toThrow(PluginError);
  });
});

describe('PluginRegistry — hooks (sync)', () => {
  let reg: PluginRegistry;
  beforeEach(() => { reg = new PluginRegistry(); });

  test('runHook calls matching callbacks with args', () => {
    const calls: string[] = [];
    reg.register(makePlugin({
      name: 'hook-demo',
      hooks: [{ hook: 'beforeFormulaEval', callback: (f: string) => calls.push(f) }],
    }));
    reg.runHook('beforeFormulaEval', '=SUM(A1:B1)');
    expect(calls).toEqual(['=SUM(A1:B1)']);
  });

  test('multiple plugins hooking the same event all run, in registration order', () => {
    const calls: string[] = [];
    reg.register(makePlugin({ name: 'p1', hooks: [{ hook: 'afterFormulaEval', callback: () => calls.push('p1') }] }));
    reg.register(makePlugin({ name: 'p2', hooks: [{ hook: 'afterFormulaEval', callback: () => calls.push('p2') }] }));
    reg.runHook('afterFormulaEval');
    expect(calls).toEqual(['p1', 'p2']);
  });

  test('hook error is caught and does not crash the registry or block other hooks', () => {
    const calls: string[] = [];
    reg.register(makePlugin({
      name: 'bad-plugin',
      hooks: [{ hook: 'afterFormulaEval', callback: () => { throw new Error('boom'); } }],
    }));
    reg.register(makePlugin({
      name: 'good-plugin',
      hooks: [{ hook: 'afterFormulaEval', callback: () => calls.push('good') }],
    }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => reg.runHook('afterFormulaEval', 42)).not.toThrow();
    expect(calls).toEqual(['good']);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('runHook returns collected results in order', () => {
    reg.register(makePlugin({ name: 'p1', hooks: [{ hook: 'registerFormula', callback: () => 'r1' }] }));
    reg.register(makePlugin({ name: 'p2', hooks: [{ hook: 'registerFormula', callback: () => 'r2' }] }));
    expect(reg.runHook('registerFormula')).toEqual(['r1', 'r2']);
  });

  test('a thrown-callback slot is simply absent from results (not undefined padding)', () => {
    reg.register(makePlugin({
      name: 'mixed',
      hooks: [
        { hook: 'registerFormula', callback: () => 'ok' },
        { hook: 'registerFormula', callback: () => { throw new Error('x'); } },
      ],
    }));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(reg.runHook('registerFormula')).toEqual(['ok']);
    (console.warn as unknown as import('./expect').MockFn).mockRestore();
  });

  test('onPluginLoad hook fires for plugins registered AFTER the listener', () => {
    const calls: string[] = [];
    reg.register(makePlugin({
      name: 'listener',
      hooks: [{ hook: 'onPluginLoad', callback: (name: string) => calls.push(name) }],
    }));
    reg.register(makePlugin({ name: 'later' }));
    // The listener also observes its own registration (self-notification),
    // since onPluginLoad runs against the full registered set, which by
    // that point includes the plugin that was just added.
    expect(calls).toEqual(['listener', 'later']);
  });

  test('a plugin observes its own onPluginLoad event (self-notification)', () => {
    const calls: string[] = [];
    reg.register(makePlugin({
      name: 'self-aware',
      hooks: [{ hook: 'onPluginLoad', callback: (name: string) => calls.push(name) }],
    }));
    expect(calls).toEqual(['self-aware']);
  });
});

describe('PluginRegistry — hooks (async)', () => {
  let reg: PluginRegistry;
  beforeEach(() => { reg = new PluginRegistry(); });

  test('runHookAsync awaits promise-returning callbacks in order', async () => {
    const calls: string[] = [];
    reg.register(makePlugin({
      name: 'async-plugin',
      hooks: [{
        hook: 'onFormulaError',
        callback: async () => {
          await new Promise(r => setTimeout(r, 5));
          calls.push('done');
          return 'async-result';
        },
      }],
    }));
    const results = await reg.runHookAsync('onFormulaError');
    expect(calls).toEqual(['done']);
    expect(results).toEqual(['async-result']);
  });

  test('runHookAsync catches rejected promises without throwing', async () => {
    reg.register(makePlugin({
      name: 'bad-async',
      hooks: [{ hook: 'onFormulaError', callback: async () => { throw new Error('async boom'); } }],
    }));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(reg.runHookAsync('onFormulaError')).resolves.toEqual([]);
    warnSpy.mockRestore();
  });
});

describe('PluginRegistry — listAll / metadata', () => {
  let reg: PluginRegistry;
  beforeEach(() => { reg = new PluginRegistry(); });

  test('listAll includes disabled plugins with correct metadata', () => {
    reg.register(makePlugin({ name: 'a', version: '1.0.0', capabilities: ['theme-extension'] }));
    reg.disable('a');
    const all = reg.listAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ name: 'a', version: '1.0.0', enabled: false, capabilities: ['theme-extension'] });
    expect(typeof all[0].loadedAt).toBe('number');
  });

  test('hookCount reflects number of declared hooks', () => {
    reg.register(makePlugin({
      hooks: [
        { hook: 'beforeFormulaEval', callback: () => {} },
        { hook: 'afterFormulaEval', callback: () => {} },
      ],
    }));
    expect(reg.listAll()[0].hookCount).toBe(2);
  });
});

describe('PluginRegistry — clear()', () => {
  test('clear() removes all plugins and fires unload hooks', () => {
    const reg = new PluginRegistry();
    const calls: string[] = [];
    reg.register(makePlugin({
      name: 'watcher',
      hooks: [{ hook: 'onPluginUnload', callback: (n: string) => calls.push(n) }],
    }));
    reg.register(makePlugin({ name: 'a' }));
    reg.register(makePlugin({ name: 'b' }));
    reg.clear();
    expect(reg.count()).toBe(0);
    expect(calls.sort()).toEqual(['a', 'b', 'watcher']);
  });
});

describe('PluginRegistry — performance', () => {
  test('registering 200 plugins with hooks and running a hook completes quickly', () => {
    const reg = new PluginRegistry();
    const start = Date.now();
    for (let i = 0; i < 200; i++) {
      reg.register(makePlugin({
        name: `perf-${i}`,
        hooks: [{ hook: 'beforeFormulaEval', callback: () => i }],
      }));
    }
    reg.runHook('beforeFormulaEval');
    expect(Date.now() - start).toBeLessThan(100);
  });
});
