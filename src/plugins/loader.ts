/**
 * LombokTableSheet Plugin Framework — Loader
 * WS-3
 */

import type { IPlugin } from './types.js';
import { PluginError } from './types.js';
import { ALL_HOOK_NAMES } from './types.js';

const VERSION_SHAPE_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export class PluginLoader {
  /** Validate and return a plugin object already in memory (built-ins, tests,
   *  or anything the host application constructs directly). */
  static loadObject(obj: IPlugin): IPlugin {
    if (!obj || typeof obj !== 'object') {
      throw new PluginError('Plugin must be an object.');
    }
    if (!obj.name || typeof obj.name !== 'string') {
      throw new PluginError('Plugin must have a non-empty string "name".');
    }
    if (!obj.version || typeof obj.version !== 'string' || !VERSION_SHAPE_RE.test(obj.version)) {
      throw new PluginError(
        `Plugin "${obj.name}" has an invalid "version" — expected semver X.Y.Z, got "${obj.version}".`,
        obj.name
      );
    }
    if (!Array.isArray(obj.capabilities)) {
      throw new PluginError(`Plugin "${obj.name}" must have a "capabilities" array (may be empty).`, obj.name);
    }
    if (obj.hooks) {
      if (!Array.isArray(obj.hooks)) {
        throw new PluginError(`Plugin "${obj.name}" "hooks" must be an array.`, obj.name);
      }
      for (const h of obj.hooks) {
        if (!ALL_HOOK_NAMES.includes(h.hook)) {
          throw new PluginError(
            `Plugin "${obj.name}" declares unknown hook "${h.hook}". Valid hooks: ${ALL_HOOK_NAMES.join(', ')}.`,
            obj.name
          );
        }
        if (typeof h.callback !== 'function') {
          throw new PluginError(
            `Plugin "${obj.name}" hook "${h.hook}" callback must be a function.`,
            obj.name
          );
        }
      }
    }
    return obj;
  }

  /** Load from a dynamic import path (Node / bundler). Accepts either a
   *  default export or a named `plugin` export. */
  static async loadFromPath(path: string): Promise<IPlugin> {
    let mod: any;
    try {
      mod = await import(path);
    } catch (err) {
      throw new PluginError(`Failed to import plugin module from "${path}": ${(err as Error).message}`);
    }
    const candidate = mod.default ?? mod.plugin ?? mod;
    return PluginLoader.loadObject(candidate);
  }
}
