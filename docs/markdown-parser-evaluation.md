# Markdown parser evaluation — 2026-10-28

**Decision: retain the current validator.** A disposable adapter around markdown-it did not preserve the existing regression suite. The probe is intentionally incomplete: its failures establish that this adapter is not a safe replacement, not that markdown-it cannot support one with additional work.

## Follow-up — 2026-10-29

The separate [revised candidate](../experiments/markdown-parser/candidate.cjs) adds source-line tracking, explicit missing-reference detection and conservative fence/comment checks. It passed the original 123 regression tests on Node 24.22.0. Eight small rendering cases also agreed with the separate `commonmark` 0.31.2 implementation, using parse5 to extract links from both renderers. Those samples are not a complete CommonMark or GitHub Flavored Markdown conformance test.

Three bounded repair passes were used. The first reached 122/123 existing tests; the second reached 123/123 but a scoped recheck exposed a valid reference after a comment being incorrectly reported as missing. The third repaired that case, but its recheck found a different fence regression: an unclosed fenced block in a list followed by a sibling item does not produce the existing unclosed-fence diagnostic. The [additional candidate tests](../experiments/markdown-parser/candidate.test.cjs) reproduce it. The combined result was **136 passed, 1 failed**: all 123 existing tests, five of six additional cases and all eight independent-rendering cases passed. The three earlier findings are improved, but compatibility remains incomplete; the candidate is not adopted.

The candidate depends on markdown-it's internal parser rules to capture reference definitions and source locations. Its implementation and compatibility across versions need review before any production use. The original adapter and the historical 78/45 results below are preserved.

### Additional list-fence pass — 2026-10-29

One additional pass preserved sibling-item visibility for unclosed unordered and ordered list fences, including a closing fence and an unindented line after the list. The previously failing unquoted-list case now passes. A scoped recheck found a related unresolved case: with a list fence inside a blockquote, the candidate reports a missing sibling link that the current validator treats as fenced text. The new test records this difference.

The latest candidate run produced **138 passed, 1 failed**: all 123 existing tests, seven of eight additional candidate tests, and all eight independent-rendering cases passed. The failing case is the quoted-list variant. The current validator remains unchanged; the candidate remains experimental.

### Quoted-list follow-up — 2026-10-29

The next bounded pass extends the same list-fence visibility handling to blockquote containers. The candidate now passes **140 of 140 tests**: the 123 existing tests, nine candidate tests, and eight independent-rendering cases. The new cases cover unordered and ordered lists, nested blockquotes, closing fences and leaving the list; a separate comparison also checked hidden reference definitions, blank quote lines and changes in quote depth against the current validator.

The earlier failure counts describe the earlier candidate snapshots. Passing these cases does not establish complete parser compatibility or justify adoption by itself: the adapter still relies on markdown-it internals, the rendering sample is small, and the broader dependency and compatibility review remains outstanding. The current validator is unchanged.

### Compatibility and dependency review — 2026-10-29

**Decision: do not adopt the candidate.** A targeted review of the parser adapter and its validator callers found two additional compatibility defects. The candidate is experimental and neither finding affects the unchanged production validator.

| Finding | Reproduction and impact | Required follow-up |
| --- | --- | --- |
| malformed URL escape is accepted | Create a local file named `exists%ZZ.md` and inspect `[x](exists%ZZ.md)`. The current validator reports invalid URL encoding; the candidate reports no issue. The same result occurs for an image and a reference definition. A properly escaped `%25ZZ` control is accepted by both. markdown-it normalizes the bad escape before the candidate calls `decodeURIComponent`. | Validate the original destination spelling before normalization, while preserving valid escapes and existing link/reference behavior. |
| quote-depth transition hides a fence error | With `> - ~~~`, `>   code`, then `> > - [bad](missing.md)` on successive lines, the current validator reports both an unclosed fence and the missing link. The candidate reports only the missing link. A sibling item at the original quote depth still produces the unclosed-fence diagnostic. | Preserve fence state when quote depth changes and test both transitions and valid closures. |

