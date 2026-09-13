import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// why: собственный ридер вместо @aperturesyndicate/synx-format — чекер обязан
// работать без единой зависимости, а нужный здесь диалект SYNX это `key value...`.
function parseSynx(text) {
  const entries = new Map()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const cut = trimmed.indexOf(' ')
    if (cut === -1) {
      entries.set(trimmed, [])
      continue
    }
    const key = trimmed.slice(0, cut)
    const rest = trimmed.slice(cut + 1).trim()
    const previous = entries.get(key) ?? []
    entries.set(key, [...previous, ...rest.split(/\s+/)])
  }
  return entries
}

/** Корень проекта: верх git-репозитория, а без git — текущий каталог. */
function findProjectRoot() {
  if (process.env.GRAIN_ROOT !== undefined) return resolve(process.env.GRAIN_ROOT)
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return process.cwd()
  }
}

const here = dirname(fileURLToPath(import.meta.url))
const defaultsFile = resolve(here, '..', 'grain.synx')
const projectRoot = findProjectRoot()
const projectFile = resolve(process.env.GRAIN_CONFIG ?? join(projectRoot, 'grain.synx'))

// why: проект переопределяет ключ целиком, а не дописывает: иначе нельзя ни сузить
// список, ни очистить его. Версия и имя стандарта принадлежат пакету.
const owned = new Set(['standard', 'version'])

function readEntries() {
  const entries = parseSynx(readFileSync(defaultsFile, 'utf-8'))
  if (projectFile === defaultsFile || !existsSync(projectFile)) return entries
  for (const [key, value] of parseSynx(readFileSync(projectFile, 'utf-8'))) {
    if (!owned.has(key)) entries.set(key, value)
  }
  return entries
}

const entries = readEntries()

function readList(key) {
  const value = entries.get(key)
  if (value === undefined) throw new Error(`grain.synx: missing key ${key}`)
  return value
}

function readNumber(key) {
  const [first] = readList(key)
  const parsed = Number(first)
  if (Number.isNaN(parsed)) throw new Error(`grain.synx: ${key} is not a number`)
  return parsed
}

const verbGroups = [
  'verbs_query',
  'verbs_io',
  'verbs_store',
  'verbs_build',
  'verbs_transform',
  'verbs_mutate',
  'verbs_state',
  'verbs_signal',
  'verbs_life',
  'verbs_ui',
]

/** Чем заменить запрещённый глагол — подсказка в тексте ошибки. */
const verbReplacements = {
  handle: 'name the action: submitLogin, retryPayout',
  process: 'derive / apply / the transform verb that fits',
  manage: 'split into concrete actions',
  do: 'name the action',
  perform: 'name the action',
  execute: 'apply / start',
  check: 'is* for an answer, assert* for an invariant',
  init: 'start (a process) / make (a value)',
  update: 'save / apply / set',
  fetch: 'read (I/O) / load (an aggregate)',
  retrieve: 'get / find',
  calculate: 'derive',
  compute: 'derive',
  generate: 'make',
  build: 'make',
  setup: 'ensure / start',
  validate: 'assert (throws) / parse (returns the parsed value)',
  transform: 'derive / format',
  convert: 'format / encode',
  prepare: 'make',
  determine: 'resolve',
  deal: 'name the action',
  run: 'start / apply',
  trigger: 'emit / send',
}

export const grain = {
  projectRoot,
  configFile: existsSync(projectFile) ? projectFile : null,
  version: readList('version')[0],
  verbs: new Set(verbGroups.flatMap(readList)),
  verbGroups: Object.fromEntries(verbGroups.map((key) => [key, readList(key)])),
  verbsBanned: new Set(readList('verbs_banned')),
  eventVerbs: new Set(readList('event_verbs')),
  verbReplacements,
  units: new Set([
    ...readList('units_time'),
    ...readList('units_size'),
    ...readList('units_money'),
    ...readList('units_ratio'),
    ...readList('units_count'),
    ...readList('units_domain'),
  ]),
  unitsExempt: new Set(readList('units_exempt')),
  unitsForeign: new Set(readList('units_foreign')),
  boolPrefixes: readList('bool_prefixes'),
  nounsBanned: new Set(readList('nouns_banned')),
  abbreviations: new Set(readList('abbreviations')),
  adjectivesBanned: new Set(readList('adjectives_banned')),
  fileRoles: new Set(readList('file_roles')),
  filesBanned: new Set(readList('files_banned')),
  filesFramework: new Set(readList('files_framework')),
  filePublic: readList('file_public')[0],
  dirsBanned: new Set(readList('dirs_banned')),
  dirsFramework: new Set(readList('dirs_framework')),
  commentTags: readList('comment_tags'),
  commentEscape: readList('comment_escape')[0],
  maxNesting: readNumber('max_nesting'),
  maxParams: readNumber('max_params'),
  maxFunctionLines: readNumber('max_function_lines'),
  maxFileLines: readNumber('max_file_lines'),
  maxDirDepth: readNumber('max_dir_depth'),
  failCodePattern: new RegExp(readList('fail_code_pattern')[0]),
  adopt: readList('adopt'),
  pathsIgnored: readList('paths_ignored'),
  filesChecked: readList('files_checked'),
  synxConfig: new Set(readList('synx_config')),
  level: readNumber('level'),
  docsUrl: readList('docs_url')[0],
  badgeUrl: readList('badge_url')[0],
  levelRules: { 1: readList('level_1'), 2: readList('level_2') },
  rolesBoundary: new Set(readList('roles_boundary')),
  importsAllowed: new Map(
    readList('imports_allowed').map((pair) => {
      const [role, allowed] = pair.split('=')
      return [role, new Set((allowed ?? '').split(','))]
    }),
  ),
  effectsNondeterministic: readList('effects_nondeterministic'),
}

/** Уровень, начиная с которого правило проверяется. L3 добавляет не правила, а гарантию. */
export function findRuleLevel(rule) {
  if (grain.levelRules[1].includes(rule)) return 1
  if (grain.levelRules[2].includes(rule)) return 2
  return null
}

/** Слова идентификатора: camelCase, snake_case и CONSTANT_CASE читаются одинаково. */
export function splitWords(name) {
  const bare = name.replace(/^[_$]+/, '')
  // why: в CONSTANT_CASE заглавная каждая буква — разбор по ним рассыпал бы DEADLINE_MS на буквы
  const shape = /^[A-Z0-9_]+$/.test(bare) ? /_/ : /(?=[A-Z])|_/
  return bare
    .split(shape)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase())
}

/** Карта «сокращение → целое слово» из grain.synx. */
export const abbrevFix = new Map(
  readList('abbrev_fix').map((pair) => {
    const [short, full] = pair.split('=')
    return [short, full]
  }),
)
