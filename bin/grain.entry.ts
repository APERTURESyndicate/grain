#!/usr/bin/env bun
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { findRuleLevel, grain } from '../src/vocabulary.js'
import { listAstFindings } from '../src/check-eslint.wire.ts'
import { listLevelFaults } from '../src/check-level.wire.ts'
import { listDeadExports } from '../src/check-export.pure.ts'
import { listEventFindings } from '../src/check-event.pure.ts'
import { isIgnoredPath, listPathFindings } from '../src/check-path.pure.ts'
import { listMobileFindings } from '../src/check-mobile.pure.ts'
import { listRustFindings } from '../src/check-rust.pure.ts'
import { listSqlFindings } from '../src/check-sql.pure.ts'
import { listSynxCanonFindings } from '../src/check-synx-canon.pure.ts'
import { listSynxFindings } from '../src/check-synx.pure.ts'
import { listTextFindings } from '../src/check-text.pure.ts'
import {
  countRepaid,
  formatBaseline,
  listExcess,
  parseBaseline,
} from '../src/baseline.pure.ts'
import { type Finding } from '../src/finding.shape.ts'
import { formatExplain, formatUnitStat } from '../src/report.pure.ts'
import { listUnallowed } from '../src/allow.pure.ts'

const checked = new RegExp(`\\.(${grain.filesChecked.join('|')})$`)
const scripted = /\.(ts|tsx|js|jsx)$/

function listGitFiles(query: string[]): string[] {
  return execFileSync('git', query, { encoding: 'utf-8' })
    .split('\n')
    .filter((file) => file !== '')
}

// why: путь может быть каталогом — раскрываем через git, чтобы уважать .gitignore
const wholeQuery = ['ls-files', '--cached', '--others', '--exclude-standard']

// why: git отдаёт пути от корня репозитория, и долг записан от него же —
// поэтому чекер работает из корня, а аргументы-пути переводит туда из cwd
const startedAt = process.cwd()
process.chdir(grain.projectRoot)
const fromRoot = (path: string) =>
  relative(grain.projectRoot, resolve(startedAt, path)).split('\\').join('/') || '.'

function listCandidates(argv: string[]): { files: string[]; isGated: boolean; isWhole: boolean } {
  const paths = argv
    .filter((argument) => !argument.startsWith('--') && argument !== String(readLevel(argv)))
    .map(fromRoot)
  const isWhole = argv.includes('--all')
  if (paths.length > 0) {
    return { files: listGitFiles([...wholeQuery, '--', ...paths]), isGated: false, isWhole: true }
  }
  const staged = ['diff', '--cached', '--name-only', '--diff-filter=ACMR']
  return {
    files: listGitFiles(isWhole ? wholeQuery : staged),
    isGated: !argv.includes('--force') && grain.adopt.length > 0,
    isWhole,
  }
}

function readLevel(argv: string[]): number {
  const flag = argv.indexOf('--level')
  if (flag === -1) return grain.level
  return Number(argv[flag + 1] ?? grain.level)
}

function listFileFindings(file: string, source: string): Finding[] {
  const findings = listPathFindings(file)
  if (file.endsWith('.sql')) {
    return [...findings, ...listTextFindings(file, source, '--'), ...listSqlFindings(file, source)]
  }
  if (file.endsWith('.rs')) {
    return [...findings, ...listTextFindings(file, source, '//'), ...listRustFindings(file, source)]
  }
  if (file.endsWith('.synx')) {
    return [...findings, ...listSynxFindings(file, source)]
  }
  if (file.endsWith('.kt') || file.endsWith('.swift')) {
    return [...findings, ...listTextFindings(file, source, '//'), ...listMobileFindings(file, source)]
  }
  return [
    ...findings,
    ...listTextFindings(file, source, '//'),
    ...listEventFindings(file, source),
  ]
}

function writeReport(findings: Finding[], level: number): void {
  let current = ''
  for (const finding of findings) {
    if (finding.file !== current) {
      current = finding.file
      process.stdout.write(`\n  ${current}\n`)
    }
    const mark = `L${String(findRuleLevel(finding.rule) ?? level)}`
    process.stdout.write(
      `    ${String(finding.line).padStart(4)}  ${mark}  ${finding.rule.padEnd(16)}  ${finding.message}\n`,
    )
  }
  process.stdout.write(
    `\nGRAIN ${grain.version} L${String(level)}: ${String(findings.length)} violations.\n` +
      `The standard — ${grain.docsUrl}\nA deliberate exception — // ${grain.commentEscape} <rule> — <reason>\n`,
  )
}

const argv = process.argv.slice(2)
const level = readLevel(argv)

