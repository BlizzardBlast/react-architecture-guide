#!/usr/bin/env node
/**
 * Architecture boundary checker for React+TS. Uses TypeScript's parser + module resolver.
 * Source imports, re-exports, literal require and dynamic import are all inspected.
 * This checks source dependencies (including import type), not just transpiled JS.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { fileURLToPath, pathToFileURL } = require('node:url');

function loadTypeScript(projectDir = process.argv[2]) {
  // Resolve from the consuming application first, not the directory containing this tool.
  if (projectDir && fs.existsSync(projectDir)) {
    try {
      const consumerRequire = createRequire(path.join(path.resolve(projectDir), '__architecture_checker__.cjs'));
      return consumerRequire('typescript');
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  try { return require('typescript'); }
  catch {
    // Allows local smoke tests on machines with a globally installed compiler.
    // In a project, add typescript as a devDependency instead.
    const root = execSync('npm root -g', { encoding: 'utf8', shell: true }).trim();
    return require(path.join(root, 'typescript'));
  }
}
const ts = loadTypeScript();
const { scanCssDependencies } = require('./css-dependencies.cjs');
const { scanHtml } = require('./html-dependencies.cjs');
const { resolveViteLocalModule } = require('./vite-runtime-resolution.cjs');
// The dot is required: filenames such as "assets" are not source files.
const sourceExt = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const assetExt = /\.(?:css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|json)$/i;
const styleExt = /\.(?:css|scss|sass|less|styl|stylus)$/i;
function fileSpecifier(spec) {
  // Vite query directives are compilation modes, not filesystem path components.
  // Preserve Node/TypeScript '#imports' specifiers: the leading # is a name,
  // not a URL fragment.
  // A leading # names a Node package import; a later ? remains a Vite
  // query directive and must not change which runtime import map is checked.
  return spec.startsWith('#') ? spec.split('?', 1)[0] : spec.split(/[?#]/, 1)[0];
}
function assetPath(spec) {
  const filename = fileSpecifier(spec);
  return assetExt.test(filename) ? filename : null;
}
function isPureShared(relative) {
  return relative.startsWith('shared/lib/') || relative.startsWith('shared/domain/');
}
function isPureModule(source) {
  return source.layer === 'module' && ['domain', 'model', 'application'].includes(source.part);
}
function walk(root) {
  if (!fs.existsSync(root)) throw new Error(`Source directory not found: ${root}`);
  const result = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    // All files under src/ are first-party candidates, even in directories
    // named dist/, coverage/ or node_modules/. Skipping by basename can
    // conceal transitive imports and directly served source files.
    // .git is repository metadata, not executable application source.
    if (item.name === '.git' && item.isDirectory()) continue;
    const full = path.join(root, item.name);
    if (item.isDirectory()) result.push(...walk(full));
    else if (sourceExt.test(item.name)) result.push(full);
  }
  return result;
}
function category(filename, srcDir) {
  const relative = normPath(path.relative(srcDir, filename));
  if (relative.startsWith('..')) return { layer: 'outside', relative };
  const segs = relative.split('/');
  if (segs[0] === 'modules' && segs.length >= 3) {
    return { layer: 'module', module: segs[1], part: segs[2], relative };
  }
  return { layer: segs[0], relative };
}
function literalString(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node.text : null;
}
function runtimeImport(node, options) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return true;
    if (clause.isTypeOnly) return false;
    // import { type A } only is type-only, even if the declaration is not.
    const b = clause.namedBindings;
    // With verbatimModuleSyntax, `import { type A }` emits `import {}`.
    // An explicitly empty binding list also always retains a runtime import.
    return Boolean(clause.name || !b || ts.isNamespaceImport(b) || b.elements.length === 0 || b.elements.some(e => !e.isTypeOnly) || options.verbatimModuleSyntax);
  }
  if (ts.isExportDeclaration(node)) return !node.isTypeOnly && (!node.exportClause || !ts.isNamedExports(node.exportClause) || node.exportClause.elements.length === 0 || node.exportClause.elements.some(e => !e.isTypeOnly) || Boolean(options.verbatimModuleSyntax));
  return true;
}
function isViteGlobExpression(node) {
  return ts.isPropertyAccessExpression(node) &&
    (node.name.text === 'glob' || node.name.text === 'globEager') &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === 'meta';
}
function isImportMetaUrl(node) {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'url' &&
    ts.isMetaProperty(node.expression) &&
    node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    node.expression.name.text === 'meta';
}
// A local binding with a declared primitive type cannot be the built-in
// CommonJS module/require object. Resolve the nearest lexical function
// parameter first, rather than rejecting every use based solely on spelling.
// Other inferred/dynamic loader aliases remain disallowed.
function isPrimitiveType(type) {
  return Boolean(type && [ts.SyntaxKind.StringKeyword, ts.SyntaxKind.NumberKeyword,
    ts.SyntaxKind.BooleanKeyword, ts.SyntaxKind.BigIntKeyword].includes(type.kind));
}
function hasSafeLocalBinding(identifier) {
  for (let parent = identifier.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) {
      const matchingParameter = parent.parameters.find(parameter =>
        ts.isIdentifier(parameter.name) && parameter.name.text === identifier.text);
      if (matchingParameter) return isPrimitiveType(matchingParameter.type);
    }
    if (ts.isBlock(parent) || ts.isSourceFile(parent)) {
      const bindings = parent.statements?.filter(ts.isVariableStatement) || [];
      for (const statement of bindings) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.name.text !== identifier.text ||
              declaration.getStart() > identifier.getStart()) continue;
          const init = declaration.initializer;
          return Boolean(isPrimitiveType(declaration.type) || init && (
              ts.isStringLiteral(init) || ts.isNumericLiteral(init) ||
              init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword
            ));
        }
      }
    }
  }
  return false;
}
function imports(node, list, options) {
  // Vite transforms statically analyzable new URL(...) references into bundled
  // assets or worker entrypoints; they need the same ownership validation.
  if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
      node.expression.text === 'URL' && node.arguments?.length === 2 &&
      isImportMetaUrl(node.arguments[1])) {
    const spec = literalString(node.arguments[0]);
    if (spec === null) {
      list.push({ unsupported: 'dynamic-url', line: node.getStart() });
    } else if (spec.startsWith('.') || spec.startsWith('/')) {
      const parent = node.parent;
      const workerEntry = Boolean(parent && ts.isNewExpression(parent) &&
        ts.isIdentifier(parent.expression) &&
        ['Worker', 'SharedWorker'].includes(parent.expression.text) &&
        parent.arguments?.[0] === node);
      list.push({ spec, runtime: workerEntry, fromUrl: true, workerEntry, line: node.getStart() });
    }
  }
  // Vite expands glob imports to real module dependencies. Until glob semantics
  // are fully resolved, reject every glob call rather than silently missing edges.
  if (ts.isCallExpression(node) && isViteGlobExpression(node.expression)) {
    list.push({ spec: node.expression.getText(), viteGlob: true, line: node.getStart() });
  }
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const spec = literalString(node.moduleReference.expression);
    if (spec) list.push({ spec, runtime: !node.isTypeOnly, line: node.getStart() });
  }
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    const spec = literalString(node.moduleSpecifier);
    if (spec) list.push({ spec, runtime: runtimeImport(node, options), line: node.getStart() });
  }
  // Strict builtin loader grammar: identifier aliases can otherwise turn a
  // forbidden import into an ordinary-looking local function call. Binding
  // analysis would be needed to safely admit such aliases.
  if (ts.isIdentifier(node) && ['require', 'module'].includes(node.text)) {
    const parent = node.parent;
    // Declaration keys have no runtime value and are not CommonJS loader
    // references. In particular, interface fields and class members may be
    // named "module" or "require" without importing anything.
    const isPropertyName = (
      ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      // Parameter declarations are not references to the Node loader.
      // Their value uses must still be reviewed independently.
      ts.isParameter(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)
    ) && parent.name === node ||
      ts.isBindingElement(parent) &&
      (parent.propertyName === node || parent.name === node);
    const directRequire = node.text === 'require' &&
      ts.isCallExpression(parent) && parent.expression === node;
    const directModuleMember = node.text === 'module' && (
      (ts.isPropertyAccessExpression(parent) && parent.expression === node &&
        (parent.name.text === 'exports' ||
          (parent.name.text === 'require' && ts.isCallExpression(parent.parent) &&
            parent.parent.expression === parent))) ||
      (ts.isElementAccessExpression(parent) && parent.expression === node &&
        (literalString(parent.argumentExpression) === 'exports' ||
          (literalString(parent.argumentExpression) === 'require' &&
            ts.isCallExpression(parent.parent) && parent.parent.expression === parent)))
    );
    if (!isPropertyName && !directRequire && !directModuleMember &&
        !hasSafeLocalBinding(node)) {
      list.push({ unsupported: 'indirect-commonjs-loader', line: node.getStart() });
    }
  }
  // process.mainModule is a deprecated but executable CommonJS loader.
  // Its require() resolves from the entrypoint, not the current source, and
  // cannot safely be turned into an ownership edge by this local resolver.
  if ((ts.isPropertyAccessExpression(node) && node.name.text === 'mainModule' &&
       ts.isIdentifier(node.expression) && node.expression.text === 'process') ||
      (ts.isElementAccessExpression(node) &&
       ts.isIdentifier(node.expression) && node.expression.text === 'process' &&
       literalString(node.argumentExpression) === 'mainModule')) {
    list.push({ unsupported: 'node-mainmodule-loader', line: node.getStart() });
  }
  // Node CommonJS supports module.require() as well as require(). Treat the
  // literal, quoted-member and dynamic member forms as executable edges (or
  // unsupported loaders), never silently omit them from the ownership graph.
  const isModuleMember = expr => ts.isPropertyAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) && expr.expression.text === 'module' ||
    ts.isElementAccessExpression(expr) &&
    ts.isIdentifier(expr.expression) && expr.expression.text === 'module';
  const moduleMember = expr => isModuleMember(expr) &&
    (ts.isPropertyAccessExpression(expr) ? expr.name.text : literalString(expr.argumentExpression));
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    const moduleMemberName = moduleMember(callee);
    const imported = callee.kind === ts.SyntaxKind.ImportKeyword;
    const commonJs = ts.isIdentifier(callee) && callee.text === 'require' ||
      moduleMemberName === 'require';
    if (isModuleMember(callee) && moduleMemberName === null) {
      list.push({ unsupported: 'computed-module-loader', line: node.getStart() });
    } else if (imported || commonJs) {
      const spec = literalString(node.arguments[0]);
      if (spec === null) {
        list.push({ unsupported: imported ? 'dynamic-import' : 'dynamic-require',
          line: node.getStart() });
      } else {
        list.push({ spec, runtime: true, line: node.getStart() });
        // Node's module package can create arbitrary require functions.
        // Without binding analysis those loaders may hide ownership edges.
        if (commonJs && ['node:module', 'module'].includes(spec)) {
          list.push({ unsupported: 'node-create-require', line: node.getStart() });
        }
      }
    }
    if (ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) && callee.expression.text === 'require') {
      list.push({ unsupported: 'indirect-require', line: node.getStart() });
    }
  }
  // A detached loader alias such as module.require.bind(module), or calling
  // require via .call/.apply, cannot be resolved reliably. Reject it rather
  // than giving the dependency graph a false pass.
  if (isModuleMember(node) && moduleMember(node) === 'require' &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
    list.push({ unsupported: 'indirect-module-require', line: node.getStart() });
  }
  if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) &&
      ts.isIdentifier(node.initializer) && node.initializer.text === 'module' &&
      node.name.elements.some(e =>
        (e.propertyName?.text || e.name.getText()) === 'require')) {
    list.push({ unsupported: 'indirect-module-require', line: node.getStart() });
  }
  if (ts.isPropertyAccessExpression(node) &&
      node.name.text === 'createRequire' &&
      ts.isCallExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'require' &&
      ['module', 'node:module'].includes(literalString(node.expression.arguments[0]))) {
    list.push({ unsupported: 'node-create-require', line: node.getStart() });
  }
  if (ts.isImportDeclaration(node) && ['module', 'node:module'].includes(literalString(node.moduleSpecifier))) {
    const named = node.importClause?.namedBindings;
    if (node.importClause?.name || named && ts.isNamespaceImport(named) ||
        named && ts.isNamedImports(named) && named.elements.some(e =>
          (e.propertyName?.text || e.name.text) === 'createRequire')) {
      list.push({ unsupported: 'node-create-require', line: node.getStart() });
    }
  }
  ts.forEachChild(node, child => imports(child, list, options));
}
function configFor(dir) {
  const file = ts.findConfigFile(dir, ts.sys.fileExists, 'tsconfig.json');
  if (!file) return { options: { allowJs: true } };
  const read = ts.readConfigFile(file, ts.sys.readFile);
  if (read.error) throw Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(file), {}, file);
  if (parsed.errors.length) throw Error(parsed.errors.map(e => ts.flattenDiagnosticMessageText(e.messageText, '\n')).join('\n'));
  return parsed;
}
function normPath(pathname) { return pathname.replace(/\\/g, '/'); }
function isWithinRoot(filename, root) {
  const relative = path.relative(root, filename);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}
function sameOwnership(a, b) {
  return a.layer === b.layer && a.module === b.module && a.part === b.part;
}
// External library imports must resolve under a node_modules directory that
// Node/TypeScript can discover from the importing file's ancestor chain.
// An arbitrary sibling vendor/node_modules folder is not a package root for
// a different source tree, even if a custom baseUrl makes it resolvable.
function isInstalledDependencyPath(filename, importer, originalPath) {
  // TypeScript resolves linked packages to their real paths by default.
  // Its originalPath records the path inside the importer's node_modules
  // before following that link; with preserveSymlinks, filename is already
  // the logical installed path. Do not accept arbitrary vendor/node_modules.
  const installedPath = originalPath || filename;
  let installed = false;
  for (let dir = path.dirname(importer); ; dir = path.dirname(dir)) {
    if (isWithinRoot(installedPath, path.join(dir, 'node_modules'))) {
      installed = true;
      break;
    }
    if (path.dirname(dir) === dir) break;
  }
  if (!installed) return false;
  try {
    // Prove the installed logical path actually names the resolved module.
    // A stale, unrelated or dangling path cannot certify external ownership.
    return fs.realpathSync(installedPath) === fs.realpathSync(filename);
  } catch {
    return false;
  }
}
// A paths/baseUrl pattern is only an owned alias when it actually resolves to
// first-party code. A broad "*" mapping can fall through to node_modules.
// Compare with unaliased Node-style package resolution before trusting an
// external fallback; never excuse a local alias deliberately routed to vendor.
function isUnaliasedInstalledPackage(spec, importer, options, resolvedModule) {
  if (!resolvedModule?.isExternalLibraryImport || !resolvedModule.resolvedFileName ||
      !isInstalledDependencyPath(resolvedModule.resolvedFileName, importer,
        resolvedModule.originalPath)) return false;
  const noAliases = { ...options, paths: undefined, baseUrl: undefined };
  const ordinary = ts.resolveModuleName(spec, importer, noAliases, ts.sys).resolvedModule;
  return Boolean(ordinary?.isExternalLibraryImport && ordinary.resolvedFileName &&
    path.resolve(ordinary.resolvedFileName) ===
      path.resolve(resolvedModule.resolvedFileName) &&
    isInstalledDependencyPath(ordinary.resolvedFileName, importer, ordinary.originalPath));
}

const publicEntrypoints = new Set([
  'index.ts', 'index.tsx', 'index.mts', 'index.cts',
  'index.js', 'index.jsx', 'index.mjs', 'index.cjs',
]);
function isPublicEntrypoint(dest) {
  return dest.layer === 'module' &&
    publicEntrypoints.has(dest.relative.split('/').at(-1)) &&
    dest.relative.split('/').length === 3;
}
function isSelfBarrel(source, dest) {
  return dest.module === source.module && isPublicEntrypoint(dest);
}
function matchesAlias(spec, patterns) {
  return Object.keys(patterns || {}).some(pattern => {
    const chunks = pattern.split('*');
    return chunks.length === 1 ? spec === pattern
      : spec.startsWith(chunks[0]) && spec.endsWith(chunks[chunks.length - 1]);
  });
}
// Vite may resolve bare package exports to CSS without a stylesheet suffix,
// while TypeScript resolves a declaration or nothing at all. Inspect the
// *matching* export subpath, including conditional alternatives.
function packageStyleExport(spec, importer, ownedSource = false, visited = new Set()) {
  if (spec.startsWith('node:') || visited.has(spec)) return false;
  visited.add(spec);
  const isStyle = target => /\.(?:css|scss|sass|less|styl|stylus)$/i.test(fileSpecifier(target));
  function containsStyles(value) {
    if (typeof value === 'string') {
      if (isStyle(value)) return true;
      // Package imports may redirect through #aliases or another package.
      // Follow bare specifiers, not relative files whose names happen to
      // resemble package names. TypeScript-only aliases never prove runtime ownership.
      if (value.startsWith('.') || value.startsWith('/') ||
          value.startsWith('node:')) return false;
      return packageStyleExport(value, importer, false, visited);
    }
    if (Array.isArray(value)) return value.some(containsStyles);
    return Boolean(value && typeof value === 'object' &&
      Object.values(value).some(containsStyles));
  }
  function matchingTargets(field, key) {
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
      return key === '.' ? field : undefined;
    }
    const keys = Object.keys(field);
    if (key === '.' && keys.every(k => !k.startsWith('.') && !k.startsWith('#'))) {
      return field;
    }
    if (Object.hasOwn(field, key)) return field[key];
    const matching = keys.filter(k => {
      const star = k.indexOf('*');
      return star >= 0 && k.indexOf('*', star + 1) < 0 &&
        (k.startsWith('./') || k.startsWith('#')) &&
        key.startsWith(k.slice(0, star)) &&
        key.endsWith(k.slice(star + 1)) &&
        key.length >= k.length - 1;
    });
    matching.sort((a, b) => {
      const ap = a.indexOf('*'), bp = b.indexOf('*');
      return bp - ap || (b.length - bp) - (a.length - ap);
    });
    return matching.length ? field[matching[0]] : undefined;
  }
  // Nearest package imports and self-name exports may point to CSS at runtime
  // while TypeScript resolves to owned declarations. Inspect both targets.
  let scope;
  for (let dir = path.dirname(importer); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'package.json');
    if (fs.existsSync(manifest)) {
      try { scope = JSON.parse(fs.readFileSync(manifest, 'utf8')); }
      catch { return true; }
      break;
    }
    if (path.dirname(dir) === dir) break;
  }
  if (spec.startsWith('#')) {
    return scope?.imports !== undefined &&
      containsStyles(matchingTargets(scope.imports, spec));
  }
  const parts = spec.split('/');
  const scoped = spec.startsWith('@');
  if ((scoped && parts.length < 2) || !parts[0]) return false;
  const packageName = scoped ? parts.slice(0, 2).join('/') : parts[0];
  const subpath = parts.slice(scoped ? 2 : 1).join('/');
  const exportKey = subpath ? './' + subpath : '.';
  if (scope?.name === packageName && scope.exports !== undefined) {
    return containsStyles(matchingTargets(scope.exports, exportKey));
  }
  // Owned baseUrl imports must not be tainted by unrelated installed packages.
  if (ownedSource) return false;
  for (let dir = path.dirname(importer); ; dir = path.dirname(dir)) {
    const manifest = path.join(dir, 'node_modules', packageName, 'package.json');
    if (fs.existsSync(manifest)) {
      let pkg;
      try { pkg = JSON.parse(fs.readFileSync(manifest, 'utf8')); }
      catch { return true; }
      if (pkg.exports !== undefined) return containsStyles(matchingTargets(pkg.exports, exportKey));
      if (exportKey === '.') {
        return ['module', 'main', 'browser'].some(key =>
          typeof pkg[key] === 'string' && isStyle(pkg[key]));
      }
      return Boolean(pkg.browser && typeof pkg.browser === 'object' &&
        containsStyles(pkg.browser['./' + subpath]));
    }
    if (path.dirname(dir) === dir) return false;
  }
}

// Node package imports and self-name exports are runtime resolution rules.
// TypeScript paths can name a different file entirely, so inspect the active
// targets independently. The resolver deliberately fails closed on external,
// unresolved, cyclic or computed targets rather than misreporting ownership.
function runtimePackageTargets(spec, importer) {
  let scope = null, scopeDir = null;
  for (let dir = path.dirname(importer); ; dir = path.dirname(dir)) {
    const filename = path.join(dir, 'package.json');
    if (fs.existsSync(filename)) {
      try { scope = JSON.parse(fs.readFileSync(filename, 'utf8')); }
      catch { return { paths: [], unverifiable: true }; }
      scopeDir = dir;
      break;
    }
    if (path.dirname(dir) === dir) break;
  }
  if (!scope) return null;
  const ownName = typeof scope.name === 'string' ? scope.name : '';
  const isSelf = ownName && (spec === ownName || spec.startsWith(ownName + '/'));
  if (!spec.startsWith('#') && !isSelf) return null;
  const visited = new Set();
  function match(field, key) {
    if (typeof field !== 'object' || field === null || Array.isArray(field)) {
      return key === '.' ? { target: field, wildcard: null } : null;
    }
    const keys = Object.keys(field);
    if (key === '.' && keys.every(k => !k.startsWith('.') && !k.startsWith('#'))) {
      return { target: field, wildcard: null };
    }
    if (Object.hasOwn(field, key)) return { target: field[key], wildcard: null };
    const hits = keys.flatMap(k => {
      const star = k.indexOf('*');
      if (star < 0 || k.indexOf('*', star + 1) !== -1 ||
          !(k.startsWith('#') || k.startsWith('./'))) return [];
      const prefix = k.slice(0, star), suffix = k.slice(star + 1);
      if (!key.startsWith(prefix) || !key.endsWith(suffix) ||
          key.length < prefix.length + suffix.length) return [];
      return [{ k, prefix, suffix,
        wildcard: key.slice(prefix.length, key.length - suffix.length) }];
    });
    hits.sort((a, b) => b.prefix.length - a.prefix.length ||
      b.suffix.length - a.suffix.length);
    return hits.length ? { target: field[hits[0].k], wildcard: hits[0].wildcard } : null;
  }
  function walk(name) {
    if (visited.has(name)) return { paths: [], unverifiable: true };
    visited.add(name);
    try {
      const self = ownName && (name === ownName || name.startsWith(ownName + '/'));
    const mapping = name.startsWith('#') ? match(scope.imports, name) :
      self ? match(scope.exports, name === ownName ? '.' : './' + name.slice(ownName.length + 1)) : null;
    if (!mapping) return { paths: [], unverifiable: true };
    const paths = [];
    let unverifiable = false;
    function evaluate(target, wildcard) {
      if (typeof target === 'string') {
        const value = wildcard === null ? target : target.replace(/\*/g, wildcard);
        if (value.startsWith('./')) {
          paths.push(path.resolve(scopeDir, value));
        } else if (value.startsWith('#') || value === ownName ||
                   ownName && value.startsWith(ownName + '/')) {
          // Node package imports do not allow another #imports key as the
          // target. Audit any reachable source for ownership, but reject the
          // nonconforming redirect instead of certifying a safe runtime path.
          if (value.startsWith('#')) unverifiable = true;
          const follow = walk(value);
          paths.push(...follow.paths);
          unverifiable ||= follow.unverifiable;
        } else {
          // Bare redirects can execute package JS independently of TS paths.
          unverifiable = true;
        }
      } else if (Array.isArray(target)) {
        if (!target.length) unverifiable = true;
        for (const item of target) evaluate(item, wildcard);
      } else if (target && typeof target === 'object') {
        let runtimeBranch = false;
        for (const [condition, item] of Object.entries(target)) {
          // The "types" condition cannot be selected by Node/Vite at runtime.
          if (condition === 'types') continue;
          runtimeBranch = true;
          evaluate(item, wildcard);
        }
        if (!runtimeBranch) unverifiable = true;
      } else {
        unverifiable = true;
      }
    }
      evaluate(mapping.target, mapping.wildcard);
      return { paths, unverifiable };
    } finally {
      // A completed sibling branch is not a recursion cycle. Keep only the
      // active call chain in visited, including when an alias is unresolved.
      visited.delete(name);
    }
  }
  return walk(spec);
}

