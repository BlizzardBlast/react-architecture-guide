const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { inspectMarkdown, checkAll } = require('./validate-docs.cjs');

function fixture(markdown, callback) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'architecture-docs-'));
  try {
    fs.writeFileSync(path.join(dir, 'README.md'), markdown);
    return callback(dir);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('valid fenced text with a fictitious link remains ignored', () => fixture(
  '~~~ts\n[not real](missing.md)\n~~~\n', root => {
    assert.deepEqual(checkAll(root).issues, []);
  },
));
test('mismatched fence chars are rejected even with even fence count', () => fixture(
  '~~~ts\n[not real](missing.md)\n' + '```\n',
  root => assert.match(checkAll(root).issues.join(' '), /unclosed ~~~/),
));
test('a closing fence must be at least as long as the opener', () => fixture(
  '~~~~ts\n~~~\n', root => assert.match(checkAll(root).issues.join(' '), /unclosed ~~~~/),
));
test('missing Markdown links outside fences are reported', () => fixture(
  '# Title\n[missing](nothing.md)\n', root => {
    assert.match(inspectMarkdown('README.md', fs.readFileSync(path.join(root, 'README.md'), 'utf8'), root).join(' '), /missing local link/);
  },
));
test('valid local links and anchors pass', () => fixture(
  '# Title\n[Self](README.md#title)\n', root => assert.deepEqual(checkAll(root).issues, []),
));
test('attempts to link outside the repository are rejected', () => fixture(
  '# Title\n[escape](../outside.md)\n', root => assert.match(checkAll(root).issues.join(' '), /outside-repository/),
));

test('local links with balanced filename parentheses pass', () => fixture(
  '[Release](release(v2).md)', root => {
    fs.writeFileSync(path.join(root, 'release(v2).md'), '# Release');
    assert.deepEqual(checkAll(root).issues, []);
  },
));
test('angle-bracket destinations may contain spaces', () => fixture(
  '[Guide](<My Guide.md>)', root => {
    fs.writeFileSync(path.join(root, 'My Guide.md'), '# Guide');
    assert.deepEqual(checkAll(root).issues, []);
  },
));
test('references to missing local files fail even for reference-style links', () => fixture(
  '[Guide][ref]\n[ref]: docs/missing.md\n', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('forward reference links are accepted when the target exists', () => fixture(
  '[Guide][ref]\n[ref]: guide.md\n', root => {
    fs.writeFileSync(path.join(root, 'guide.md'), '# Guide');
    assert.deepEqual(checkAll(root).issues, []);
  },
));
test('local image links are validated just like text links', () => fixture(
  '![Icon](missing.svg)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('unresolved reference labels are reported', () => fixture(
  '[Guide][does-not-exist]', root =>
    assert.match(checkAll(root).issues.join(' '), /missing reference definition/),
));

test('single-line HTML comments do not create dependencies', () => fixture(
  '<!-- [hidden](missing.md) -->', root => assert.deepEqual(checkAll(root).issues, []),
));
test('multiline HTML comments do not create links or definitions', () => fixture(
  '<!--\n[hidden][ref]\n[ref]: missing.md\n-->\n', root =>
    assert.deepEqual(checkAll(root).issues, []),
));
test('links outside a closed HTML comment remain checked', () => fixture(
  '<!-- [ignored](missing.md) -->\n[visible](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('indented code blocks do not create missing links', () => fixture(
  '\n    [ignored](missing.md)\n\n[Self](README.md)\n', root =>
    assert.deepEqual(checkAll(root).issues, []),
));
test('indented paragraph continuation is still checked for links', () => fixture(
  'A paragraph\n    [visible](missing.md)\n', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('HTML-like syntax in a fence cannot suppress later links', () => fixture(
  '~~~md\n<!--\n~~~\n[visible](missing.md)\n', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));

test('raw HTML blocks suppress non-rendered links until a blank', () => {
  for (const tag of ['div', 'table', 'section']) fixture(
    '<' + tag + '>\n[not rendered](missing.md)\n</' + tag + '>\n\n[Self](README.md)',
    root => assert.deepEqual(checkAll(root).issues, []),
  );
});

test('HTML raw-text blocks suppress links even across blank lines', () => {
  for (const tag of ['script', 'pre', 'style', 'textarea']) fixture(
    '<' + tag + '>\n\n[not rendered](missing.md)\n</' + tag + '>\n[Self](README.md)',
    root => assert.deepEqual(checkAll(root).issues, []),
  );
});

test('real links after a closed raw-text block are checked', () => fixture(
  '<script>\n[ignored](missing.md)\n</script>\n[visible](missing.md)',
  root => assert.match(checkAll(root).issues.join(' '), /missing local link/),
));

test('raw HTML blocks stop at a blank line', () => fixture(
  '<div>\n[ignored](missing.md)\n\n[visible](missing.md)',
  root => assert.match(checkAll(root).issues.join(' '), /missing local link/),
));

test('fenced code inside blockquotes does not create links', () => fixture(
  '> ~~~md\n> [ignored](missing.md)\n> ~~~\n> [Self](README.md)',
  root => assert.deepEqual(checkAll(root).issues, []),
));

test('nested blockquote fences do not hide following real links', () => fixture(
  '> > ~~~md\n> > [ignored](missing.md)\n> > ~~~\n> > [visible](missing.md)',
  root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /missing local link/);
  },
));

test('unclosed blockquoted fenced code reports the fence but not hidden links', () => fixture(
  '> ~~~\n> [ignored](missing.md)\n> [ignored](missing.md)',
  root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /unclosed ~~~/);
  },
));

test('ordinary blockquote paragraphs still contain active links', () => fixture(
  '> [visible](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));

test('HTML blocks within blockquotes do not create links', () => fixture(
  '> <div>\n> [ignored](missing.md)\n>\n> [Self](README.md)',
  root => assert.deepEqual(checkAll(root).issues, []),
));

test('literal HTML comment opener in inline code does not hide a later link', () => fixture(
  '`<!--`\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('inline backticked comment opener does not hide a same-line link', () => fixture(
  '`<!--` [Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('comment delimiters inside inline code do not create phantom comments', () => fixture(
  '`<!--` [Self](README.md) `-->`', root =>
    assert.deepEqual(checkAll(root).issues, []),
));
test('unclosed blockquote fences have a diagnostic with their original line', () => fixture(
  '> ~~~js\n> [not a link](missing.md)\n', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:1: unclosed ~~~/);
  },
));
test('fenced blocks inside Markdown lists are not scanned as links', () => fixture(
  '- ~~~js\n  [not a link](missing.md)\n  ~~~', root =>
    assert.deepEqual(checkAll(root).issues, []),
));
test('nested list fenced blocks are not scanned as links', () => fixture(
  '- item\n  - ~~~js\n    [not a link](missing.md)\n    ~~~', root =>
    assert.deepEqual(checkAll(root).issues, []),
));
test('unclosed list fences produce one fence diagnostic but no missing link', () => fixture(
  '- ~~~js\n  [not a link](missing.md)\n', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /unclosed ~~~/);
  },
));
test('fences inside a list cannot suppress a subsequent unindented link', () => fixture(
  '- ~~~js\n  [not a link](missing.md)\n[real link](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /missing local link/);
  },
));
test('ordinary links in Markdown list items are still validated', () => fixture(
  '- [real link](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));

test('escaped HTML comment opener does not hide an active link', () => fixture(
  '\\<!--\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('HTML comment closing delimiter is effective even when wrapped in backticks', () => fixture(
  '<!-- `-->`\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('closing an HTML comment within backticks resumes links on the same line', () => fixture(
  '<!-- `-->` [Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('indented code containing an apparent comment opener cannot hide links', () => fixture(
  '    <!--\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('indented HTML comment closer still works when a comment is already open', () => fixture(
  '<!--\n    -->\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('inline comment text within code remains inactive', () => fixture(
  '`<!--`\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));
test('real multiline HTML comments continue to hide apparent links', () => fixture(
  '<!--\n[ignored](missing.md)\n-->\n[Self](README.md)', root =>
    assert.deepEqual(checkAll(root).issues, []),
));

test('HTML-looking text inside a link title cannot hide a subsequent missing link', () => fixture(
  '[Self](README.md "<!--")\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:2: missing local link/);
  },
));

test('HTML-looking text inside an inline link URL cannot open a comment', () => fixture(
  '[Self](README.md?x=<!--)\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:2: missing local link/);
  },
));

test('link metadata comment markers preserve same-line active link validation', () => fixture(
  '[Self](README.md "<!--") [Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:1: missing local link/);
  },
));

test('masking link metadata does not hide a broken link own destination', () => fixture(
  '[Broken](missing.md "<!--")', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));

test('real comments outside links remain ignored after a link title', () => fixture(
  '[Self](README.md "<!--") <!-- [Hidden](missing.md) -->\n[Self](README.md)', root =>
    assert.deepEqual(checkAll(root).issues, []),
));

test('nested parentheses inside a link URL do not trigger phantom comments', () => fixture(
  '[Self](README.md?x=(<!--) "preview")\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link/),
));

test('Unicode before link metadata preserves HTML comment detection offsets', () => fixture(
  '🔥 [Self](README.md "<!--")\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:2: missing local link/);
  },
));

