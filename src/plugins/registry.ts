/**
 * LombokTableSheet Plugin Framework — Registry
 * WS-3
 */

import type { IPlugin, PluginRegistryEntry, PluginMetadata, HookName } from './types.js';
import { PluginError } from './types.js';
import { satisfies } from './semver.js';

export interface RegisterOptions {
  /** Skip dependency-version checking (useful for test doubles). Default: false. */
  skipDependencyCheck?: boolean;
}

export class PluginRegistry {
  private plugins = new Map<string, PluginRegistryEntry>();

  /**
   * Register a plugin. Validates name/version shape, checks for duplicate
   * registration, and — unless skipped — verifies every declared dependency
   * is already registered and satisfies the requested semver range.
   *
   * Fires 'onPluginLoad' against the full registered set after adding this
   * plugin, so a plugin that itself declares an onPluginLoad hook WILL
   * observe its own registration (self-notification), not just later ones.
   *
   * Throws PluginError (not a generic Error) so callers can distinguish
   * plugin-system failures from other errors.
   */
  register(plugin: IPlugin, options: RegisterOptions = {}): void {
    if (!plugin.name || typeof plugin.name !== 'string') {
      throw new PluginError('Plugin must have a non-empty string "name".');
    }
    if (!plugin.version || typeof plugin.version !== 'string') {
      throw new PluginError(`Plugin "${plugin.name}" must have a "version".`, plugin.name);
    }
    if (this.plugins.has(plugin.name)) {
      throw new PluginError(`Plugin "${plugin.name}" is already registered.`, plugin.name);
    }

    if (!options.skipDependencyCheck && plugin.dependencies) {
      for (const [depName, range] of Object.entries(plugin.dependencies)) {
        const dep = this.plugins.get(depName);
        if (!dep) {
          throw new PluginError(
            `Plugin "${plugin.name}" requires "${depName}@${range}" but it is not registered.`,
            plugin.name
          );
        }
        if (!satisfies(dep.plugin.version, range)) {
          throw new PluginError(
            `Plugin "${plugin.name}" requires "${depName}@${range}" but registered version is ` +
            `"${dep.plugin.version}".`,
            plugin.name
          );
        }
      }
    }

    this.plugins.set(plugin.name, {
      plugin,
      enabled: true,
      loadedAt: Date.now(),
    });
    this.runHook('onPluginLoad', plugin.name, {});
  }

  /**
   * Unregister a plugin. Refuses to remove a plugin that other registered
   * plugins still declare as a dependency, unless `force` is true — removing
   * it silently would leave those plugins referencing a missing dependency.
   */
  unregister(name: string, force = false): void {
    const entry = this.plugins.get(name);
    if (!entry) return;

    if (!force) {
      const dependents = this.findDependents(name);
      if (dependents.length > 0) {
        throw new PluginError(
          `Cannot unregister "${name}": still required by ${dependents.join(', ')}. ` +
          `Pass force=true to override.`,
          name
        );
      }
    }

    this.runHook('onPluginUnload', name);
    this.plugins.delete(name);
  }

  /** Names of currently-registered plugins that declare `name` as a dependency. */
  findDependents(name: string): string[] {
    const result: string[] = [];
    for (const entry of this.plugins.values()) {
      if (entry.plugin.dependencies && name in entry.plugin.dependencies) {
        result.push(entry.plugin.name);
      }
    }
    return result;
  }

  enable(name: string): void {
    const entry = this.plugins.get(name);
    if (entry) entry.enabled = true;
  }

  disable(name: string): void {
    const entry = this.plugins.get(name);
    if (entry) entry.enabled = false;
  }

  get(name: string): IPlugin | undefined {
    return this.plugins.get(name)?.plugin;
  }

  isEnabled(name: string): boolean {
    return this.plugins.get(name)?.enabled ?? false;
  }

  /** Enabled plugins only, in registration order. */
  list(): IPlugin[] {
    return [...this.plugins.values()]
      .filter(e => e.enabled)
      .map(e => e.plugin);
  }

  /** All registered plugins (enabled or not) with registry metadata. */
  listAll(): PluginMetadata[] {
    return [...this.plugins.values()].map(e => ({
      name: e.plugin.name,
      version: e.plugin.version,
      capabilities: e.plugin.capabilities,
      description: e.plugin.description,
      author: e.plugin.author,
      license: e.plugin.license,
      enabled: e.enabled,
      loadedAt: e.loadedAt,
      hookCount: e.plugin.hooks?.length ?? 0,
    }));
  }

  exists(name: string): boolean {
    return this.plugins.has(name);
  }

  count(): number {
    return this.plugins.size;
  }

  /** Remove every registered plugin (unloads in reverse-registration order,
   *  bypassing the dependent check since everything is going away together). */
  clear(): void {
    const names = [...this.plugins.keys()].reverse();
    for (const name of names) {
      this.runHook('onPluginUnload', name);
    }
    this.plugins.clear();
  }

  /**
   * Run all callbacks registered for `hookName`, in plugin-registration
   * order, skipping disabled plugins. A callback that throws is caught and
   * logged so one misbehaving plugin cannot break the others or the caller.
   *
   * NOTE: this does not await returned promises. If any hook for this name
   * may be async, use runHookAsync instead — mixing sync/async callers on
   * the same hook name will silently drop async results here.
   */
  runHook(hookName: HookName, ...args: any[]): any[] {
    const results: any[] = [];
    for (const { plugin, enabled } of this.plugins.values()) {
      if (!enabled) continue;
      for (const hookDef of (plugin.hooks ?? [])) {
        if (hookDef.hook === hookName) {
          try {
            results.push(hookDef.callback(...args));
          } catch (err) {
            this.logHookError(plugin.name, hookName, err);
          }
        }
      }
    }
    return results;
  }

  /** Async variant of runHook — awaits each callback's result in sequence. */
  async runHookAsync(hookName: HookName, ...args: any[]): Promise<any[]> {
    const results: any[] = [];
    for (const { plugin, enabled } of this.plugins.values()) {
      if (!enabled) continue;
      for (const hookDef of (plugin.hooks ?? [])) {
        if (hookDef.hook === hookName) {
          try {
            results.push(await Promise.resolve(hookDef.callback(...args)));
          } catch (err) {
            this.logHookError(plugin.name, hookName, err, true);
          }
        }
      }
    }
    return results;
  }

  private logHookError(pluginName: string, hookName: HookName, err: unknown, async = false): void {
    console.warn(
      `[Plugin:${pluginName}] ${async ? 'Async hook' : 'Hook'} "${hookName}" threw:`,
      err
    );
  }
}

// Singleton export for consumers that just want a shared default instance.
export const pluginRegistry = new PluginRegistry();
