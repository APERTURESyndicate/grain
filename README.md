# GRAIN

**The APERTURESyndicate code standard — and the checker that enforces it.**

Film grain is what identifies the medium before you read the signature. GRAIN is not about indentation and quotes — that is the formatter's job, and it leaves no trace. GRAIN is about **naming, contracts and shape**: what survives any formatter and reads like handwriting. Code written to GRAIN is recognisable in a stranger's repository within one screen.

- A closed lexicon of 33 verbs, each with a contract: `find*` may return `null`, `get*` never does, `list*` is always a collection.
- A number carries its unit (`refreshTtlSec`, `priceCents`); a boolean carries its prefix (`is`, `has`, `can`, …).
- One file — one role, and the role is in the name: `invoice.store.ts`, `token.policy.ts`, `cover.pure.ts`. No `utils`, no `helpers`, no `index`.
- Comments answer *why* and start with a tag: `why:` `perf:` `safety:` `spec:` `ref:`. No `TODO`, no dividers, no retelling of the next line.
- Time, randomness and `process.env` live only at the boundary; dependencies point inward; independent `await`s run through `Promise.all`.

The full standard: [docs.aperturesyndicate.com/en/grain/overview](https://docs.aperturesyndicate.com/en/grain/overview) (English) · [`docs/`](docs/README.md) (Russian, the canonical text). The one-page card is [`docs/CARD.md`](docs/CARD.md); the twelve laws that fit into an assistant's prompt are [`docs/SMALL.md`](docs/SMALL.md).

## The checker

The standard is held by a machine, not by memory. `grain` reads the same vocabulary file the standard is written from ([`grain.synx`](grain.synx)) and checks TypeScript, JavaScript, Rust, SQL, Kotlin, Swift and SYNX: names, contracts, file roles, directory shape, comments, event subjects, config keys. For TypeScript it runs its own 17 AST rules through ESLint as a library — the project needs no ESLint config of its own.

Requires [Bun](https://bun.sh).

```bash
bun add -d @aperturesyndicate/grain
```

```bash
bun grain                    # staged files — what the pre-commit hook runs
bun grain --all              # the whole repository
bun grain src/billing        # one path, no gate
bun grain --all --baseline   # record the current debt
bun grain --audit            # is the declared level actually earned
bun grain --all --stat       # debt map by module
bun grain --explain <rule>   # what a rule checks
bun grain --json             # machine-readable output for CI
```

### Switching it on in a live project

A standard cannot be switched on "starting tomorrow": existing code breaks it in thousands of places, and a gate that fails on everything is removed by day two. So the debt is recorded as numbers:

```bash
bun grain --all --baseline   # writes baseline.synx: <file> <rule> <count>
```

From then on the gate lets exactly that debt through and **fails on anything new** — new code holds the standard from its first line, old code is repaid a module at a time. Line numbers are deliberately not stored: they shift on any edit above and would turn the debt into a source of false positives.

### Project configuration

The package ships the full vocabulary. A project overrides only what differs, in its own `grain.synx` at the repository root — a key is replaced whole:

```synx
level 3
adopt src scripts
paths_ignored node_modules dist src/db/migrations
synx_config app.synx
units_domain Px Deg Hz Bpm Db Energy
```

Every key and its meaning is documented inline in [`grain.synx`](grain.synx). Environment overrides: `GRAIN_ROOT`, `GRAIN_CONFIG`, `GRAIN_BASELINE`.

### Levels

| Level | What it means |
|---|---|
| **L1 Readability** | Verbs, units, boolean prefixes, comment form, no dumping-ground files. Adopted in an evening. |
| **L2 Contracts** | The full standard: `find`/`get` contracts, file roles, boundaries, inward imports, dead exports, failure codes. |
| **L3 Discipline** | The rules of L2 plus a guarantee: a blocking pre-commit hook, a check in CI, adoption covering all the code. `grain --audit` verifies the guarantee and refuses to let a project claim a level it does not hold. |

### Pre-commit and CI

```bash
# .githooks/pre-commit
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
[ "${GRAIN_SKIP:-0}" = "1" ] && exit 0
bun grain
```

```bash
git config core.hooksPath .githooks   # once per clone
```

```yaml
# .github/workflows/grain.yml
name: grain
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun grain --all
      - run: bun grain --audit
```

### The escape hatch

A rule may be broken deliberately, but not silently. The comment covers the named rule on its own line and the next one; the reason is mandatory.

```ts
// grain:allow unit-suffix — field of an external Stripe contract, cannot be renamed
```

### ESLint plugin

For editor highlighting the same rules are available as a flat config:

```js
// eslint.config.js
import { grainConfig } from '@aperturesyndicate/grain'

export default [grainConfig]
```

`grainLevel1Config` limits it to L1; `grainMigrationConfig` keeps GRAIN's own rules as errors and lowers the built-in shape limits to warnings for code that is migrating.

## Repository layout

```
grain.synx     the vocabularies as data — the single source the standard, the rules and the docs are built from
bin/           the checker entry point and the docs generator
src/           checks by language, the ESLint rules, the baseline ledger
docs/          the standard (Russian): overview, per-language chapters, glossary, walkthrough
test/          the rules' self-test: bun test
baseline.synx  this repository's own recorded debt
```

`docs/CARD.md` and `docs/SMALL.md` are generated from `grain.synx` by `bun run docs` — do not edit them by hand. A rule that is not in `grain.synx` is not checked; a rule that is not in the docs makes no sense. Both change together or neither does.

## Versioning

GRAIN is versioned as a whole. Adding to a vocabulary is a minor version; removing a verb, a role or a unit is a major one, because it breaks existing code. See [`CHANGELOG.md`](CHANGELOG.md).

## License

[MIT](LICENSE) — the text of the standard and the checker alike.
