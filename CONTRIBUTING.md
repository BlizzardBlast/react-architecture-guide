# Contributing

This project contains architectural guidance and one small executable example, not an application framework.

1. Start with a concrete problem, proposed decision, and trade-offs.
2. Update the canonical document, relevant ADR, the example when appropriate, and `AGENTS.md` when agent rules change.
3. Distinguish sourced guidance from project recommendations; keep version-dependent React advice conditional.
4. Keep diagrams, directory explanations, and actual example paths consistent.
5. Validate locally:

~~~bash
python3 scripts/validate_docs.py
cd examples/orders
npm install
npm test
~~~

6. Batch changes and review fixes before pushing. Don't add redundant GitHub Actions workflows or remove necessary quality gates to conserve minutes.
