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
// The dot is required: filenames such as "assets" are not source files.
const sourceExt = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const assetExt = /\.(?:css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm|json)$/i;
function fileSpecifier(spec) {
  // Vite query directives are compilation modes, not filesystem path components.
  // Preserve Node/TypeScript '#imports' specifiers: the leading # is a name,
  // not a URL fragment.
  return spec.startsWith('#') ? spec : spec.split(/[?#]/, 1)[0];
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
    if (['node_modules', 'dist', 'coverage', '.git'].includes(item.name)) continue;
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
      list.push({ spec, runtime: true, fromUrl: true, line: node.getStart() });
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
  if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
    const spec = literalString(node.arguments[0]);
    if (spec === null) {
      // Vite can expand variable dynamic imports, so a missing literal cannot
      // be interpreted as an absence of internal source dependencies.
      list.push({ unsupported: node.expression.kind === ts.SyntaxKind.ImportKeyword
        ? 'dynamic-import' : 'dynamic-require', line: node.getStart() });
    } else {
      list.push({ spec, runtime: true, line: node.getStart() });
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
function loadBoundaryConfig(parent) {
  const file = path.join(parent, 'architecture.config.json');
  if (!fs.existsSync(file)) return { allowPureExternal: [], allowCrossModule: {}, allowMixedLayouts: {}, viteAliases: {} };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const mixed = data.allowMixedLayouts || {};
  const aliases = data.viteAliases || {};
  if (!Array.isArray(data.allowPureExternal || []) ||
      typeof (data.allowCrossModule || {}) !== 'object' ||
      Array.isArray(data.allowCrossModule || {}) ||
      typeof mixed !== 'object' || mixed === null || Array.isArray(mixed) ||
      Object.values(mixed).some(reason => typeof reason !== 'string' || !reason.trim()) ||
      typeof aliases !== 'object' || aliases === null || Array.isArray(aliases) ||
      Object.entries(aliases).some(([alias, target]) =>
        !alias.trim() || typeof target !== 'string' || !target.trim())) {
    throw Error('Invalid architecture.config.json: allowPureExternal must be an array, allowCrossModule an object, and allowMixedLayouts a map of nonempty migration reasons');
  }
  return {
    allowPureExternal: data.allowPureExternal || [],
    allowCrossModule: data.allowCrossModule || {},
    allowMixedLayouts: mixed,
    viteAliases: aliases,
  };
}

function resolveViteAlias(spec, aliases, projectDir) {
  // Vite matches exact alias names or name + "/". The configured value is a
  // path relative to the project root, never an executable config expression.
  for (const [find, destination] of Object.entries(aliases)) {
    // An alias ending in '/' is a prefix already; do not append a second '/'.
    const matches = find.endsWith('/')
      ? spec.startsWith(find)
      : (spec === find || spec.startsWith(find + '/'));
    if (matches) {
      const suffix = spec.slice(find.length).replace(/^\//, '');
      return path.resolve(projectDir, destination, suffix);
    }
  }
  return null;
}
function resolveLocalSource(candidate, options) {
  const importer = path.join(path.dirname(candidate), '__architecture_alias__.ts');
  // TypeScript handles file extensions, directory indexes and declaration files.
  const basename = './' + path.basename(candidate);
  return ts.resolveModuleName(basename, importer, options, ts.sys).resolvedModule?.resolvedFileName;
}
function verifyViteAliases(projectDir, policy, errors) {
  const vitePaths = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs']
    .map(name => path.join(projectDir, name)).filter(fs.existsSync);
  if (vitePaths.length !== 1) {
    if (vitePaths.length > 1 || Object.keys(policy.viteAliases).length) {
      errors.push('unsupported-vite-alias-config: expected one recognizable Vite config');
    }
    return;
  }
  const vitePath = vitePaths[0];
  const source = ts.createSourceFile(vitePath, fs.readFileSync(vitePath, 'utf8'),
    ts.ScriptTarget.Latest, true, ts.getScriptKindFromFileName(vitePath));
  if (source.parseDiagnostics.length) {
    errors.push('unsupported-vite-alias-config: Vite configuration has syntax errors');
    return;
  }
  function propertyName(prop) {
    if (!prop || !ts.isPropertyAssignment(prop)) return null;
    const name = prop.name;
    return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
  }
  const exports = source.statements.filter(statement =>
    ts.isExportAssignment(statement) && !statement.isExportEquals);
  if (exports.length !== 1) {
    errors.push('unsupported-vite-alias-config: one default config export is required');
    return;
  }
  let config = exports[0].expression;
  if (ts.isCallExpression(config) && ts.isIdentifier(config.expression) &&
      config.expression.text === 'defineConfig' && config.arguments.length === 1) {
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
  const configured = top.get('resolve');
  const aliases = new Map();
  if (configured) {
    if (!ts.isObjectLiteralExpression(configured)) {
      errors.push('unsupported-vite-alias-config: resolve must be a static object');
    } else {
      const resolve = objectProperties(configured, 'resolve');
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
  // Vite aliases are ordered rules. The checker map must preserve this order
  // so overlapping prefixes cannot resolve to a different physical target.
  const configuredOrder = Object.keys(policy.viteAliases);
  const viteOrder = [...aliases.keys()];
  if (configuredOrder.length === viteOrder.length &&
      configuredOrder.some((name, i) => name !== viteOrder[i])) {
    errors.push('vite-alias-order-mismatch: architecture.config.json must preserve Vite alias order');
  }
  for (const [find, value] of aliases) {
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
        value.expression.getText(source) === 'fileURLToPath' &&
        value.arguments.length === 1) {
      const expr = value.arguments[0];
      if (ts.isNewExpression(expr) && expr.expression.getText(source) === 'URL' &&
          expr.arguments?.length === 2 && ts.isStringLiteral(expr.arguments[0]) &&
          expr.arguments[1].getText(source) === 'import.meta.url') {
        actual = path.resolve(projectDir, expr.arguments[0].text);
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

function check(srcDir) {
  const errors = [];
  const warnings = [];
  const root = path.resolve(srcDir);
  const physicalRoot = fs.realpathSync(root);
  const options = configFor(path.dirname(root)).options;
  const policy = loadBoundaryConfig(path.dirname(root));
  verifyViteAliases(path.dirname(root), policy, errors);
  const files = walk(root).map(f => path.resolve(f));
  if (files.length === 0) errors.push('no-source-files: No supported source files found');
  const known = new Set(files);
  const edges = new Map(files.map(f => [f, []]));
  const moduleLayouts = new Map();
  for (const file of files) {
    const logical = category(file, root);
    const physicalFile = fs.realpathSync(file);
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
    const text = fs.readFileSync(file, 'utf8');
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
      const relativeSpec = filesystemSpec.startsWith('.');
      const rootAbsolute = filesystemSpec.startsWith('/');
      const rootPath = rootAbsolute ? path.resolve(path.dirname(root), '.' + filesystemSpec) : null;
      const viteAlias = resolveViteAlias(filesystemSpec, policy.viteAliases, path.dirname(root));
      const projectAlias = rootAbsolute || Boolean(viteAlias) || matchesAlias(filesystemSpec, options.paths) ||
        (Boolean(options.baseUrl) && /^(?:modules|shared|routes|app|testing|generated)\//.test(filesystemSpec));
      const barePackage = !relativeSpec && !projectAlias;
      const isTest = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
      const pureCode = isPureModule(source) ||
        (source.layer === 'shared' && isPureShared(source.relative));
      const staticAsset = assetPath(dep.spec) ||
        ((dep.fromUrl || filesystemSpec !== dep.spec) && !sourceExt.test(filesystemSpec)
          ? filesystemSpec : null);
      const localAsset = Boolean((staticAsset || filesystemSpec !== dep.spec) &&
        (relativeSpec || projectAlias));
      // Assets are still architectural dependencies. Resolve the physical path,
      // then apply the same ownership/layer checks used for source imports.
      let resolved;
      if (localAsset) {
        const candidates = [];
        if (relativeSpec) candidates.push(path.resolve(path.dirname(file), filesystemSpec));
        if (rootPath) candidates.push(rootPath);
        if (viteAlias) candidates.push(viteAlias);
        if (projectAlias) {
          const baseDir = options.baseUrl || path.dirname(root);
          // Match tsconfig.paths before falling back to baseUrl; otherwise a
          // same-named local file can hide the intended aliased dependency.
          for (const [pattern, targets] of Object.entries(options.paths || {})) {
            const star = pattern.indexOf('*');
            const match = star < 0
              ? (filesystemSpec === pattern ? '' : null)
              : (filesystemSpec.startsWith(pattern.slice(0, star)) &&
                  filesystemSpec.endsWith(pattern.slice(star + 1))
                    ? filesystemSpec.slice(star, filesystemSpec.length - (pattern.length - star - 1))
                    : null);
            if (match === null) continue;
            for (const targetSpec of targets) {
              candidates.push(path.resolve(baseDir, targetSpec.replace('*', match)));
            }
          }
          if (options.baseUrl) candidates.push(path.resolve(baseDir, filesystemSpec));
        }
        const candidate = candidates.find(candidate =>
          fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        // Real paths matter: a symlink inside src may point outside the owned tree.
        resolved = candidate ? fs.realpathSync(candidate) : undefined;
        if (!resolved) {
          errors.push(`missing-static-asset: ${source.relative} -> ${dep.spec}`);
          continue;
        }
        // JSON can be pure configuration/data; styles, images, and media cannot
        // be imported into domain/application/model or pure shared modules.
        if (pureCode && !isTest && !filesystemSpec.toLowerCase().endsWith('.json') &&
            !sourceExt.test(filesystemSpec)) {
          errors.push(`pure-layer-static-asset: ${source.relative} -> ${dep.spec}`);
        }
      } else {
        resolved = viteAlias || rootPath
          ? resolveLocalSource(viteAlias || rootPath, options)
          : ts.resolveModuleName(filesystemSpec, file, options, ts.sys).resolvedModule?.resolvedFileName;
        const externalDependency = Boolean(resolved && normPath(resolved).includes('/node_modules/'));
        if (pureCode && !isTest &&
            (barePackage || externalDependency) && !policy.allowPureExternal.includes(dep.spec)) {
          errors.push(`pure-layer-external-package: ${source.relative} -> ${dep.spec}`);
        }
        if (!resolved) {
          if (relativeSpec || projectAlias) errors.push(`${source.relative}: unresolved internal import ${dep.spec}`);
          continue;
        }
      }
      const target = path.resolve(resolved);
      if (!known.has(target) && !localAsset) {
        // Ordinary package imports are not owned source files. Keep them separate
        // from relative/aliased workspace references, which must be validated.
        const externalPackage = normPath(target).includes('/node_modules/');
        if (!externalPackage && (relativeSpec || projectAlias)) {
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
      if (source.layer === 'shared' && dest.layer !== 'shared') errors.push(`shared-must-be-independent: ${desc}`);
      // Domain/model/application and pure shared code may depend on pure shared
      // primitives only, never generated API clients, UI, HTTP or test setup.
      if (pureCode && !(source.layer === 'shared' && isTest)) {
        if (dest.layer === 'shared' && !isPureShared(dest.relative)) {
          errors.push(`pure-layer-imports-technical-shared: ${desc}`);
        }
        if (dest.layer === 'generated' || dest.layer === 'testing' ||
            (dest.layer === 'shared' && !isPureShared(dest.relative))) {
          if (dest.layer !== 'shared') errors.push(`pure-layer-imports-technical: ${desc}`);
        }
      }
      if (source.layer === 'module' && dest.layer === 'module' && source.module !== dest.module) {
        // Pure/application layers must not depend on another module's potentially UI-facing barrel.
        if (['domain', 'model', 'application'].includes(source.part)) {
          errors.push(`cross-module-pure-layer: ${desc}`);
        }
        const exceptions = policy.allowCrossModule[source.module] || [];
        if (!Array.isArray(exceptions) || !exceptions.includes(dest.module) ||
            !isPublicEntrypoint(dest)) {
          errors.push(`sibling-module-dependency: ${desc}`);
        }
      }
      if (source.layer === 'module' && dest.layer === 'module' && source.module === dest.module) {
        if (isSelfBarrel(source, dest)) errors.push(`no-self-barrel: ${desc}`);
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
        const allowedPublic = isPublicEntrypoint(dest);
        if (!allowedPublic && !['testing'].includes(source.layer)) errors.push(`deep-module-import: ${desc}`);
      }
      // Pure-layer checks above apply consistently to domain, model, application
      // and transitively pure shared/lib and shared/domain modules.
      if (source.layer === 'routes' && dest.layer === 'app') errors.push(`routes-import-app: ${desc}`);
      if (source.layer === 'module' && ['app', 'routes'].includes(dest.layer)) errors.push(`module-imports-composition: ${desc}`);
      // ?raw and ?url treat source files as bytes/data, not executable imports.
      // ?worker imports are bundled entrypoints and must remain graph edges.
      const query = dep.spec.slice(filesystemSpec.length);
      const dataQuery = /(?:[?&])(?:raw|url|inline|no-inline)(?:[=&]|$)/.test(query) &&
        !/(?:[?&])worker(?:[=&]|$)/.test(query);
      if (!localAsset || (sourceExt.test(filesystemSpec) && !dataQuery)) {
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
