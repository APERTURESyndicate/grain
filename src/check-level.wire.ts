import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { grain } from './vocabulary.js'
import { isIgnoredPath } from './check-path.pure.ts'
import { makeFinding, type Finding } from './finding.shape.ts'

const isAdopted = (file: string) =>
  grain.adopt.length === 0 || grain.adopt.some((prefix: string) => file.startsWith(prefix))

const isRunningGrain = (file: string) => existsSync(file) && readFileSync(file, 'utf-8').includes('grain')

function findConfiguredHooksDir(): string | null {
  try {
    const wired = execFileSync('git', ['config', 'core.hooksPath'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return wired === '' ? null : wired
  } catch {
    return null
  }
}

/** Каталог, в котором лежит pre-commit с запуском grain: свой, husky или локальный. */
function findHookDir(): string | null {
  const candidates = [findConfiguredHooksDir(), '.githooks', '.husky', '.git/hooks'].filter(
    (dir): dir is string => dir !== null,
  )
  return candidates.find((dir) => isRunningGrain(join(dir, 'pre-commit'))) ?? null
}

function findHookFault(): string | null {
  if (findHookDir() !== null) return null
  return 'no pre-commit runs grain (.githooks, .husky or core.hooksPath) — nothing stops a commit'
}

// why: файл хука в репозитории ничего не гарантирует — git его не увидит, пока
// клон не переключён на этот каталог; именно так проверка и не работала однажды
function findWiringFault(): string | null {
  if (process.env.CI !== undefined) return null
  const dir = findHookDir()
  if (dir === null || dir === '.git/hooks') return null
  const wired = findConfiguredHooksDir()
  if (wired === dir) return null
  return `the hook lives in ${dir} but git looks in ${wired ?? '.git/hooks'} — git config core.hooksPath ${dir}`
}

function findCiFault(): string | null {
  const flows = '.github/workflows'
  const isGithub =
    existsSync(flows) && readdirSync(flows).some((file) => isRunningGrain(join(flows, file)))
  const isGitlab = isRunningGrain('.gitlab-ci.yml')
  if (isGithub || isGitlab) return null
  return 'no workflow (.github/workflows, .gitlab-ci.yml) runs grain — there is no check in CI'
}

const checked = new RegExp(`\\.(${grain.filesChecked.join('|')})$`)

/** Первый сегмент пути, у монорепо — юнит вида apps/<svc>. */
function getUnit(file: string): string {
  const parts = file.split('/')
  const root = parts[0] ?? file
  return (root === 'apps' || root === 'packages') && parts.length > 2
    ? parts.slice(0, 2).join('/')
    : root
}

function listAdoptFaults(files: string[]): string[] {
  const missed = [
    ...new Set(
      files
        .filter((file) => checked.test(file) && !isIgnoredPath(file) && !isAdopted(file))
        .map(getUnit),
    ),
  ]
  if (missed.length === 0) return []
  const shown = missed.slice(0, 5).join(', ')
  const rest = missed.length > 5 ? ` and ${String(missed.length - 5)} more` : ''
  return [`outside the adoption list: ${shown}${rest}`]
}

/**
 * L3 отличается от L2 не правилами, а гарантией: хук, CI и полный охват.
 * Проверяем именно её — объявленный уровень должен быть заслужен, а не написан.
 */
export function listLevelFaults(level: number, files: string[]): Finding[] {
  if (level < 3) return []
  const faults = [findHookFault(), findWiringFault(), findCiFault(), ...listAdoptFaults(files)].filter(
    (fault): fault is string => fault !== null,
  )
  return faults.map((fault) => makeFinding(['grain.synx', 1], 'level-honesty', fault))
}
