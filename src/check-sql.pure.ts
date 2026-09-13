import { grain, splitWords } from './vocabulary.js'
import { makeFinding, type Finding } from './finding.shape.ts'

const snake = /^[a-z][a-z0-9_]*$/
const tableStart = /create\s+table\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_.]+)"?/i
const indexStart = /create\s+(unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/i
const constraintStart = /constraint\s+"?([a-z0-9_]+)"?\s+(primary\s+key|foreign\s+key|unique|check)/i
const columnStart = /^\s*"?([a-z][a-z0-9_]*)"?\s+(timestamptz|timestamp|date|boolean|bool|bigint|integer|int|smallint|numeric|decimal|real|double)/i

const numberTypes = /^(bigint|integer|int|smallint|numeric|decimal|real|double)$/i
const timeTypes = /^(timestamptz|timestamp|date)$/i
const units = new Set([...grain.units].map((unit) => unit.toLowerCase()))

function findColumnFault(name: string, kind: string): string | null {
  if (!snake.test(name)) return `column "${name}" must be snake_case`
  const words = splitWords(name)
  const first = words[0]
  const last = words[words.length - 1]
  if (last !== undefined && grain.nounsBanned.has(last)) {
    return `column "${name}": the word "${last}" says nothing`
  }
  if (timeTypes.test(kind) && last !== 'at') {
    return `timestamp "${name}" needs the _at suffix (created_at, expires_at)`
  }
  if (/^(boolean|bool)$/i.test(kind) && first !== undefined && !grain.boolPrefixes.includes(first)) {
    return `boolean "${name}" needs a prefix: ${grain.boolPrefixes.map((prefix) => `${prefix}_`).join('/')}`
  }
  if (!numberTypes.test(kind) || name.endsWith('_id') || name === 'id') return null
  if (last !== undefined && (units.has(last) || grain.unitsExempt.has(last))) return null
  return `number "${name}" has no unit — _ms, _sec, _cents, _bytes, _count, _pct`
}

function findObjectFault(line: string): string | null {
  const table = tableStart.exec(line)
  if (table !== null) {
    const name = (table[1] ?? '').split('.').pop() ?? ''
    return snake.test(name) ? null : `table "${name}" must be snake_case and plural`
  }
  const index = indexStart.exec(line)
  if (index !== null) {
    const name = index[2] ?? ''
    const wanted = index[1] === undefined ? 'idx_' : 'uq_'
    return name.startsWith(wanted) ? null : `index "${name}" needs the prefix ${wanted}<table>_<columns>`
  }
  const constraint = constraintStart.exec(line)
  if (constraint === null) return null
  const prefixes: Record<string, string> = {
    p: 'pk_',
    f: 'fk_',
    u: 'uq_',
    c: 'ck_',
  }
  const wanted = prefixes[(constraint[2] ?? '').slice(0, 1).toLowerCase()] ?? ''
  const name = constraint[1] ?? ''
  return name.startsWith(wanted) ? null : `constraint "${name}" needs the prefix ${wanted}`
}

/** SQL: имена таблиц, колонок, индексов; единицы и префиксы в схеме. */
export function listSqlFindings(file: string, source: string): Finding[] {
  const findings: Finding[] = []
  source.split('\n').forEach((line, index) => {
    const place: [string, number] = [file, index + 1]
    const objectFault = findObjectFault(line)
    if (objectFault !== null) findings.push(makeFinding(place, 'sql-name', objectFault))
    const column = columnStart.exec(line)
    if (column === null) return
    const fault = findColumnFault(column[1] ?? '', column[2] ?? '')
    if (fault !== null) findings.push(makeFinding(place, 'sql-column', fault))
  })
  return findings
}
