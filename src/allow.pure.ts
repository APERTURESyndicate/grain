import { grain } from './vocabulary.js'
import { type Finding } from './finding.shape.ts'

const escape = new RegExp(`${grain.commentEscape}\\s+([a-z-]+)\\s+—`)

/** Строки, на которых правило отключено осознанно: сама строка с escape и следующая за ней. */
function listAllowed(source: string): Set<string> {
  const allowed = new Set<string>()
  source.split('\n').forEach((line, index) => {
    const found = escape.exec(line)
    if (found === null) return
    allowed.add(`${String(index + 1)}:${found[1] ?? ''}`)
    allowed.add(`${String(index + 2)}:${found[1] ?? ''}`)
  })
  return allowed
}

/** Находки за вычетом тех, что прикрыты `grain:allow <правило> — <причина>`. */
export function listUnallowed(findings: Finding[], sources: Map<string, string>): Finding[] {
  const byFile = new Map<string, Set<string>>()
  for (const [file, source] of sources) {
    if (source.includes(grain.commentEscape)) byFile.set(file, listAllowed(source))
  }
  return findings.filter(
    (finding) => !byFile.get(finding.file)?.has(`${String(finding.line)}:${finding.rule}`),
  )
}
