import { grain } from '../vocabulary.js'

const emoji = /\p{Extended_Pictographic}/u
const divider = /^[\s*]*[-=*_~#]{4,}\s*$/
const stepNumbering = /^\s*(шаг|step)\s*\d+\s*[:.)]/i
const toolingDirective = /^\s*(eslint-|@ts-|prettier-|biome-|c8 |istanbul |global |#!)/
const tagged = new RegExp(`^\\s*(${grain.commentTags.join('|')}):\\s+\\S`)
const escapeHatch = new RegExp(`^\\s*${grain.commentEscape}\\s+\\S+\\s+—\\s+\\S`)
const leftover = /^\s*(todo|fixme|hack|xxx|note)\b/i

export const commentForm = {
  meta: {
    type: 'problem',
    docs: { description: 'A comment answers "why" and carries a tag' },
    schema: [],
    messages: {
      untagged:
        'GRAIN: comment without a tag. Allowed: {{tags}}. If it retells the code — delete it.',
      leftover: 'GRAIN: "{{word}}" is not a comment but unfinished work. Finish it or file a task.',
      divider: 'GRAIN: ASCII dividers do not structure code — splitting into files does.',
      steps: 'GRAIN: numbered steps retell the control flow. Delete them.',
      emoji: 'GRAIN: emoji in a comment.',
      block: 'GRAIN: a block comment is allowed only as JSDoc above an export. Commented-out code — delete it.',
      escape: 'GRAIN: the escape form is {{escape}} <rule> — <reason>. The reason is mandatory.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      Program() {
        let continuedLine = -1
        for (const comment of sourceCode.getAllComments()) {
          // why: shebang приходит отдельным типом и без решётки — это не комментарий автора
          if (comment.type === 'Shebang') continue
          const text = comment.value
          const isContinuation = comment.loc.start.line === continuedLine
          continuedLine = comment.loc.end.line + 1
          if (emoji.test(text)) {
            context.report({ node: comment, messageId: 'emoji' })
            continue
          }
          if (divider.test(text)) {
            context.report({ node: comment, messageId: 'divider' })
            continue
          }
          if (comment.type === 'Block') {
            if (!text.startsWith('*')) context.report({ node: comment, messageId: 'block' })
            continue
          }
          if (toolingDirective.test(text)) continue
          if (text.trimStart().startsWith(grain.commentEscape)) {
            if (!escapeHatch.test(text)) {
              context.report({
                node: comment,
                messageId: 'escape',
                data: { escape: grain.commentEscape },
              })
            }
            continue
          }
          if (leftover.test(text)) {
            const [word] = text.trim().split(/\s|:/)
            context.report({ node: comment, messageId: 'leftover', data: { word } })
            continue
          }
          if (stepNumbering.test(text)) {
            context.report({ node: comment, messageId: 'steps' })
            continue
          }
          // why: вторая и следующие строки одного тегированного комментария тег не повторяют
          if (tagged.test(text) || isContinuation) continue
          context.report({
            node: comment,
            messageId: 'untagged',
            data: { tags: grain.commentTags.map((tag) => `${tag}:`).join(' ') },
          })
        }
      },
    }
  },
}

const loggerCall = /^(console|logger|log)$/

export const noEmojiLog = {
  meta: {
    type: 'problem',
    docs: { description: 'Logs without emoji' },
    schema: [],
    messages: { emoji: 'GRAIN: emoji in a log line. Logs are read by grep, not by a person.' },
  },
  create(context) {
    const sourceCode = context.sourceCode
    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression') return
        const root = callee.object
        if (root.type !== 'Identifier' || !loggerCall.test(root.name)) return
        for (const argument of node.arguments) {
          if (emoji.test(sourceCode.getText(argument))) {
            context.report({ node: argument, messageId: 'emoji' })
          }
        }
      },
    }
  },
}
