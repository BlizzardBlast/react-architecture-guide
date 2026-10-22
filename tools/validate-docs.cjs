#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function inspectMarkdown(relative, contents, root) {
  const issues = [];
  const fullpath = path.join(root, relative);
  const lines = contents.split(/\r?\n/);
  let fence = null;
  let inComment = false;
  let inIndentedCode = false;
  let previousBlank = true;
  const active = [];
  // HTML comments may span lines; preserve line positions when masking them.
  function maskHtmlComments(line) {
    let result = '';
    let cursor = 0;
    while (cursor < line.length) {
      if (inComment) {
        const close = line.indexOf('-->', cursor);
        if (close === -1) {
          result += ' '.repeat(line.length - cursor);
          break;
        }
        result += ' '.repeat(close + 3 - cursor);
        cursor = close + 3;
        inComment = false;
      } else {
        const open = line.indexOf('<!--', cursor);
        if (open === -1) {
          result += line.slice(cursor);
          break;
        }
        result += line.slice(cursor, open) + '    ';
        cursor = open + 4;
        inComment = true;
      }
    }
    return result;
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(raw);
      if (closing && closing[1][0] === fence.char &&
          closing[1].length >= fence.length && /^\s*$/.test(closing[2])) fence = null;
      continue;
    }
    const line = maskHtmlComments(raw);
    if (!line.trim()) {
      previousBlank = true;
      continue;
    }
    // Four spaces or a tab form an indented code block only when they do
    // not interrupt a paragraph. Use the original indentation rather than
    // whitespace introduced while masking comments.
    const indented = /^(?: {4}|\t)/.test(raw);
    if (indented && (previousBlank || inIndentedCode)) {
      inIndentedCode = true;
      previousBlank = false;
      continue;
    }
    inIndentedCode = false;
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (marker) {
      fence = { char: marker[1][0], length: marker[1].length, line: i + 1 };
      previousBlank = false;
      continue;
    }
    active.push({ text: line, number: i + 1 });
    previousBlank = false;
  }
  if (fence) issues.push(relative + ':' + fence.line + ': unclosed ' +
    fence.char.repeat(fence.length) + ' code fence');

  const labels = new Map();
  const normalizeLabel = s => s.trim().replace(/\s+/g, ' ').toLowerCase();
  const unescapeMarkdown = s => s.replace(/\\([\\()[\]<> !])/g, '$1');
  const inspect = (href, lineNumber) => {
    href = unescapeMarkdown(href.trim());
    if (!href || /^(?:https?:|mailto:|tel:|data:|#)/i.test(href)) return;
    let destination;
    try { destination = decodeURIComponent(href.split('#')[0].split('?')[0]); }
    catch { issues.push(relative + ':' + lineNumber + ': invalid URL encoding: ' + href); return; }
    if (!destination) return;
    const target = path.resolve(path.dirname(fullpath), destination);
    if (target !== root && !target.startsWith(root + path.sep))
      issues.push(relative + ':' + lineNumber + ': outside-repository link: ' + href);
    else if (!fs.existsSync(target))
      issues.push(relative + ':' + lineNumber + ': missing local link: ' + href);
  };
  const definitions = /^ {0,3}\[([^\]]+)\]:\s*(?:<((?:\\.|[^>])*)>|(\S+))/;
  for (const row of active) {
    const match = definitions.exec(row.text);
    if (!match) continue;
    const target = match[2] === undefined ? match[3] : match[2];
    labels.set(normalizeLabel(match[1]), { target, line: row.number });
    inspect(target, row.number);
  }
  // Balanced inline destinations include nested parentheses and spaces in <...>.
  // Full and collapsed reference links use definitions collected ahead of time.
  for (const row of active) {
    if (definitions.test(row.text)) continue;
    const line = row.text.replace(/(`+)([\s\S]*?)\1/g, match => ' '.repeat(match.length));
    for (let i = 0; i < line.length; i++) {
      if (line[i] !== '[' || i > 0 && line[i - 1] === '\\') continue;
      let end = i + 1;
      for (; end < line.length; end++) {
        if (line[end] === '\\') { end++; continue; }
        if (line[end] === ']') break;
      }
      if (end >= line.length) break;
      const label = line.slice(i + 1, end);
      const next = line[end + 1];
      if (next === '[') {
        const referenceEnd = line.indexOf(']', end + 2);
        if (referenceEnd >= 0) {
          const ref = normalizeLabel(line.slice(end + 2, referenceEnd) || label);
          const def = labels.get(ref);
          if (def) inspect(def.target, row.number);
          else issues.push(relative + ':' + row.number + ': missing reference definition: ' + ref);
          i = referenceEnd;
        }
      } else if (next === '(') {
        let cursor = end + 2;
        while (line[cursor] === ' ' || line[cursor] === '\t') cursor++;
        let href = '';
        if (line[cursor] === '<') {
          const start = ++cursor;
          for (; cursor < line.length &&
              (line[cursor] !== '>' || line[cursor - 1] === '\\'); cursor++);
          if (cursor >= line.length) continue;
          href = line.slice(start, cursor++);
        } else {
          let depth = 0;
          const start = cursor;
          for (; cursor < line.length; cursor++) {
            if (line[cursor] === '\\') { cursor++; continue; }
            if (line[cursor] === '(') depth++;
            else if (line[cursor] === ')') { if (depth === 0) break; depth--; }
            else if (/\s/.test(line[cursor]) && depth === 0) break;
          }
          href = line.slice(start, cursor);
        }
        // Permit a quoted optional title after an existing link destination.
        while (cursor < line.length && line[cursor] !== ')') {
          if (line[cursor] === '\\') cursor++;
          cursor++;
        }
        if (cursor < line.length) { inspect(href, row.number); i = cursor; }
      }
    }
  }
  return [...new Set(issues)];
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
