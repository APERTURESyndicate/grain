import { basename } from 'node:path'
import { grain } from '../vocabulary.js'

/** Роль файла из его имени: track.store.ts → store. */
function findRole(filename) {
  const parts = basename(filename).split('.')
  const role = parts.length >= 3 ? parts[parts.length - 2] : null
  return role !== null && grain.fileRoles.has(role) ? role : null
}

const nondeterministic = new Set(grain.effectsNondeterministic)

export const boundaryEffect = {
  meta: {
    type: 'problem',
    docs: { description: 'Время, случайность и окружение берутся только на границе' },
    schema: [],
    messages: {
      effect:
        'GRAIN: "{{source}}" внутри {{role}}-файла. Недетерминизм живёт на границе ({{boundary}}) и приходит в домен аргументом — иначе код нельзя ни протестировать без моков, ни воспроизвести по логам.',
      date: 'GRAIN: new Date() внутри {{role}}-файла. Момент времени приходит аргументом.',
    },
  },
  create(context) {
    const role = findRole(context.filename)
    if (role === null || grain.rolesBoundary.has(role)) return {}
    const boundary = [...grain.rolesBoundary].join('/')
    const sourceCode = context.sourceCode
    return {
      MemberExpression(node) {
        const text = sourceCode.getText(node)
        // why: process.env.X даёт два вложенных узла — сообщаем только о самом process.env
        const isEnv =
          node.object.type === 'Identifier' &&
          node.object.name === 'process' &&
          node.property.type === 'Identifier' &&
          node.property.name === 'env'
        if (!isEnv && !nondeterministic.has(text)) return
        const source = isEnv ? 'process.env' : text
        context.report({ node, messageId: 'effect', data: { source, role, boundary } })
      },
      NewExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'Date') return
        if (node.arguments.length > 0) return
        context.report({ node, messageId: 'date', data: { role } })
      },
    }
  },
}

export const inwardImport = {
  meta: {
    type: 'problem',
    docs: { description: 'Зависимости направлены внутрь, к домену' },
    schema: [],
    messages: {
      outward:
        'GRAIN: {{role}}-файл импортирует {{imported}}-файл. Разрешено: {{allowed}}. Домен не знает о том, кто его вызывает и через что ходит наружу.',
    },
  },
  create(context) {
    const role = findRole(context.filename)
    if (role === null) return {}
    const allowed = grain.importsAllowed.get(role)
    if (allowed === undefined) return {}
    return {
      ImportDeclaration(node) {
        const target = String(node.source.value)
        if (!target.startsWith('.')) return
        const imported = findRole(target.replace(/\.(ts|tsx|js)$/, '') + '.ts')
        if (imported === null || allowed.has(imported)) return
        context.report({
          node,
          messageId: 'outward',
          data: { role, imported, allowed: [...allowed].join(', ') },
        })
      },
    }
  },
}

/** Имена, которые упоминает выражение. */
function listMentions(node, found) {
  if (node === null || typeof node !== 'object') return found
  if (Array.isArray(node)) {
    for (const child of node) listMentions(child, found)
    return found
  }
  if (typeof node.type !== 'string') return found
  if (node.type === 'Identifier') found.add(node.name)
  for (const [key, child] of Object.entries(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    listMentions(child, found)
  }
  return found
}

const isAwaitDeclaration = (statement) =>
  statement.type === 'VariableDeclaration' &&
  statement.declarations.length === 1 &&
  statement.declarations[0]?.init?.type === 'AwaitExpression'

export const explicitParallel = {
  meta: {
    type: 'problem',
    docs: { description: 'Независимые ожидания запускаются параллельно' },
    schema: [],
    messages: {
      serial:
        'GRAIN: этот await не зависит от предыдущего — они выполняются по очереди без причины. Запусти параллельно: const [{{names}}] = await Promise.all([…]).',
    },
  },
  create(context) {
    const check = (body) => {
      let declaredBefore = new Set()
      let previousName = null
      for (const statement of body) {
        if (!isAwaitDeclaration(statement)) {
          declaredBefore = new Set()
          previousName = null
          continue
        }
        const declared = statement.declarations[0]
        const name = declared.id.type === 'Identifier' ? declared.id.name : '…'
        const mentions = listMentions(declared.init, new Set())
        const isDependent = [...declaredBefore].some((known) => mentions.has(known))
        if (previousName !== null && !isDependent) {
          context.report({
            node: statement,
            messageId: 'serial',
            data: { names: `${previousName}, ${name}` },
          })
        }
        declaredBefore.add(name)
        previousName = name
      }
    }
    return {
      BlockStatement(node) {
        check(node.body)
      },
      Program(node) {
        check(node.body)
      },
    }
  },
}
