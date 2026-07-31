/**
 * @lombok-themes/demo — Example theme-extension plugin.
 *
 * Theme plugins don't hook the formula-eval path at all — they exist to
 * be discovered via the registry's capability metadata (listAll()) and
 * queried directly for their palette by the UI layer. This shows that
 * `hooks` is entirely optional: a plugin can be pure data + an init().
 */

import type { IPlugin } from '../types.js';

export interface ThemePalette {
  name: string;
  background: string;
  foreground: string;
  accent: string;
  gridline: string;
}

const PALETTE: ThemePalette = {
  name: 'Lombok Dusk',
  background: '#1a1a2e',
  foreground: '#e6e6e6',
  accent: '#e94560',
  gridline: '#33334d',
};

export const plugin: IPlugin & { getPalette(): ThemePalette } = {
  name: '@lombok-themes/demo',
  version: '1.0.0',
  description: 'A single dark theme palette, discoverable by the UI layer.',
  author: 'LombokTableSheet',
  license: 'Apache-2.0',
  capabilities: ['theme-extension'],

  getPalette(): ThemePalette {
    return { ...PALETTE };
  },

  async init(engine: any) {
    // Real integration: engine.themes?.register(PALETTE.name, PALETTE);
    if (engine?.themes?.register) {
      engine.themes.register(PALETTE.name, PALETTE);
    }
  },
};

export default plugin;
