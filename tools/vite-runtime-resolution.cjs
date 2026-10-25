'use strict';
const fs = require('node:fs');
const path = require('node:path');
const viteExtensions = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];
function isFile(filename) {
  try { return fs.statSync(filename).isFile(); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}
function resolveViteLocalModule(candidate) {
  // Unlike TypeScript's type resolver, Vite selects an existing JS file first.
  if (isFile(candidate)) return candidate;
  const ext = path.extname(candidate);
  if (['.js', '.mjs', '.cjs', '.jsx'].includes(ext)) {
    const base = candidate.slice(0, -ext.length);
    const substitutions = ext === '.js' ? ['.ts', '.tsx'] : [ext.replace('js', 'ts')];
    for (const replacement of substitutions) {
      if (isFile(base + replacement)) return base + replacement;
    }
  }
  for (const extension of viteExtensions) {
    if (isFile(candidate + extension)) return candidate + extension;
  }
  try {
    if (!fs.statSync(candidate).isDirectory()) return null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
  // Package directories may select custom exports/main. Do not guess an index.
  if (fs.existsSync(path.join(candidate, 'package.json'))) return null;
  for (const extension of viteExtensions) {
    const file = path.join(candidate, 'index' + extension);
    if (isFile(file)) return file;
  }
  return null;
}
module.exports = { resolveViteLocalModule };