The candidate overrides markdown-it's inline parser and accesses its private `__rules__` array. This creates a maintenance dependency on parser internals in addition to the handwritten fence visibility pass; review that design before considering adoption. Registry metadata for `markdown-it` 15.0.3 lists the MIT license and six direct dependencies. Its temporary resolved dependency tree had no npm audit findings in this run; this does not certify future versions. No parser dependency or lockfile was added to the repository.

On Windows with Node 22.15.1, all 140 existing candidate and rendering tests passed. The previously recorded Node 24.22.0 run also passed those tests. The advertised Node 22.13 minimum, other operating systems, and complete CommonMark/GFM conformance were not tested. These results do not supersede the two reproduced failures above, and no CI was run for this review.

### Compatibility fixes — 2026-10-29

The experimental adapter preserves malformed path escapes before markdown-it normalizes a destination, allowing its existing URL check to reject them. It also retains an unclosed-fence diagnostic when a following list item changes blockquote depth. Regression tests cover malformed links, images and reference definitions; valid escaped filenames and query strings; increasing and decreasing quote depth; and a valid closing fence. A separate comparison against the current validator checked those cases, a filename with an encoded space, an external URL and a link after exiting the list.

Both findings are resolved for these tested cases. All **142 candidate, existing and independent-rendering tests** passed on Windows with Node 22.15.1 and 24.22.0. The temporary dependency audit reported no known vulnerabilities. The parser remains an experiment: it still relies on markdown-it internals, and the samples do not prove complete Markdown conformance. The production validator and repository dependencies remain unchanged.

### Adoption assessment — 2026-10-29

**Decision: retain the current validator and stop developing this adapter as a replacement.** The latest candidate passed its 142 existing tests on Node 24.22.0, but a broader bounded comparison found a broken-link detection regression. This decision applies to this adapter, not to every maintained Markdown parser.

the candidate's list-fence masking can hide a real link. For the following input, the current validator reports `missing local link: missing.md` on line 4; the candidate instead reports an unclosed fence on line 3 and misses the link. Both markdown-it and the independent `commonmark` renderer render the link. The invariant is that a rendered local link remains subject to existence and containment checks.

~~~~markdown
1. ~~~
   code
- ~~~
[bad](missing.md)
~~~~

The targeted comparison covered 88 combinations of links, references, comments and code across plain text, quotes, lists and fences; the candidate and current validator returned the same diagnostics for those cases. A separate 52-case fence/container comparison found 12 differing outputs, including the example above; not every difference was classified as a defect. These are samples, not exhaustive conformance results.

The prototype is shorter than the current validator, but its behavior depends on an overridden inline parser, markdown-it's private `__rules__` storage, and a handwritten preprocessing pass that parses each document twice. Repeated additions to preserve the existing conservative checks have not yet produced equivalent behavior. It also has no command-line entry point, while `npm run test:docs` and the Python wrapper execute the production checker directly. Production adoption would require those contracts, a pinned dependency and lockfile, full verification and independent compatibility evidence. Those requirements do not justify continuing this particular adapter without a new, demonstrated need.

This assessment did not change the production validator or dependency tree. Complete CommonMark/GFM conformance, the advertised Node 22.13 minimum, other operating systems and CI remain unverified.

To reproduce the current follow-up from the repository root on Windows, use a fresh temporary directory. The 143 tests include the original 142 checks and a counterexample check that asserts the current candidate's known false negative, alongside a normal-link control. If the candidate changes, revisit that expected failure rather than treating it as desired validator behavior.

```powershell
$probeDir = Join-Path $env:TEMP ("react-guide-candidate-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $probeDir | Out-Null
Copy-Item experiments/markdown-parser/candidate.cjs $probeDir
Copy-Item experiments/markdown-parser/candidate.cjs (Join-Path $probeDir 'validate-docs.cjs')
Copy-Item experiments/markdown-parser/candidate.test.cjs $probeDir
Copy-Item experiments/markdown-parser/independent-render.test.cjs $probeDir
Copy-Item experiments/markdown-parser/counterexample.test.cjs $probeDir
Copy-Item tools/validate-docs.test.cjs $probeDir
Copy-Item tools/validate-docs.cjs (Join-Path $probeDir 'production-validator.cjs')
npm install --prefix $probeDir --save-exact --ignore-scripts --no-audit --no-fund markdown-it@15.0.3 parse5@8.0.1 commonmark@0.31.2
Push-Location $probeDir
try { node --test validate-docs.test.cjs candidate.test.cjs independent-render.test.cjs counterexample.test.cjs }
finally { Pop-Location }
```

