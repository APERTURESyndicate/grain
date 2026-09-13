import { abbrevFix, grain, splitWords } from '../vocabulary.js'

const isPascalCase = (name) => /^[A-Z]/.test(name)
const isConstantCase = (name) => /^[A-Z0-9_]+$/.test(name)
const isBooleanAnswer = (text) => /\bboolean\b/.test(text) || /\bis\b/.test(text)

/** Имя объявляемой функции и сам узел функции, если узел объявляет функцию. */
function readFunctionName(node) {
  if (node.type === 'FunctionDeclaration' || node.type === 'TSDeclareFunction') {
    return node.id === null ? null : { name: node.id.name, target: node.id, shape: node }
  }
  if (node.type === 'VariableDeclarator') {
    const kind = node.init?.type
    if (kind !== 'ArrowFunctionExpression' && kind !== 'FunctionExpression') return null
    return node.id.type === 'Identifier'
      ? { name: node.id.name, target: node.id, shape: node.init }
      : null
  }
  if (node.type === 'MethodDefinition' || node.type === 'TSAbstractMethodDefinition') {
    if (node.kind !== 'method' || node.key.type !== 'Identifier') return null
    return { name: node.key.name, target: node.key, shape: node.value }
  }
  return null
}

export const verbLexicon = {
  meta: {
    type: 'problem',
    docs: { description: 'Имя функции начинается с глагола из словаря GRAIN' },
    schema: [],
    messages: {
      banned: 'GRAIN: глагол "{{verb}}" запрещён — {{fix}}.',
      unknown:
        'GRAIN: "{{verb}}" не из словаря глаголов. Разрешены: {{sample}} (полный список — grain.synx).',
      answer:
        'GRAIN: "{{name}}" обещает ответ да/нет, а возвращает {{returned}}. Префикс {{prefixes}} — только у булевых.',
    },
  },
  create(context) {
    const sample = [...grain.verbGroups.verbs_query, ...grain.verbGroups.verbs_build].join(', ')
    const prefixes = grain.boolPrefixes.join('/')
    const sourceCode = context.sourceCode
    // why: стандарт сам предписывает is*/has* вместо check* — предикат называется префиксом,
    // а не глаголом, и обязан отвечать булевым
    const reportAnswer = (found, name) => {
      const returned = found.shape?.returnType?.typeAnnotation
      if (returned === undefined || returned === null) return
      const text = sourceCode.getText(returned)
      if (isBooleanAnswer(text)) return
      context.report({
        node: found.target,
        messageId: 'answer',
        data: { name, returned: text, prefixes },
      })
    }
    const check = (node) => {
      const found = readFunctionName(node)
      if (found === null) return
      // why: PascalCase — компонент или класс, это существительное по определению
      if (isPascalCase(found.name) || isConstantCase(found.name)) return
      const [verb] = splitWords(found.name)
      if (verb === undefined) return
      if (grain.boolPrefixes.includes(verb)) {
        reportAnswer(found, found.name)
        return
      }
      if (grain.verbs.has(verb)) return
      if (grain.verbsBanned.has(verb)) {
        const fix = grain.verbReplacements[verb] ?? 'назови действие по существу'
        context.report({ node: found.target, messageId: 'banned', data: { verb, fix } })
        return
      }
      context.report({ node: found.target, messageId: 'unknown', data: { verb, sample } })
    }
    return {
      FunctionDeclaration: check,
      TSDeclareFunction: check,
      VariableDeclarator: check,
      MethodDefinition: check,
    }
  },
}

export const booleanPrefix = {
  meta: {
    type: 'problem',
    docs: { description: 'Булево имя начинается с is/has/can/should/was/will/must' },
    schema: [],
    messages: {
      prefix: 'GRAIN: булево "{{name}}" — нужен префикс {{prefixes}}.',
    },
  },
  create(context) {
    const prefixes = grain.boolPrefixes
    const looksBoolean = (init, annotation) => {
      if (annotation?.typeAnnotation?.type === 'TSBooleanKeyword') return true
      if (init === null || init === undefined) return false
      if (init.type === 'Literal' && typeof init.value === 'boolean') return true
      if (init.type === 'UnaryExpression' && init.operator === '!') return true
      if (init.type === 'BinaryExpression') {
        return ['===', '!==', '==', '!=', '<', '>', '<=', '>='].includes(init.operator)
      }
      return false
    }
    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier') return
        if (!looksBoolean(node.init, node.id.typeAnnotation)) return
        const [first] = splitWords(node.id.name)
        if (prefixes.includes(first)) return
        context.report({
          node: node.id,
          messageId: 'prefix',
          data: { name: node.id.name, prefixes: prefixes.join('/') },
        })
      },
      PropertyDefinition(node) {
        if (node.key.type !== 'Identifier') return
        if (!looksBoolean(node.value, node.typeAnnotation)) return
        const [first] = splitWords(node.key.name)
        if (prefixes.includes(first)) return
        context.report({
          node: node.key,
          messageId: 'prefix',
          data: { name: node.key.name, prefixes: prefixes.join('/') },
        })
      },
    }
  },
}

export const noVagueName = {
  meta: {
    type: 'problem',
    docs: { description: 'Имя не заканчивается словом-пустышкой' },
    schema: [],
    messages: {
      vague: 'GRAIN: "{{name}}" — слово "{{word}}" ничего не сообщает. Назови по домену.',
      adjective: 'GRAIN: "{{name}}" — самопохвала "{{word}}" в имени не несёт смысла.',
      abbrev: 'GRAIN: "{{name}}" — пиши "{{full}}" вместо "{{word}}".',
    },
  },
  create(context) {
    const report = (target, name) => {
      const words = splitWords(name)
      if (words.length === 0) return
      const last = words[words.length - 1]
      if (grain.nounsBanned.has(last)) {
        context.report({ node: target, messageId: 'vague', data: { name, word: last } })
        return
      }
      for (const word of words) {
        if (grain.adjectivesBanned.has(word)) {
          context.report({ node: target, messageId: 'adjective', data: { name, word } })
          return
        }
        const full = abbrevFix.get(word)
        if (full !== undefined) {
          context.report({ node: target, messageId: 'abbrev', data: { name, word, full } })
          return
        }
      }
    }
    const checkPattern = (node) => {
      if (node.type === 'Identifier') report(node, node.name)
      if (node.type === 'ObjectPattern' || node.type === 'ArrayPattern') return
      if (node.type === 'AssignmentPattern') checkPattern(node.left)
      if (node.type === 'RestElement') checkPattern(node.argument)
    }
    return {
      VariableDeclarator(node) {
        checkPattern(node.id)
      },
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression'(node) {
        for (const parameter of node.params) checkPattern(parameter)
      },
      PropertyDefinition(node) {
        if (node.key.type === 'Identifier' && !node.computed) report(node.key, node.key.name)
      },
      TSPropertySignature(node) {
        if (node.key.type === 'Identifier' && !node.computed) report(node.key, node.key.name)
      },
    }
  },
}
