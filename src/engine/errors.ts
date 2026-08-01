/**
 * HostEngine — Formula evaluation error, localized via i18n.
 *
 * `message` is ALWAYS the localized, user-facing string. `cause` retains
 * the original (English, code-prefixed) error thrown by the formula
 * implementation itself, for logs/devtools — never shown to the end user.
 */
export class FormulaEngineError extends Error {
  constructor(
    localizedMessage: string,
    public readonly formulaName: string | undefined,
    public readonly cause?: Error
  ) {
    super(localizedMessage);
    this.name = 'FormulaEngineError';
  }
}
