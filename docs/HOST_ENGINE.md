# HostEngine

`HostEngine` is the wiring layer that connects the three subsystems shipped in
0.7.0–0.9.0: the plugin registry, the i18n manager, and the formula
implementations (currently ANOVA).

Before 1.0.0 each of those existed but had no common owner — a plugin could
declare a formula, and a catalog could hold a translated error string, but
nothing resolved one against the other. `HostEngine` does exactly that and
nothing more.

## What it owns

One `PluginRegistry` and one `I18nManager`, plus a formula table rebuilt from
the enabled plugins' `registerFormula` hooks.

```ts
import { HostEngine, anovaPlugin, catalogs } from 'lomboktablesheet';

const engine = new HostEngine({ defaultLanguage: 'en' });
engine.registerLanguage('en', catalogs.en);
engine.registerLanguage('es', catalogs.es);

await engine.loadPlugin(anovaPlugin);

engine.listFormulaNames();          // ['ANOVA_ONEWAY', 'ANOVA_TWOWAY']
engine.getFormulaLabel('ANOVA_ONEWAY');  // 'ANOVA One-Way'

const result = engine.evalFormula('ANOVA_ONEWAY',
  [23, 25, 21], [30, 32, 29], [28, 26, 30]);
```

## The integration contract

A formula plugin never imports `I18nManager`. It declares *which* i18n keys
apply and lets the engine resolve them against whatever language is active:

- `labelKey` — dot-path for the formula's display name
- `errorCodeMap` — maps an error-message **prefix** thrown by `fn` to an i18n
  error key, matched with `startsWith` in insertion order

This is what keeps WS-5 (ANOVA) and WS-4 (i18n) decoupled: `src/stats/anova.ts`
throws `ANOVA_INSUFFICIENT_GROUPS: ...`, `src/plugins/anova-plugin.ts` maps that
prefix to `errors.insufficient_data`, and the engine translates it at throw
time. The plugin stays testable standalone.

## Error localization

Every failure surfaces as a `FormulaEngineError` whose `message` is the
**localized** string. The original English, code-prefixed error is preserved on
`.cause` for logs and devtools — never show `.cause` to an end user.

```ts
engine.i18n.setLanguage('es');
try {
  engine.evalFormula('ANOVA_ONEWAY', [1, 2, 3]);   // only one group
} catch (err) {
  err.message;        // localized 'Datos insuficientes...'
  err.cause?.message; // 'ANOVA_INSUFFICIENT_GROUPS: requires at least 2 groups, got 1'
}
```

If no `errorCodeMap` entry matches, the engine falls back to the
`errors.formula_error` template and fills `%error` with the raw message. That
deliberately leaks the English detail rather than showing a dangling
placeholder — declare `errorCodeMap` entries for any error you expect.

## Hook dispatch around evaluation

`evalFormula` runs `beforeFormulaEval` before the call, `afterFormulaEval` after
a successful call, and `onFormulaError` on failure (with the localized error,
never the raw one). All three go through the registry's **synchronous** dispatch,
so hook callbacks on the eval path must stay synchronous and cheap — a returned
promise will not be awaited. Use `registry.runHookAsync` for anything that needs
I/O, outside the eval path.

## Lifecycle

`loadPlugin` registers, awaits the plugin's optional `init(engine)`, then
refreshes the formula table — so a failed init leaves the table untouched.
`unloadPlugin` awaits `destroy()` first. `enablePlugin` / `disablePlugin`
refresh too, which means disabling a plugin immediately stops its formulas from
resolving. If you mutate `engine.plugins` directly, call `refreshFormulas()`
yourself afterward.

See also: [PLUGIN_API.md](PLUGIN_API.md), [PLUGIN_DEV_GUIDE.md](PLUGIN_DEV_GUIDE.md).
