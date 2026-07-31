# PLUGIN_DEV_GUIDE.md — Building a LombokTableSheet Plugin
## WS-3, v1.0.0

Companion to `PLUGIN_API.md` (the locked spec). This guide walks through
writing, testing, and publishing a plugin using the three reference
examples in `examples/`.

---

## 1. Anatomy of a plugin

The minimum viable plugin is just data:

```typescript
import type { IPlugin } from '@lombok-tablesheet/plugins';

export const plugin: IPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  capabilities: [],
};

export default plugin;
```

That's a legal plugin — `capabilities` may be empty, `hooks`/`init`/`destroy`
are all optional. Real plugins add one or more of:

- **`hooks`** — react to formula-eval lifecycle events, or supply
  definitions (formulas/codecs/charts) for the host to collect.
- **`init(engine)`** — one-time setup when the plugin is registered
  (register with the *host engine*, not the plugin registry — the registry
  calls `register()` for you; `init` is for wiring into the rest of the app).
- **`destroy()`** — cleanup when unregistered.
- **`dependencies`** — declare what other plugins must already be present.

See the three worked examples:

| Example | Capability | Demonstrates |
|---|---|---|
| `examples/formula-demo-plugin.ts` | `formula-extension` | `registerFormula`, `beforeFormulaEval`, `onFormulaError` |
| `examples/theme-demo-plugin.ts` | `theme-extension` | Hookless plugin — pure data + `init()` |
| `examples/codec-demo-plugin.ts` | `codec-extension` | `registerCodec`, and a `dependencies` declaration |

## 2. Writing a formula-extension plugin

Return a formula definition from `registerFormula`:

```typescript
hooks: [{
  hook: 'registerFormula',
  callback: () => ({ name: 'TITLECASE', arity: 1, fn: titleCase }),
}],
```

The host engine calls `registry.runHook('registerFormula')` once at
startup and registers everything returned. Keep the callback pure and
side-effect-free — it may run again if plugins are reloaded.

If you also want to observe every formula evaluation (for logging,
metrics, etc.), add `beforeFormulaEval` / `afterFormulaEval` /
`onFormulaError`. These run on the hot path — keep them O(1), synchronous,
and non-throwing (a throw is caught and logged, but still costs a
try/catch per plugin per eval).

## 3. Writing a hookless (data-only) plugin

Not every plugin needs to touch the eval path. `theme-demo-plugin.ts`
exposes a `getPalette()` method directly on the plugin object instead of
going through hooks — the host UI layer calls
`registry.get('@lombok-themes/demo')` and uses whatever custom shape the
plugin exposes. `capabilities` still tells the host *what kind* of thing
this is, even with zero `hooks`.

## 4. Dependencies between plugins

Declare what you need and the range you need it in:

```typescript
dependencies: { '@lombok-formulas/demo': '^1.0.0' },
```

Two consequences, both enforced by the registry, not by convention:

1. **Order matters.** The dependency must be registered *before* you are.
   `codec-demo-plugin.ts` depends on `formula-demo-plugin.ts` — registering
   it first throws `PluginError` ("requires ... but it is not registered").
2. **You block your dependency's removal.** Once registered, the registry
   refuses `unregister('@lombok-formulas/demo')` while your plugin is
   still around, unless the caller passes `force: true`. Use
   `registry.findDependents(name)` to see who's depending on something
   before removing it.

Range syntax matches common npm conventions (`^`, `~`, `>=`, exact, etc.)
— see `PLUGIN_API.md §3` for the full table, including the `0.x` caret
edge cases that trip people up.

## 5. Testing your plugin

Pattern used throughout `tests/plugins/`:

```typescript
import { PluginRegistry } from '../../src/plugins/registry';
import { plugin } from '../../examples/my-plugin';

test('registers and exposes MYFORMULA', () => {
  const reg = new PluginRegistry(); // fresh instance per test — never share state
  reg.register(plugin);
  const [def] = reg.runHook('registerFormula');
  expect(def.name).toBe('MYFORMULA');
});
```

Always instantiate a fresh `PluginRegistry()` per test rather than reusing
the exported `pluginRegistry` singleton — tests that share the singleton
will leak plugin registrations across test files (duplicate-registration
errors are a common symptom).

For plugins with `dependencies`, write both the "missing dependency"
failure case and the "present + satisfies range" success case explicitly
— see `integration.test.ts` for the full three-plugin wiring example,
including the deliberate failure test (registering the codec plugin
before its dependency).

## 6. Publishing checklist

- [ ] `name` is unique and, if official, under the `@lombok-*` namespace.
- [ ] `version` is strict `X.Y.Z` semver (prerelease tags like `-beta.1`
      are accepted but bump your `dependencies` ranges accordingly).
- [ ] `capabilities` accurately reflects what the plugin does.
- [ ] Every hook name in `hooks` is one of the eight in `PLUGIN_API.md §2`
      — `PluginLoader` rejects unknown hook names at load time.
- [ ] Hook callbacks are synchronous and fast, or you're calling them via
      `runHookAsync` intentionally (mixing sync/async callers on the same
      hook name silently drops async results under `runHook`).
- [ ] `dependencies` versions are declared, and you've tested both the
      missing-dependency and version-mismatch failure paths.
- [ ] Ran the benchmark (`benchmarks/load-time.bench.ts`) if your `init()`
      does non-trivial work — registration itself is cheap, but a slow
      `init()` will still stall startup since eager loading is the v1.0
      default.

## 7. What the framework does NOT do (v1.0)

No sandboxing beyond per-hook `try/catch`, no hot-swap/upgrade of an
already-registered plugin, no automatic dependency-order resolution — see
`PLUGIN_API.md §7` for the full non-goals list before assuming a
capability exists.
