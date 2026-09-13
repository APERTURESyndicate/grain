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
  return [...shown, '', 'Сверху — те, кому до чистоты ближе всего.'].join('\n')
}

const cliRules: Record<string, string> = {
  'file-role': 'Имя файла: <домен>.<роль>.ts, kebab-case (PascalCase в Kotlin/Swift, snake в Rust/SQL)',
  'no-dump-file': 'Файлы и каталоги-свалки: utils, helpers, common, shared, lib, types, index',
  'dir-depth': 'Глубина каталогов внутри src; иерархия от фреймворка не считается',
  'no-dead-export': 'Экспорт, которого никто не упоминает в этом репозитории',
  'sql-name': 'Имена таблиц, индексов и ограничений: snake_case, префиксы idx_/uq_/pk_/fk_/ck_',
  'sql-column': 'Колонки: snake_case, _at у времени, is_/has_ у булевых, единица у чисел',
  naming: 'Булевы префиксы и единицы измерения в Rust, Kotlin и Swift',
  'max-lines': 'Длина файла: в файле больше одной роли',
  'level-honesty': 'Объявленный уровень против того, что репозиторий реально держит',
  parse: 'Файл не разобрался — правила по AST на нём не исполнялись',
}

/** Что проверяет правило и куда идти за развёрнутым объяснением. */
export function formatExplain(rule: string, own: Record<string, string>, docs: string): string {
  const known = own[rule] ?? cliRules[rule]
  if (known === undefined) {
    const all = [...Object.keys(own), ...Object.keys(cliRules)].sort().join(' ')
    return `Правила "${rule}" нет. Есть: ${all}`
  }
  return `${rule}\n\n  ${known}\n\n  Полностью — ${docs}\n`
}