test('reference-definition quoted title with HTML-looking text does not hide later broken links', () => fixture(
  '[safe]: README.md "<!--"\n[Safe][safe]\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:3: missing local link: missing\.md/);
  },
));

test('reference-definition destination with a query comment opener is still link metadata', () => fixture(
  '[safe]: README.md?value=<!--\n[Safe][safe]\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:3: missing local link/);
  },
));

test('reference title containing HTML-looking text does not hide its own invalid destination', () => fixture(
  '[broken]: missing.md "<!--"\n[Broken][broken]', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link: missing\.md/),
));

test('quoted reference titles with Unicode preceding them preserve comment masking offsets', () => fixture(
  '[🔥]: README.md "<!--"\n[Link][🔥]\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:3: missing local link/),
));

test('real comments after definitions still conceal inactive links', () => fixture(
  '[safe]: README.md "<!--"\n<!-- [Inactive](missing.md) -->\n[Safe][safe]', root =>
    assert.deepEqual(checkAll(root).issues, []),
));

test('multiline reference title cannot open a phantom HTML comment', () => fixture(
  '[safe]: README.md\n    "<!--"\n[Safe][safe]\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:4: missing local link: missing\.md/);
  },
));

test('single-quoted and parenthesized multiline reference titles are also literal', () => {
  for (const title of [" '<!--'", ' (<!--)']) fixture(
    '[safe]: README.md\n' + title + '\n[Broken](missing.md)', root => {
      const issues = checkAll(root).issues;
      assert.equal(issues.length, 1);
      assert.match(issues[0], /README\.md:3: missing local link/);
    },
  );
});

