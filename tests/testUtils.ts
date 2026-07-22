import { JSDOM } from 'jsdom';

const MIRRORED_KEYS = [
  'window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node', 'Event',
  'KeyboardEvent', 'MouseEvent', 'CustomEvent', 'DocumentFragment', 'Text',
  'HTMLInputElement', 'HTMLTableElement', 'HTMLDivElement', 'Comment',
] as const;

/** Installs a fresh jsdom document as globalThis.document/window (and friends) for a test.
 *  React/Vue's runtime both feature-detect against these globals, so a handful of
 *  DOM constructors need to be present, not just `document`. */
export function installDom(): { window: JSDOM['window']; cleanup: () => void } {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const g = globalThis as unknown as Record<string, unknown>;
  const prev: Record<string, unknown> = {};
  for (const key of MIRRORED_KEYS) prev[key] = g[key];
  const prevNavigator = (globalThis as unknown as { navigator?: unknown }).navigator;
  const prevActEnv = g.IS_REACT_ACT_ENVIRONMENT;

  for (const key of MIRRORED_KEYS) {
    const val = (dom.window as unknown as Record<string, unknown>)[key];
    if (val !== undefined) g[key] = val;
  }
  Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
  g.IS_REACT_ACT_ENVIRONMENT = true;

  return {
    window: dom.window,
    cleanup: () => {
      for (const key of MIRRORED_KEYS) g[key] = prev[key];
      Object.defineProperty(globalThis, 'navigator', { value: prevNavigator, configurable: true });
      g.IS_REACT_ACT_ENVIRONMENT = prevActEnv;
    },
  };
}
