import { abbrevFix, grain, splitWords } from './vocabulary.js'
import { makeFinding, type Finding } from './finding.shape.ts'

// why: имена, продиктованные трейтами std и Tauri — переименовать их нельзя
const traitNames = new Set([
  'main', 'new', 'default', 'from', 'into', 'fmt', 'drop', 'clone', 'eq', 'cmp', 'hash',
  'next', 'poll', 'serialize', 'deserialize', 'setup', 'run',
])

const functionLine = /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([a-z0-9_]+)/
const bindingLine = /^\s*let\s+(?:mut\s+)?([a-z0-9_]+)\s*(?::\s*([A-Za-z0-9_<>:]+))?\s*=\s*(.+)$/
const numberType = /^(u8|u16|u32|u64|usize|i8|i16|i32|i64|isize|f32|f64)$/
const numberValue = /^-?\d[\d_]*(\.\d+)?[a-z0-9]*\s*[,;)]?$/

function findNameFault(name: string): string | null {
  const words = splitWords(name)
  const last = words[words.length - 1]
  if (last !== undefined && grain.nounsBanned.has(last)) {
    return `"${name}": the word "${last}" says nothing — name it by the domain`
  }
  const short = words.find((word) => abbrevFix.has(word))
  if (short !== undefined) return `"${name}": write "${abbrevFix.get(short) ?? ''}" instead of "${short}"`
  const boastful = words.find((word) => grain.adjectivesBanned.has(word))
  if (boastful !== undefined) return `"${name}": the self-praise "${boastful}" carries no meaning in a name`
  return null
}

function findVerbFault(name: string): string | null {
  const [verb] = splitWords(name)
  if (verb === undefined || grain.verbs.has(verb)) return null
  // why: предикат называется булевым префиксом, а не глаголом — is_ready, has_cover
  if (grain.boolPrefixes.includes(verb)) return null
  if (grain.verbsBanned.has(verb)) {
    return `the verb "${verb}" is banned — ${grain.verbReplacements[verb] ?? 'name the actual action'}`
  }
  return `"${verb}" is not in the GRAIN verb lexicon — see grain.synx`
}

function findBindingFault(name: string, kind: string | undefined, value: string): string | null {
  const words = splitWords(name)
  const first = words[0]
  const last = words[words.length - 1]
  const isBoolean = kind === 'bool' || value.startsWith('true') || value.startsWith('false')
  if (isBoolean && first !== undefined && !grain.boolPrefixes.includes(first)) {
    return `boolean "${name}" needs a prefix: ${grain.boolPrefixes.join('/')}`
  }
  const isNumber = (kind !== undefined && numberType.test(kind)) || numberValue.test(value.trim())
  const knownUnit = new Set([...grain.units].map((unit) => unit.toLowerCase()))
  if (!isNumber || name.length <= 2) return null
  if (last === undefined || knownUnit.has(last) || grain.unitsExempt.has(last)) return null
  return `"${name}" is a number without a unit (${[...grain.units].slice(0, 6).join(', ')}, …)`
}

/** Rust: словарь глаголов, булевы префиксы, единицы, пустые имена. */
export function listRustFindings(file: string, source: string): Finding[] {
  const findings: Finding[] = []
  source.split('\n').forEach((line, index) => {
    const place: [string, number] = [file, index + 1]
    const declared = functionLine.exec(line)
    if (declared !== null && !traitNames.has(declared[1] ?? '')) {
      const name = declared[1] ?? ''
      const verbFault = findVerbFault(name)
      if (verbFault !== null) findings.push(makeFinding(place, 'verb-lexicon', verbFault))
      const nameFault = findNameFault(name)
      if (nameFault !== null) findings.push(makeFinding(place, 'no-vague-name', nameFault))
    }
    const bound = bindingLine.exec(line)
    if (bound === null) return
    const fault = findBindingFault(bound[1] ?? '', bound[2], bound[3] ?? '')
    if (fault !== null) findings.push(makeFinding(place, 'naming', fault))
    const nameFault = findNameFault(bound[1] ?? '')
    if (nameFault !== null) findings.push(makeFinding(place, 'no-vague-name', nameFault))
  })
  return findings
}