test('image alt text containing HTML-looking syntax cannot hide a subsequent link', () => fixture(
  '![example <!--](README.md)\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:2: missing local link: missing\.md/);
  },
));

test('image alt text cannot conceal its own broken image destination', () => fixture(
  '![example <!--](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link: missing\.md/),
));

test('Unicode image alt text preserves comment masking positions', () => fixture(
  '![🔥 <!--](README.md)\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:2: missing local link/),
));

test('real comments remain inactive after an image link', () => fixture(
  '![image](README.md) <!-- [Inactive](missing.md) -->\n[Self](README.md)', root =>
    assert.deepEqual(checkAll(root).issues, []),
));

test('ordinary inline and single-line reference titles still work', () => fixture(
  '[safe]: README.md "<!--"\n[Safe][safe]\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:3: missing local link/),
));

test('reference-style image alt text containing comment-looking syntax cannot hide broken links', () => fixture(
  '[img]: README.md\n![example <!--][img]\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:3: missing local link: missing\.md/);
  },
));

test('reference-style text-link label cannot open a phantom comment', () => fixture(
  '[ref]: README.md\n[example <!--][ref]\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:3: missing local link/),
));

test('collapsed and shortcut image references treat their bracket labels as text', () => {
  for (const link of ['![img <!--][]', '![img <!--]']) fixture(
    '[img <!--]: README.md\n' + link + '\n[Broken](missing.md)', root =>
      assert.match(checkAll(root).issues.join(' '), /README\.md:3: missing local link/),
  );
});

