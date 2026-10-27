'use strict';
// HTML5 parsing is deliberately delegated to parse5 rather than attempting
// to approximate browser comment, RCDATA, foreign-content and quote states.
const { parse } = require('parse5');

const inertScriptTypes = new Set(['application/json', 'application/ld+json']);
const viteMetaAssetNames = new Set(["msapplication-tileimage","msapplication-square70x70logo","msapplication-square150x150logo","msapplication-wide310x150logo","msapplication-square310x310logo","msapplication-config","twitter:image"]);
const viteMetaAssetProperties = new Set(["og:image","og:image:url","og:image:secure_url","og:audio","og:audio:secure_url","og:video","og:video:secure_url"]);
const urlAttributes = new Set([
  'href', 'src', 'srcset', 'poster', 'action', 'formaction',
  'xlink:href', 'data', 'cite', 'background', 'manifest',
]);
const executableDocuments = new Set(['iframe', 'frame', 'object', 'embed', 'portal']);
const nativeResources = new Map([
  ['img', ['src', 'srcset']],
  ['source', ['src', 'srcset']],
  ['video', ['src', 'poster']],
  ['audio', ['src']],
  ['track', ['src']],
  ['input', ['src']],
  ['image', ['href', 'xlink:href']],
  ['use', ['href', 'xlink:href']],
  ['feimage', ['href', 'xlink:href']],
]);
const dangerousScheme = /^(?:javascript|vbscript|data:text\/html|data:image\/svg\+xml):/i;

