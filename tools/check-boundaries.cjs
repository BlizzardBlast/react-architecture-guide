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
const assetExt = /\.(?:css|scss|sass|less|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)$/i;
function assetPath(spec) {
  const filename = spec.split(/[?#]/, 1)[0];
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
function imports(node, list, options) {
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    const spec = literalString(node.moduleReference.expression);
    if (spec) list.push({ spec, runtime: !node.isTypeOnly, line: node.getStart() });
  }
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    const spec = literalString(node.moduleSpecifier);
    if (spec) list.push({ spec, runtime: runtimeImport(node, options), line: node.getStart() });
  }
  if (ts.isCallExpression(node) && node.arguments.length >= 1 && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
    const spec = literalString(node.arguments[0]);
    if (spec) list.push({ spec, runtime: true, line: node.getStart() });
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
function isSelfBarrel(source, dest) {
  return dest.relative === `modules/${source.module}/index.ts` ||
    dest.relative === `modules/${source.module}/index.tsx`;
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
  if (!fs.existsSync(file)) return { allowPureExternal: [], allowCrossModule: {} };
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(data.allowPureExternal || []) ||
      typeof (data.allowCrossModule || {}) !== 'object' ||
      Array.isArray(data.allowCrossModule || {})) {
    throw Error('Invalid architecture.config.json: expected allowPureExternal array and allowCrossModule object');
  }
  return { allowPureExternal: data.allowPureExternal || [], allowCrossModule: data.allowCrossModule || {} };
}
function check(srcDir) {
  const errors = [];
  const warnings = [];
  const root = path.resolve(srcDir);
  const options = configFor(path.dirname(root)).options;
  const policy = loadBoundaryConfig(path.dirname(root));
  const files = walk(root).map(f => path.resolve(f));
  if (files.length === 0) errors.push('no-source-files: No supported source files found');
  const known = new Set(files);
  const edges = new Map(files.map(f => [f, []]));
  for (const file of files) {
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
      const source = category(file, root);
      const relativeSpec = dep.spec.startsWith('.');
      const projectAlias = matchesAlias(dep.spec, options.paths) ||
        (Boolean(options.baseUrl) && /^(?:modules|shared|routes|app|testing|generated)\//.test(dep.spec));
      const barePackage = !relativeSpec && !projectAlias;
      const staticAsset = assetPath(dep.spec);
      if (staticAsset && (relativeSpec || projectAlias)) {
        // TypeScript module resolution intentionally does not resolve CSS/images.
        // Verify Vite-style relative and tsconfig.paths/baseUrl asset imports by file.
        const candidates = [];
        if (relativeSpec) candidates.push(path.resolve(path.dirname(file), staticAsset));
        if (projectAlias) {
          const baseDir = options.baseUrl || path.dirname(root);
          if (options.baseUrl) candidates.push(path.resolve(baseDir, staticAsset));
          for (const [pattern, targets] of Object.entries(options.paths || {})) {
            const star = pattern.indexOf('*');
            const match = star < 0
              ? (staticAsset === pattern ? '' : null)
              : (staticAsset.startsWith(pattern.slice(0, star)) &&
                  staticAsset.endsWith(pattern.slice(star + 1))
                    ? staticAsset.slice(star, staticAsset.length - (pattern.length - star - 1))
                    : null);
            if (match === null) continue;
            for (const targetSpec of targets) {
              candidates.push(path.resolve(baseDir, targetSpec.replace('*', match)));
            }
          }
        }
        if (!candidates.some(candidate =>
          fs.existsSync(candidate) && fs.statSync(candidate).isFile())) {
          errors.push(`missing-static-asset: ${source.relative} -> ${dep.spec}`);
        }
        continue;
      }
      const isTest = /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
      const resolved = ts.resolveModuleName(dep.spec, file, options, ts.sys).resolvedModule?.resolvedFileName;
      const externalDependency = Boolean(resolved && normPath(resolved).includes('/node_modules/'));
      const pureCode = isPureModule(source) ||
        (source.layer === 'shared' && isPureShared(source.relative));
      if (pureCode && !isTest &&
          (barePackage || externalDependency) && !policy.allowPureExternal.includes(dep.spec)) {
        errors.push(`pure-layer-external-package: ${source.relative} -> ${dep.spec}`);
      }
      if (!resolved) {
        if (relativeSpec || projectAlias) errors.push(`${source.relative}: unresolved internal import ${dep.spec}`);
        continue;
      }
      const target = path.resolve(resolved);
      if (!known.has(target)) {
        // A resolved workspace alias outside src must not bypass all boundary checks.
        // Third-party packages and their declarations in node_modules are external.
        const externalPackage = normPath(target).includes('/node_modules/');
        if (!externalPackage && (relativeSpec || projectAlias)) {
          errors.push(`outside-source-import: ${source.relative} -> ${dep.spec}`);
        }
        continue;
      }
      const dest = category(target, root);
      const desc = `${source.relative} -> ${dest.relative}`;
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
            !['index.ts', 'index.tsx'].some(name => dest.relative === `modules/${dest.module}/${name}`)) {
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
      }
      if (dest.layer === 'module' && source.layer !== 'module' && source.layer !== 'app' && source.layer !== 'routes' && source.layer !== 'shared') {
        errors.push(`invalid-external-module-use: ${desc}`);
      }
      if (dest.layer === 'module' && source.layer !== 'module') {
        const allowedPublic = ['index.ts','index.tsx'].some(name => dest.relative === `modules/${dest.module}/${name}`);
        if (!allowedPublic && !['testing'].includes(source.layer)) errors.push(`deep-module-import: ${desc}`);
      }
      // Pure-layer checks above apply consistently to domain, model, application
      // and transitively pure shared/lib and shared/domain modules.
      if (source.layer === 'routes' && dest.layer === 'app') errors.push(`routes-import-app: ${desc}`);
      if (source.layer === 'module' && ['app', 'routes'].includes(dest.layer)) errors.push(`module-imports-composition: ${desc}`);
      edges.get(file).push({ target, runtime: dep.runtime });
    }
  }
  // DFS detects cycles. Only runtime edges are fatal; type-only edges are inspected separately.
  function detect(onlyRuntime) {
    const visiting = new Set(), done = new Set(), seen = new Set();
    const result = [];
    function visit(v, trail) {
      if (visiting.has(v)) {
        const offset = trail.indexOf(v);
        const cycle = trail.slice(offset).concat(v).map(f => path.relative(root, f)).join(' -> ');
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