const explained = argv.indexOf('--explain')
if (explained !== -1) {
  const { grainPlugin } = await import('../src/public.js')
  const own = Object.fromEntries(
    Object.entries(grainPlugin.rules).map(([rule, made]) => [rule, made.meta.docs.description]),
  )
  process.stdout.write(formatExplain(argv[explained + 1] ?? '', own, grain.docsUrl))
  process.exit(0)
}

if (argv.includes('--audit')) {
  const faults = listLevelFaults(level, listGitFiles(wholeQuery))
  for (const fault of faults) process.stdout.write(`  L${String(level)}  ${fault.message}\n`)
  process.stdout.write(
    faults.length === 0
      ? `GRAIN ${grain.version}: level L${String(level)} is held by machine — hook, CI, full coverage.\n`
      : `GRAIN ${grain.version}: L${String(level)} is declared but not guaranteed — ${String(faults.length)} reasons above.\n`,
  )
  process.exit(faults.length > 0 ? 1 : 0)
}
const { files, isGated, isWhole } = listCandidates(argv)
const adopted = files
  .filter((file) => checked.test(file) && !isIgnoredPath(file) && existsSync(file))
  .filter((file) => !isGated || grain.adopt.some((prefix: string) => file.startsWith(prefix)))

// why: на Windows рабочая копия лежит с CRLF, в CI — с LF; без нормализации
// построчные проверки дают разный результат, и долг, записанный на одной машине,
// не сходится на другой
const readSource = (file: string) => readFileSync(file, 'utf-8').replace(/\r\n/g, '\n')
const sources = new Map(adopted.map((file) => [file, readSource(file)]))
const ast = await listAstFindings(
  new Map([...sources].filter(([file]) => scripted.test(file))),
  level,
)
// why: комментарии в TS разбирает ESLint по настоящим узлам — текстовый проход
// на тех же файлах повторил бы находку и ошибся бы на комментарии внутри строки
const isDoubled = (finding: Finding) =>
  ast.isRun && finding.rule === 'comment-form' && scripted.test(finding.file)
const scanned = [...sources]
  .flatMap(([file, source]) => listFileFindings(file, source))
  .filter((finding) => !isDoubled(finding))
// why: мёртвый экспорт виден только на полном наборе файлов — на выборке любое имя,
// которое зовут из соседнего каталога, выглядит мёртвым
const dead = isWhole && argv.includes('--all') ? listDeadExports(sources) : []
// why: расхождение имён видно только при сравнении конфигов между собой
const canon = argv.includes('--all') ? listSynxCanonFindings(sources) : []
const findings = listUnallowed([...scanned, ...ast.findings, ...dead, ...canon], sources)
  .filter((finding) => (findRuleLevel(finding.rule) ?? 1) <= level)
  .sort((one, other) => one.file.localeCompare(other.file) || one.line - other.line)

const baselineFile =
  process.env.GRAIN_BASELINE === undefined
    ? join(grain.projectRoot, 'baseline.synx')
    : resolve(startedAt, process.env.GRAIN_BASELINE)
if (argv.includes('--baseline')) {
  writeFileSync(baselineFile, formatBaseline(findings, grain.version), 'utf-8')
  process.stdout.write(`GRAIN ${grain.version}: debt recorded — ${String(findings.length)} violations.\n`)
  process.exit(0)
}

// why: долг берётся как данность — иначе стандарт нельзя включить нигде, кроме
// чистого листа: гейт ловит новые нарушения, старые гасятся по пути
const ledger = existsSync(baselineFile)
  ? parseBaseline(readFileSync(baselineFile, 'utf-8'))
  : new Map<string, Map<string, number>>()
const excess = listExcess(findings, ledger)
const owedCount = findings.length - excess.length
// why: на выборке файлов «погашено» посчиталось бы по всему долгу и всегда врало
const repaidCount = argv.includes('--all') ? countRepaid(findings, ledger) : 0
const repaid = repaidCount > 0 ? `, ${String(repaidCount)} repaid — grain --all --baseline` : ''
const debt = owedCount > 0 ? `In debt: ${String(owedCount)}${repaid}.` : ''

if (argv.includes('--stat')) {
  process.stdout.write(`${formatUnitStat(findings)}
`)
} else if (argv.includes('--json')) {
  process.stdout.write(JSON.stringify(excess, null, 2))
} else if (argv.includes('--badge')) {
  const badge = `[![GRAIN L${String(level)}](${grain.badgeUrl}/grain-l${String(level)}.svg)](${grain.docsUrl})`
  process.stdout.write(
    findings.length === 0
      ? `${badge}\n`
      : `No badge: ${String(excess.length)} beyond the debt and ${String(owedCount)} in debt at L${String(level)}.\n`,
  )
} else if (excess.length > 0) {
  writeReport(excess, level)
} else {
  process.stdout.write(
    `GRAIN ${grain.version} L${String(level)}: clean (${String(adopted.length)} files). ${debt}\n`,
  )
}
process.exit(excess.length > 0 ? 1 : 0)
