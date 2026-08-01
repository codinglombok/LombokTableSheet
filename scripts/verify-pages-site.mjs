#!/usr/bin/env node
/**
 * Verifies an assembled Pages site before it is uploaded.
 *
 * Why this exists: the demo once deployed as a blank page for weeks. The build
 * was green — `cp` and `sed` both succeeded — but the HTML it produced imported
 * a module specifier the browser could not resolve, so nothing rendered below
 * the heading. A build that cannot tell the difference between "deployed" and
 * "works" is not much of a check.
 *
 * Why it is a file rather than inline `run:` shell: the first version of this
 * check WAS inline, and its nested quoting (`tr -d \"'\"`) was a shell syntax
 * error that killed the whole step. A real file can be executed locally,
 * verbatim, before it is committed — which is the only way to know it works.
 *
 * Usage:  node scripts/verify-pages-site.mjs <site-dir>
 * Exits non-zero, with the reason on stderr, if the site would not load.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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

// 1. Every repo-root-relative specifier must have been rewritten for the
//    flatter Pages layout. One survivor means a 404 at load time.
if (html.includes('../../dist/')) {
  problems.push("an unrewritten '../../dist/' specifier remains in index.html");
}

// 2. Every relative specifier the page imports must actually be in the artifact.
const specifiers = [...html.matchAll(/from\s+['"](\.\/[^'"]+)['"]/g)].map(m => m[1]);
for (const spec of specifiers) {
  if (!existsSync(join(siteDir, spec))) {
    problems.push(`imports ${spec}, which is not in the site directory`);
  }
}

// 3. The page must not import anything that reaches a Node built-in. Resolving
//    the full module graph here would duplicate the bundler's job, so this
//    checks the one entry point known to pull in `node:zlib` via xlsx -> zip.
//    Keep this list in step with DEPLOYMENT.md's browser-safe/Node-only table.
const nodeOnly = ['./dist/index.js', './dist/formats/xlsx.js', './dist/formats/zip.js'];
for (const spec of specifiers) {
  if (nodeOnly.includes(spec)) {
    problems.push(`imports ${spec}, which reaches a node: built-in and cannot load in a browser`);
  }
}

if (specifiers.length === 0) {
  problems.push('index.html imports no modules at all — the demo would render nothing');
}

if (problems.length > 0) {
  console.error('Pages site would not load:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Pages site verified: ${specifiers.length} import(s) resolve, none Node-only`);