// A TypeScript paths/baseUrl alias does not rewrite the emitted bare import.
// Without an audited Vite alias, an installed package with the same name can
// shadow the TypeScript target at runtime. Locate the nearest actual package,
// rather than trusting an unrelated vendor/node_modules directory.
function hasInstalledPackageCandidate(spec, importer) {
  if (spec.startsWith('#') || spec.startsWith('node:')) return false;
  const parts = spec.split('/');
  const scoped = spec.startsWith('@');
  if ((scoped && (parts.length < 2 || !parts[1])) || !parts[0]) return false;
  const packageName = scoped ? parts.slice(0, 2).join('/') : parts[0];
  for (let dir = path.dirname(importer); ; dir = path.dirname(dir)) {
    const packageDir = path.join(dir, 'node_modules', packageName);
    // Some legacy packages have an index.js but no package.json; Vite can
    // resolve these too. The directory is enough to create a runtime collision.
    if (fs.existsSync(packageDir) && fs.statSync(packageDir).isDirectory()) {
      return true;
    }
    if (path.dirname(dir) === dir) return false;
  }
}
function loadBoundaryConfig(parent) {
  const file = path.join(parent, 'architecture.config.json');
  if (!fs.existsSync(file)) return { allowPureExternal: [], allowCrossModule: {}, allowMixedLayouts: {}, viteAliases: {}, viteConfig: null };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const mixed = data.allowMixedLayouts || {};
  const aliases = data.viteAliases || {};
  if (!Array.isArray(data.allowPureExternal || []) ||
      typeof (data.allowCrossModule || {}) !== 'object' ||
      Array.isArray(data.allowCrossModule || {}) ||
      typeof mixed !== 'object' || mixed === null || Array.isArray(mixed) ||
      Object.values(mixed).some(reason => typeof reason !== 'string' || !reason.trim()) ||
      typeof aliases !== 'object' || aliases === null || Array.isArray(aliases) ||
      (data.viteConfig !== undefined && (typeof data.viteConfig !== 'string' || !data.viteConfig.trim())) ||
      Object.entries(aliases).some(([alias, target]) =>
        !alias.trim() || typeof target !== 'string' || !target.trim())) {
    throw Error('Invalid architecture.config.json: allowPureExternal must be an array, allowCrossModule an object, and allowMixedLayouts a map of nonempty migration reasons');
  }
  return {
    allowPureExternal: data.allowPureExternal || [],
    allowCrossModule: data.allowCrossModule || {},
    allowMixedLayouts: mixed,
    viteAliases: aliases,
    viteConfig: data.viteConfig || null,
  };
}

