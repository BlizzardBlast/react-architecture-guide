'use strict';
// Disposable compatibility probe, not a proposed production replacement.
const fs = require('node:fs');
const path = require('node:path');
const md = require('markdown-it')({html: true});
function inspectMarkdown(relative, contents, root) {
  const issues = [];
  const env = {};
  const tokens = md.parse(contents, env);
  const lines = contents.split(/\r?\n/);
  function inspect(href, line) {
    if (!href || /^(?:https?:|mailto:|tel:|data:|#)/i.test(href)) return;
    let destination;
    try { destination = decodeURIComponent(href.split('#')[0].split('?')[0]); }
    catch { issues.push(`${relative}:${line}: invalid URL encoding: ${href}`); return; }
    if (!destination) return;
    const target = path.resolve(path.dirname(path.join(root, relative)), destination);
    if (target !== root && !target.startsWith(root + path.sep)) issues.push(`${relative}:${line}: outside-repository link: ${href}`);
    else if (!fs.existsSync(target)) issues.push(`${relative}:${line}: missing local link: ${href}`);
  }
  for (const ref of Object.values(env.references || {})) inspect(ref.href, 1);
  for (const token of tokens) {
    const line = (token.map?.[0] ?? 0) + 1;
    if (token.type === 'fence') {
      const last = lines[token.map[1] - 1] || '';
      const marker = token.markup;
      const close = new RegExp(marker[0] === '`' ? '`{' + marker.length + ',}\\s*$' : '~{' + marker.length + ',}\\s*$');
      if (token.map[1] - token.map[0] < 2 || !close.test(last)) issues.push(`${relative}:${line}: unclosed ${marker} code fence`);
    }
    for (const child of token.children || []) {
      if (child.type === 'link_open') inspect(child.attrGet('href'), line);
      if (child.type === 'image') inspect(child.attrGet('src'), line);
    }
  }
  return [...new Set(issues)];
}
function checkAll(root) {
  const issues = []; let count = 0;
  function walk(dir) {
    for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
      if (['.git', 'node_modules', 'dist', 'coverage'].includes(item.name)) continue;
      const full = path.join(dir, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.name.endsWith('.md')) { count++; issues.push(...inspectMarkdown(path.relative(root, full), fs.readFileSync(full, 'utf8'), root)); }
    }
  }
  walk(root); return {issues, count};
}
module.exports = {inspectMarkdown, checkAll};
