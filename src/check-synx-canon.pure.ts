import { grain } from './vocabulary.js'
import { makeFinding, type Finding } from './finding.shape.ts'

const declared = /^(\s*)([a-z_][a-z0-9_]*)(\[[^\]]*\])?(:[^\s]*)?(?:\s+([A-Z][A-Z0-9_]*))?\s*$/

type Reading = { file: string; line: number; path: string }

/** Путь ключа в конфиге: секции по отступу плюс само имя — redis.url, а не url. */
function listReadings(file: string, source: string): [string, Reading][] {
  const found: [string, Reading][] = []
  const sections: [number, string][] = []
  source.split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#') || trimmed.startsWith('!')) return
    const parsed = declared.exec(line)
    if (parsed === null) return
    const depth = (parsed[1] ?? '').length
    const key = parsed[2] ?? ''
    while (sections.length > 0 && (sections[sections.length - 1]?.[0] ?? 0) >= depth) sections.pop()
    const path = [...sections.map(([, name]) => name), key].join('.')
    const env = parsed[5]
    if (env === undefined) {
      sections.push([depth, key])
      return
    }
    if ((parsed[4] ?? '').includes(':env')) found.push([env, { file, line: index + 1, path }])
  })
  return found
}

const isConfig = (file: string) => grain.synxConfig.has(file.split(/[\/]/).pop() ?? file)

/**
 * Одно и то же значение платформы должно читаться под одним именем во всех
 * сервисах. Иначе `INTERNAL_API_SECRET` живёт как `internal_api_secret` в одном
 * конфиге, `internal_secret` во втором и `auth.secret` в третьем — и человек,
 * пришедший в новый сервис, ищет то, что у него уже было.
 */
export function listSynxCanonFindings(sources: Map<string, string>): Finding[] {
  const byEnv = new Map<string, Reading[]>()
  for (const [file, source] of sources) {
    if (!isConfig(file)) continue
    for (const [env, reading] of listReadings(file, source)) {
      byEnv.set(env, [...(byEnv.get(env) ?? []), reading])
    }
  }
  const findings: Finding[] = []
  for (const [env, readings] of byEnv) {
    const paths = [...new Set(readings.map((reading) => reading.path))]
    if (paths.length < 2) continue
    const counted = new Map<string, number>()
    for (const reading of readings) counted.set(reading.path, (counted.get(reading.path) ?? 0) + 1)
    const [common] = [...counted].sort((one, other) => other[1] - one[1])
    for (const reading of readings) {
      if (reading.path === common?.[0]) continue
      findings.push(
        makeFinding(
          [reading.file, reading.line],
          'synx-canon',
          `${env} is read as "${reading.path}" here and as "${String(common?.[0])}" elsewhere. One platform value — one name everywhere`,
        ),
      )
    }
  }
  return findings
}
