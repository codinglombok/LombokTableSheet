/**
 * Contract a plugin's `registerFormula` hook callback must return.
 *
 * The plugin stays decoupled from any live i18n instance: it declares
 * WHICH i18n keys apply (labelKey for the display name, errorCodeMap for
 * translating specific thrown-error prefixes) and the HostEngine resolves
 * them against its own I18nManager at collection/eval time. This means a
 * formula plugin has zero dependency on the i18n module and can be tested
 * standalone (see WS-3's own example plugins), while still getting full
 * localization once loaded into a HostEngine.
 */
export interface FormulaDef {
  name: string;
  /** -1 = variadic. Informational only — not enforced by the engine. */
  arity?: number;
  fn: (...args: any[]) => any;
  /** i18n dot-path resolved via I18nManager.t() for the formula's display name. */
  labelKey?: string;
  /**
   * Maps an error-message PREFIX (as thrown by `fn`) to an i18n error key.
   * The engine matches by `rawError.message.startsWith(prefix)`, in
   * insertion order, and uses the first match. Unmatched errors fall back
   * to the generic 'errors.formula_error' key.
   */
  errorCodeMap?: Record<string, string>;
}
