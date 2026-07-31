/**
 * LombokTableSheet Plugin Framework — Type Definitions
 * WS-3
 */

export type HookName =
  | 'beforeFormulaEval'
  | 'afterFormulaEval'
  | 'onFormulaError'
  | 'registerFormula'
  | 'registerCodec'
  | 'registerChart'
  | 'onPluginLoad'
  | 'onPluginUnload';

export const ALL_HOOK_NAMES: readonly HookName[] = [
  'beforeFormulaEval',
  'afterFormulaEval',
  'onFormulaError',
  'registerFormula',
  'registerCodec',
  'registerChart',
  'onPluginLoad',
  'onPluginUnload',
];

export type PluginCapability =
  | 'formula-extension'
  | 'codec-extension'
  | 'chart-extension'
  | 'theme-extension'
  | 'hook-extension';

export interface HookDefinition {
  hook: HookName;
  /** Sync callback. For hooks that may need to await I/O, use runHookAsync
   *  from the registry — the callback itself may still return a Promise,
   *  which runHook (sync) will NOT await; use runHookAsync in that case. */
  callback: (...args: any[]) => any;
}

export interface IPlugin {
  name: string;
  version: string;
  capabilities: PluginCapability[];
  description?: string;
  author?: string;
  license?: string;
  /** Map of plugin-name -> semver range, e.g. { "@lombok-formulas/core": "^1.0.0" } */
  dependencies?: Record<string, string>;
  hooks?: HookDefinition[];
  init?(engine: any): Promise<void> | void;
  destroy?(): Promise<void> | void;
}

export interface PluginRegistryEntry {
  plugin: IPlugin;
  enabled: boolean;
  loadedAt: number;
}

export interface PluginMetadata {
  name: string;
  version: string;
  capabilities: PluginCapability[];
  description?: string;
  author?: string;
  license?: string;
  enabled: boolean;
  loadedAt: number;
  hookCount: number;
}

/** Thrown when a plugin fails validation, dependency resolution, or registration. */
export class PluginError extends Error {
  constructor(message: string, public readonly pluginName?: string) {
    super(message);
    this.name = 'PluginError';
  }
}
