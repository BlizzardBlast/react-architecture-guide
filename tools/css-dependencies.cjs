'use strict';

// Deliberately conservative static stylesheet dependency scanner. Each
// @import/@use/@forward and url() must be literal, or validation fails.
// Projects with custom PostCSS/preprocessor plugins must also verify output.
function scanCssDependencies(css) {
  const references = [];
  const errors = [];
  let clean = '', quote = null, inComment = false, escape = false;
  for (let i = 0; i < css.length; i++) {
    const c = css[i], n = css[i + 1];
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
    if (c === '"' || c === "'") quote = c;
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
  const readQuoted = start => {
    const q = clean[start];
    if (q !== '"' && q !== "'") return null;
    let value = '', escaped = false;
    for (let i = start + 1; i < clean.length; i++) {
      const c = clean[i];
      if (escaped) { value += c; escaped = false; continue; }
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
    let found = null;
    if (/^url\s*\(/i.test(mask.slice(cursor))) {
      importedUrls.add(cursor);
      found = readUrl(clean.indexOf('(', cursor));
    } else found = readQuoted(cursor);
    if (!found || !found.value.trim()) {
      errors.push('unsupported-css-dependency: ' + m[0] + ' at offset ' + m.index);
      continue;
    }
    if (m[1].toLowerCase() === 'import') {
      const end = clean.indexOf(';', found.end);
      const suffix = clean.slice(found.end, end === -1 ? clean.length : end);
      if (/,\s*(?:["']|url\s*\()/i.test(suffix)) {
        errors.push('unsupported-css-dependency: multiple @import targets at offset ' + m.index);
      }
    }
    references.push({ spec: found.value.trim(), kind: m[1].toLowerCase() });
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
  for (const m of mask.matchAll(/\bload-css\s*\(/g)) {
    errors.push('unsupported-css-dependency: computed Sass load-css at offset ' + m.index);
  }
  return { references, errors };
}
module.exports = { scanCssDependencies };
