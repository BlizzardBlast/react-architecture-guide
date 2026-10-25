# Contributing

This project contains architectural guidance and small executable examples, not an application framework.

1. Start with a concrete problem, proposed decision, and trade-offs.
2. Update the canonical document, relevant ADR, the example when appropriate, and `AGENTS.md` when agent rules change.
3. Distinguish sourced guidance from project recommendations; keep version-dependent React advice conditional.
4. Keep diagrams, directory explanations, and actual example paths consistent.
5. Validate locally:

~~~bash
npm ci
npm --prefix examples/orders ci
npm --prefix examples/react-app ci
npm run verify
npm audit
npm --prefix examples/orders audit
npm --prefix examples/react-app audit
~~~

The legacy `python3 scripts/validate_docs.py` command delegates to the same tested Node Markdown validator used by `npm run test:docs`.

6. Batch changes and review fixes before pushing. Don't add redundant GitHub Actions workflows or remove necessary quality gates to conserve minutes.
