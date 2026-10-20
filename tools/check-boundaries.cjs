#!/usr/bin/env node
/**
 * Architecture boundary checker for React+TS. Uses TypeScript's parser + module resolver.
 * Source imports, re-exports, literal require and dynamic import are all inspected.
 * This checks source dependencies (including import type), not just transpiled JS.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function loadTypeScript() {
  try { return require('typescript'); }
  catch {
    // Allows local smoke tests on machines with a globally installed compiler.
    // In a project, add typescript as a devDependency instead.
    const root = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
    return require(path.join(root, 'typescript'));
  }
}
const ts = loadTypeScript();
const sourceExt = /\.(?:tsx?|jsx?|mts|cts)$/;
function walk(root) {
  if (!fs.existsSync(root)) throw new Error(`Source directory not found: ${root}`);
  const result = [];
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.git'].includes(item.name)) continue;
    const full = path.join(root, item.name);
    if (item.isDirectory()) result.push(...walk(full));
    else if (sourceExt.test(item.name) && !item.name.endsWith('.d.ts')) result.push(full);
  }
  return result;
}
function category(filename, srcDir) {
  const relative = path.relative(srcDir, filename).replace(/\\/g, '/');
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
function runtimeImport(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return true;
    if (clause.isTypeOnly) return false;
    // import { type A } only is type-only, even if the declaration is not.
    const b = clause.namedBindings;
    return Boolean(clause.name || !b || ts.isNamespaceImport(b) || b.elements.some(e => !e.isTypeOnly));
  }
  if (ts.isExportDeclaration(node)) return !node.isTypeOnly && !(node.exportClause && ts.isNamedExports(node.exportClause) && node.exportClause.elements.length > 0 && node.exportClause.elements.every(e => e.isTypeOnly));
  return true;
}
function imports(node, list) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    const spec = literalString(node.moduleSpecifier);
    if (spec) list.push({ spec, runtime: runtimeImport(node), line: node.getStart() });
  }
  if (ts.isCallExpression(node) && node.arguments.length === 1 && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
    const spec = literalString(node.arguments[0]);
    if (spec) list.push({ spec, runtime: true, line: node.getStart() });
  }
  ts.forEachChild(node, child => imports(child, list));
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
function check(srcDir) {
  const errors = [];
  const warnings = [];
  const root = path.resolve(srcDir);
  const options = configFor(path.dirname(root)).options;
  const files = walk(root).map(f => path.resolve(f));
  const known = new Set(files);
  const edges = new Map(files.map(f => [f, []]));
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const dependencies = [];
    imports(sf, dependencies);
    for (const dep of dependencies) {
      if (!dep.spec.startsWith('.') && !dep.spec.startsWith('@/') && !Object.keys(options.paths || {}).some(p => p.replace('*', '') && dep.spec.startsWith(p.replace('*', '')))) continue;
      const resolved = ts.resolveModuleName(dep.spec, file, options, ts.sys).resolvedModule?.resolvedFileName;
      if (!resolved) {
        // Do not hide broken *relative* project imports; package imports are handled by the typechecker.
        if (dep.spec.startsWith('.') && !fs.existsSync(path.resolve(path.dirname(file), dep.spec))) errors.push(`${path.relative(root, file)}: unresolved import ${dep.spec}`);
        continue;
      }
      const target = path.resolve(resolved);
      if (!known.has(target)) continue;
      const source = category(file, root), dest = category(target, root);
      const desc = `${source.relative} -> ${dest.relative}`;
      if (source.layer === 'shared' && dest.layer !== 'shared') errors.push(`shared-must-be-independent: ${desc}`);
      if (source.layer === 'module' && dest.layer === 'module' && source.module !== dest.module) {
        errors.push(`sibling-module-dependency: ${desc}`);
      }
      if (source.layer === 'module' && dest.layer === 'module' && source.module === dest.module) {
        if (target.endsWith(`/modules/${source.module}/index.ts`)) errors.push(`no-self-barrel: ${desc}`);
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
        const allowedPublic = dest.relative === `modules/${dest.module}/index.ts`;
        if (!allowedPublic && !['testing'].includes(source.layer)) errors.push(`deep-module-import: ${desc}`);
      }
      if (source.layer === 'module' && ['domain', 'model'].includes(source.part) && dest.layer === 'shared' && !dest.relative.startsWith('shared/lib/') && !dest.relative.startsWith('shared/domain/')) errors.push(`pure-layer-imports-shared-infrastructure: ${desc}`);
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
  if (!errors.some(x => x.startsWith('runtime-cycle'))) for (const cyc of detect(false)) warnings.push(`source-level-cycle (may be type-only): ${cyc}`);
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
module.exports = { check };