function scanHtml(html) {
  const errors = [], references = [];
  const document = parse(html, {
    onParseError(error) {
      // Allow snippets used in architecture fixtures; malformed markup itself
      // is still rejected, never silently accepted as a validated HTML graph.
      if (error.code !== 'missing-doctype') {
        errors.push('unsupported-vite-html-parse: ' + error.code);
      }
    },
  });
  function addReference(spec, kind, moduleImport = false) {
    if (!spec || /[\u0000-\u001f]/.test(spec) || spec.trim() !== spec) {
      errors.push('unsupported-vite-html-url: missing, malformed or control-character URL');
      return;
    }
    if (dangerousScheme.test(spec.replace(/[\u0000-\u0020]/g, ''))) {
      errors.push('unsupported-vite-html-url: executable or active-content URL');
      return;
    }
    // Executable stylesheets are dependency-bearing: an unchecked external
    // CSS entry can import further CSS outside the verified ownership graph.
    // Remote/data decorative media are separate from active stylesheets.
    if (kind === 'stylesheet' && /^(?:https?:|data:|\/\/)/i.test(spec)) {
      errors.push('unsupported-vite-html-stylesheet: external or data stylesheet is not verified');
      return;
    }
    if (kind === 'script' && /^(?:https?:|data:|\/\/)/i.test(spec)) {
      errors.push('unsupported-vite-html-url: external script entry is not owned');
      return;
    }
    if (/^(?:https?:|data:|\/\/)/i.test(spec)) {
      if (kind !== 'asset') errors.push('unsupported-vite-html-url: external dependency is not owned');
      return; // Explicit remote/data media is not a local source dependency.
    }
    if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(spec) || /[?#\\]/.test(spec)) {
      errors.push('unsupported-vite-html-url: unresolved URL form: ' + spec);
      return;
    }
    const reference = { spec, kind };
    if (moduleImport) reference.moduleImport = true;
    references.push(reference);
  }
  function addSrcset(value) {
    if (!value || /^data:/i.test(value)) {
      errors.push('unsupported-vite-html-srcset: unsupported data/empty source list');
      return;
    }
    // This intentionally restricted grammar fails closed on data URL commas,
    // additional descriptors, and other syntax we cannot resolve confidently.
    for (const item of value.split(',')) {
      const match = /^([^\s,]+)(?:\s+(?:\d+w|\d+(?:\.\d+)?x))?$/.exec(item.trim());
      if (!match) {
        errors.push('unsupported-vite-html-srcset: unresolved candidate: ' + item.trim());
        continue;
      }
      addReference(match[1], 'asset');
    }
  }
  function visit(node) {
    const tag = node.tagName?.toLowerCase();
    if (tag) {
      const attrs = new Map();
      for (const attribute of node.attrs || []) {
        const key = (attribute.prefix ? attribute.prefix + ':' : '') + attribute.name.toLowerCase();
        attrs.set(key, attribute.value);
        if (/^on[a-z]/i.test(key)) {
          errors.push('unsupported-vite-html-inline: executable event handler ' + key);
        }
        if (key === 'style' || key === 'srcdoc') {
          errors.push('unsupported-vite-html-inline: unchecked inline ' + key);
        }
        if (urlAttributes.has(key) && dangerousScheme.test(
          attribute.value.replace(/[\u0000-\u0020]/g, ''))) {
          errors.push('unsupported-vite-html-url: executable URL in ' + key);
        }
      }
      if (tag === 'style' || tag === 'noscript') {
        errors.push('unsupported-vite-html-inline: unverified <' + tag + '> element');
      }
      if (executableDocuments.has(tag) || tag === 'base') {
        errors.push('unsupported-vite-html-embed: unverified <' + tag + '> element');
      }
      if (tag === 'meta' && attrs.get('http-equiv')?.trim().toLowerCase() === 'refresh') {
        errors.push('unsupported-vite-html-inline: meta refresh is not verified');
      }
      if (tag === 'script') {
        const type = (attrs.get('type') || '').trim().toLowerCase();
        const src = attrs.get('src');
        const content = (node.childNodes || []).filter(x => x.nodeName === '#text')
          .map(x => x.value || '').join('');
        if (inertScriptTypes.has(type)) {
          if (src) errors.push('unsupported-vite-html-inline: data script with a src');
        } else if (type !== 'module' || !src || content.trim()) {
          errors.push('unsupported-vite-html-entry: script must be a src-only module');
        } else {
          addReference(src, 'script', !attrs.has('vite-ignore'));
        }
      }
      if (tag === 'link') {
        // Vite also rewrites <link imagesrcset>; a harmless href cannot mask
        // a private candidate in this independent responsive image list.
        if (attrs.has('imagesrcset')) addSrcset(attrs.get('imagesrcset'));
        const rel = new Set((attrs.get('rel') || '').toLowerCase().split(/\s+/));
        const href = attrs.get('href');
        let cssImport = false;
        // Vite imports local CSS links by URL, regardless of their rel value.
        if (href && !attrs.has('media') && !attrs.has('disabled') && !attrs.has('vite-ignore') &&
            !/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) {
          try { cssImport = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/.test(decodeURI(href)); }
          catch { /* Invalid URLs are diagnosed by the ownership resolver. */ }
        }
        if (cssImport) addReference(href, 'stylesheet', true);
        else if (rel.has('stylesheet')) addReference(href, 'stylesheet');
        else if (rel.has('modulepreload')) addReference(attrs.get('href'), 'script');
        else if (rel.has('preload')) {
          const as = (attrs.get('as') || '').toLowerCase();
          if (as === 'script') addReference(attrs.get('href'), 'script');
          else if (as === 'style') addReference(attrs.get('href'), 'stylesheet');
          else if (['image', 'style', 'font', 'audio', 'video', 'fetch'].includes(as)) {
            addReference(attrs.get('href'), 'asset');
          } else errors.push('unsupported-vite-html-link: unverified preload type');
        } else if (rel.has('icon') || rel.has('apple-touch-icon')) {
          addReference(attrs.get('href'), 'asset');
        } else if (attrs.has('href') && !rel.has('canonical') &&
                   !rel.has('alternate') && !rel.has('preconnect') &&
                   !rel.has('dns-prefetch')) {
          errors.push('unsupported-vite-html-link: unsupported resource link');
        }
      }
      // Vite rewrites selected HTML metadata image/audio/video references.
      // Ordinary descriptive content stays text rather than a file path.
      if (tag === 'meta' && attrs.has('content')) {
        const name = (attrs.get('name') || '').toLowerCase();
        const property = (attrs.get('property') || '').toLowerCase();
        if (viteMetaAssetNames.has(name) || viteMetaAssetProperties.has(property)) {
          addReference(attrs.get('content'), 'asset');
        }
      }
      // Legacy HTML background URLs also fetch assets. Unknown URL-bearing
      // attributes must not silently create an untracked dependency edge.
      if (attrs.has('background')) addReference(attrs.get('background'), 'asset');
      const supportedResourceKeys = new Set(nativeResources.get(tag) || []);
      if (tag === 'script') supportedResourceKeys.add('src');
      if (tag === 'link') supportedResourceKeys.add('href');
      for (const key of ['src', 'srcset', 'poster', 'data', 'xlink:href']) {
        if (attrs.has(key) && !supportedResourceKeys.has(key) &&
            !(executableDocuments.has(tag) && ['src', 'data'].includes(key))) {
          errors.push('unsupported-vite-html-url: unverified ' + key + ' on <' + tag + '>');
        }
      }
      for (const key of nativeResources.get(tag) || []) {
        const value = attrs.get(key);
        if (value !== undefined) {
          if (key === 'srcset') addSrcset(value);
          else addReference(value, 'asset');
        }
      }
      // A custom element can interpret arbitrary src/href attributes. Reject
      // these rather than claiming a complete dependency graph for its logic.
      if (tag.includes('-') && [...urlAttributes].some(k => attrs.has(k))) {
        errors.push('unsupported-vite-html-url: custom element resource URL');
      }
    }
    for (const child of node.childNodes || []) visit(child);
    if (node.content) visit(node.content); // inert templates may later be cloned.
  }
  visit(document);
  return { errors: [...new Set(errors)], references };
}
module.exports = { scanHtml };
