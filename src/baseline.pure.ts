import { type Finding } from './finding.shape.ts'

type Ledger = Map<string, Map<string, number>>

const place = (finding: Finding) => `${finding.file}\u0000${finding.rule}`

/** Сколько нарушений каждого правила числится за файлом. */
export function parseBaseline(text: string): Ledger {
  const ledger: Ledger = new Map()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const [file, rule, written] = trimmed.split(/\s+/)
    if (file === undefined || rule === undefined) continue
    const known = ledger.get(file) ?? new Map<string, number>()
    known.set(rule, Number(written ?? 1))
    ledger.set(file, known)
  }
  return ledger
}

function countFindings(findings: Finding[]): Map<string, number> {
  const counted = new Map<string, number>()
  for (const finding of findings) {
    counted.set(place(finding), (counted.get(place(finding)) ?? 0) + 1)
  }
  return counted
}

/**
 * Долг записан числами, а не строками: строки едут при любой правке выше,
 * и хранение номеров превратило бы baseline в источник ложных срабатываний.
 */
export function formatBaseline(findings: Finding[], version: string): string {
  const rows = [...countFindings(findings)]
    .map(([key, count]) => {
      const [file, rule] = key.split('\u0000')
      return `${file ?? ''} ${rule ?? ''} ${String(count)}`
    })
    .sort((one, other) => one.localeCompare(other))
  return [
    `# GRAIN ${version} — debt taken as given.`,
    '# The gate lets exactly these violations through and fails anything beyond them.',
    '# Line: <file> <rule> <count>. Rewritten by `grain --all --baseline`.',
    '',
    ...rows,
    '',
  ].join('\n')
}

/** Нарушения сверх принятого долга — только они валят проверку. */
export function listExcess(findings: Finding[], ledger: Ledger): Finding[] {
  const allowed = new Map<string, number>()
  for (const [file, rules] of ledger) {
    for (const [rule, count] of rules) allowed.set(`${file}\u0000${rule}`, count)
  }
  const excess: Finding[] = []
  for (const finding of findings) {
    const left = allowed.get(place(finding)) ?? 0
    if (left > 0) {
      allowed.set(place(finding), left - 1)
      continue
    }
    excess.push(finding)
  }
  return excess
}

/** Сколько записей долга больше не подтверждается находками — повод пересобрать baseline. */
export function countRepaid(findings: Finding[], ledger: Ledger): number {
  const counted = countFindings(findings)
  let repaid = 0
  for (const [file, rules] of ledger) {
    for (const [rule, count] of rules) {
      repaid += Math.max(0, count - (counted.get(`${file}\u0000${rule}`) ?? 0))
    }
  }
  return repaid
}
