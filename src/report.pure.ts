import { type Finding } from './finding.shape.ts'

// why: юнит монорепо — это apps/<svc> и packages/<pkg>; всё остальное живёт
// в общей зоне и считается одной кучей по первому сегменту
function getUnit(file: string): string {
  const parts = file.split('/')
  const root = parts[0] ?? file
  return root === 'apps' || root === 'packages' ? parts.slice(0, 2).join('/') : root
}

/** Долг по юнитам: где стандарт ближе всего к тому, чтобы стать правдой. */
export function formatUnitStat(findings: Finding[]): string {
  const counted = new Map<string, Map<string, number>>()
  for (const finding of findings) {
    const rules = counted.get(getUnit(finding.file)) ?? new Map<string, number>()
    rules.set(finding.rule, (rules.get(finding.rule) ?? 0) + 1)
    counted.set(getUnit(finding.file), rules)
  }
  const rows = [...counted]
    .map(([unit, rules]) => {
      const total = [...rules.values()].reduce((sum, count) => sum + count, 0)
      const worst = [...rules]
        .sort((one, other) => other[1] - one[1])
        .slice(0, 3)
        .map(([rule, count]) => `${rule} ${String(count)}`)
        .join(', ')
      return { unit, total, worst }
    })
    .sort((one, other) => one.total - other.total)
  const shown = rows.map(
    (row) => `  ${String(row.total).padStart(6)}  ${row.unit.padEnd(34)}  ${row.worst}`,
  )
  return [...shown, '', 'Top rows are the closest to clean.'].join('\n')
}

const cliRules: Record<string, string> = {
  'file-role': 'File name: <domain>.<role>.ts, kebab-case (PascalCase in Kotlin/Swift, snake_case in Rust/SQL)',
  'no-dump-file': 'Dumping-ground files and directories: utils, helpers, common, shared, lib, types, index',
  'dir-depth': 'Directory depth inside src; a hierarchy dictated by the framework is not counted',
  'no-dead-export': 'An export nothing else in this repository mentions',
  'sql-name': 'Names of tables, indexes and constraints: snake_case, prefixes idx_/uq_/pk_/fk_/ck_',
  'sql-column': 'Columns: snake_case, _at for timestamps, is_/has_ for booleans, a unit for numbers',
  naming: 'Boolean prefixes and units of measure in Rust, Kotlin and Swift',
  'max-lines': 'File length: the file holds more than one role',
  'level-honesty': 'The declared level against what the repository actually holds',
  parse: 'The file did not parse — AST rules did not run on it',
}

/** Что проверяет правило и куда идти за развёрнутым объяснением. */
export function formatExplain(rule: string, own: Record<string, string>, docs: string): string {
  const known = own[rule] ?? cliRules[rule]
  if (known === undefined) {
    const all = [...Object.keys(own), ...Object.keys(cliRules)].sort().join(' ')
    return `No rule "${rule}". Known: ${all}`
  }
  return `${rule}\n\n  ${known}\n\n  In full — ${docs}\n`
}