function resolveViteAlias(spec, aliases, projectDir) {
  // Vite matches exact alias names or name + "/". The configured value is a
  // path relative to the project root, never an executable config expression.
  for (const [find, destination] of Object.entries(aliases)) {
    // Match Vite/Rollup: exact match or the next character must be '/'.
    if (spec === find || spec.startsWith(find + '/')) {
      const suffix = spec.slice(find.length).replace(/^\//, '');
      return path.resolve(projectDir, destination, suffix);
    }
  }
  return null;
}

function resolveMappedAssetCandidates(spec, options, projectDir) {
  const mappings = options.paths || {};
  let selected = null;
  for (const [pattern, targets] of Object.entries(mappings)) {
    const star = pattern.indexOf('*');
    const prefix = star < 0 ? pattern : pattern.slice(0, star);
    const suffix = star < 0 ? '' : pattern.slice(star + 1);
    if (star >= 0 && suffix.includes('*')) continue; // Not valid TypeScript paths.
    if (star < 0 ? spec !== pattern :
        !(spec.startsWith(prefix) && spec.endsWith(suffix) &&
          spec.length >= prefix.length + suffix.length)) continue;
    const replacement = star < 0 ? '' : spec.slice(prefix.length, spec.length - suffix.length);
    // Match TypeScript: exact keys first, then longest prefix, then longest suffix.
    const rank = star < 0 ? [1, 0, 0] : [0, prefix.length, suffix.length];
    if (!selected || rank[0] > selected.rank[0] ||
        rank[0] === selected.rank[0] && (rank[1] > selected.rank[1] ||
        rank[1] === selected.rank[1] && rank[2] > selected.rank[2])) {
      selected = { rank, targets, replacement };
    }
  }
  if (!selected) return [];
  const base = options.baseUrl || options.pathsBasePath || projectDir;
  return selected.targets.map(target => path.resolve(base, target.replace('*', selected.replacement)));
}
function resolveLocalSource(candidate, options) {
  const importer = path.join(path.dirname(candidate), '__architecture_alias__.ts');
  // TypeScript handles file extensions, directory indexes and declaration files.
  const basename = './' + path.basename(candidate);
  return ts.resolveModuleName(basename, importer, options, ts.sys).resolvedModule?.resolvedFileName;
}
function verifyViteAliases(projectDir, policy, errors, viteState) {
  // Discover ALL default Vite filenames, and recognize explicitly selected
  // npm-script configs. Never silently inspect a different Vite config.
  const supportedExt = /\.(?:ts|mts|js|mjs|cts|cjs)$/;
  const defaults = ['ts', 'mts', 'js', 'mjs', 'cts', 'cjs']
    .map(ext => path.join(projectDir, 'vite.config.' + ext)).filter(fs.existsSync);
  const packageFile = path.join(projectDir, 'package.json');
  const scripts = fs.existsSync(packageFile)
    ? JSON.parse(fs.readFileSync(packageFile, 'utf8')).scripts || {} : {};
  const selections = new Set();
  let usesDefault = false;
  // Split compound scripts without treating separators inside quoted arguments
  // as command boundaries. Parse the flags of the Vite process, not another
  // process such as ESLint in the same npm script.
  function splitShell(script) {
    const commands = [];
    let begin = 0, quote = null, escaped = false;
    for (let i = 0; i < script.length; i++) {
      const c = script[i];
      if (escaped) { escaped = false; continue; }
      if (c === '\\' && quote !== "'") { escaped = true; continue; }
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '&' || c === '|' || c === ';') {
        commands.push(script.slice(begin, i).trim());
        if (script[i + 1] === c) i++;
        begin = i + 1;
      }
    }
    if (quote || escaped) return null;
    commands.push(script.slice(begin).trim());
    return commands.filter(Boolean);
  }
  function shellWords(command) {
    // A deliberately small lexer, not a shell interpreter. Retain quoted words
    // as one token; unsupported shell syntax should never select a safe config.
    const words = [];
    let value = '', quote = null, escaping = false, started = false;
    const push = () => {
      if (started) words.push(value);
      value = '';
      started = false;
    };
    for (let i = 0; i < command.length; i++) {
      const c = command[i], next = command[i + 1] || '';
      if (escaping) { value += c; escaping = false; started = true; continue; }
      // Backslash is a Windows path separator unless escaping whitespace
      // or shell syntax; don't silently turn .\node_modules into .node_modules.
      if (c === '\\' && quote !== "'" && /[\s"';&|\\]/.test(next)) {
        escaping = true; started = true; continue;
      }
      if (quote) {
        if (c === quote) quote = null;
        else value += c;
        continue;
      }
      if (c === "'" || c === '"') { quote = c; started = true; continue; }
      if (/\s/.test(c)) { push(); continue; }
      value += c;
      started = true;
    }
    if (escaping || quote) return null;
    push();
    return words;
  }

  // Expansion and redirection can change config after static inspection.
  // Refuse these syntax forms even when echo, printf, or vite looks trusted.
  function hasUncheckedShellEffects(script) {
    let quote = null, escaped = false;
    for (const c of script) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\' && quote !== "'") { escaped = true; continue; }
      if (c === '"' || c === "'") {
        if (quote === c) quote = null;
        else if (!quote) quote = c;
        continue;
      }
      if (quote === "'") continue;
      if ((!quote && (c === '<' || c === '>')) ||
          c === '$' || c.charCodeAt(0) === 96 || c === '\n' || c === '\r') return true;
    }
    return false;
  }
  function viteArguments(words) {
    let index = 0;
    // Recognize actual launchers, not an incidental "vite" in echo text.
    if (['npx', 'bunx', 'pnpm', 'yarn'].includes(words[index])) {
      index++;
      if (words[index] === 'exec') index++;
    } else if (words[index] === 'npm' && words[1] === 'exec') {
      index = 2;
      if (words[index] === '--') index++;
    }
    if (/^node(?:\.exe)?$/.test(words[index] || '')) index++;
    const executable = (words[index] || '').replace(/\\/g, '/');
    if (!/^(?:vite(?:\.cmd)?|(?:\.\/)?node_modules\/(?:\.bin\/vite(?:\.cmd)?|vite\/bin\/vite\.js))$/.test(executable)) {
      return null;
    }
    return words.slice(index + 1);
  }
  const viteCommands = new Set(['build', 'dev', 'serve', 'preview', 'optimize']);
  const argumentOptions = new Set(['--mode', '--base', '--outDir', '--assetsDir', '--port']);
  // Vite accepts --host with an optional value. It must not consume another CLI flag.
  const optionalArgumentOptions = new Set(['--host']);
  // --emptyOutDir is Vite's documented build flag for safely cleaning
  // the deliberately out-of-project output directory before each build.
  const booleanOptions = new Set(['--strictPort', '--force', '--clearScreen', '--cors', '--help', '--version', '--emptyOutDir']);
  // npm automatically runs pre<name> and post<name> lifecycle hooks. Those
  // hooks can launch another build with a different Vite config.
  // Follow the executable npm graph, not merely script names. npm test,
  // npm start, npm run <name> and the pre/post hooks all execute commands.
  const executableScripts = new Set();
  const entrypoint = /^(?:build|bundle|dev|serve|start|preview|watch|verify|test|lint|check)(?::|$)/i;
  function npmTarget(words) {
    if (!['npm', 'pnpm', 'yarn'].includes(words[0])) return null;
    // Exact supported grammar only. npm's "--" forwards extra arguments to
    // the child process, and --workspace/--prefix can run another package's
    // scripts. None of those selections is covered by our Vite alias proof.
    if (['test', 'start'].includes(words[1]) && words.length === 2) return words[1];
    if (['run', 'run-script'].includes(words[1])) {
      if (words.length === 3 && /^[^\\-]/.test(words[2])) return words[2];
      if (words.length === 4 && words[2] === '--silent' &&
          /^[^\\-]/.test(words[3])) return words[3];
    }
    return null;
  }
  function followScript(name, chain = []) {
    if (chain.includes(name)) {
      errors.push('unsupported-vite-custom-config: cyclic npm script delegation: ' +
        [...chain, name].join(' -> '));
      return;
    }
    if (!Object.hasOwn(scripts, name) || typeof scripts[name] !== 'string') {
      errors.push('unsupported-vite-custom-config: unknown npm script: ' + name);
      return;
    }
    if (executableScripts.has(name)) return;
    executableScripts.add(name);
    const next = [...chain, name];
    for (const hook of ['pre' + name, 'post' + name]) {
      if (Object.hasOwn(scripts, hook)) followScript(hook, next);
    }
    const commands = splitShell(scripts[name]);
    if (!commands) {
      errors.push('unsupported-vite-custom-config: unbalanced npm script: ' + name);
      return;
    }
    for (const command of commands) {
      const words = shellWords(command);
      if (!words) {
        errors.push('unsupported-vite-custom-config: unsupported npm script quoting: ' + name);
        continue;
      }
      const target = npmTarget(words);
      if (target) followScript(target, next);
    }
  }
  for (const name of Object.keys(scripts)) {
    if (entrypoint.test(name)) followScript(name);
  }
  const safeBoundaryCommand = command => {
    if (typeof command !== 'string' || /[&|;<>$\r\n]/.test(command) ||
        command.includes(String.fromCharCode(96))) return false;
    const parts = splitShell(command);
    if (!parts || parts.length !== 1) return false;
    const words = shellWords(parts[0]);
    if (!words || words.length < 2 || words.length > 3) return false;
    const [exe, script, target] = words;
    const normalized = script.replace(/\\/g, '/');
    return /^(?:node|node\.exe)$/.test(exe) &&
      /^(?:\.\.\/)*tools\/check-boundaries\.cjs$/.test(normalized) &&
      (target === undefined || /^[A-Za-z0-9_./-]+$/.test(target));
  };
  const safeDelegatedBoundary = target =>
    ['arch', 'check:arch', 'test:architecture'].includes(target) &&
    Object.hasOwn(scripts, target) &&
    safeBoundaryCommand(scripts[target]) &&
    // npm run executes hooks for the delegated name as well.
    !Object.hasOwn(scripts, 'pre' + target) &&
    !Object.hasOwn(scripts, 'post' + target);
  for (const [scriptName, script] of Object.entries(scripts)) {
    if (typeof script !== 'string') continue;
    const commands = splitShell(script);
    if (!commands) {
      if (/\bvite\b/.test(script)) {
        errors.push('unsupported-vite-custom-config: unbalanced shell quoting');
        return;
      }
      continue;
    }
    const tokens = commands.map(shellWords);
    if (tokens.some(words => !words)) {
      errors.push('unsupported-vite-custom-config: unsupported shell quoting');
      return;
    }
    // Shell interpreters can execute Vite in embedded commands without a
    // top-level vite token. Never approve defaults for opaque nested shells.
    // Even `bash -e -c`, `pwsh -File`, and an invoked .sh script are
    // opaque. Inspecting only a known -c flag can silently miss Vite inside.
    const shellExecutable = /^(?:sh|bash|dash|ash|zsh|fish|cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?)$/i;
    const shellLaunch = tokens.some(words =>
      shellExecutable.test(words[0] || '') ||
      (['env', 'cross-env', 'dotenv'].includes(words[0]) &&
        words.some((word, i) => i > 0 && shellExecutable.test(word))));
    const programmaticVite = tokens.some(words =>
      /^(?:node|node\.exe|bun|tsx|ts-node)$/i.test(words[0] || '') &&
      /(?:require\s*\(|from\s+|import\s*\().*['"]vite['"]|\bvite\.build\s*\(/i.test(words.join(' ')));
    if (shellLaunch || programmaticVite) {
      errors.push('unsupported-vite-custom-config: opaque shell or programmatic Vite invocation');
      return;
    }
    const commandsWithVite = tokens.map(words => ({ words, args: viteArguments(words) }))
      .filter(entry => entry.args !== null);
    if ((executableScripts.has(scriptName) || commandsWithVite.length) &&
        hasUncheckedShellEffects(script)) {
      errors.push('unsupported-vite-custom-config: shell expansion or redirection can change the executed Vite graph: ' + scriptName);
      return;
    }
    // For build/dev entrypoints, the actual Vite invocation must be visible.
    // An opaque Node/tsx build file or an unrelated npm script can invoke Vite
    // programmatically with a different config after validation.
    if (executableScripts.has(scriptName)) {
      // Keep this allowlist narrow: unknown build tools can hide a Vite
      // invocation via an external script, even without saying 'vite'.
      const opaque = /\$\(|`/.test(script) || tokens.some(words => {
        if (viteArguments(words) !== null) return false;
        const executable = (words[0] || '').replace(/\\/g, '/');
        // Test launchers are executable too: --import, --require and
        // alternate Vitest config flags could start another Vite instance.
        // Permit only the documented CLI subset. Test *contents* still need
        // independent runtime checks; static script discovery does not audit
        // arbitrary code executed by tests.
        const nodeTestFiles = words.slice(2);
        const safeNodeTest = (executable === 'node' || executable === 'node.exe') &&
          words[1] === '--test' && nodeTestFiles.length > 0 &&
          nodeTestFiles.every(file =>
            /^(?:\.\.?\/)?[\w./*?-]+\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/.test(file) &&
            !file.split('/').includes('..'));
        const safeVitest = executable === 'vitest' &&
          words.length === 2 && words[1] === 'run';
        if (['echo', 'printf', 'tsc', 'eslint', 'biome', 'oxlint', 'oxfmt'].includes(executable) ||
            safeVitest || safeNodeTest) {
          return false;
        }
        if (executable === 'node' || executable === 'node.exe') {
          return !safeBoundaryCommand(words.join(' '));
        }
        const target = npmTarget(words);
        if (target) {
          // The full target and its lifecycle hooks were traversed above.
          // A known delegated checker is still restricted to its exact form.
          if (['arch', 'check:arch', 'test:architecture'].includes(target) &&
              !safeDelegatedBoundary(target)) return true;
          return !executableScripts.has(target);
        }
        // Unknown or option-bearing npm invocations are opaque, including
        // forwarded arguments and workspace/prefix script selection.
        return true;
      });
      if (opaque) {
        errors.push('unsupported-vite-custom-config: opaque build script may execute an unverified Vite config: ' + scriptName);
        return;
      }
    }
    if (!commandsWithVite.length) {
      // Unknown launchers (npx --yes, cross-env, custom wrappers) must not
      // accidentally fall through to default Vite configuration discovery.
      // Ignore literal echo/printf messages: they never execute Vite.
      const suspicious = tokens.some(words =>
        !['echo', 'printf'].includes(words[0]) && words.some(word =>
          /^(?:vite(?:\.cmd)?|(?:\.\/)?node_modules\/(?:\.bin\/vite(?:\.cmd)?|vite\/bin\/vite\.js))$/.test(word)));
      if (suspicious) {
        errors.push('unsupported-vite-custom-config: unsupported Vite launcher');
        return;
      }
      continue;
    }
    if (commandsWithVite.length !== 1 ||
        tokens.some(words => ['cd', 'pushd', 'popd', 'chdir'].includes(words[0]))) {
      errors.push('unsupported-vite-custom-config: ambiguous Vite execution or working directory');
      return;
    }
    const args = commandsWithVite[0].args;
    let config = null, subcommandSeen = false;
    for (let i = 0; i < args.length; i++) {
      const word = args[i];
      if (!subcommandSeen && viteCommands.has(word)) {
        subcommandSeen = true;
        continue;
      }
      if (word === '-c' || word === '--config') {
        const value = args[++i];
        if (config !== null || !value || value.startsWith('-')) {
          errors.push('unsupported-vite-custom-config: missing or duplicate Vite config argument');
          return;
        }
        config = value;
      } else if (word.startsWith('--config=') || word.startsWith('-c=')) {
        const value = word.slice(word.indexOf('=') + 1);
        if (config !== null || !value) {
          errors.push('unsupported-vite-custom-config: missing or duplicate Vite config argument');
          return;
        }
        config = value;
      } else if (argumentOptions.has(word)) {
        if (!args[i + 1] || args[i + 1].startsWith('-')) {
          errors.push('unsupported-vite-custom-config: unsupported Vite option value: ' + word);
          return;
        }
        i++;
      } else if (optionalArgumentOptions.has(word)) {
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          if (viteCommands.has(args[i + 1])) {
            errors.push('unsupported-vite-custom-config: ambiguous --host option and Vite subcommand');
            return;
          }
          i++;
        }
      } else if (word.startsWith('--host=')) {
        if (!word.slice('--host='.length)) {
          errors.push('unsupported-vite-custom-config: empty --host value');
          return;
        }
      } else if (booleanOptions.has(word)) {
        continue;
      } else {
        // Includes positional Vite roots, unknown flags, -cfoo and plugin
        // options: these may change the effective Vite configuration.
        errors.push('unsupported-vite-custom-config: unsupported Vite argument or root: ' + word);
        return;
      }
    }
    if (config === null) usesDefault = true;
    else selections.add(path.resolve(projectDir, config));
  }
  if (selections.size > 1 || (selections.size && usesDefault)) {
    errors.push('unsupported-vite-custom-config: npm scripts select different Vite config files');
    return;
  }
  const declared = policy.viteConfig ? path.resolve(projectDir, policy.viteConfig) : null;
  const selected = [...selections][0];
  if (selected && (!declared || declared !== selected)) {
    errors.push('unsupported-vite-custom-config: npm --config must match architecture.config.json viteConfig');
    return;
  }
  if (declared && usesDefault && !selected) {
    errors.push('unsupported-vite-custom-config: npm scripts use the default Vite config, not declared viteConfig');
    return;
  }
  if (declared && !isWithinRoot(declared, projectDir)) {
    errors.push('unsupported-vite-custom-config: viteConfig must stay in project root');
    return;
  }
  const vitePaths = declared ? [declared].filter(fs.existsSync) : defaults;
  if (vitePaths.length !== 1) {
    if (vitePaths.length > 1 || declared || Object.keys(policy.viteAliases).length) {
      errors.push('unsupported-vite-alias-config: expected one recognizable Vite config');
    }
    return;
  }
  const vitePath = vitePaths[0];
  if (!isWithinRoot(fs.realpathSync(vitePath), fs.realpathSync(projectDir))) {
    errors.push('unsupported-vite-alias-config: config symlink escapes the project');
    return;
  }
  if (!supportedExt.test(vitePath)) {
    errors.push('unsupported-vite-custom-config: unsupported Vite config extension');
    return;
  }
  const source = ts.createSourceFile(vitePath, fs.readFileSync(vitePath, 'utf8'),
    ts.ScriptTarget.Latest, true, ts.getScriptKindFromFileName(vitePath));
  if (source.parseDiagnostics.length) {
    errors.push('unsupported-vite-alias-config: Vite configuration has syntax errors');
    return;
  }
  // The alias helper must really be imported from Node, not merely named
  // fileURLToPath; Vite config is executable and identifiers can be shadowed.
  const trustedHelper = source.statements.some(statement => {
    if (!ts.isImportDeclaration(statement) ||
        literalString(statement.moduleSpecifier) !== 'node:url') return false;
    const clause = statement.importClause;
    const bindings = clause?.namedBindings;
    return !clause?.isTypeOnly && bindings && ts.isNamedImports(bindings) &&
      bindings.elements.some(binding => !binding.isTypeOnly &&
        binding.name.text === 'fileURLToPath' && !binding.propertyName);
  });
  const shadows = name => source.statements.some(statement => {
    if (ts.isVariableStatement(statement)) {
      return statement.declarationList.declarations.some(declaration =>
        declaration.name.getText(source).split(/[^A-Za-z0-9_$]/).includes(name));
    }
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.name?.text === name) return true;
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.name?.text === name) return true;
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings) && bindings.name.text === name) return true;
      if (bindings && ts.isNamedImports(bindings)) return bindings.elements.some(binding =>
        binding.name.text === name && !(name === 'fileURLToPath' &&
          literalString(statement.moduleSpecifier) === 'node:url' &&
          !binding.propertyName && !binding.isTypeOnly));
    }
    return false;
  });
  const verifiedUrlHelpers = trustedHelper &&
    !shadows('fileURLToPath') && !shadows('URL');
  function propertyName(prop) {
    if (!prop || !ts.isPropertyAssignment(prop)) return null;
    const name = prop.name;
    return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
  }
  // A static CommonJS module.exports is supported; dynamic CommonJS syntax
  // fails closed just like arbitrary ESM config factories.
  const cjsFile = /\.(?:cjs|cts)$/.test(vitePath);
  const exports = source.statements.filter(statement => {
    if (!cjsFile) return ts.isExportAssignment(statement) && !statement.isExportEquals;
    return ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression) &&
      statement.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(statement.expression.left) &&
      statement.expression.left.getText(source) === 'module.exports';
  });
  if (exports.length !== 1) {
    errors.push('unsupported-vite-alias-config: expected one static ' +
      (cjsFile ? 'module.exports assignment' : 'default config export'));
    return;
  }
  // Side-effecting ESM declarations can mutate the exported config after
  // static inspection, just as CommonJS initializers can. Imports and erased
  // TypeScript type declarations are the only allowed companions of export.
  // An import executes its target module. Only known Vite/React/config
  // integration modules can be statically trusted for this reference checker.
  const trustedConfigModules = new Set(['vite', 'vitest/config', '@vitejs/plugin-react', 'node:url']);
  const inert = statement =>
    (ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression)) ||
    (!cjsFile && ((ts.isImportDeclaration(statement) &&
      (statement.importClause?.isTypeOnly ||
        Boolean(statement.importClause &&
          trustedConfigModules.has(literalString(statement.moduleSpecifier))))) ||
      ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)));
  if (source.statements.some(statement => statement !== exports[0] && !inert(statement))) {
    errors.push('unsupported-vite-alias-config: additional top-level executable declarations');
    return;
  }
  const trustedDefineConfig = source.statements.some(statement => {
    if (!ts.isImportDeclaration(statement) ||
        !['vite', 'vitest/config'].includes(literalString(statement.moduleSpecifier))) return false;
    const clause = statement.importClause;
    return !clause?.isTypeOnly && clause?.namedBindings &&
      ts.isNamedImports(clause.namedBindings) &&
      clause.namedBindings.elements.some(binding => !binding.isTypeOnly &&
        binding.name.text === 'defineConfig' && !binding.propertyName);
  });
  let config = cjsFile ? exports[0].expression.right : exports[0].expression;
  if (ts.isCallExpression(config) && ts.isIdentifier(config.expression) &&
      config.expression.text === 'defineConfig' && config.arguments.length === 1) {
    if (!trustedDefineConfig || cjsFile) {
      errors.push('unsupported-vite-alias-config: untrusted defineConfig; import from vite or vitest/config');
      return;
    }
    config = config.arguments[0];
  }
  // A config factory, spread or local reference may inject aliases into Vite.
  // Reject unknown effective resolution instead of accepting a missing alias.
  if (!ts.isObjectLiteralExpression(config)) {
    errors.push('unsupported-vite-alias-config: use an inline static defineConfig object');
    return;
  }
  function objectProperties(object, scope) {
    const properties = new Map();
    for (const prop of object.properties) {
      if (!ts.isPropertyAssignment(prop)) {
        errors.push('unsupported-vite-alias-config: ' + scope +
          ' contains computed/spread/shorthand configuration');
        continue;
      }
      const name = propertyName(prop);
      if (!name || properties.has(name)) {
        errors.push('unsupported-vite-alias-config: ' + scope +
          ' contains an unsupported or repeated property');
        continue;
      }
      properties.set(name, prop.initializer);
    }
    return properties;
  }
  const top = objectProperties(config, 'top-level');
  const allowedTop = new Set([
    'resolve', 'plugins', 'worker', 'publicDir', 'root', 'build',
    'environments', 'builder', 'esbuild', 'css', 'test',
  ]);
  for (const name of top.keys()) {
    if (!allowedTop.has(name)) errors.push(
      'unverifiable-vite-config-expression: unknown config property ' + name);
  }
  // Object property initializers execute even when their keys are ignored.
  const testOptions = top.get('test');
  if (testOptions) {
    if (!ts.isObjectLiteralExpression(testOptions)) {
      errors.push('unverifiable-vite-config-expression: test must be a literal object');
    } else {
      const options = objectProperties(testOptions, 'test');
      for (const [name, value] of options) {
        const strings = ts.isArrayLiteralExpression(value) &&
          value.elements.every(ts.isStringLiteral);
        const accepted =
          (name === 'environment' && ts.isStringLiteral(value)) ||
          (['setupFiles', 'include'].includes(name) && strings) ||
          (name === 'clearMocks' &&
            [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword].includes(value.kind));
        if (!accepted) errors.push(
          'unverifiable-vite-config-expression: executable or unknown test option ' + name);
      }
    }
  }
  const configured = top.get('resolve');
  const aliases = new Map();
  if (configured) {
    if (!ts.isObjectLiteralExpression(configured)) {
      errors.push('unsupported-vite-alias-config: resolve must be a static object');
    } else {
      const resolve = objectProperties(configured, 'resolve');
      for (const name of resolve.keys()) {
        if (name !== 'alias') errors.push(
          'unverifiable-vite-resolution-option: unchecked resolve option ' + name);
      }
      if (resolve.has('alias')) {
        const aliasValue = resolve.get('alias');
        if (!ts.isObjectLiteralExpression(aliasValue)) {
          errors.push('unsupported-vite-alias-config: resolve.alias must be a static object');
        } else {
          for (const [find, value] of objectProperties(aliasValue, 'resolve.alias')) {
            aliases.set(find, value);
          }
        }
      }
    }
  }
  // Worker plugins and Rollup settings run in a separate build pipeline.
  // The source-only dependency graph cannot certify injected worker imports.
  const worker = top.get('worker');
  if (worker && !(ts.isObjectLiteralExpression(worker) && worker.properties.length === 0)) {
    errors.push('unverifiable-vite-worker-graph: worker-specific transforms require bundler-graph verification');
  }
  // The default public/ tree ships without any transformation. Explicit
  // publicDir overrides must be static and limited to default or disabled.
  const publicConfig = top.get('publicDir');
  if (publicConfig) {
    if (publicConfig.kind === ts.SyntaxKind.FalseKeyword) {
      viteState.publicDirDisabled = true;
    } else if (!(ts.isStringLiteral(publicConfig) && publicConfig.text === 'public')) {
      errors.push('unsupported-vite-public-dir: publicDir must be "public" or false');
    }
  }
  // Vite uses the project root and build inputs to select actual entrypoints.
  // A scan of project/src cannot prove custom roots, Rollup inputs, libraries
  // or multi-environment builders. Fail closed until a resolved bundler graph
  // checker can explicitly cover every entrypoint and its dependencies.
  if (top.has('root') &&
      !(ts.isStringLiteral(top.get('root')) && top.get('root').text === '.')) {
    errors.push('unsupported-vite-build-entry: non-default Vite root is outside verified source scope');
  }
  if (top.has('build') &&
      !(ts.isObjectLiteralExpression(top.get('build')) &&
        top.get('build').properties.length === 0)) {
    errors.push('unsupported-vite-build-entry: custom build options or entrypoints require resolved bundler verification');
  }
  if (top.has('environments') || top.has('builder')) {
    errors.push('unsupported-vite-build-entry: custom build environments cannot be verified statically');
  }

  // Vite can inject imports *after* the source import and stylesheet scan.
  // Until the transformed module graph is verified, permit only inert empty
  // option objects (and esbuild:false) instead of certifying unchecked edges.
  for (const name of ['esbuild', 'css']) {
    const setting = top.get(name);
    if (!setting) continue;
    const empty = ts.isObjectLiteralExpression(setting) && setting.properties.length === 0;
    const disabled = name === 'esbuild' && setting.kind === ts.SyntaxKind.FalseKeyword;
    if (!empty && !disabled) errors.push(
      'unverifiable-vite-transforms: ' + name + ' may inject code or stylesheet dependencies');
  }
  // Plugins can ADD aliases even when resolve.alias is absent; rejecting
  // only when aliases.size > 0 leaves an unchecked dependency-resolution path.
  // The reference app may use the exact pinned React JSX/Fast Refresh plugin
  // without custom options, provided it has no declared aliases. This is a
  // deliberately narrow syntactic exception, not generic plugin trust.
  const plugins = top.get('plugins');
  const pinnedReact = (() => {
    if (!plugins || !ts.isArrayLiteralExpression(plugins) ||
        plugins.elements.length !== 1 || aliases.size ||
        Object.keys(policy.viteAliases).length) return false;
    const invocation = plugins.elements[0];
    if (!ts.isCallExpression(invocation) ||
        !ts.isIdentifier(invocation.expression) ||
        invocation.expression.text !== 'react' ||
        invocation.arguments.length !== 0) return false;
    const importedReact = source.statements.some(statement =>
      ts.isImportDeclaration(statement) &&
      literalString(statement.moduleSpecifier) === '@vitejs/plugin-react' &&
      !statement.importClause?.isTypeOnly &&
      statement.importClause?.name?.text === 'react');
    if (!importedReact || !fs.existsSync(packageFile)) return false;
    const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    return (manifest.devDependencies?.['@vitejs/plugin-react'] ||
      manifest.dependencies?.['@vitejs/plugin-react']) === '4.7.0';
  })();
  if (plugins && !(ts.isArrayLiteralExpression(plugins) &&
      plugins.elements.length === 0) && !pinnedReact) {
    errors.push('unverifiable-vite-plugin-alias: plugin hooks may add or override aliases; verify effective Vite config');
  }
  // Vite aliases are ordered rules. The checker map must preserve this order
  // so overlapping prefixes cannot resolve to a different physical target.
  const configuredOrder = Object.keys(policy.viteAliases);
  const viteOrder = [...aliases.keys()];
  if (configuredOrder.length === viteOrder.length &&
      configuredOrder.some((name, i) => name !== viteOrder[i])) {
    errors.push('vite-alias-order-mismatch: architecture.config.json must preserve Vite alias order');
  }
  for (const [find, value] of aliases) {
    if (find.endsWith('/')) {
      errors.push('unsupported-vite-alias-config: trailing-slash alias does not follow Vite matching semantics: ' + find);
    }
    if (!Object.hasOwn(policy.viteAliases, find)) {
      errors.push('unverified-vite-alias: ' + find +
        ' missing from architecture.config.json viteAliases');
      continue;
    }
    const expected = path.resolve(projectDir, policy.viteAliases[find]);
    let actual = null;
    if (ts.isStringLiteral(value) && path.isAbsolute(value.text)) {
      actual = path.resolve(value.text);
    } else if (ts.isCallExpression(value) &&
        ts.isIdentifier(value.expression) && value.expression.text === 'fileURLToPath' &&
        value.arguments.length === 1) {
      const expr = value.arguments[0];
      if (!verifiedUrlHelpers) {
        errors.push('untrusted-vite-alias-helper: ' + find +
          '; import fileURLToPath from node:url and do not shadow URL');
      } else if (ts.isNewExpression(expr) && ts.isIdentifier(expr.expression) &&
          expr.expression.text === 'URL' && expr.arguments?.length === 2 &&
          ts.isStringLiteral(expr.arguments[0]) &&
          expr.arguments[1].getText(source) === 'import.meta.url') {
        // Resolve with actual file-URL semantics; path.resolve does not
        // decode/normalize %2e%2e and can compare against a decoy path.
        try {
          const aliasUrl = new URL(expr.arguments[0].text, pathToFileURL(vitePath));
          if (aliasUrl.protocol !== 'file:' || aliasUrl.search || aliasUrl.hash) {
            throw new Error('Expected a plain local file URL');
          }
          actual = path.resolve(fileURLToPath(aliasUrl));
        } catch {
          errors.push('unverifiable-vite-alias-url: invalid local file URL for ' + find);
        }
      }
    }
    if (!actual) {
      errors.push('unverifiable-vite-alias-target: ' + find +
        '; use an absolute literal or fileURLToPath(new URL(..., import.meta.url))');
    } else if (actual !== expected) {
      errors.push('vite-alias-target-mismatch: ' + find +
        '; actual Vite path differs from architecture.config.json');
    }
  }
  for (const name of Object.keys(policy.viteAliases)) {
    if (!aliases.has(name)) {
      errors.push('unverified-vite-alias: ' + name +
        ' is configured in architecture.config.json but absent from Vite');
    }
  }
}




// Vite discovers PostCSS independently of vite.config.ts. PostCSS plugins
// can inject CSS edges that the raw source scanner never sees.
function verifyVitePostcssConfig(projectDir, errors) {
  const configName = /^(?:postcss\.config\.(?:[cm]?[jt]s|json|ya?ml)|\.postcssrc(?:\.(?:[cm]?[jt]s|json|ya?ml))?)$/i;
  for (let dir = projectDir; ; dir = path.dirname(dir)) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (configName.test(item.name)) {
        errors.push('unverifiable-vite-postcss-config: PostCSS config ' +
          normPath(path.join(dir, item.name)) + ' may transform CSS imports');
      }
    }
    const packageFile = path.join(dir, 'package.json');
    if (fs.existsSync(packageFile)) {
      let pkg;
      try { pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8')); }
      catch {
        errors.push('unverifiable-vite-postcss-config: unreadable package manifest ' + packageFile);
      }
      if (pkg && Object.hasOwn(pkg, 'postcss')) {
        errors.push('unverifiable-vite-postcss-config: package.json postcss configuration in ' + dir);
      }
    }
    if (path.dirname(dir) === dir) break;
  }
}

const publicSafeAsset = /\.(?:png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|mp4|webm)$/i;

function verifyVitePublicDirectory(projectDir, errors, state) {
  // publicDir:false disables the special public middleware but not Vite's
  // ordinary root-static or root-HTML middleware. Audit active asset types
  // even in the disabled public directory.
  const publicRoot = path.join(projectDir, 'public');
  if (!fs.existsSync(publicRoot)) return;
  const projectPhysicalRoot = fs.realpathSync(projectDir);
  if (fs.lstatSync(publicRoot).isSymbolicLink() ||
      !isWithinRoot(fs.realpathSync(publicRoot), projectPhysicalRoot)) {
    errors.push('unverified-vite-public-dir: public directory symlink escapes checked project');
    return;
  }
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const relative = normPath(path.relative(publicRoot, full));
      if (entry.isSymbolicLink()) {
        errors.push('unverified-vite-public-dir: symlink ' + relative);
      } else if (entry.isDirectory()) {
        scan(full);
      } else if (!entry.isFile() ||
          (!publicSafeAsset.test(relative) &&
           !(state.publicDirDisabled && /\.html?$/i.test(relative)))) {
        // Disabled publicDir HTML is checked by verifyViteSecondaryHtml.
        // Other JS, CSS, SVG and unknown active resources still fail closed.
        errors.push('unverified-vite-public-dir: unsupported public asset ' + relative);
      }
    }
  }
  scan(publicRoot);
}

// The dev server serves other project HTML files, even with a single-page
// production build. Reject them until they are explicitly audited.
function verifyViteSecondaryHtml(projectDir, errors, state) {
  // Exclusions are paths rooted at the Vite project, NOT arbitrary directory
  // basenames: docs/public/index.html is a Vite dev entry, unlike public/.
  // Only repository/vendor metadata is excluded; names like dist/, build/,
  // coverage/, .next/ and .vite/ can still contain dev-addressable HTML.
  // A generated HTML page is unverified until an explicit build/dev graph
  // policy is implemented, regardless of its directory name.
  const rootExcluded = new Set(['.git', 'node_modules']);
  // Vite can still serve /public/*.html as ordinary project-root HTML
  // when publicDir is disabled. Only skip public/ here if the separate
  // public asset scanner actually audited it.
  if (!state.publicDirDisabled) rootExcluded.add('public');
  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (dir === projectDir && rootExcluded.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      const relative = normPath(path.relative(projectDir, file));
      if (entry.isSymbolicLink()) {
        // A symlink can point at a directory of HTML entries, or directly at
        // an HTML document under an innocuous alias. Never recurse through it.
        if (/\.html?$/i.test(entry.name)) {
          errors.push('unverified-vite-html-page: symlinked HTML entry ' + relative);
          continue;
        }
        try {
          const target = fs.statSync(file);
          if (target.isDirectory() || /\.html?$/i.test(fs.realpathSync(file))) {
            errors.push('unverified-vite-html-page: symlinked HTML or directory ' + relative);
          }
        } catch (error) {
          // A dangling/inaccessible symlink must not crash the architecture
          // checker. Unknown destinations cannot safely be certified inert.
          errors.push('unverified-vite-html-page: unresolved symlink ' + relative +
            ' (' + (error.code || 'unknown error') + ')');
        }
      } else if (entry.isDirectory()) {
        scan(file);
      } else if (/\.html?$/i.test(entry.name) && relative !== 'index.html') {
        errors.push('unverified-vite-html-page: secondary HTML entry ' + relative);
      }
    }
  }
  scan(projectDir);
}

function verifyViteHtmlEntrypoints(projectDir, sourceRoot, policy, errors, state) {
  const htmlFile = path.join(projectDir, 'index.html');
  if (!fs.existsSync(htmlFile)) return;
  const physicalRoot = fs.realpathSync(sourceRoot);
  const publicRoot = path.join(projectDir, 'public');
  const { errors: parseErrors, references } = scanHtml(fs.readFileSync(htmlFile, 'utf8'));
  errors.push(...parseErrors.map(message => message + ': index.html'));
  for (const { spec, kind } of references) {
    const projectCandidate = path.resolve(projectDir, spec.startsWith('/') ? '.' + spec : spec);
    const publicCandidate = path.resolve(publicRoot, spec.startsWith('/') ? '.' + spec : spec);
    const local = fs.existsSync(projectCandidate) &&
      fs.statSync(projectCandidate).isFile();
    const fromPublic = !local && !state.publicDirDisabled &&
      fs.existsSync(publicCandidate) && fs.statSync(publicCandidate).isFile();
    const target = local ? projectCandidate : fromPublic ? publicCandidate : null;
    if (!target) {
      errors.push('missing-html-asset: index.html -> ' + spec);
      continue;
    }
    const physical = fs.realpathSync(target);
    if (kind === 'script' && !sourceExt.test(target)) {
      errors.push('unsupported-vite-html-entry: module script is not a JS/TS file: ' + spec);
      continue;
    }
    if (fromPublic) {
      if (!fs.existsSync(publicRoot) || !isWithinRoot(physical, fs.realpathSync(publicRoot)) ||
          !publicSafeAsset.test(target) || kind === 'script') {
        errors.push('unverified-html-public-asset: index.html -> ' + spec);
      }
      continue;
    }
    if (!isWithinRoot(physical, physicalRoot)) {
      errors.push('outside-source-html-import: index.html -> ' + spec);
      continue;
    }
    // index.html is app-level composition, not a public API of another module.
    const source = { layer: 'app', relative: 'index.html' };
    const dest = category(physical, physicalRoot);
    checkOwnedDependency(source, dest, policy, errors, { asset: kind !== 'script' });
  }
}

// One ownership/layer policy for script, stylesheet and static-asset edges.
// Only the resolution mechanism and runtime cycle semantics differ.
function checkOwnedDependency(source, dest, policy, errors, { asset = false, isTest = false, stylesheet = false } = {}) {
  const desc = `${source.relative} -> ${dest.relative}`;
  const pureCode = isPureModule(source) ||
    (source.layer === 'shared' && isPureShared(source.relative));
      if (source.layer === 'shared' && dest.layer !== 'shared') errors.push(`shared-must-be-independent: ${desc}`);
      // Domain/model/application and pure shared code may depend on pure shared
      // primitives only, never generated API clients, UI, HTTP or test setup.
      if (pureCode && !isTest) {
        // Only known-pure shared folders and permitted same-module layers can
        // be imported. Unknown source-root directories are not implicitly pure.
        const pureSharedTarget = dest.layer === 'shared' && isPureShared(dest.relative);
        const sameModule = source.layer === 'module' && dest.layer === 'module' &&
          source.module === dest.module;
        const pureModuleTarget = sameModule && (
          (source.part === 'domain' && dest.part === 'domain') ||
          (source.part === 'model' && dest.part === 'model') ||
          (source.part === 'application' && ['application', 'domain'].includes(dest.part)));
        if (!pureSharedTarget && !pureModuleTarget) {
          if (dest.layer === 'shared') {
            errors.push(`pure-layer-imports-technical-shared: ${desc}`);
          } else if (['generated', 'testing'].includes(dest.layer)) {
            errors.push(`pure-layer-imports-technical: ${desc}`);
          } else {
            errors.push(`pure-layer-imports-nonpure-source: ${desc}`);
          }
        }
      }
      if (source.layer === 'module' && dest.layer === 'module' && source.module !== dest.module) {
        // Pure/application layers must not depend on another module's potentially UI-facing barrel.
        if (['domain', 'model', 'application'].includes(source.part)) {
          errors.push(`cross-module-pure-layer: ${desc}`);
        }
        const exceptions = Object.hasOwn(policy.allowCrossModule, source.module)
          ? policy.allowCrossModule[source.module] : [];
        if (!Array.isArray(exceptions) || !exceptions.includes(dest.module) ||
            (asset || !isPublicEntrypoint(dest))) {
          errors.push(`sibling-module-dependency: ${desc}`);
        }
      }
      if (source.layer === 'module' && dest.layer === 'module' && source.module === dest.module) {
        if (!asset && isSelfBarrel(source, dest)) errors.push(`no-self-barrel: ${desc}`);
        const part = source.part, targetPart = dest.part;
        if (part === 'domain' && targetPart !== 'domain') errors.push(`pure-domain-import: ${desc}`);
        if (part === 'application' && !['domain', 'application'].includes(targetPart)) errors.push(`application-import: ${desc}`);
        if (part === 'infrastructure' && !['application', 'domain', 'infrastructure'].includes(targetPart)) errors.push(`infrastructure-import: ${desc}`);
        if (part === 'ui' && targetPart === 'infrastructure') errors.push(`ui-imports-infrastructure: ${desc}`);
        if (part === 'model' && !['model'].includes(targetPart)) errors.push(`pure-model-import: ${desc}`);
        if (part === 'api' && targetPart === 'ui') errors.push(`api-imports-ui: ${desc}`);
        if (['api', 'model'].includes(part) &&
            ['domain', 'application', 'infrastructure'].includes(targetPart)) {
          errors.push(`mixed-mode-import: ${desc}`);
        }
        if (['domain', 'application', 'infrastructure'].includes(part) &&
            ['api', 'model'].includes(targetPart)) {
          errors.push(`mixed-mode-import: ${desc}`);
        }
      }
      if (dest.layer === 'module' && source.layer !== 'module' && source.layer !== 'app' && source.layer !== 'routes' && source.layer !== 'shared') {
        errors.push(`invalid-external-module-use: ${desc}`);
      }
      if (dest.layer === 'module' && source.layer !== 'module') {
        const allowedPublic = !asset && isPublicEntrypoint(dest);
        if (!allowedPublic && !['testing'].includes(source.layer)) errors.push(`deep-module-import: ${desc}`);
      }
      // Pure-layer checks above apply consistently to domain, model, application
      // and transitively pure shared/lib and shared/domain modules.
      if (source.layer === 'routes' && dest.layer === 'app') errors.push(`routes-import-app: ${desc}`);
      if (source.layer === 'module' && ['app', 'routes'].includes(dest.layer)) errors.push(`module-imports-composition: ${desc}`);
  // Source imports already distinguish pure JSON from presentation assets.
  // Only stylesheet-originated dependencies need this additional asset guard.
  if (stylesheet && pureCode && !isTest) errors.push(`pure-layer-static-asset: ${desc}`);
}

function scanOwnedStylesheets(root, physicalRoot, policy, options, errors) {
  function scanDir(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // Do not silently omit imported stylesheets under nested generated-
      // looking folders. Inspect every first-party stylesheet under src/.
      if (entry.name === '.git' && entry.isDirectory()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scanDir(file);
      else if (styleExt.test(entry.name)) scanFile(file);
    }
  }
  function scanFile(logicalFile) {
    let physicalFile;
    try {
      physicalFile = fs.realpathSync(logicalFile);
    } catch (error) {
      // Dangling or inaccessible stylesheet links are violations, not
      // exceptional terminations of the entire architecture review.
      errors.push('unresolved-stylesheet-symlink: ' +
        normPath(path.relative(root, logicalFile)) + ' (' + (error.code || 'unknown error') + ')');
      return;
    }
    if (!isWithinRoot(physicalFile, physicalRoot)) {
      errors.push('outside-source-symlink: ' + path.relative(root, logicalFile));
      return;
    }
    const source = category(physicalFile, physicalRoot);
    if (/\.(?:styl|stylus)$/i.test(logicalFile)) {
      errors.push('unverified-vite-stylus-graph: ' + source.relative +
        '; Stylus imports require an audited resolved preprocessing graph');
      return;
    }
    let css;
    try {
      css = fs.readFileSync(logicalFile, 'utf8');
    } catch (error) {
      errors.push('unreadable-stylesheet: ' + source.relative +
        ' (' + (error.code || 'unknown error') + ')');
      return;
    }
    const scanned = scanCssDependencies(css, { filename: logicalFile });
    for (const issue of scanned.errors) errors.push(issue + ': ' + source.relative);
    for (const ref of scanned.references) {
      const spec = fileSpecifier(ref.spec);
      if (!spec) continue;
      // An @import/@use/@forward introduces a dependency-bearing stylesheet;
      // unlike decorative url() or image-set media, an unverified remote/data
      // stylesheet may import further unchecked sources.
      if (/^(?:data:|https?:|\/\/)/i.test(spec)) {
        if (['import', 'use', 'forward'].includes(ref.kind)) {
          errors.push('unverified-css-external-stylesheet: ' + source.relative + ' -> ' + ref.spec);
        }
        continue;
      }
      // Sass's built-in modules are internal compiler dependencies, not
      // external CSS URLs. Their use/forward form remains supported.
      if (/^sass:/i.test(spec)) {
        if (!['use', 'forward'].includes(ref.kind)) {
          errors.push('unsupported-css-dependency: unsupported Sass built-in import ' +
            source.relative + ' -> ' + ref.spec);
        }
        continue;
      }
      if (/[#@]\{|\$\{/.test(ref.spec)) {
        errors.push('unsupported-css-dependency: interpolated reference ' + source.relative + ' -> ' + ref.spec);
        continue;
      }
      if (spec.startsWith('#')) {
        if (ref.kind === 'url' && /^#[\w-]+$/.test(spec)) continue;
        errors.push('unsupported-css-dependency: unresolved hash reference ' + source.relative + ' -> ' + ref.spec);
        continue;
      }
      const projectDir = path.dirname(root);
      const alias = resolveViteAlias(spec, policy.viteAliases, projectDir);
      const candidates = [];
      if (alias) candidates.push(alias);
      else if (spec.startsWith('.')) candidates.push(path.resolve(path.dirname(logicalFile), spec));
      else if (spec.startsWith('/src/')) candidates.push(path.resolve(projectDir, '.' + spec));
      else {
        candidates.push(...resolveMappedAssetCandidates(spec, options, projectDir));
      }
      if (!candidates.length) {
        errors.push('unverified-css-dependency: ' + source.relative + ' -> ' + ref.spec);
        continue;
      }
      const expanded = [];
      for (const candidate of candidates) {
        expanded.push(candidate);
        if (ref.kind !== 'url') {
          const extname = path.extname(candidate);
          if (extname) {
            // Sass partials can be referenced using their public filename.
            expanded.push(path.join(path.dirname(candidate), '_' + path.basename(candidate)));
          } else {
            for (const ext of ['.css', '.scss', '.sass', '.less']) {
              expanded.push(candidate + ext);
              expanded.push(path.join(path.dirname(candidate), '_' + path.basename(candidate) + ext));
            }
          }
        }
      }
      const found = expanded.find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
      if (!found) {
        if (ref.optional) continue; // Valid Less (optional) when the file is absent.
        errors.push('missing-static-asset: ' + source.relative + ' -> ' + ref.spec);
        continue;
      }
      const actual = fs.realpathSync(found);
      if (!isWithinRoot(actual, physicalRoot)) {
        errors.push('outside-source-import: ' + source.relative + ' -> ' + ref.spec);
        continue;
      }
      const dest = category(actual, physicalRoot);
      checkOwnedDependency(source, dest, policy, errors, { asset: true, stylesheet: true });
    }
  }
  scanDir(root);
}

function check(srcDir) {
  const errors = [];
  const warnings = [];
  const root = path.resolve(srcDir);
  const physicalRoot = fs.realpathSync(root);
  const options = configFor(path.dirname(root)).options;
  const policy = loadBoundaryConfig(path.dirname(root));
  const viteState = { publicDirDisabled: false };
  verifyViteAliases(path.dirname(root), policy, errors, viteState);
  verifyVitePostcssConfig(path.dirname(root), errors);
  verifyVitePublicDirectory(path.dirname(root), errors, viteState);
  verifyViteSecondaryHtml(path.dirname(root), errors, viteState);
  verifyViteHtmlEntrypoints(path.dirname(root), root, policy, errors, viteState);
  const files = walk(root).map(f => path.resolve(f));
  if (files.length === 0) errors.push('no-source-files: No supported source files found');
  const known = new Set(files);
  const edges = new Map(files.map(f => [f, []]));
  const moduleLayouts = new Map();
  scanOwnedStylesheets(root, physicalRoot, policy, options, errors);
  for (const file of files) {
    const logical = category(file, root);
    let physicalFile;
    try {
      physicalFile = fs.realpathSync(file);
    } catch (error) {
      errors.push('unresolved-source-symlink: ' + logical.relative +
        ' (' + (error.code || 'unknown error') + ')');
      continue;
    }
    if (!isWithinRoot(physicalFile, physicalRoot)) {
      errors.push(`outside-source-symlink: ${logical.relative} -> ${physicalFile}`);
      continue;
    }
    const actual = category(physicalFile, physicalRoot);
    if (!sameOwnership(logical, actual)) {
      errors.push(`source-symlink-ownership: ${logical.relative} -> ${actual.relative}`);
    }
    if (actual.layer === 'module') {
      const layout = moduleLayouts.get(actual.module) || { simple: new Set(), complex: new Set() };
      if (['api', 'model'].includes(actual.part)) layout.simple.add(actual.part);
      if (['domain', 'application', 'infrastructure'].includes(actual.part)) layout.complex.add(actual.part);
      moduleLayouts.set(actual.module, layout);
    }
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (error) {
      errors.push('unreadable-source-file: ' + logical.relative +
        ' (' + (error.code || 'unknown error') + ')');
      continue;
    }
    const kind = ts.getScriptKindFromFileName(file);
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    for (const diagnostic of sf.parseDiagnostics) {
      const location = sf.getLineAndCharacterOfPosition(diagnostic.start || 0);
      errors.push(`syntax-error: ${path.relative(root, file)}:${location.line + 1}:${location.character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
    }
    const dependencies = [];
    imports(sf, dependencies, options);
    for (const dep of dependencies) {
      const source = actual;
      if (dep.unsupported) {
        errors.push(`unsupported-${dep.unsupported}: ${source.relative} at offset ${dep.line}; dependency targets cannot be verified`);
        continue;
      }
      if (dep.viteGlob) {
        errors.push(`unsupported-vite-glob: ${source.relative} uses ${dep.spec}; use explicit imports or implement audited glob expansion`);
        continue;
      }
      const filesystemSpec = fileSpecifier(dep.spec);
      const query = dep.spec.slice(filesystemSpec.length);
      // Vite ?raw/?url explicitly load data. ?inline/?no-inline only control
      // asset inlining; on JS/TS they are not an asset loader and still execute
      // the source module. Worker entries must also retain executable edges.
      // Mirror Vite 7.3.7's exact query-token syntax. "=value" is
      // not a raw/url/worker flag, and must not suppress execution edges.
      const workerQuery = /(?:[?&])(?:worker|sharedworker)(?:&|$)/.test(query) ||
        Boolean(dep.workerEntry);
      const dataQuery = /(?:[?&])(?:raw|url)(?:&|$)/.test(query) &&
        !workerQuery;
      // Treat solely these known inline modifiers as non-transforming for
      // source modules. Unknown or combined query modes stay conservative.
      const inlineModifiersOnly = /^\?(?:inline|no-inline)(?:&(?:inline|no-inline))*$/.test(query);
      const knownQuerySyntax = !query ||
        /^\?(?:raw|url|inline|no-inline|worker|sharedworker)(?:&(?:raw|url|inline|no-inline|worker|sharedworker))*$/.test(query);
      if (dep.runtime && !knownQuerySyntax) {
        errors.push('unverified-vite-import-query: ' + source.relative + ' -> ' + dep.spec);
      }
      const mappedAsset = dataQuery || (Boolean(dep.fromUrl) && !dep.workerEntry);
      const transformedImport = Boolean(dep.fromUrl) ||
        (Boolean(query) && !inlineModifiersOnly);
      const relativeSpec = filesystemSpec.startsWith('.');
      const rootAbsolute = filesystemSpec.startsWith('/');
      const rootPath = rootAbsolute ? path.resolve(path.dirname(root), '.' + filesystemSpec) : null;
      const viteAlias = resolveViteAlias(filesystemSpec, policy.viteAliases, path.dirname(root));
      const pathPattern = matchesAlias(filesystemSpec, options.paths);
      // baseUrl can resolve arbitrary specifiers such as "helpers" or
      // "features/helpers"; the names of source directories are not evidence
      // of first-party ownership. Check the actual TypeScript result against
      // the enumerated source tree before classifying a bare import.
      const tsCandidate = !relativeSpec && !rootAbsolute && !viteAlias
        ? ts.resolveModuleName(filesystemSpec, file, options, ts.sys).resolvedModule
        : null;
      // A #imports entry or self-name exports mapping has its own executable
      // resolution rules below. Its TS target is not a baseUrl alias: treating
      // it as one would turn valid mapped ?raw/?url requests into missing
      // local-asset errors and skip package-map provenance checks.
      const packageMapOwnsRuntime = !relativeSpec && !rootAbsolute && !viteAlias &&
        runtimePackageTargets(filesystemSpec, file) !== null;
      const ownedTsSource = Boolean(!filesystemSpec.startsWith('#') &&
        !packageMapOwnsRuntime && tsCandidate?.resolvedFileName &&
        known.has(path.resolve(tsCandidate.resolvedFileName)));
      // TypeScript does not resolve arbitrary CSS/image imports. For baseUrl
      // assets use a concrete, source-contained file, not its bare spelling.
      // Preserve explicit paths mappings' precedence over baseUrl fallback.
      const baseUrlAsset = !relativeSpec && !rootAbsolute && !viteAlias &&
        !pathPattern && options.baseUrl && assetPath(dep.spec)
        ? path.resolve(options.baseUrl, filesystemSpec) : null;
      let ownedBaseUrlAsset = false;
      if (baseUrlAsset && fs.existsSync(baseUrlAsset) &&
          fs.statSync(baseUrlAsset).isFile()) {
        const physicalAsset = fs.realpathSync(baseUrlAsset);
        ownedBaseUrlAsset = isWithinRoot(physicalAsset, physicalRoot);
      }
      const baseUrlCandidate = Boolean(options.baseUrl) &&
        /^(?:modules|shared|routes|app|testing|generated)\//.test(filesystemSpec);
      const possibleAlias = pathPattern || baseUrlCandidate ||
        ownedTsSource || ownedBaseUrlAsset;
      // A paths wildcard falling through to the same installed package under
      // ordinary Node resolution must remain external.
      const externalFallback = possibleAlias && isUnaliasedInstalledPackage(
        filesystemSpec, file, options, tsCandidate);
      const projectAlias = rootAbsolute || Boolean(viteAlias) ||
        (possibleAlias && !externalFallback);
      const barePackage = !relativeSpec && !projectAlias;
      // TypeScript paths/baseUrl do not rewrite an emitted bare import.
      // Vite's default resolver does not automatically honor them: require
      // an audited Vite alias or executable Node package mapping instead.
      // Erased import type has no runtime resolution requirement.
      if (dep.runtime && projectAlias && !relativeSpec && !rootAbsolute &&
          !viteAlias && !packageMapOwnsRuntime &&
          !hasInstalledPackageCandidate(filesystemSpec, file) &&
          (ownedTsSource || ownedBaseUrlAsset || pathPattern)) {
        errors.push('unverified-vite-runtime-alias: ' +
          source.relative + ' -> ' + dep.spec);
      }
      const isTest = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
      const pureCode = isPureModule(source) ||
        (source.layer === 'shared' && isPureShared(source.relative));
      const staticAsset = assetPath(dep.spec) ||
        ((dep.fromUrl || filesystemSpec !== dep.spec) && !sourceExt.test(filesystemSpec)
          ? filesystemSpec : null);
      // Vite bundles stylesheet side-effect imports even when TypeScript
      // cannot resolve them. Bare package stylesheets are outside our
      // first-party CSS graph, so reject instead of silently skipping them.
      // This includes .module.css and query-qualified Sass/Less imports.
      const bareStylesheet = dep.runtime && !relativeSpec && !projectAlias &&
        /\.(?:css|scss|sass|less|styl|stylus)$/i.test(filesystemSpec);
      if (bareStylesheet) {
        errors.push(`unverified-package-stylesheet: ${source.relative} -> ${dep.spec}`);
        if (pureCode && !isTest) {
          errors.push(`pure-layer-static-asset: ${source.relative} -> ${dep.spec}`);
        }
        continue;
      }
      // Validate Node package imports and self-name exports independently of
      // TypeScript paths; source aliases do not change emitted runtime imports.
      const mappedStyle = dep.runtime && !relativeSpec && !rootAbsolute && !viteAlias &&
        packageStyleExport(filesystemSpec, file, true);
      if (mappedStyle) {
        errors.push(`unverified-package-stylesheet: ${source.relative} -> ${dep.spec}`);
        if (pureCode && !isTest) errors.push(`pure-layer-static-asset: ${source.relative} -> ${dep.spec}`);
        continue;
      }
      // A TS-only alias does not change Vite's runtime package resolution.
      // This condition is relevant only to owned TS/baseUrl aliases; ordinary
      // external packages continue through their existing provenance checks.
      // Explicit, verified Vite aliases take precedence over installed packages.
      const shadowCandidate = dep.runtime && projectAlias && !relativeSpec &&
        !rootAbsolute && !viteAlias && !filesystemSpec.startsWith('#') &&
        runtimePackageTargets(filesystemSpec, file) === null &&
        hasInstalledPackageCandidate(filesystemSpec, file);
      // Broad TS paths may fall through to installed dependencies. A local
      // asset that TypeScript cannot type-resolve can also be shadowed by an
      // installed package (e.g. bare "theme.css"). Reject collisions for
      // owned source or concrete baseUrl assets without a verified Vite alias.
      const shadowedPackage = Boolean(shadowCandidate &&
        (ownedTsSource || ownedBaseUrlAsset));
      if (shadowedPackage) {
        const style = packageStyleExport(filesystemSpec, file, false);
        errors.push((style ? 'unverified-package-stylesheet: ' :
          'unverified-package-runtime-mapping: ') +
          source.relative + ' -> ' + dep.spec);
        if (pureCode && !isTest) {
          errors.push(style ? 'pure-layer-static-asset: ' +
            source.relative + ' -> ' + dep.spec :
            'pure-layer-external-package: ' + source.relative + ' -> ' + dep.spec);
        }
        continue;
      }
      // A query that is not an actual data/worker loader cannot turn source
      // code into a static asset or bypass public-barrel ownership rules.
      // Unknown source queries still fail closed above, and retain code edges.
      // ?inline/?no-inline are only asset modifiers. When a Vite/TS
      // extensionless spelling resolves to owned source they do not change
      // the import into an asset or suppress executable runtime cycles.
      const inlineSourceTarget = inlineModifiersOnly && !assetPath(dep.spec)
        ? (relativeSpec || viteAlias || rootPath
          ? resolveViteLocalModule(viteAlias || rootPath ||
            path.resolve(path.dirname(file), filesystemSpec))
          : ts.resolveModuleName(
            filesystemSpec, file, options, ts.sys).resolvedModule?.resolvedFileName)
        : null;
      const executableSourceQuery = !dataQuery && !workerQuery && !dep.fromUrl &&
        (sourceExt.test(filesystemSpec) || Boolean(inlineSourceTarget &&
          sourceExt.test(inlineSourceTarget) &&
          known.has(path.resolve(inlineSourceTarget))));
      const localAsset = Boolean(((staticAsset && !executableSourceQuery) || dep.fromUrl ||
        (filesystemSpec !== dep.spec && !inlineModifiersOnly && !executableSourceQuery)) &&
        (relativeSpec || projectAlias));
      if (dep.runtime && !relativeSpec && !rootAbsolute && !viteAlias) {
        const mapping = runtimePackageTargets(filesystemSpec, file);
        if (mapping) {
          const resolvedRuntime = [];
          let unverifiable = mapping.unverifiable || mapping.paths.length === 0;
          for (const candidate of mapping.paths) {
            // In Vite TS projects, a package ./name.js target can correspond
            // to ./name.ts before emit. A .d.ts-only target is not executable.
            const target = resolveViteLocalModule(candidate);
            if (!target || /\.d\.[cm]?ts$/i.test(target)) {
              unverifiable = true;
              continue;
            }
            let physical;
            try { physical = fs.realpathSync(target); }
            catch { unverifiable = true; continue; }
            if (!isWithinRoot(physical, physicalRoot) ||
                !known.has(path.resolve(target))) {
              unverifiable = true;
              continue;
            }
            const dest = category(physical, physicalRoot);
            checkOwnedDependency(source, dest, policy, errors,
              { asset: mappedAsset, isTest });
            // A transformed file is an asset value even if its underlying
            // package mapping names JavaScript or TypeScript source.
            if (pureCode && !isTest && transformedImport && !localAsset) {
              errors.push('pure-layer-static-asset: ' +
                source.relative + ' -> ' + dep.spec);
            }
            if (!mappedAsset) resolvedRuntime.push(path.resolve(target));
          }
          if (unverifiable) {
            errors.push('unverified-package-runtime-mapping: ' +
              source.relative + ' -> ' + dep.spec);
          }
          // The TypeScript graph is checked below too; record additional
          // runtime edges so a valid mapped import cannot conceal a cycle.
          for (const target of resolvedRuntime) {
            edges.get(file).push({ target, runtime: true });
          }
        }
      }

      // Assets are still architectural dependencies. Resolve the physical path,
      // then apply the same ownership/layer checks used for source imports.
      let resolved;
      // Pathnames are not package provenance: a first-party directory
      // named node_modules cannot automatically exempt an import.
      let isExternalLibraryImport = false;
      let originalExternalPath;
      if (localAsset) {
        const candidates = [];
        if (relativeSpec) candidates.push(path.resolve(path.dirname(file), filesystemSpec));
        else if (rootPath) candidates.push(rootPath);
        else if (viteAlias) candidates.push(viteAlias); // Effective Vite alias takes precedence.
        else if (projectAlias) {
          const mapped = resolveMappedAssetCandidates(filesystemSpec, options, path.dirname(root));
          if (mapped.length) candidates.push(...mapped);
          else if (options.baseUrl) candidates.push(path.resolve(options.baseUrl, filesystemSpec));
        }
        let candidate = candidates.find(candidate =>
          fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        // Vite resolves extensionless ?raw/?url/worker imports using its source
        // extension lookup before transforming the resolved file. A missing
        // literal filename (e.g. ./config) is not proof ./config.ts is absent.
        // Only accept actual first-party source files; never infer an asset
        // target from an arbitrary installed declaration or vendor directory.
        if (!candidate && (dataQuery || workerQuery) && !dep.fromUrl) {
          // Vite's default extension lookup is ordered and also includes
          // JSON; TypeScript resolution alone can choose a different file
          // (or refuse JSON). Check concrete candidates in Vite order first.
          const viteExtensions = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'];
          for (const base of candidates) {
            for (const ext of viteExtensions) {
              const expanded = base + ext;
              if (fs.existsSync(expanded) && fs.statSync(expanded).isFile()) {
                candidate = expanded;
                break;
              }
            }
            if (candidate) break;
          }
          // An import with a TS paths pattern may not have a direct
          // filesystem candidate, and explicit JS filenames may point to
          // TypeScript source in Vite. Restrict the fallback to known owned
          // files, rather than trusting arbitrary node_modules paths.
          if (!candidate) {
            const resolvedSource = relativeSpec || viteAlias || rootPath
              ? resolveViteLocalModule(viteAlias || rootPath ||
                path.resolve(path.dirname(file), filesystemSpec))
              : ts.resolveModuleName(
                filesystemSpec, file, options, ts.sys).resolvedModule?.resolvedFileName;
            if (resolvedSource && sourceExt.test(resolvedSource) &&
                known.has(path.resolve(resolvedSource)) &&
                fs.existsSync(resolvedSource) && fs.statSync(resolvedSource).isFile()) {
              candidate = resolvedSource;
            }
          }
        }
        // Real paths matter: a symlink inside src may point outside the owned tree.
        resolved = candidate ? fs.realpathSync(candidate) : undefined;
        if (!resolved) {
          errors.push(`missing-static-asset: ${source.relative} -> ${dep.spec}`);
          continue;
        }
        // Pure data imports require ordinary, unmodified JSON. Raw/URL/worker
        // transformations and other asset queries are not pure data, even
        // when their underlying file has a .json or source extension.
        const querySuffix = dep.spec.slice(filesystemSpec.length);
        const plainJson = !querySuffix && !dep.fromUrl &&
          filesystemSpec.toLowerCase().endsWith('.json');
        const plainSource = !querySuffix && !dep.fromUrl &&
          sourceExt.test(filesystemSpec);
        if (pureCode && !isTest && !plainJson && !plainSource) {
          errors.push(`pure-layer-static-asset: ${source.relative} -> ${dep.spec}`);
        }
      } else {
        if (relativeSpec || viteAlias || rootPath) {
          const local = viteAlias || rootPath || path.resolve(path.dirname(file), filesystemSpec);
          resolved = dep.runtime ? resolveViteLocalModule(local) : resolveLocalSource(local, options);
        } else {
          const resolvedModule = ts.resolveModuleName(
            filesystemSpec, file, options, ts.sys).resolvedModule;
          resolved = resolvedModule?.resolvedFileName;
          isExternalLibraryImport = Boolean(resolvedModule?.isExternalLibraryImport);
          originalExternalPath = isExternalLibraryImport ? resolvedModule?.originalPath : undefined;
        }
        // Owned baseUrl imports are local regardless of their bare spelling.
        const ownedSource = resolved && known.has(path.resolve(resolved));
        const styleExport = dep.runtime && barePackage &&
          packageStyleExport(filesystemSpec, file, Boolean(ownedSource));
        if (styleExport) {
          errors.push(`unverified-package-stylesheet: ${source.relative} -> ${dep.spec}`);
          if (pureCode && !isTest) {
            errors.push(`pure-layer-static-asset: ${source.relative} -> ${dep.spec}`);
          }
          continue;
        }
        if (pureCode && !isTest && barePackage && !ownedSource &&
            !policy.allowPureExternal.includes(dep.spec)) {
          errors.push(`pure-layer-external-package: ${source.relative} -> ${dep.spec}`);
        }
        if (!resolved) {
          if (relativeSpec || projectAlias) {
            errors.push(`${source.relative}: unresolved internal import ${dep.spec}`);
          } else if (barePackage && dep.runtime && !isTest &&
                     !filesystemSpec.startsWith('node:')) {
            // Unresolved bare runtime imports might be Vite-only stylesheets.
            errors.push(`unverified-package-import: ${source.relative} -> ${dep.spec}`);
          }
          continue;
        }
      }
      const target = path.resolve(resolved);
      if (!known.has(target) && !localAsset) {
        // Exempt only bare specifiers TypeScript resolved as external library
        // imports. Relative paths, aliases and local baseUrl targets remain
        // owned dependencies even when their paths contain node_modules.
        if (!(barePackage && isExternalLibraryImport &&
             isInstalledDependencyPath(target, file, originalExternalPath))) {
          errors.push(`outside-source-import: ${source.relative} -> ${dep.spec}`);
        }
        continue;
      }
      const physicalTarget = fs.realpathSync(target);
      if (!isWithinRoot(physicalTarget, physicalRoot)) {
        errors.push(`outside-source-import: ${logical.relative} -> ${dep.spec}`);
        continue;
      }
      const dest = category(physicalTarget, physicalRoot);
      const desc = `${source.relative} -> ${dest.relative}`;
      if (dest.layer === 'outside') {
        errors.push(`outside-source-import: ${source.relative} -> ${dep.spec}`);
        continue;
      }
      checkOwnedDependency(source, dest, policy, errors, { asset: localAsset, isTest });
      // Preserve Vite's asset/execution distinction for mapped #imports,
      // relative imports, and source files transformed through a query.
      if (!dataQuery && (!dep.fromUrl || dep.workerEntry) &&
          (!localAsset || sourceExt.test(target))) {
        edges.get(file).push({ target, runtime: dep.runtime });
      }
    }
  }
  for (const [name, layout] of moduleLayouts) {
    if (layout.simple.size && layout.complex.size && !Object.hasOwn(policy.allowMixedLayouts, name)) {
      errors.push(`mixed-module-layout: ${name} has both simple (${[...layout.simple].join(', ')}) and complex (${[...layout.complex].join(', ')}) layers; use an explicitly justified allowMixedLayouts migration exception`);
    }
  }
  // DFS detects cycles. Only runtime edges are fatal; type-only edges are inspected separately.
  function detect(onlyRuntime) {
    const visiting = new Set(), done = new Set(), seen = new Set();
    const result = [];
    function visit(v, trail) {
      if (visiting.has(v)) {
        const offset = trail.indexOf(v);
        const cycle = trail.slice(offset).map(f => path.relative(root, f)).join(' -> ');
        if (!seen.has(cycle)) { seen.add(cycle); result.push(cycle); }
        return;
      }
      if (done.has(v)) return;
      visiting.add(v);
      for (const edge of edges.get(v) || []) {
        if (!onlyRuntime || edge.runtime) visit(edge.target, [...trail, edge.target]);
      }
      visiting.delete(v); done.add(v);
    }
    for (const file of files) visit(file, [file]);
    return result;
  }
  for (const cyc of detect(true)) errors.push(`runtime-cycle: ${cyc}`);
  for (const cyc of detect(false)) {
    const modules = new Set(cyc.split(' -> ').map(f => {
      const match = f.match(/^modules\/([^/]+)\//);
      return match ? match[1] : null;
    }).filter(Boolean));
    if (modules.size > 1) errors.push(`cross-module-cycle: ${cyc}`);
    else if (!errors.some(x => x.startsWith('runtime-cycle:') && x.includes(cyc)))
      warnings.push(`source-level-cycle (may be type-only): ${cyc}`);
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], count: files.length };
}

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node tools/check-boundaries.cjs path/to/src'); process.exit(2); }
  try {
    const result = check(dir);
    for (const item of result.errors) console.error(`ERROR ${item}`);
    for (const item of result.warnings) console.warn(`WARN ${item}`);
    if (result.errors.length) { console.error(`${result.errors.length} architecture violations in ${result.count} files`); process.exitCode = 1; }
    else console.log(`PASS architecture boundaries for ${result.count} files`);
  } catch (error) { console.error(error); process.exitCode = 2; }
}
module.exports = { check, isSelfBarrel, normPath };
