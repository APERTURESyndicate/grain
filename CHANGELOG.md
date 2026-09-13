# Changelog

## 1.2.0

First public release. The standard and its checker were extracted from the APERTURESyndicate platform, where GRAIN 1.2 has been enforced on every commit since 2026-09-05.

- Checker for TypeScript, JavaScript, Rust, SQL, Kotlin, Swift and SYNX; 17 AST rules run through ESLint as a library, no project ESLint config required.
- Debt ledger (`baseline.synx`): the gate passes recorded violations and fails anything new.
- Levels L1/L2/L3 and `grain --audit`, which refuses a declared level the repository does not hold.
- Project configuration: a `grain.synx` at the repository root overrides any key of the shipped vocabulary; `adopt` left empty covers the whole repository.
- `grain:allow <rule> — <reason>` covers the named rule on its own line and the next one, for every check.
- The checker runs from any directory of the repository; paths are resolved against the git root.
