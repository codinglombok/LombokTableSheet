/**
 * @lombok-codecs/demo — Example codec-extension plugin.
 *
 * Registers a "TSV" (tab-separated) import/export codec via
 * 'registerCodec'. Also demonstrates the `dependencies` field: this
 * plugin declares a dependency on @lombok-formulas/demo, so the registry
 * will refuse to register it unless that plugin is already present and
 * its version satisfies the requested range — see PLUGIN_DEV_GUIDE.md
 * "Dependencies between plugins".
 */

import type { IPlugin } from '../types.js';

interface Codec {
  name: string;
  extensions: string[];
  encode(rows: string[][]): string;
  decode(text: string): string[][];
}

const tsvCodec: Codec = {
  name: 'TSV',
  extensions: ['.tsv', '.tab'],
  encode: (rows: string[][]) => rows.map(r => r.join('\t')).join('\n'),
  decode: (text: string) => text.split('\n').filter(l => l.length > 0).map(l => l.split('\t')),
};

export const plugin: IPlugin = {
  name: '@lombok-codecs/demo',
  version: '1.0.0',
  description: 'Adds a TSV import/export codec. Depends on @lombok-formulas/demo.',
  author: 'LombokTableSheet',
  license: 'Apache-2.0',
  capabilities: ['codec-extension'],

  // NOTE: this dependency is illustrative — a codec plugin has no real
  // technical need for a formula plugin. It's declared here purely to
  // demonstrate registry-enforced dependency ordering and version checks.
  dependencies: {
    '@lombok-formulas/demo': '^1.0.0',
  },

  hooks: [
    {
      hook: 'registerCodec',
      callback: () => tsvCodec,
    },
  ],

  async init(engine: any) {
    if (engine?.codecs?.register) {
      engine.codecs.register(tsvCodec.name, tsvCodec);
    }
  },
};

export default plugin;