## Scope and baseline

The source baseline was `86a61a946920ad6f39c1e0fea6ec105654a65efb` on Windows with Node 24.22.0. The existing [`validate-docs.cjs`](../tools/validate-docs.cjs) and its Python wrapper remain unchanged. The baseline suite passed 123 of 123 tests.

The candidate was `markdown-it` 15.0.3 (MIT), installed only in a temporary directory, with the already-used `parse5` 8.0.1 for inspecting rendered HTML. The candidate's default parser had HTML enabled; this is not a claim of complete GitHub Flavored Markdown compatibility. No dependency or lockfile was added to the repository. The temporary dependency audit reported zero vulnerabilities at the time of the run.

## Comparison

The [probe adapter](../experiments/markdown-parser/validate-docs.cjs) checks tokenized links and images, reference destinations, basic fence closure, local file existence and lexical path containment. It is deliberately not a production validator. Running the existing 123 tests unchanged against this adapter produced **78 passes and 45 failures**. Many failures are incorrect line numbers caused by using the start of an inline block or line 1 for references; the count must not be attributed to the parser alone.

| Review finding | Evidence and consequence | Disposition |
| --- | --- | --- |
| unresolved explicit references | `[Missing][ref]` becomes plain text in the parser token stream. The adapter misses the existing missing-reference diagnostic. | Unresolved in the adapter; the replacement was not adopted. |
| diagnostic line locations | Inline tokens can cover multiple source lines; the probe uses their block start, and assigns references line 1. Existing tests detect incorrect locations. | Unresolved in the adapter; source mapping would need a separately verified implementation. |
| fence and comment policy | The adapter reports an additional unclosed fence when a list container ends. For `<!-- ` followed by a backtick-wrapped `-->` and a same-line Markdown link, the current validator checks the tail, while markdown-it renders the line as an HTML block and produces no link token. | Unresolved in the adapter; reconcile conservative lint policy with rendering before replacement. |

The [rendered-link probe](../experiments/markdown-parser/render-parity.cjs) passed nine cases: inline links, images, preceding and forward references, inline code, a comment block, a list, a table, and a same-line block-comment tail. It compared markdown-it's token output with its own rendered HTML parsed by parse5. This is a small consistency check, not an independent CommonMark/GFM conformance test; renderer behavior can differ from the current validator's intentionally conservative diagnostics.

The validator checks the existence of the file part of a local link, but **does not validate fragment anchors**. The earlier suggestion to preserve anchor validation overstated its current behavior. The probe also does not establish physical symlink containment or comprehensive URL semantics; those were not newly certified by this evaluation.

## Reproduce on Windows

Run this from the repository root with Node 24 and npm registry access. It creates an isolated temporary directory; it does not install packages in the repository. The regression command is expected to fail for this probe.

```powershell
$probeDir = Join-Path $env:TEMP ("react-guide-markdown-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $probeDir | Out-Null
Copy-Item experiments/markdown-parser/validate-docs.cjs $probeDir
Copy-Item experiments/markdown-parser/render-parity.cjs $probeDir
Copy-Item tools/validate-docs.test.cjs $probeDir
npm install --prefix $probeDir --save-exact --ignore-scripts --no-audit --no-fund markdown-it@15.0.3 parse5@8.0.1
Push-Location $probeDir
try {
  node --test validate-docs.test.cjs
  node render-parity.cjs
  npm audit --audit-level=low
} finally { Pop-Location }
```

The next viable replacement must preserve the existing policy checks and meaningful source locations, then pass the complete suite and independent rendering comparisons. No browser, screen-reader, or repository-wide validation is implied by this experiment.
