import { basename } from 'node:path'
import { makeFinding, type Finding } from './finding.shape.ts'

const exported = /^export\s+(?:async\s+)?(?:function|const|let|class|type|interface|enum)\s+([A-Za-z0-9_]+)/
const consumed = /\.(entry|route|rpc|job)\.tsx?$/
const skipped = /\.(test|spec|d)\.tsx?$/

/** Экспорты файла с номерами строк. */
function listExports(source: string): [string, number][] {
  const found: [string, number][] = []
  source.split('\n').forEach((line, index) => {
    const match = exported.exec(line)
    if (match !== null) found.push([match[1] ?? '', index + 1])
  })
  return found
}

const isEntryPoint = (file: string) => {
  const name = basename(file)
  return consumed.test(name) || name.startsWith('public.') || skipped.test(name)
}

// perf: имена всех файлов собираются в индекс один раз — прежний обход гонял
// отдельную регулярку по каждому файлу на каждый экспорт, то есть n²
function makeWordIndex(sources: Map<string, string>): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  for (const [file, source] of sources) {
    for (const word of source.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
      const seen = index.get(word) ?? new Set<string>()
      seen.add(file)
      index.set(word, seen)
    }
  }
  return index
}

const isMentionedElsewhere = (seen: Set<string> | undefined, file: string) =>
  seen !== undefined && [...seen].some((other) => other !== file)

/**
 * Экспорт, которого никто не упоминает. Проверка честна только в пределах
 * переданного набора файлов: имя, вызываемое из другого репозитория или
 * динамически, здесь неотличимо от мёртвого.
 */
export function listDeadExports(sources: Map<string, string>): Finding[] {
  const index = makeWordIndex(sources)
  const findings: Finding[] = []
  for (const [file, source] of sources) {
    if (isEntryPoint(file)) continue
    for (const [name, line] of listExports(source)) {
      if (isMentionedElsewhere(index.get(name), file)) continue
      findings.push(
        makeFinding(
          [file, line],
          'no-dead-export',
          `"${name}" не упоминается больше нигде — удали или не экспортируй (git помнит)`,
        ),
      )
    }
  }
  return findings
}
