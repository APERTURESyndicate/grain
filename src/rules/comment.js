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
    docs: { description: 'Комментарий отвечает «почему» и несёт тег' },
    schema: [],
    messages: {
      untagged:
        'GRAIN: комментарий без тега. Разрешено: {{tags}}. Если он пересказывает код — удали.',
      leftover: 'GRAIN: «{{word}}» — это не комментарий, а незаконченная работа. Доделай или заведи задачу.',
      divider: 'GRAIN: ASCII-разделители не структурируют код — структурирует разбиение на файлы.',
      steps: 'GRAIN: нумерация шагов пересказывает поток управления. Удали.',
      emoji: 'GRAIN: эмодзи в комментарии.',
      block: 'GRAIN: блочный комментарий разрешён только как JSDoc над экспортом. Закомментированный код — удали.',
      escape: 'GRAIN: форма escape — {{escape}} <правило> — <причина>. Причина обязательна.',
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
    docs: { description: 'Логи без эмодзи' },
    schema: [],
    messages: { emoji: 'GRAIN: эмодзи в логе. Лог читает grep, а не человек.' },
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
