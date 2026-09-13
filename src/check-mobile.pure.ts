import { abbrevFix, grain, splitWords } from './vocabulary.js'
import { makeFinding, type Finding } from './finding.shape.ts'

// why: имена жизненного цикла платформы — Android и UIKit зовут их сами,
// переименовать нельзя; @Composable и SwiftUI-вью — существительные, как компоненты
const platformNames = new Set([
  'main', 'onCreate', 'onStart', 'onResume', 'onPause', 'onStop', 'onDestroy', 'onBind',
  'onStartCommand', 'onTaskRemoved', 'onReceive', 'onBackPressed', 'onNewIntent',
  'onConfigurationChanged', 'onRequestPermissionsResult', 'onActivityResult', 'onCleared',
  'viewDidLoad', 'viewWillAppear', 'viewDidAppear', 'viewWillDisappear', 'application',
  'makeUIView', 'updateUIView', 'makeCoordinator', 'body', 'toString', 'equals', 'hashCode',
])

const declaredFunction = /^\s*(?:@\w+\s+)*(?:(?:public|private|internal|protected|open|final|override|suspend|inline|operator|static|class|convenience|@objc|@MainActor|nonisolated|mutating)\s+)*(?:fun|func)\s+([A-Za-z_][A-Za-z0-9_]*)/
// why: имя переопределения диктует супертип (Modifier.Node.onAttach, ModifierNodeElement.update) —
// автор его не выбирал и переименовать не может
const overridden = /^\s*(?:@\w+\s+)*(?:\w+\s+)*override\s+(?:\w+\s+)*(?:fun|func)\s/
// why: `remember*` — идиома Compose для значения, переживающего рекомпозицию; это UI-хук,
// как `use*` в React, и словарь глаголов его не покрывает
const composeHook = /^remember[A-Z]/
const declaredValue = /^\s*(?:(?:public|private|internal|protected|open|final|override|lateinit|static|@State|@Published)\s+)*(?:val|var|let)\s+([a-z_][A-Za-z0-9_]*)\s*(?::\s*([A-Za-z0-9_<>.?]+))?\s*=?\s*(.*)$/
const numberType = /^(Int|Int8|Int16|Int32|Int64|UInt|UInt8|UInt16|UInt32|UInt64|Long|Short|Byte|Float|Double|CGFloat|TimeInterval|Duration)\??$/
const booleanType = /^(Boolean|Bool)\??$/
const numberValue = /^-?\d[\d_]*(\.\d+)?[fLdD]?\s*$/

function findNameFault(name: string): string | null {
  const words = splitWords(name)
  const last = words[words.length - 1]
  if (last !== undefined && grain.nounsBanned.has(last)) {
    return `"${name}": слово "${last}" ничего не сообщает — назови по домену`
  }
  const short = words.find((word) => abbrevFix.has(word))
  if (short !== undefined) return `"${name}": пиши "${abbrevFix.get(short) ?? ''}" вместо "${short}"`
  const boastful = words.find((word) => grain.adjectivesBanned.has(word))
  if (boastful !== undefined) return `"${name}": самопохвала "${boastful}" в имени не несёт смысла`
  return null
}

function findVerbFault(name: string): string | null {
  const [verb] = splitWords(name)
  if (verb === undefined || grain.verbs.has(verb) || grain.boolPrefixes.includes(verb)) return null
  if (grain.verbsBanned.has(verb)) {
    return `глагол "${verb}" запрещён — ${grain.verbReplacements[verb] ?? 'назови действие по существу'}`
  }
  return `"${verb}" не из словаря глаголов GRAIN — см. grain.synx`
}

function findValueFault(name: string, kind: string | undefined, value: string): string | null {
  const words = splitWords(name)
  const first = words[0]
  const last = words[words.length - 1]
  const isBoolean =
    (kind !== undefined && booleanType.test(kind)) ||
    value.startsWith('true') ||
    value.startsWith('false')
  if (isBoolean && first !== undefined && !grain.boolPrefixes.includes(first)) {
    return `булево "${name}" — нужен префикс ${grain.boolPrefixes.join('/')}`
  }
  const isNumber = (kind !== undefined && numberType.test(kind)) || numberValue.test(value)
  if (!isNumber || name.length <= 2) return null
  const units = new Set([...grain.units].map((unit) => unit.toLowerCase()))
  if (last === undefined || units.has(last) || grain.unitsExempt.has(last)) return null
  return `"${name}" — число без единицы (${[...grain.units].slice(0, 6).join(', ')}, …)`
}

/** Kotlin и Swift: тот же словарь глаголов, булевы префиксы, единицы, пустые имена. */
export function listMobileFindings(file: string, source: string): Finding[] {
  const findings: Finding[] = []
  source.split('\n').forEach((line, index) => {
    const place: [string, number] = [file, index + 1]
    const declared = declaredFunction.exec(line)
    const name = declared?.[1]
    if (name !== undefined && !platformNames.has(name) && !/^[A-Z]/.test(name)) {
      const isNameDictated = overridden.test(line) || composeHook.test(name)
      const verbFault = isNameDictated ? null : findVerbFault(name)
      if (verbFault !== null) findings.push(makeFinding(place, 'verb-lexicon', verbFault))
      const nameFault = findNameFault(name)
      if (nameFault !== null) findings.push(makeFinding(place, 'no-vague-name', nameFault))
    }
    const bound = declaredValue.exec(line)
    if (bound === null) return
    const fault = findValueFault(bound[1] ?? '', bound[2], (bound[3] ?? '').trim())
    if (fault !== null) findings.push(makeFinding(place, 'naming', fault))
    const nameFault = findNameFault(bound[1] ?? '')
    if (nameFault !== null) findings.push(makeFinding(place, 'no-vague-name', nameFault))
  })
  return findings
}
