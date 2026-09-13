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
    docs: { description: 'Time, randomness and the environment are taken only at the boundary' },
    schema: [],
    messages: {
      effect:
        'GRAIN: "{{source}}" inside a {{role}} file. Nondeterminism lives at the boundary ({{boundary}}) and enters the domain as an argument — otherwise the code can neither be tested without mocks nor replayed from logs.',
      date: 'GRAIN: new Date() inside a {{role}} file. The moment in time arrives as an argument.',
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
    docs: { description: 'Dependencies point inward, toward the domain' },
    schema: [],
    messages: {
      outward:
        'GRAIN: a {{role}} file imports a {{imported}} file. Allowed: {{allowed}}. The domain does not know who calls it or how it reaches outside.',
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
    docs: { description: 'Independent awaits run in parallel' },
    schema: [],
    messages: {
      serial:
        'GRAIN: this await does not depend on the previous one — they run in sequence for no reason. Run them in parallel: const [{{names}}] = await Promise.all([…]).',
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
