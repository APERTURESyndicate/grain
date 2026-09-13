import { grain, splitWords } from './vocabulary.js'
import { makeFinding, type Finding } from './finding.shape.ts'

const snake = /^[a-z][a-z0-9_]*$/
const declaredKey = /^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\[[^\]]*\])?(:[^\s]*)?(?:\s+(.*))?$/
const intType = /type:\s*(int|float|number)/
const boolType = /type:\s*bool(ean)?/
const numberValue = /^-?\d+(\.\d+)?$/
const boolValue = /^(true|false)$/

const units = new Set([...grain.units].map((unit) => unit.toLowerCase()))

function findKeyFault(key: string, modifiers: string, value: string): string | null {
  if (!snake.test(key)) return `key "${key}" must be snake_case`
  const words = splitWords(key)
  const first = words[0]
  const last = words[words.length - 1]
  if (last !== undefined && grain.nounsBanned.has(last)) {
    return `key "${key}": the word "${last}" says nothing`
  }
  const isBoolean = boolType.test(modifiers) || boolValue.test(value)
  if (isBoolean && first !== undefined && !grain.boolPrefixes.includes(first)) {
    return `boolean key "${key}" needs a prefix: ${grain.boolPrefixes.map((prefix) => `${prefix}_`).join('/')}`
  }
  const isNumber = intType.test(modifiers) || numberValue.test(value)
  if (!isNumber || key.length <= 2) return null
  if (last !== undefined && (units.has(last) || grain.unitsExempt.has(last))) return null
  return `number "${key}" has no unit — _ms, _sec, _bytes, _count, _pct`
}

/**
 * SYNX-конфиг: имена ключей держат тот же словарь, что и код. Комментарии здесь
 * не проверяются — в конфиге они подписывают разделы, а не пересказывают строку.
 * Файлы-данные в том же формате не проверяются вовсе: их словарь принадлежит домену.
 */
export function listSynxFindings(file: string, source: string): Finding[] {
  const name = file.split(/[\/]/).pop() ?? file
  if (!grain.synxConfig.has(name)) return []
  const findings: Finding[] = []
  source.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) return
    const declared = declaredKey.exec(line)
    if (declared === null) return
    const fault = findKeyFault(declared[2] ?? '', declared[3] ?? '', (declared[5] ?? '').trim())
    if (fault !== null) findings.push(makeFinding([file, index + 1], 'synx-key', fault))
  })
  return findings
}
