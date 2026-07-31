# PLUGIN_API.md — LombokTableSheet Plugin API Spec
## WS-3, v1.0.0

Locked spec for the plugin system. Implementation lives in `src/plugins/`.

---

## 1. Plugin shape (`IPlugin`)

```typescript
interface IPlugin {
  name: string;                    // unique, e.g. "@lombok-formulas/demo"
  version: string;                 // strict semver X.Y.Z (prerelease optional: X.Y.Z-tag)
  capabilities: PluginCapability[]; // may be empty, but the field must exist
  description?: string;
  author?: string;
  license?: string;
  dependencies?: Record<string, string>; // { pluginName: semverRange }
  hooks?: HookDefinition[];
  init?(engine: any): Promise<void> | void;
  destroy?(): Promise<void> | void;
}
```

`capabilities` values: `formula-extension`, `codec-extension`, `chart-extension`,
`theme-extension`, `hook-extension`. Purely descriptive metadata — the registry
does not enforce that a plugin's hooks match its declared capabilities.

## 2. Hooks

Eight hook points, fixed for v1.0 (`ALL_HOOK_NAMES` in `types.ts`):

| Hook | Fires when | Typical args |
|---|---|---|
| `beforeFormulaEval` | Just before a formula string is evaluated | `(formula: string)` |
| `afterFormulaEval` | After successful evaluation | `(result: unknown)` |
| `onFormulaError` | Evaluation threw | `(formula: string, error: Error)` |
| `registerFormula` | Plugin should return a formula definition | none — return value collected |
| `registerCodec` | Plugin should return a codec definition | none — return value collected |
| `registerChart` | Plugin should return a chart-type definition | none — return value collected |
| `onPluginLoad` | Any plugin (including this one) is registered | `(pluginName: string)` |
| `onPluginUnload` | Any plugin (including this one) is unregistered | `(pluginName: string)` |

A plugin declares hooks as an array; multiple entries may target the same
hook name. Unknown hook names are rejected at load time by `PluginLoader`.

**Self-notification:** `onPluginLoad` / `onPluginUnload` fire against the
full registered set at the moment of the event — a plugin that declares
one of these hooks WILL observe its own load/unload, not just other
plugins'. Design for this explicitly rather than assuming "other plugins
only".

## 3. Dependency resolution

- `dependencies` maps a required plugin name to a semver range.
- Supported range syntax: exact (`1.2.3`), caret (`^1.2.3`), tilde
  (`~1.2.3`), comparison operators (`>=`, `<=`, `>`, `<`, `=`), wildcard
  (`*` / `x` / empty string), and space-separated conjunctions
  (`>=1.0.0 <2.0.0`).
- Caret ranges follow standard semver "0.x" semantics: for `major > 0` the
  major version is the breaking boundary; for `0.x.y` the minor version is
  the boundary; for `0.0.z` the patch version is the boundary. (`^1.2.3` →
  `<2.0.0`; `^0.2.3` → `<0.3.0`; `^0.0.3` → `<0.0.4`.)
- Dependencies must already be registered at the time a dependent plugin
  registers — **registration is eager and ordered**, there is no deferred
  resolution or topological re-ordering. Register dependencies first.
- `register()` throws `PluginError` if a dependency is missing or its
  registered version doesn't satisfy the range. Pass
  `{ skipDependencyCheck: true }` to bypass (intended for test doubles).
- `unregister()` refuses to remove a plugin that others still depend on,
  unless called with `force = true`. Use `findDependents(name)` to inspect
  first.

## 4. Registry behavior

- `register(plugin, options?)` — validates, checks deps, adds, fires
  `onPluginLoad`. Throws `PluginError` on any failure; nothing is
  partially registered.
- `unregister(name, force?)` — fires `onPluginUnload`, then removes.
- `enable(name)` / `disable(name)` — unknown names are a silent no-op.
  Disabled plugins are skipped by `list()` and by hook dispatch, but
  remain visible via `listAll()` / `exists()`.
- `list()` — enabled plugins, in registration order.
- `listAll()` — every registered plugin (enabled or not) with metadata
  (`enabled`, `loadedAt`, `hookCount`).
- `runHook(name, ...args)` — **sync**. Calls every matching, enabled
  hook in registration order. A throwing callback is caught, logged via
  `console.warn`, and excluded from the results array (no `undefined`
  padding). Does not await promises — a callback returning one yields
  the raw pending Promise in results.
- `runHookAsync(name, ...args)` — same semantics, but awaits each
  callback's return value in sequence before moving to the next.
- `clear()` — unregisters everything, reverse-registration order, bypassing
  the dependent check (since the whole set is being torn down together).

## 5. Loading

`PluginLoader.loadObject(obj)` validates shape (name, semver version,
capabilities array, known hook names, callback-is-function) and returns
the object typed as `IPlugin`, or throws `PluginError` with a specific
reason.

`PluginLoader.loadFromPath(path)` dynamically `import()`s a module,
accepts a default export or a named `plugin` export, and runs it through
the same `loadObject` validation.

## 6. Errors

All plugin-system failures throw `PluginError extends Error`
(`err.name === 'PluginError'`, optional `err.pluginName`). Use this to
distinguish plugin-system errors from arbitrary exceptions elsewhere in
the host application.

## 7. Non-goals (v1.0)

- No VM/process sandboxing — isolation is per-hook `try/catch` only. A
  malicious plugin can still access any JS global. Trust boundary is
  "vetted npm package", not "arbitrary user code".
- No hot-swap / version upgrade of an already-registered plugin — call
  `unregister` then `register` again.
- No topological auto-ordering of dependencies — caller controls
  registration order.
