#!/usr/bin/env node
/**
 * Verifies an assembled Pages site before it is uploaded.
 *
 * Why this exists: the demo once deployed as a blank page. The build was green —
 * `cp` and `sed` both succeeded — but the HTML imported a module the browser
 * could not load, so nothing rendered below the heading. A build that cannot
 * tell the difference between "deployed" and "works" is not much of a check.
 *
 * Why it is a file rather than inline `run:` shell: the first version WAS
 * inline, and its nested quoting was a shell syntax error that killed the step.
 * A real file can be executed locally, verbatim, before it is committed.
 *
 * What it checks, and why each check exists:
 *   1. no leftover '../../dist/' specifier  — would 404 on the flatter site layout
 *   2. every imported file is present       — `files`/build gaps
 *   3. no `node:` import anywhere in the    — caught the xlsx -> zip -> node:zlib chain
 *      transitively reachable graph
 *   4. no Node-only global in that graph    — caught `Buffer.byteLength` in the CSV,
 *                                             JSON and HTML decoders, which threw
 *                                             "Buffer is not defined" in the browser
 *                                             even though no `node:` import was involved
 *
 * Check 4 exists because check 3 was not enough: avoiding `node:` specifiers
 * says nothing about globals the runtime is assumed to provide.
 *
 * Usage:  node scripts/verify-pages-site.mjs <site-dir>
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, normalize } from 'node:path';

const siteDir = process.argv[2];
if (!siteDir) {
  console.error('usage: verify-pages-site.mjs <site-dir>');
  process.exit(2);
}

const indexPath = join(siteDir, 'index.html');
if (!existsSync(indexPath)) {
  console.error(`No index.html in ${siteDir}`);
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const problems = [];

if (html.includes('../../dist/')) {
  problems.push("an unrewritten '../../dist/' specifier remains in index.html");
}

const entries = [...html.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map(m => m[1]);
if (entries.length === 0) {
  problems.push('index.html imports no modules at all — the demo would render nothing');
}

/** Node globals a browser does not provide. `require` catches stray CJS output. */
const NODE_GLOBALS = ['Buffer', 'process', 'require', '__dirname', '__filename', 'global'];

/** Strip block and line comments so prose about Node globals is not flagged. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const visited = new Set();
const queue = [];
for (const e of entries) {
  if (!existsSync(join(siteDir, e))) {
    problems.push(`index.html imports ${e}, which is not in the site directory`);
  } else {
    queue.push(normalize(e));
  }
}

// Walk the module graph the page actually reaches. Files that ship in dist but
// are never imported (xlsx, zip) are irrelevant and must not fail the build.
while (queue.length > 0) {
  const rel = queue.shift();
  if (visited.has(rel)) continue;
  visited.add(rel);

  const abs = join(siteDir, rel);
  if (!existsSync(abs)) {
    problems.push(`${rel} is imported but missing from the site directory`);
    continue;
  }
  const src = readFileSync(abs, 'utf8');

  for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    if (spec.startsWith('node:')) {
      problems.push(`${rel} imports ${spec}, which a browser cannot resolve`);
      continue;
    }
    if (!spec.startsWith('.')) continue; // bare specifier: not ours to resolve
    queue.push(normalize(join(dirname(rel), spec)));
  }

  // Comments legitimately discuss these names — `bytes.js` explains why it does
  // NOT use Buffer — so scan code only. First version of this check flagged its
  // own explanatory comment.
  const code = stripComments(src);
  for (const g of NODE_GLOBALS) {
    // Word-boundary match, skipping property accesses like `foo.process`.
    const re = new RegExp(`(^|[^.\\w$])${g}\\s*[.(\\[]`, 'm');
    if (re.test(code)) {
      problems.push(`${rel} uses the Node-only global \`${g}\``);
    }
  }
}

if (problems.length > 0) {
  console.error('Pages site would not load:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Pages site verified: ${visited.size} module(s) reachable, none Node-only`);
