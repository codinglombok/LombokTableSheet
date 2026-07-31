import { describe, it, test, beforeEach, afterEach } from 'node:test';
import { expect, jest } from './expect';
import { PluginRegistry } from '../src/plugins/registry';
import { plugin as formulaDemo } from '../src/plugins/examples/formula-demo-plugin';
import { plugin as themeDemo } from '../src/plugins/examples/theme-demo-plugin';
import { plugin as codecDemo } from '../src/plugins/examples/codec-demo-plugin';

describe('Integration — three example plugins wired together', () => {
  test('codec plugin requires formula plugin registered first (dependency enforcement)', () => {
    const reg = new PluginRegistry();
    expect(() => reg.register(codecDemo)).toThrow(/requires "@lombok-formulas\/demo@\^1\.0\.0"/);
  });

  test('registering in dependency order succeeds and all three are listed', () => {
    const reg = new PluginRegistry();
    reg.register(formulaDemo);
    reg.register(themeDemo);
    reg.register(codecDemo);
    expect(reg.list().map(p => p.name).sort()).toEqual([
      '@lombok-codecs/demo',
      '@lombok-formulas/demo',
      '@lombok-themes/demo',
    ]);
  });

  test('registerFormula hook returns the TITLECASE formula definition', () => {
    const reg = new PluginRegistry();
    reg.register(formulaDemo);
    const results = reg.runHook('registerFormula');
    expect(results).toHaveLength(1);
    const [def] = results as Array<{ name: string; fn: (s: string) => string }>;
    expect(def.name).toBe('TITLECASE');
    expect(def.fn('hello world')).toBe('Hello World');
  });

  test('registerCodec hook returns a working TSV codec', () => {
    const reg = new PluginRegistry();
    reg.register(formulaDemo);
    reg.register(codecDemo);
    const [codec] = reg.runHook('registerCodec') as Array<{
      encode(rows: string[][]): string;
      decode(text: string): string[][];
    }>;
    const encoded = codec.encode([['a', 'b'], ['1', '2']]);
    expect(encoded).toBe('a\tb\n1\t2');
    expect(codec.decode(encoded)).toEqual([['a', 'b'], ['1', '2']]);
  });

  test('theme plugin has no hooks but exposes getPalette() directly', () => {
    const reg = new PluginRegistry();
    reg.register(themeDemo);
    expect(reg.get('@lombok-themes/demo')?.capabilities).toEqual(['theme-extension']);
    expect((themeDemo as any).getPalette().name).toBe('Lombok Dusk');
  });

  test('unregistering the formula plugin while the codec plugin depends on it is refused', () => {
    const reg = new PluginRegistry();
    reg.register(formulaDemo);
    reg.register(codecDemo);
    expect(() => reg.unregister('@lombok-formulas/demo'))
      .toThrow(/still required by @lombok-codecs\/demo/);
  });

  test('beforeFormulaEval and onFormulaError hooks from the formula plugin fire correctly', () => {
    const reg = new PluginRegistry();
    reg.register(formulaDemo);
    const before = reg.runHook('beforeFormulaEval', '=TITLECASE(A1)');
    expect(before[0]).toMatchObject({ formula: '=TITLECASE(A1)' });

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    reg.runHook('onFormulaError', '=TITLECASE(A1)', new Error('bad ref'));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('@lombok-formulas/demo')
    );
    warnSpy.mockRestore();
  });
});
