import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const root = fileURLToPath(new URL('../', import.meta.url));

// shortcut: minimatch exceeds the upstream range; remove when upstream supports a patched version.
test('project-service globs accept matching files and reject nonmatching files', async () => {
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [{
      files: ['**/*.mjs'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { projectService: { allowDefaultProject: ['*.mjs'] }, tsconfigRootDir: root },
      },
      rules: { 'no-unused-vars': 'error' },
    }],
  });

  const [allowed] = await eslint.lintFiles(['eslint.config.mjs']);
  const [denied] = await eslint.lintFiles(['tests/boundary-conformance.test.mjs']);
  assert.equal(allowed.errorCount, 0);
  assert.ok(denied.messages.some(message => message.fatal && /allowDefaultProject.*does not match/s.test(message.message)));
});

test('configured accessibility rule reports a missing image description', async () => {
  const eslint = new ESLint({ cwd: root });
  const [result] = await eslint.lintText('export const Image = () => <img src="x" />;', {
    filePath: 'src/lint-compatibility-probe.tsx',
  });
  assert.ok(result.messages.some(message => message.ruleId === 'jsx-a11y/alt-text'));
});
