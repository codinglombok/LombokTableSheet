/**
 * HostEngine — the integration point WS-3 (plugins), WS-4 (i18n), and
 * WS-5 (ANOVA, as a plugin) were each built for but never actually wired
 * into. This is that wiring.
 *
 * Responsibilities:
 *  - Owns one PluginRegistry and one I18nManager.
 *  - Loads plugins (register + optional async init(engine)).
 *  - Collects formula definitions from every enabled plugin's
 *    'registerFormula' hook into a single formula table.
 *  - Evaluates formulas by name, dispatching beforeFormulaEval /
 *    afterFormulaEval / onFormulaError hooks around the call, and
 *    localizing any thrown error via the formula's declared errorCodeMap.
 */

import { PluginRegistry } from '../plugins/registry.js';
import type { IPlugin } from '../plugins/types.js';
import { I18nManager } from '../i18n/manager.js';
import type { I18nOptions, Language, LanguageCatalog } from '../i18n/types.js';
import type { FormulaDef } from './formula-types.js';
import { FormulaEngineError } from './errors.js';

export class HostEngine {
  readonly plugins: PluginRegistry;
  readonly i18n: I18nManager;
  private formulas = new Map<string, FormulaDef>();

  constructor(i18nOptions?: Partial<I18nOptions>) {
    this.plugins = new PluginRegistry();
    this.i18n = new I18nManager(i18nOptions);
  }

  /**
   * Register a language's strings with the engine's i18n manager.
   * Thin passthrough kept on HostEngine so callers don't need to reach
   * into `engine.i18n` for the most common setup step.
   */
  registerLanguage(lang: Language, strings: LanguageCatalog): void {
    this.i18n.registerLanguage(lang, strings);
  }

  /**
   * Register a plugin, run its optional init(engine), and refresh the
   * formula table so any formulas it declares become immediately callable.
   * Rethrows whatever PluginRegistry.register or the plugin's own init
   * throws — a failed load leaves the engine's formula table unchanged
   * (refreshFormulas runs only after both steps succeed).
   */
  async loadPlugin(plugin: IPlugin): Promise<void> {
    this.plugins.register(plugin);
    if (plugin.init) {
      await Promise.resolve(plugin.init(this));
    }
    this.refreshFormulas();
  }

  /**
   * Unregister a plugin (running its destroy() first, if present) and
   * refresh the formula table so its formulas stop being callable.
   */
  async unloadPlugin(name: string, force = false): Promise<void> {
    const plugin = this.plugins.get(name);
    if (plugin?.destroy) {
      await Promise.resolve(plugin.destroy());
    }
    this.plugins.unregister(name, force);
    this.refreshFormulas();
  }

  enablePlugin(name: string): void {
    this.plugins.enable(name);
    this.refreshFormulas();
  }

  disablePlugin(name: string): void {
    this.plugins.disable(name);
    this.refreshFormulas();
  }

  /**
   * Re-run 'registerFormula' across every currently enabled plugin and
   * rebuild the formula table from scratch. Called automatically by
   * loadPlugin/unloadPlugin/enablePlugin/disablePlugin — exposed publicly
   * for callers who mutate the registry directly (via engine.plugins) and
   * need to sync afterward.
   */
  refreshFormulas(): void {
    this.formulas.clear();
    const defs = this.plugins.runHook('registerFormula') as unknown[];
    for (const raw of defs) {
      const def = raw as FormulaDef;
      if (!def || typeof def.name !== 'string' || typeof def.fn !== 'function') {
        // eslint-disable-next-line no-console
        console.warn('[HostEngine] Ignoring malformed value from a registerFormula hook (missing name/fn).');
        continue;
      }
      this.formulas.set(def.name, def);
    }
  }

  hasFormula(name: string): boolean {
    return this.formulas.has(name);
  }

  listFormulaNames(): string[] {
    return [...this.formulas.keys()];
  }

  /** Localized display name for a registered formula, falling back to the
   *  bare formula name if it declared no labelKey or the key has no
   *  translation for the current language. */
  getFormulaLabel(name: string): string {
    const def = this.formulas.get(name);
    if (!def) return name;
    if (!def.labelKey) return name;
    return this.i18n.t(def.labelKey);
  }

  /**
   * Evaluate a registered formula by name. Dispatches beforeFormulaEval
   * before the call and afterFormulaEval after a successful call, both
   * via the plugin registry's sync hook dispatch. On failure, dispatches
   * onFormulaError with a LOCALIZED FormulaEngineError (never the raw
   * error) and throws that same localized error to the caller.
   */
  evalFormula(name: string, ...args: any[]): any {
    this.plugins.runHook('beforeFormulaEval', name, args);

    const def = this.formulas.get(name);
    if (!def) {
      const err = new FormulaEngineError(
        `${this.i18n.t('errors.invalid_input')}: ${name}`,
        name
      );
      this.plugins.runHook('onFormulaError', name, err);
      throw err;
    }

    try {
      const result = def.fn(...args);
      this.plugins.runHook('afterFormulaEval', name, result);
      return result;
    } catch (rawErr) {
      const localized = this.localizeError(def, rawErr as Error);
      this.plugins.runHook('onFormulaError', name, localized);
      throw localized;
    }
  }

  private localizeError(def: FormulaDef, rawErr: Error): FormulaEngineError {
    const map = def.errorCodeMap;
    if (map) {
      for (const [prefix, key] of Object.entries(map)) {
        if (rawErr.message.startsWith(prefix)) {
          return new FormulaEngineError(this.i18n.t(key), def.name, rawErr);
        }
      }
    }
    // No specific mapping matched. The generic fallback string is a
    // template ("Formula error: %error") — fill it with the raw error's
    // message so the user sees SOMETHING actionable rather than a dangling
    // "%error" placeholder. This intentionally surfaces the original
    // (English, code-prefixed) detail even in non-English locales, since
    // there is no translated text for an error the plugin author didn't
    // anticipate. Prefer declaring errorCodeMap entries over relying on
    // this path whenever the error is expected/recoverable.
    return new FormulaEngineError(
      this.i18n.t('errors.formula_error', { error: rawErr.message }),
      def.name,
      rawErr
    );
  }
}
