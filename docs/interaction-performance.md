# Interaction performance contracts for shared UI

A reusable component's responsiveness is part of its consumer-facing contract, alongside correctness and accessibility. An application's optimized state management cannot compensate for costly rendering, layout work, or DOM operations hidden inside a shared dropdown, table, or form primitive. This guidance applies to components with plausible high-cardinality or repeated-interaction workloads; it is **not** a blanket requirement to benchmark every button.

## Define the contract at the owning layer

For a high-impact component, record:

1. **Supported workload:** real or representative option/row counts, interaction frequency, device class and any supported maximums. State whether the component is intended for hundreds of rows or a small bounded list.
2. **User-observable behavior:** how quickly the result becomes usable, not only whether a React render or event handler completes. Specify keyboard and pointer paths, focus behavior, announcements and pending states.
3. **Evidence-backed performance target:** a measured baseline and project-specific threshold when one exists; otherwise record an investigation goal without inventing a pass/fail SLA. Note whether the target is a field metric or an isolated lab metric.
4. **Degradation strategy:** filtering, pagination, incremental rendering or accessible virtualization for genuinely large collections when justified by profiling. Include a non-virtualized option when workloads are small enough.
5. **Ownership:** shared UI maintainers handle shared-component hotspots; feature teams remain responsible for data fetching, filtering, composition, and feature-specific behavior.

## Representative interaction probes

Pick **only applicable** cases and bound the work; counts are workload examples, not guaranteed performance budgets.

| Component | Example workload | Check |
| --- | --- | --- |
| Country selector or combobox | Open with 125 and 250 options; optionally test 500 when supported | Time to visible/usable options; main-thread tasks; scaling as items increase; arrow-key navigation and focus |
| Bulk checkbox selection | Select/deselect 100 items | Visual update, input responsiveness, unnecessary per-item layout/animation work, and correct accessible checked state |
| Data table | Render or interact with 100 and 1,000 rows **if supported** | DOM growth, filtering/sorting response, scroll usability, row focus, and assistive-technology semantics |
| Autocomplete | Type into a large, realistic option set | Input responsiveness, cancellation/stale results, filtering complexity, and keyboard announcements |
| Large form | Change a field in a form with many controlled inputs | Update responsiveness, rerender scope, field errors and focus preservation |

Use growth comparisons to detect unexpectedly superlinear work. A 2× input is not necessarily expected to take 2× time: rendering, accessibility semantics, caching, transitions, and environment change the cost model. Investigate the cause rather than demanding a universal ratio.

## Measure consistently

- Build production artifacts, run the same actual user action and successful outcome, and report browser/version, machine, CPU throttling if any, dependency versions, revision, warm/cold state, data scale and repetitions. Use representative synthetic data; never copy sensitive production records into benchmark artifacts.
- Prefer browser traces plus user-visible timing. Distinguish total **main-thread busy time**, a **long task**, an isolated event-handler measurement, and **Interaction to Next Paint (INP)**. They are not interchangeable.
- INP at or below 200 ms at the **75th percentile of real page visits** is Google's general good-responsiveness field guidance, **not** a per-component main-thread benchmark cutoff or a promise attainable on every machine.
- Inspect DOM traversal complexity, forced synchronous layout (interleaved style writes and reads), large DOM trees, work per rendered item, expensive option matching, repeated rerenders, and synchronized animations. Confirm a plausible causal chain before recommending optimization.
- Do not add blanket `useMemo`, `useCallback`, or `React.memo`. React Compiler support, rendering semantics and data shape depend on project versions. Prefer fixes to excess work at the shared owner when a shared primitive causes the problem.
- Any virtualization must preserve navigation, labels/roles, screen-reader relationships, active-descendant/focus handling and discoverability. Virtualization is not automatically required or beneficial for 250 options.

## Regression prevention without CI churn

Keep deterministic behavior, keyboard/a11y and boundary tests in the project's usual test suite. For meaningful interaction regressions, keep a reproducible **opt-in local benchmark** and compare against a measured baseline under comparable conditions. Record run-to-run variation and the smallest relevant workload first. Promote a noisy time threshold to mandatory CI **only after** it is stable on controlled runners and its value outweighs cost/flakiness; never remove existing required checks to save minutes. Batch validated changes before a push.

A proposed measurement is `NOT RUN` until executed. If there is no controlled environment, report the gap, not a passing benchmark.

## Lightweight evidence record

Record: owning component, revision/dependencies, action and expected visible outcome, workload/data source and size, browser/hardware/throttling, build mode, warmup and repetitions, metric definition and units, baseline/current results with spread, accessibility check, test command, and interpretation/limitations. Avoid claiming a specific optimization improved INP when only main-thread work was measured.

## Sources and limits

- [Den Odell, *Design Systems Should Be Fast by Default*](https://denodell.com/blog/design-systems-should-be-fast-by-default) (2026-10-27) and [example Playwright benchmark harness](https://github.com/denodell/design-system-performance-tests). Ten libraries and two workloads are useful case studies, **not** a comprehensive ranking or a universal latency budget.
- [web.dev: Interaction to Next Paint](https://web.dev/articles/inp) and [optimizing INP](https://web.dev/articles/optimize-inp). Field responsiveness and lab traces answer different questions.
