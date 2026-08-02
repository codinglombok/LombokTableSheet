#!/usr/bin/env node
/**
 * Fails if any action in .github/workflows is referenced by tag instead of a
 * full-length commit SHA.
 *
 * This repository has "require actions to be pinned to a full-length commit
 * SHA" enabled, so an unpinned reference does not merely warn — the job dies
 * in "Set up job" before a single step runs, and the error appears only in the
 * Actions log. That has now happened twice: once for the whole workflow set,
 * and again when a single file was overwritten from an out-of-date copy and
 * silently reverted `upload-pages-artifact` to `@v3`.
 *
 * Catching it here means it surfaces in CI and locally, not as a mystery
 * failure after a push.
 *
 * Usage:  node scripts/check-action-pins.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = '.github/workflows';
const SHA = /^[0-9a-f]{40}$/;

const problems = [];
let checked = 0;

for (const file of readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))) {
  const lines = readFileSync(join(dir, file), 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    const m = /^\s*-?\s*uses:\s*(\S+)/.exec(line);
    if (!m) return;
    const ref = m[1];
    if (ref.startsWith('./') || ref.startsWith('docker://')) return; // local / image refs
    checked++;
    const at = ref.lastIndexOf('@');
    const version = at === -1 ? '' : ref.slice(at + 1);
    if (!SHA.test(version)) {
      problems.push(`${file}:${idx + 1}  ${ref}`);
    }
  });
}

if (problems.length > 0) {
  console.error('Actions must be pinned to a full-length commit SHA:');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\nResolve a tag to its SHA with:');
  console.error('  git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag>');
  process.exit(1);
}

console.log(`All ${checked} action reference(s) are SHA-pinned.`);
