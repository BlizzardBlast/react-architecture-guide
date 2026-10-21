#!/usr/bin/env node
// Cross-platform link/fence check, independent of dependencies or Python.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const errors = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.md')) check(file);
  }
}
function check(file) {
  const relative = path.relative(root, file);
  const content = fs.readFileSync(file, 'utf8');
  const fenceLines = content.split(/\r?\n/).filter(line => /^\s*(?:```|~~~)/.test(line));
  if (fenceLines.length % 2 !== 0) errors.push(`${relative}: unbalanced fences`);
  const prose = content.replace(/(?:~~~|```)[\s\S]*?(?:~~~|```)/g, '');
  for (const m of prose.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
    const href = m[1].trim().split(/\s+/)[0].replace(/^<|>$/g, '');
    if (!href || /^(https?:|mailto:|#)/.test(href)) continue;
    const target = decodeURIComponent(href.split('#')[0].split('?')[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      errors.push(`${relative}: outside repository link ${href}`);
    } else if (!fs.existsSync(resolved)) errors.push(`${relative}: missing ${href}`);
  }
}
walk(root);
if (errors.length) { for (const e of errors) console.error('FAIL',e); process.exit(1); }
console.log('PASS markdown local links and code fences');
