'use strict';

// Deliberately conservative static stylesheet dependency scanner. Each
// @import/@use/@forward and url() must be literal, or validation fails.
// Projects with custom PostCSS/preprocessor plugins must also verify output.
function scanCssDependencies(css, { filename = 'style.css' } = {}) {
  const lineComments = /\.(?:scss|sass|less)$/i.test(filename);
  const references = [];
  const errors = [];
  let clean = '', quote = null, inComment = false, lineComment = false;
  let escape = false, urlDepth = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i], n = css[i + 1];
    if (lineComment) {
      clean += c === '\n' ? '\n' : ' ';
      if (c === '\n') lineComment = false;
      continue;
    }
    if (inComment) {
      if (c === '*' && n === '/') { clean += '  '; i++; inComment = false; }
      else clean += c === '\n' ? '\n' : ' ';
      continue;
    }
    if (quote) {
      clean += c;
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && n === '*') { clean += '  '; i++; inComment = true; continue; }
    // In SCSS/Sass/Less, // begins a line comment, except in url(//cdn...)
    // and unquoted URL schemes. Plain CSS does not have // comments.
    if (lineComments && c === '/' && n === '/' && urlDepth === 0 &&
        clean.at(-1) !== ':') {
      clean += '  '; i++; lineComment = true; continue;
    }
    if (c === '"' || c === "'") quote = c;
    if (c === '(' && /\burl\s*$/i.test(clean)) urlDepth++;
    else if (c === ')' && urlDepth) urlDepth--;
    clean += c;
  }
  // Mask strings so quoted content cannot introduce a fake @import or url().
  let mask = '', q = null, escaped = false;
  for (const ch of clean) {
    if (q) {
      mask += ch === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") { q = ch; mask += ' '; }
    else mask += ch;
  }
  // Escaped identifiers can encode CSS dependencies such as @im\70ort
  // and u\72l(...). Fail closed; this scanner is not a CSS tokenizer.
  // Strings and comments were already masked above.
  const identifierPiece = String.raw`(?:[A-Za-z_-]|\\(?:[0-9a-fA-F]{1,6}[ \t\r\n\f]?|[^\r\n\f0-9a-fA-F]))`;
  const escapedAtRules = new RegExp('@(' + identifierPiece + '+)', 'g');
  const escapedFunctions = new RegExp('(' + identifierPiece + '+)\\s*\\(', 'g');
  for (const token of [...mask.matchAll(escapedAtRules), ...mask.matchAll(escapedFunctions)]) {
    if (token[1].includes('\\')) {
      errors.push('unsupported-css-escaped-identifier: at offset ' + token.index);
    }
  }
  const readQuoted = (start, input = clean) => {
    const q = input[start];
    if (q !== '"' && q !== "'") return null;
    let value = '', escaped = false;
    for (let i = start + 1; i < input.length; i++) {
      const c = input[i];
      if (escaped) {
        if (/[0-9a-f]/i.test(c)) {
          let hex = c;
          while (hex.length < 6 && /[0-9a-f]/i.test(input[i + 1] || '')) hex += input[++i];
          const number = parseInt(hex, 16);
          value += String.fromCodePoint(number && number <= 0x10ffff ? number : 0xfffd);
          if (/\s/.test(input[i + 1] || '')) i++;
        } else if (!/[\r\n\f]/.test(c)) value += c;
        escaped = false;
        continue;
      }
      if (c === '\\') { escaped = true; continue; }
      if (c === q) return { value, end: i + 1 };
      value += c;
    }
    return null;
  };
  const readUrl = start => {
    let i = start + 1;
    while (/\s/.test(clean[i] || '') && i < clean.length) i++;
    if (clean[i] === '"' || clean[i] === "'") {
      const quoted = readQuoted(i);
      if (!quoted) return null;
      i = quoted.end;
      while (/\s/.test(clean[i] || '') && i < clean.length) i++;
      return clean[i] === ')' ? { value: quoted.value, end: i + 1 } : null;
    }
    const close = clean.indexOf(')', i);
    if (close === -1) return null;
    const value = clean.slice(i, close).trim();
    if (/[()"'\\]/.test(value)) return null;
    return { value, end: close + 1 };
  };
  const importedUrls = new Set();
  for (const m of mask.matchAll(/@(import|use|forward)\b/gi)) {
    let cursor = m.index + m[0].length;
    while (/\s/.test(clean[cursor] || '') && cursor < clean.length) cursor++;
    const directive = m[1].toLowerCase();
    let optional = false;
    if (directive === 'import' && clean[cursor] === '(') {
      if (!lineComments || !/\.less$/i.test(filename)) {
        errors.push('unsupported-css-dependency: Less options outside .less at offset ' + m.index);
        continue;
      }
      const close = clean.indexOf(')', cursor + 1);
      if (close < 0) {
        errors.push('unsupported-css-dependency: unterminated Less options at offset ' + m.index);
        continue;
      }
      const options = clean.slice(cursor + 1, close).split(',').map(x => x.trim());
      if (!options.length || options.some(x =>
          !['reference', 'inline', 'less', 'css', 'once', 'multiple', 'optional'].includes(x))) {
        errors.push('unsupported-css-dependency: invalid Less import options at offset ' + m.index);
        continue;
      }
      optional = options.includes('optional');
      cursor = close + 1;
      while (/\s/.test(clean[cursor] || '') && cursor < clean.length) cursor++;
    }
    let found = null;
    if (/^url\s*\(/i.test(mask.slice(cursor))) {
      importedUrls.add(cursor);
      found = readUrl(clean.indexOf('(', cursor));
    } else found = readQuoted(cursor);
    if (!found || !found.value.trim()) {
      errors.push('unsupported-css-dependency: ' + m[0] + ' at offset ' + m.index);
      continue;
    }
    if (directive === 'import') {
      const end = clean.indexOf(';', found.end);
      const suffix = clean.slice(found.end, end === -1 ? clean.length : end);
      if (/,\s*(?:["']|url\s*\()/i.test(suffix)) {
        errors.push('unsupported-css-dependency: multiple @import targets at offset ' + m.index);
      }
    }
    const reference = { spec: found.value.trim(), kind: directive };
    if (optional) reference.optional = true;
    references.push(reference);
  }
  for (const m of mask.matchAll(/\burl\s*\(/gi)) {
    if (importedUrls.has(m.index)) continue;
    const found = readUrl(clean.indexOf('(', m.index));
    if (!found || !found.value.trim()) {
      errors.push('unsupported-css-url: url() at offset ' + m.index);
      continue;
    }
    references.push({ spec: found.value.trim(), kind: 'url' });
  }
  // CSS image-set() can use quoted image paths instead of url(). Follow
  // those literal references too, while leaving nested url() to the loop above.
  for (const m of mask.matchAll(/\b(?:-webkit-)?image-set\s*\(/gi)) {
    const open = clean.indexOf('(', m.index);
    let depth = 1, quote = null, escaped = false, start = open + 1;
    const choices = [];
    let closed = false;
    for (let i = start; i < clean.length; i++) {
      const c = clean[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '(') depth++;
      if (c === ')') {
        depth--;
        if (depth === 0) {
          choices.push(clean.slice(start, i).trim());
          closed = true;
          break;
        }
      }
      if (c === ',' && depth === 1) {
        choices.push(clean.slice(start, i).trim());
        start = i + 1;
      }
    }
    if (!closed) {
      errors.push('unsupported-css-image-set: unterminated image-set at offset ' + m.index);
      continue;
    }
    for (const choice of choices) {
      const first = choice[0];
      if (first === '"' || first === "'") {
        const quoted = readQuoted(0, choice);
        if (!quoted || !quoted.value.trim()) {
          errors.push('unsupported-css-image-set: invalid image string at offset ' + m.index);
        } else {
          references.push({ spec: quoted.value, kind: 'image-set' });
        }
      } else if (!/^url\s*\(|^(?:linear|radial|conic)-gradient\s*\(/i.test(choice)) {
        errors.push('unsupported-css-image-set: dynamic choice at offset ' + m.index);
      }
    }
  }
  for (const m of mask.matchAll(/\bload-css\s*\(/gi)) {
    errors.push('unsupported-css-dependency: computed Sass load-css at offset ' + m.index);
  }
  return { references, errors };
}
module.exports = { scanCssDependencies };
