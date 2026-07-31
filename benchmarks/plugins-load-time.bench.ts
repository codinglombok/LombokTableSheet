/**
 * Benchmark: plugin registration ("load") time and hook dispatch overhead.
 * Run with: npx ts-node benchmarks/load-time.bench.ts
 * (or compile then `node dist/benchmarks/load-time.bench.js`)
 *
 * Target from WS-3 checklist: plugin load time < 100ms.
 */
import { PluginRegistry } from '../src/plugins/registry';
import type { IPlugin } from '../src/plugins/types';

function makePlugin(i: number): IPlugin {
  return {
    name: `bench-plugin-${i}`,
    version: '1.0.0',
    capabilities: ['formula-extension'],
    dependencies: i > 0 ? { [`bench-plugin-${i - 1}`]: '^1.0.0' } : undefined,
    hooks: [
      { hook: 'beforeFormulaEval', callback: (f: string) => f.length },
      { hook: 'afterFormulaEval', callback: (r: unknown) => r },
    ],
  };
}

function benchRegisterN(n: number): number {
  const reg = new PluginRegistry();
  const start = performance.now();
  for (let i = 0; i < n; i++) reg.register(makePlugin(i));
  return performance.now() - start;
}

function benchSingleLoad(): number {
  // Isolate the cost of a single plugin's registration after 99 others
  // are already present — the realistic "load one more plugin" case.
  const reg = new PluginRegistry();
  for (let i = 0; i < 99; i++) reg.register(makePlugin(i));
  const start = performance.now();
  reg.register(makePlugin(99));
  return performance.now() - start;
}

function benchHookDispatch(n: number, iterations: number): number {
  const reg = new PluginRegistry();
  for (let i = 0; i < n; i++) reg.register(makePlugin(i));
  const start = performance.now();
  for (let j = 0; j < iterations; j++) {
    reg.runHook('beforeFormulaEval', '=SUM(A1:A10)');
  }
  return performance.now() - start;
}

function run() {
  const results: Array<{ label: string; ms: number; target: number; pass: boolean }> = [];

  const single = benchSingleLoad();
  results.push({ label: 'Single plugin load (100th registration)', ms: single, target: 100, pass: single < 100 });

  const chain50 = benchRegisterN(50);
  results.push({ label: 'Register 50 chained-dependency plugins', ms: chain50, target: 100, pass: chain50 < 100 });

  const chain200 = benchRegisterN(200);
  results.push({ label: 'Register 200 chained-dependency plugins', ms: chain200, target: 500, pass: chain200 < 500 });

  const dispatch1k = benchHookDispatch(50, 1000);
  results.push({
    label: 'Dispatch beforeFormulaEval x1000 across 50 plugins (100 listeners/run)',
    ms: dispatch1k, target: 100, pass: dispatch1k < 100,
  });

  console.log('\nWS-3 Plugin Framework — Load & Dispatch Benchmark\n' + '='.repeat(58));
  for (const r of results) {
    const status = r.pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${r.label}: ${r.ms.toFixed(2)}ms (target < ${r.target}ms)`);
  }
  const allPass = results.every(r => r.pass);
  console.log('='.repeat(58));
  console.log(allPass ? 'All benchmarks within target.' : 'SOME BENCHMARKS FAILED TARGET.');
  process.exit(allPass ? 0 : 1);
}

run();
