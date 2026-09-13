import { grain, splitWords } from '../vocabulary.js'

/** Текст аннотации возвращаемого типа, включая раскрытый Promise<...>. */
function readReturnType(node, sourceCode) {
  if (node.returnType === undefined || node.returnType === null) return null
  return sourceCode.getText(node.returnType.typeAnnotation)
}

const mentionsNothing = (text) => /\bnull\b|\bundefined\b|\bvoid\b/.test(text)

export const findGetContract = {
  meta: {
    type: 'problem',
    docs: { description: 'find* допускает null, get* — нет' },
    schema: [],
    messages: {
      findNotNullable:
        'GRAIN: find* обязан допускать null в типе. Гарантируешь значение — это get{{tail}}.',
      getNullable:
        'GRAIN: get* обязан гарантировать значение. Может не найтись — это find{{tail}}.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    const check = (node, name) => {
      const [verb, ...rest] = splitWords(name)
      if (verb !== 'find' && verb !== 'get') return
      const returnType = readReturnType(node, sourceCode)
      if (returnType === null) return
      const tail = name.slice(verb.length)
      const nullable = mentionsNothing(returnType)
      if (verb === 'find' && !nullable) {
        context.report({ node, messageId: 'findNotNullable', data: { tail: tail || 'X' } })
      }
      if (verb === 'get' && nullable && rest.length > 0) {
        context.report({ node, messageId: 'getNullable', data: { tail: tail || 'X' } })
      }
    }
    return {
      FunctionDeclaration(node) {
        if (node.id !== null) check(node, node.id.name)
      },
      VariableDeclarator(node) {
        const kind = node.init?.type
        if (kind !== 'ArrowFunctionExpression' && kind !== 'FunctionExpression') return
        if (node.id.type === 'Identifier') check(node.init, node.id.name)
      },
    }
  },
}

export const failCode = {
  meta: {
    type: 'problem',
    docs: { description: 'Код доменной ошибки — домен.предмет.причина' },
    schema: [],
    messages: {
      shape: 'GRAIN: код "{{code}}" не в форме домен.предмет.причина (например auth.token.expired).',
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.computed) return
        const key = node.key.type === 'Identifier' ? node.key.name : node.key.value
        if (key !== 'code' && key !== 'failCode') return
        if (node.value.type !== 'Literal' || typeof node.value.value !== 'string') return
        if (grain.failCodePattern.test(node.value.value)) return
        context.report({ node: node.value, messageId: 'shape', data: { code: node.value.value } })
      },
    }
  },
}

export const catchMustAct = {
  meta: {
    type: 'problem',
    docs: { description: 'catch либо бросает дальше, либо возвращает отказ' },
    schema: [],
    messages: {
      empty: 'GRAIN: пустой catch прячет отказ. Пробрось дальше или верни типизированный отказ.',
      logOnly:
        'GRAIN: catch, который только логирует и продолжает, превращает отказ в тишину. Пробрось или верни отказ.',
    },
  },
  create(context) {
    // why: ветвление само по себе не действие — catch, где `if` только пишет в лог,
    // гасит отказ ровно так же, как пустой
    const isEscaping = (node) => {
      if (node === null || typeof node !== 'object') return false
      if (Array.isArray(node)) return node.some(isEscaping)
      if (node.type === 'ThrowStatement' || node.type === 'ReturnStatement') return true
      if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') return false
      if (node.type === 'ArrowFunctionExpression') return false
      return Object.entries(node).some(
        ([key, child]) => key !== 'parent' && key !== 'loc' && key !== 'range' && isEscaping(child),
      )
    }
    const isAction = (statement) =>
      statement.type === 'ThrowStatement' ||
      statement.type === 'ReturnStatement' ||
      statement.type === 'TryStatement' ||
      ((statement.type === 'IfStatement' || statement.type === 'SwitchStatement') &&
        isEscaping(statement))
    return {
      CatchClause(node) {
        const body = node.body.body
        if (body.length === 0) {
          context.report({ node, messageId: 'empty' })
          return
        }
        if (body.some(isAction)) return
        context.report({ node, messageId: 'logOnly' })
      },
    }
  },
}

export const noRedundantTemp = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Переменная, объявленная только чтобы её вернуть' },
    schema: [],
    fixable: 'code',
    messages: {
      temp: 'GRAIN: "{{name}}" существует одну строку — верни выражение сразу.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    const check = (body) => {
      if (body.length < 2) return
      const beforeLast = body[body.length - 2]
      const last = body[body.length - 1]
      if (last.type !== 'ReturnStatement' || last.argument?.type !== 'Identifier') return
      if (beforeLast.type !== 'VariableDeclaration' || beforeLast.declarations.length !== 1) return
      const [declared] = beforeLast.declarations
      if (declared.id.type !== 'Identifier' || declared.id.name !== last.argument.name) return
      if (declared.init === null) return
      context.report({
        node: beforeLast,
        messageId: 'temp',
        data: { name: declared.id.name },
        fix: (fixer) =>
          fixer.replaceTextRange(
            [beforeLast.range[0], last.range[1]],
            `return ${sourceCode.getText(declared.init)}`,
          ),
      })
    }
    return {
      BlockStatement(node) {
        check(node.body)
      },
    }
  },
}

export const noDefaultExport = {
  meta: {
    type: 'problem',
    docs: { description: 'Только именованные экспорты' },
    schema: [],
    messages: {
      named: 'GRAIN: только именованные экспорты — имя должно быть одинаковым на обоих концах.',
    },
  },
  create(context) {
    return {
      ExportDefaultDeclaration(node) {
        context.report({ node, messageId: 'named' })
      },
    }
  },
}
