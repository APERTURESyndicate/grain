import { grain } from './vocabulary.js'
import { makeFinding, type Finding } from './finding.shape.ts'

const emoji = /\p{Extended_Pictographic}/u
const divider = /^[-=*_~#]{4,}$/
const leftover = /^(todo|fixme|hack|xxx)\b/i
const tooling = /^(eslint-|@ts-|prettier-|biome-|clippy|allow\(|noqa|#!)/

const tagged = new RegExp(`^(${grain.commentTags.join('|')}):\\s+\\S`)
const escapeHatch = new RegExp(`^${grain.commentEscape}\\s+\\S+\\s+—\\s+\\S`)

function findCommentFault(body: string, isContinuation: boolean): string | null {
  if (emoji.test(body)) return 'emoji in a comment'
  if (divider.test(body)) return 'ASCII divider: structure comes from splitting into files'
  if (tooling.test(body) || body === '') return null
  if (body.startsWith(grain.commentEscape)) {
    return escapeHatch.test(body) ? null : `form: ${grain.commentEscape} <rule> — <reason>`
  }
  if (leftover.test(body)) return 'unfinished work instead of a comment: finish it or file a task'
  if (tagged.test(body) || isContinuation) return null
  return `comment without a tag (${grain.commentTags.map((tag) => `${tag}:`).join(' ')}) — or it retells the code`
}

function isInsideLiteral(before: string): boolean {
  return ['"', "'", '`'].some((quote) => (before.split(quote).length - 1) % 2 === 1)
}

/** Общие для всех языков проверки: комментарии, эмодзи, длина файла. */
export function listTextFindings(file: string, source: string, commentMark: string): Finding[] {
  const findings: Finding[] = []
  const lines = source.split('\n')
  let continuedLine = -1
  lines.forEach((line, index) => {
    const cut = line.indexOf(commentMark)
    if (cut === -1) return
    // why: отсечь совпадение внутри строкового литерала — грубо, но без парсера иначе никак
    if (isInsideLiteral(line.slice(0, cut))) return
    const isContinuation = index === continuedLine
    const fault = findCommentFault(line.slice(cut + commentMark.length).trim(), isContinuation)
    continuedLine = index + 1
    if (fault !== null) findings.push(makeFinding([file, index + 1], 'comment-form', fault))
  })
  if (lines.length > grain.maxFileLines) {
    findings.push(
      makeFinding(
        [file, lines.length],
        'max-lines',
        `${String(lines.length)} lines against a limit of ${String(grain.maxFileLines)} — the file holds more than one role`,
      ),
    )
  }
  return findings
}
