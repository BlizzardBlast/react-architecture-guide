#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function inspectMarkdown(relative, contents, root) {
  const issues = [];
  let fence = null;
  const fullpath = path.join(root, relative);
  const lines = contents.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (opening && opening[1][0] === fence.char &&
          opening[1].length >= fence.length && /^\s*$/.test(opening[2])) {
        fence = null;
      }
      continue;
    }
    if (opening) {
      fence = { char: opening[1][0], length: opening[1].length, line: i + 1 };
      continue;
    }
    for (const match of line.matchAll(/(?<!!)\[[^\]]*\]\(([^)]+)\)/g)) {
      const href = match[1].trim().split(/\s+/)[0].replace(/^<|>$/g, '');
      if (!href || /^(https?:|mailto:|#)/i.test(href)) continue;
      let destination;
      try { destination = decodeURIComponent(href.split('#')[0].split('?')[0]); }
      catch { issues.push(relative + ':' + (i + 1) + ': invalid URL encoding: ' + href); continue; }
      if (!destination) continue;
      const target = path.resolve(path.dirname(fullpath), destination);
      if (target !== root && !target.startsWith(root + path.sep)) {
        issues.push(relative + ':' + (i + 1) + ': outside-repository link: ' + href);
      } else if (!fs.existsSync(target)) {
        issues.push(relative + ':' + (i + 1) + ': missing local link: ' + href);
      }
    }
  }
  if (fence) issues.push(relative + ':' + fence.line + ': unclosed ' + fence.char.repeat(fence.length) + ' code fence');
  return issues;
}

function checkAll(root) {
  const issues = [];
  let count = 0;
  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist', 'coverage'].includes(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.name.endsWith('.md')) {
        count++;
        const relative = path.relative(root, full);
        issues.push(...inspectMarkdown(relative, fs.readFileSync(full, 'utf8'), root));
      }
    }
  }
  walk(root);
  return { issues, count };
}
if (require.main === module) {
  const root = path.resolve(__dirname, '..');
  const result = checkAll(root);
  for (const issue of result.issues) console.error('FAIL ' + issue);
  if (result.issues.length) process.exitCode = 1;
  else console.log('PASS ' + result.count + ' Markdown files: links and matching fences');
}
module.exports = { inspectMarkdown, checkAll };