test('shortcut reference text links cannot conceal later active destinations', () => fixture(
  '[link <!--]: README.md\n[link <!--]\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:3: missing local link/),
));

test('Unicode reference labels preserve offsets for comment masking', () => fixture(
  '[img]: README.md\n![🔥 <!--][img]\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:3: missing local link/),
));

test('reference-style image still validates its own missing target', () => fixture(
  '[img]: missing.svg\n![example <!--][img]', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link: missing\.svg/),
));

test('real HTML comments after reference labels still mask inactive links', () => fixture(
  '[ref]: README.md\n[example <!--][ref] <!-- [Inactive](missing.md) -->\n[Self](README.md)', root =>
    assert.deepEqual(checkAll(root).issues, []),
));

test('escaped brackets inside full references do not create phantom HTML comments', () => fixture(
  '[img]: README.md\n![some \\] <!--][img]\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 1);
    assert.match(issues[0], /README\.md:3: missing local link: missing\.md/);
  },
));

test('nested image labels protect comment text and preserve following active links', () => fixture(
  '![outer [inner] <!--](README.md)\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:2: missing local link/),
));

test('nested and escaped image alt labels are supported together', () => fixture(
  '![nested [x \\] z] <!--](README.md)\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:2: missing local link/),
));

test('escaped bracket in reference-style text link cannot hide active links', () => fixture(
  '[ref]: README.md\n[label \\] <!--][ref]\n[Broken](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /README\.md:3: missing local link/),
));

test('unreferenced bracket-like text must not hide real HTML comment openers', () => fixture(
  '[literal <!--]\n[Inactive](missing.md)\n-->', root =>
    assert.deepEqual(checkAll(root).issues, []),
));

test('balanced shortcut/collapsed reference labels continue to validate links', () => {
  for (const image of ['![img <!--]', '![img <!--][]']) fixture(
    '[img <!--]: README.md\n' + image + '\n[Broken](missing.md)', root =>
      assert.match(checkAll(root).issues.join(' '), /README\.md:3: missing local link/),
  );
});

test('nested inline image label validates the active image destination', () => fixture(
  '![outer [inner] label](missing.png)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link: missing\.png/),
));

test('nested inline link label validates an active destination', () => fixture(
  '[outer [inner] label](missing.md)', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link: missing\.md/),
));

test('nested inline labels containing HTML-looking text still check their own links', () => fixture(
  '![outer [inner] <!--](missing.png)\n[Broken](missing.md)', root => {
    const issues = checkAll(root).issues;
    assert.equal(issues.length, 2);
    assert.match(issues.join(' '), /missing local link: missing\.png/);
    assert.match(issues.join(' '), /missing local link: missing\.md/);
  },
));

test('escaped and nested reference labels share the same closing-bracket grammar', () => fixture(
  '[ref]: missing.md\n[outer [inner] label][ref]', root =>
    assert.match(checkAll(root).issues.join(' '), /missing local link: missing\.md/),
));

test('nested valid links and images continue to validate without false positives', () => fixture(
  '[outer [inner] label](README.md)\n![outer [inner] label](README.md)', root =>
    assert.deepEqual(checkAll(root).issues, []),
));
