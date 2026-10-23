#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

function inspectMarkdown(relative, contents, root) {
  const issues = [];
  const fullpath = path.join(root, relative);
  const lines = contents.split(/\r?\n/);
  let fence = null;
  let quotedFence = null;
  let htmlBlock = null;
  let inComment = false;
  let inIndentedCode = false;
  let previousBlank = true;
  let listIndent = 0, listDepth = 0;
  let pendingReferenceTitle = null;
  const active = [];
  const blockTags = /^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|output|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[\s/>])/i;
  const fenceMarker = /^ {0,3}([\x60]{3,}|~{3,})(.*)$/;
  // Backtick-delimited inline code is literal text. Mask it before looking
  // for HTML comment delimiters, otherwise a literal `<!--` hides real links.
  function maskInlineCode(line) {
    // Fenced openers are blocks, not inline code spans.
    if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) return line;
    return line.replace(/(`+)([^\n]*?)\1/g, match => ' '.repeat(match.length));
  }
  // Strip the content indentation of simple list containers. A list item
  // beginning with a fence owns its indented following lines.
  function unwrapList(text, depth) {
    if (depth !== listDepth) { listIndent = 0; listDepth = depth; }
    const marker = /^ {0,3}(?:[-+*]|\d{1,9}[.)])(?:[ \t]+|$)/.exec(text);
    if (marker) {
      listIndent = marker[0].length;
      return { content: text.slice(listIndent), inList: true };
    }
    if (listIndent && text.startsWith(' '.repeat(listIndent))) {
      return { content: text.slice(listIndent), inList: true };
    }
    if (text.trim()) listIndent = 0;
    return { content: text, inList: false };
  }
  // CommonMark link destinations and optional quoted titles are inline data:
  // an HTML-looking "<!--" inside a URL/title must not start a comment.
  // Return a SAME-LENGTH detection mask; retain original text for link checks.
  // Bounded CommonMark subset: balanced bracket labels with escape support.
  const normalizeReference = label => label.replace(/\\([\[\]\\])/g, '$1')
    .trim().replace(/\s+/g, ' ').toLowerCase();
  function closingBracket(line, at) {
    let depth = 0;
    for (let i = at; i < line.length; i++) {
      if (line[i] === '\\') { i++; continue; }
      if (line[i] === '[') depth++;
      else if (line[i] === ']' && --depth === 0) return i;
    }
    return -1;
  }
  function isEscaped(line, at) {
    let count = 0;
    for (let i = at - 1; i >= 0 && line[i] === '\\'; i--) count++;
    return count % 2 === 1;
  }
  function closingDestination(line, open) {
    let depth = 0, quoted = null;
    for (let i = open; i < line.length; i++) {
      const c = line[i];
      if (c === '\\') { i++; continue; }
      if (quoted) { if (c === quoted) quoted = null; continue; }
      if (c === '"' || c === "'") { quoted = c; continue; }
      if (c === '(') depth++;
      else if (c === ')' && --depth === 0) return i;
    }
    return -1;
  }
  // Definitions may follow their uses. An unreferenced '[text <!--]' is not
  // a link and must NOT mask an actual HTML comment opener.
  const knownReferences = new Set();
  for (const sourceLine of lines) {
    const start = /^ {0,3}\[/.exec(sourceLine);
    if (!start) continue;
    const end = closingBracket(sourceLine, start[0].length - 1);
    if (end !== -1 && sourceLine[end + 1] === ':' &&
        /^\s*(?:<[^>]+>|\S+)/.test(sourceLine.slice(end + 2))) {
      knownReferences.add(normalizeReference(sourceLine.slice(start[0].length, end)));
    }
  }
  function maskLinkMetadata(line) {
    const start = /^ {0,3}\[/.exec(line);
    if (start) {
      const end = closingBracket(line, start[0].length - 1);
      if (end !== -1 && line[end + 1] === ':' &&
          /^\s*(?:<[^>]+>|\S+)/.test(line.slice(end + 2))) {
        return ' '.repeat(line.length);
      }
    }
    const chars = line.split(''); // Preserve UTF-16 RegExp offsets.
    const hide = (from, until) => {
      for (let k = from; k < until; k++) chars[k] = ' ';
    };
    for (let i = 0; i < line.length; i++) {
      const image = line[i] === '!' && line[i + 1] === '[' && !isEscaped(line, i);
      const open = image ? i + 1 : i;
      if (line[open] !== '[' || isEscaped(line, open)) continue;
      const end = closingBracket(line, open);
      if (end === -1) continue;
      const label = line.slice(open + 1, end);
      const after = end + 1;
      if (line[after] === '(') {
        const close = closingDestination(line, after);
        if (close < 0) continue;
        hide(i, close + 1);
        i = close;
      } else if (line[after] === '[') {
        const close = closingBracket(line, after);
        if (close < 0) continue;
        const ref = line.slice(after + 1, close) || label;
        if (!knownReferences.has(normalizeReference(ref))) continue;
        hide(i, close + 1);
        i = close;
      } else if (knownReferences.has(normalizeReference(label))) {
        hide(i, after);
        i = end;
      }
    }
    return chars.join('');
  }
  // HTML comments take precedence over inline-code syntax inside them.
  // Outside comments, inline code and backslash escaping block openers.
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
        continue;
      }
      const visible = maskInlineCode(line.slice(cursor));
      const detect = maskLinkMetadata(visible);
      let open = detect.indexOf('<!--');
      while (open !== -1) {
        let slashCount = 0;
        for (let j = open - 1; j >= 0 && visible[j] === '\\'; j--) slashCount++;
        if (slashCount % 2 === 0) break;
        open = detect.indexOf('<!--', open + 4);
      }
      if (open === -1) {
        result += visible;
        break;
      }
      result += visible.slice(0, open) + '    ';
      cursor += open + 4;
      inComment = true;
    }
    return result;
  }
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Strip blockquote containers only for block classification. Ordinary
    // blockquoted links are still inspected once the container is removed.
    const prefix = /^ {0,3}(?:>[ \t]?)+/.exec(raw)?.[0] || '';
    const depth = (prefix.match(/>/g) || []).length;
    const list = unwrapList(raw.slice(prefix.length), depth);
    const text = list.content;
    // A link reference title may occupy the next (possibly indented) line.
    // Consume it as link metadata before indented-code and HTML-comment
    // scanning; a literal <!-- inside its quotes cannot hide later links.
    const title = pendingReferenceTitle?.depth === depth &&
      /^(?: {0,4}|\t)(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\((?:\\.|[^)])*\))[ \t]*$/.test(text);
    pendingReferenceTitle = null;
    if (title) {
      inIndentedCode = false;
      previousBlank = false;
      continue;
    }
    // A fenced list item ends when its container is exited; it cannot
    // swallow an unindented Markdown link that follows the list.
    if (fence?.list && !list.inList && text.trim()) fence = null;
    if (quotedFence?.list && !list.inList && text.trim()) quotedFence = null;
    if (fence || quotedFence) {
      const current = fence || quotedFence;
      if (!quotedFence || current.depth === depth) {
        const marker = fenceMarker.exec(text);
        if (marker && marker[1][0] === current.char &&
            marker[1].length >= current.length && /^\s*$/.test(marker[2])) {
          fence = null;
          quotedFence = null;
        }
        continue;
      }
      // Blank lines outside a quote retain an unclosed fence until EOF.
      // A nonblank line exits the quote and reports the missing closer.
      if (!text.trim()) continue;
      issues.push(relative + ':' + current.line + ': unclosed ' +
        current.char.repeat(current.length) + ' code fence');
      quotedFence = null;
    }
    if (htmlBlock && htmlBlock.depth !== depth) htmlBlock = null;
    if (htmlBlock) {
      if (htmlBlock.close) {
        if (htmlBlock.close.test(text)) htmlBlock = null;
        continue;
      }
      if (text.trim()) continue;
      htmlBlock = null;
    }
    // Indented code is literal, and cannot start an HTML comment. If
    // already inside a comment, even indented closing delimiters can end it.
    const indented = /^(?: {4}|\t)/.test(text);
    if (!inComment && indented && (previousBlank || inIndentedCode)) {
      inIndentedCode = true;
      previousBlank = false;
      continue;
    }
    inIndentedCode = false;
    const line = maskHtmlComments(text);
    if (!line.trim()) {
      previousBlank = true;
      continue;
    }
    // CommonMark raw-text HTML blocks run through the matching end tag, even
    // across blank lines. Block-level HTML runs until the next blank line.
    const rawText = /^ {0,3}<(script|pre|style|textarea)(?=[\s>])/i.exec(line);
    if (rawText) {
      const close = new RegExp('</' + rawText[1] + '[\\s>]', 'i');
      if (!close.test(line)) htmlBlock = { depth, close };
      continue;
    }
    if (/^ {0,3}<!\[CDATA\[/i.test(line)) {
      if (!line.includes(']]>')) htmlBlock = { depth, close: /\]\]>/ };
      continue;
    }
    if (/^ {0,3}<\?/.test(line)) {
      if (!line.includes('?>')) htmlBlock = { depth, close: /\?>/ };
      continue;
    }
    if (/^ {0,3}<![A-Z]/.test(line)) {
      if (!line.includes('>')) htmlBlock = { depth, close: />/ };
      continue;
    }
    if (blockTags.test(line) ||
        previousBlank && /^ {0,3}<\/?[A-Za-z][^>]*>\s*$/.test(line)) {
      htmlBlock = { depth, close: null };
      continue;
    }
    const marker = fenceMarker.exec(line);
    if (marker) {
      const value = { char: marker[1][0], length: marker[1].length, line: i + 1, list: list.inList };
      if (depth) quotedFence = { ...value, depth };
      else fence = value;
      previousBlank = false;
      continue;
    }
    active.push({ text: line, number: i + 1 });
    // Only the immediately following line can be a reference title.
    // Restrict the opening line to a link label and destination without
    // a same-line title, matching the supported static reference grammar.
    if (/^ {0,3}\[[^\]\n]+\]:[ \t]*(?:<(?:\\.|[^>])*>|\S+)[ \t]*$/.test(line)) {
      pendingReferenceTitle = { depth };
    }
    previousBlank = false;
  }
  const hangingFence = fence || quotedFence;
  if (hangingFence) issues.push(relative + ':' + hangingFence.line + ': unclosed ' +
    hangingFence.char.repeat(hangingFence.length) + ' code fence');

  const labels = new Map();
  const normalizeLabel = normalizeReference;
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
  const definitions = /^ {0,3}\[((?:\\.|[^\]])+)\]:\s*(?:<((?:\\.|[^>])*)>|(\S+))/;
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
      if (line[i] !== '[' || isEscaped(line, i)) continue;
      // Use the SAME escaped/nested bracket grammar used by the HTML comment
      // masker. Otherwise an active nested-label link is invisible here.
      const end = closingBracket(line, i);
      if (end < 0) continue;
      const label = line.slice(i + 1, end);
      const next = line[end + 1];
      if (next === '[') {
        const referenceEnd = closingBracket(line, end + 1);
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
