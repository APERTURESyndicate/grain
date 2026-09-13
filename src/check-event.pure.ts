import { grain, splitWords } from './vocabulary.js'
import { makeFinding, type Finding } from './finding.shape.ts'

// why: за "v1." прячутся и номера версий ("v1.2.3"), и префиксы подписки
// ("v1.billing.", "v1.user.>") — сабджект это версия, домен и что произошло
const subjectLiteral = /['"`](v\d+(?:\.[a-z][A-Za-z0-9]*){2,})['"`]/g

function findSubjectFault(subject: string): string | null {
  const parts = subject.split('.')
  const tail = parts[parts.length - 1] ?? ''
  const words = splitWords(tail)
  const last = words[words.length - 1] ?? tail
  if (grain.eventVerbs.has(last)) return null
  return `"${subject}": "${tail}" — an event is named as an accomplished fact (${[...grain.eventVerbs]
    .slice(0, 6)
    .join(', ')}, …), not as a command or a noun`
}

/** Имена событий шины: закрытый словарь причастий, как и словарь глаголов в коде. */
export function listEventFindings(file: string, source: string): Finding[] {
  const findings: Finding[] = []
  source.split('\n').forEach((line, index) => {
    for (const found of line.matchAll(subjectLiteral)) {
      const fault = findSubjectFault(found[1] ?? '')
      if (fault !== null) findings.push(makeFinding([file, index + 1], 'event-subject', fault))
    }
  })
  return findings
}
