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
  const atxHeading = /^ {0,3}#{1,6}(?:[ \t]+|$)/;
  function interruptsParagraph(text) {
    return !text.trim() || atxHeading.test(text) ||
      /^ {0,3}(?:=+|-+)[ \t]*$/.test(text) ||
      /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:_[ \t]*){3,}|(?:-[ \t]*){3,})$/.test(text) ||
      fenceMarker.test(text) || blockTags.test(text) ||
      /^ {0,3}<![A-Z]/.test(text) ||
      /^ {0,3}(?:<!--|<\?|<!\[CDATA\[|<(?:script|pre|style|textarea)(?=[\s>]))/i.test(text);
  }
  // Code spans can cross lines *within one paragraph*. Track matching
  // backtick-run lengths so <!-- inside a multiline span stays literal.
  // A run with no closer is ordinary text, not a code-span opener.
  let codeSpanTicks = 0;
  function hasCodeSpanCloser(text, from, size, lineIndex) {
    const start = blocks[lineIndex];
    for (let row = lineIndex; row < lines.length; row++) {
      const block = blocks[row];
      // An ordered list starts at 1 when interrupting a paragraph; empty
      // items cannot interrupt it. Existing lists may have other siblings.
      const newItem = block.item && (start.inList || block.content.trim() &&
        (/^[-+*]$/.test(block.item) || parseInt(block.item, 10) === 1));
      const candidate = row === lineIndex ? text.slice(from) :
        block.item && !newItem ? block.item + ' ' + block.content : block.content;
      // CommonMark block constructs interrupt a paragraph before inline
      // backtick matching. A backtick inside a block HTML comment is *not*
      // a closer for the preceding paragraph's code span.
      if (row !== lineIndex && (atxHeading.test(start.content) ||
          interruptsParagraph(candidate) || newItem ||
          block.depth > blocks[row - 1].depth)) return false;
      for (const match of candidate.matchAll(/`+/g)) {
        if (match[0].length === size) return true;
      }
    }
    return false;
  }
  function maskInlineCode(text, lineIndex) {
    const chars = text.split('');
    for (let i = 0; i < text.length;) {
      if (text[i] !== '`') {
        if (codeSpanTicks) chars[i] = ' ';
        i++;
        continue;
      }
      const start = i;
      while (text[i] === '`') i++;
      const width = i - start;
      if (codeSpanTicks === width) {
        for (let j = start; j < i; j++) chars[j] = ' ';
        codeSpanTicks = 0;
      } else if (codeSpanTicks) {
        for (let j = start; j < i; j++) chars[j] = ' ';
      } else if (!isEscaped(text, start) &&
          hasCodeSpanCloser(text, i, width, lineIndex)) {
        for (let j = start; j < i; j++) chars[j] = ' ';
        codeSpanTicks = width;
      }
    }
    return chars.join('');
  }
  // Strip the content indentation of simple list containers. A list item
  // beginning with a fence owns its indented following lines.
  function unwrapList(text, depth) {
    if (depth !== listDepth) { listIndent = 0; listDepth = depth; }
    const marker = /^ {0,3}([-+*]|\d{1,9}[.)])(?:[ \t]+|$)/.exec(text);
    if (marker) {
      listIndent = marker[0].length;
      return { content: text.slice(listIndent), inList: true, item: marker[1] };
    }
    if (listIndent && text.startsWith(' '.repeat(listIndent))) {
      return { content: text.slice(listIndent), inList: true };
    }
    if (text.trim()) listIndent = 0;
    return { content: text, inList: false };
  }
  // Both visibility passes and code-span lookahead use the same containers.
  const blocks = lines.map(raw => {
    const prefix = /^ {0,3}(?:>[ \t]?)+/.exec(raw)?.[0] || '';
    const depth = (prefix.match(/>/g) || []).length;
    return { ...unwrapList(raw.slice(prefix.length), depth), depth };
  });
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
  // A reference definition inside fenced/indented code or a raw HTML comment
  // is not a definition. Pre-index only plausible *active block* lines; the
  // inline pass below retains its own destination checks.
  let referenceFence = null, referenceComment = false;
  let referenceHtml = null;
  let referenceIndent = false, referencePreviousBlank = true;
  // Definitions inside multiline inline code spans cannot become references.
  // Reuse the same closer/paragraph-interruption rules as the inline pass.
  let referenceTicks = 0;
  function referenceVisible(text, row) {
    const chars = text.split('');
    for (let i = 0; i < text.length;) {
      if (text[i] !== '`') {
        if (referenceTicks) chars[i] = ' ';
        i++;
        continue;
      }
      const start = i;
      while (text[i] === '`') i++;
      const width = i - start;
      if (referenceTicks === width) {
        for (let k = start; k < i; k++) chars[k] = ' ';
        referenceTicks = 0;
      } else if (referenceTicks ||
          !isEscaped(text, start) && hasCodeSpanCloser(text, i, width, row)) {
        for (let k = start; k < i; k++) chars[k] = ' ';
        if (!referenceTicks) referenceTicks = width;
      }
    }
    return chars.join('');
  }
  for (let row = 0; row < lines.length; row++) {
    const { content: line, depth, inList } = blocks[row];
    const marker = fenceMarker.exec(line);
    if (referenceFence && line.trim() &&
        (referenceFence.list && !inList || referenceFence.depth && referenceFence.depth !== depth)) {
      referenceFence = null;
    }
    if (referenceFence) {
      if (marker && marker[1][0] === referenceFence.char &&
          marker[1].length >= referenceFence.length && /^\s*$/.test(marker[2])) {
        referenceFence = null;
      }
      continue;
    }
    if (referenceHtml && referenceHtml.depth !== depth) referenceHtml = null;
    if (referenceComment) {
      if (line.includes('-->')) referenceComment = false;
      continue;
    }
    if (referenceHtml) {
      if (referenceHtml.close) {
        if (referenceHtml.close.test(line)) referenceHtml = null;
        continue;
      }
      if (line.trim()) continue;
      referenceHtml = null;
    }
    if (marker) {
      referenceTicks = 0;
      referenceFence = { char: marker[1][0], length: marker[1].length, depth, list: inList };
      referencePreviousBlank = false;
      continue;
    }
    if (/^(?: {4}|\t)/.test(line) &&
        (referencePreviousBlank || referenceIndent)) {
      referenceIndent = true;
      referencePreviousBlank = false;
      continue;
    }
    referenceIndent = false;
    if (!line.trim()) { referenceTicks = 0; referencePreviousBlank = true; continue; }
    referencePreviousBlank = false;
    if (/^ {0,3}<!--/.test(line)) {
      referenceTicks = 0;
      referenceComment = !line.includes('-->');
      continue;
    }
    // The same block-level HTML grammar as the active-lines pass:
    // raw-text elements close at an end tag, other HTML blocks at blank.
    const rawText = /^ {0,3}<(script|pre|style|textarea)(?=[\s>])/i.exec(line);
    if (rawText) {
      const close = new RegExp('</' + rawText[1] + '[\\s>]', 'i');
      if (!close.test(line)) referenceHtml = { close, depth };
      continue;
    }
    if (blockTags.test(line) ||
        /^ {0,3}<\/?[A-Za-z][^>]*>\s*$/.test(line)) {
      referenceHtml = { close: null, depth };
      continue;
    }
    const visible = referenceVisible(line, row);
    const start = /^ {0,3}\[/.exec(visible);
    if (!start) continue;
    const end = closingBracket(visible, start[0].length - 1);
    if (end !== -1 && visible[end + 1] === ':' &&
        /^\s*(?:<[^>]+>|\S+)/.test(visible.slice(end + 2))) {
      knownReferences.add(normalizeReference(visible.slice(start[0].length, end)));
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
      const priorTicks = codeSpanTicks;
      const visible = maskInlineCode(line.slice(cursor), currentLineIndex);
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
      // Backticks *inside* a real HTML comment have no Markdown meaning.
      // Undo the speculative code-span state for the part after its opener.
      codeSpanTicks = priorTicks;
      maskInlineCode(line.slice(cursor, cursor + open), currentLineIndex);
      result += visible.slice(0, open) + '    ';
      cursor += open + 4;
      inComment = true;
    }
    return result;
  }
  let currentLineIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    currentLineIndex = i;
    const list = blocks[i];
    const { depth } = list;
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
    // CommonMark raw-text HTML takes precedence over inline HTML comments:
    // <!-- within <script>/<pre>/<style>/<textarea> cannot mask later links.
    if (!inComment) {
      const rawOpener = /^ {0,3}<(script|pre|style|textarea)(?=[\s>])/i.exec(text);
      if (rawOpener) {
        const close = new RegExp('</' + rawOpener[1] + '[\\s>]', 'i');
        if (!close.test(text)) htmlBlock = { depth, close };
        codeSpanTicks = 0;
        previousBlank = false;
        continue;
      }
    }
    // A block fence takes precedence over inline HTML-comment syntax in its
    // info string. Existing HTML comments still mask fence-like lines.
    const marker = !inComment && fenceMarker.exec(text);
    if (marker) {
      const value = { char: marker[1][0], length: marker[1].length, line: i + 1, list: list.inList };
      if (depth) quotedFence = { ...value, depth };
      else fence = value;
      codeSpanTicks = 0;
      previousBlank = false;
      continue;
    }
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
    const line = row.text;
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
