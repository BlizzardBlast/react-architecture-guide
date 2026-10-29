'use strict';
// Disposable compatibility probe, not a proposed production replacement.
const fs = require('node:fs');
const path = require('node:path');
const md = require('markdown-it')({html: true});
const normalizeLink = md.normalizeLink.bind(md);
md.normalizeLink = href => {
  try { decodeURIComponent(href.split('#')[0].split('?')[0]); }
  catch { return href; }
  return normalizeLink(href);
};
// Capture locations while markdown-it still has the inline source cursor.
md.inline.parse = function (source, parser, env, output) {
  const state = new this.State(source, parser, env, output);
  const breaks = [];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') breaks.push(i);
  state.sourceLineAt = position => {
    let low = 0, high = breaks.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (breaks[mid] < position) low = mid + 1;
      else high = mid;
    }
    return env.blockLine + low;
  };
  const push = state.push.bind(state);
  state.push = (type, tag, nesting) => {
    const token = push(type, tag, nesting);
    token.sourceLine = state.sourceLineAt(state.pos);
    return token;
  };
  env.inlineDepth = (env.inlineDepth || 0) + 1;
  try {
    this.tokenize(state);
    for (const rule of this.ruler2.getRules('')) rule(state);
  } finally { env.inlineDepth--; }
};
md.core.ruler.at('inline', state => {
  for (const token of state.tokens) {
    if (token.type !== 'inline') continue;
    state.env.blockLine = (token.map?.[0] ?? 0) + 1;
    state.md.inline.parse(token.content, state.md, state.env, token.children);
  }
});
const referenceRule = md.block.ruler.__rules__.find(rule => rule.name === 'reference');
const originalReference = referenceRule.fn;
md.block.ruler.at('reference', (state, start, end, silent) => {
  if (silent) return originalReference(state, start, end, silent);
  const references = state.env.references;
  state.env.references = Object.create(null);
  let matched;
  try { matched = originalReference(state, start, end, false); }
  finally {
    const found = state.env.references;
    state.env.references = references || Object.create(null);
    for (const [label, reference] of Object.entries(found)) {
      state.env.definitions.push({reference, line: start + 1});
      if (!Object.hasOwn(state.env.references, label)) state.env.references[label] = reference;
    }
  }
  return matched;
}, {alt: referenceRule.alt});
md.inline.ruler.before('link', 'missing_explicit_reference', (state, silent) => {
  if (silent || state.env.inlineDepth !== 1 || state.src[state.pos] !== '[') return false;
  const end = state.md.helpers.parseLinkLabel(state, state.pos, true);
  if (end < 0 || state.src[end + 1] !== '[') return false;
  const referenceEnd = state.md.helpers.parseLinkLabel(state, end + 1);
  if (referenceEnd < 0) return false;
  const label = state.src.slice(end + 2, referenceEnd) || state.src.slice(state.pos + 1, end);
  const key = state.md.utils.normalizeReference(label);
  if (!Object.hasOwn(state.env.references || {}, key)) {
    state.env.missingReferences.push({
      label: label.replace(/\\([\[\]\\])/g, '$1').trim().replace(/\s+/g, ' ').toLowerCase(),
      line: state.sourceLineAt(state.pos),
    });
  }
  return false;
});
function splitQuote(line) {
  const prefix = /^ {0,3}(?:>[ \t]?)+/.exec(line)?.[0] || '';
  return {prefix, content: line.slice(prefix.length), depth: (prefix.match(/>/g) || []).length};
}
function preserveListFenceVisibility(contents) {
  const lines = contents.split(/\r?\n/);
  const tokens = md.parse(contents, {missingReferences: [], definitions: []});
  const listMarker = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/;
  for (const token of tokens) {
    if (token.type !== 'fence') continue;
    const start = splitQuote(lines[token.map[0]]);
    const opener = listMarker.exec(start.content);
    if (!opener) continue;
    const last = splitQuote(lines[token.map[1] - 1] || '');
    const next = splitQuote(lines[token.map[1]] || '');
    const marker = token.markup;
    const close = new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}[ \\t]*$');
    if (close.test(last.content.trimStart()) || next.depth !== start.depth || !listMarker.test(next.content)) continue;
    let indent = opener[0].length;
    for (let i = token.map[1]; i < lines.length; i++) {
      const line = splitQuote(lines[i]);
      if (!line.content.trim()) continue;
      if (line.depth !== start.depth) break;
      const item = listMarker.exec(line.content);
      if (item) indent = item[0].length;
      else if (!line.content.startsWith(' '.repeat(indent))) break;
      const content = line.content.slice(indent);
      if (close.test(content)) {
        lines[i] = line.prefix + ' '.repeat(indent) + content;
        break;
      }
      lines[i] = line.prefix + ' '.repeat(line.content.length);
    }
  }
  return lines.join('\n');
}
function inspectMarkdown(relative, contents, root) {
  const issues = [];
  const fenceIssues = [];
  const env = {missingReferences: [], definitions: []};
  const visible = preserveListFenceVisibility(contents);
  const tokens = md.parse(visible, env);
  const lines = visible.split('\n');
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
  for (const definition of env.definitions) inspect(definition.reference.href, definition.line);
  for (const ref of env.missingReferences) issues.push(`${relative}:${ref.line}: missing reference definition: ${ref.label}`);
  for (const token of tokens) {
    const line = (token.map?.[0] ?? 0) + 1;
    if (token.type === 'fence') {
      const last = lines[token.map[1] - 1] || '';
      const marker = token.markup;
      const close = new RegExp('^\\s*(?:>\\s*)*' + (marker[0] === '`' ? '`' : '~') + '{' + marker.length + ',}\\s*$');
      const start = splitQuote(lines[token.map[0]]);
      const next = splitQuote(lines[token.map[1]] || '');
      const listMarker = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/;
      const exitedList = listMarker.test(start.content) && token.map[1] < lines.length && next.content.trim() &&
        !(start.depth !== next.depth && listMarker.test(next.content));
      if (!exitedList && (token.map[1] - token.map[0] < 2 || !close.test(last))) fenceIssues.push(`${relative}:${line}: unclosed ${marker} code fence`);
    }
    if (token.type === 'html_block' && /^\s*<!--/.test(token.content)) {
      const close = token.content.indexOf('-->');
      if (close >= 0) {
        const before = token.content.slice(0, close + 3);
        const rest = token.content.slice(close + 3).split('\n')[0];
        const tailLine = line + (before.match(/\n/g) || []).length;
        const tailEnv = {missingReferences: [], definitions: [], references: env.references};
        for (const child of md.parseInline(rest, tailEnv)[0].children || []) {
          if (child.type === 'link_open') inspect(child.attrGet('href'), tailLine);
          if (child.type === 'image') inspect(child.attrGet('src'), tailLine);
        }
        for (const ref of tailEnv.missingReferences) issues.push(`${relative}:${tailLine}: missing reference definition: ${ref.label}`);
      }
    }
    for (const child of token.children || []) {
      if (child.type === 'link_open') inspect(child.attrGet('href'), child.sourceLine ?? line);
      if (child.type === 'image') inspect(child.attrGet('src'), child.sourceLine ?? line);
    }
  }
  return [...new Set([...fenceIssues, ...issues])];
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
