import { basename } from 'node:path'
import { grain } from '../vocabulary.js'

// why: путь приходит и с прямым, и с обратным слэшем — разбор по обоим
const separator = /[\/]/
const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/
const skipExtension = /\.(d|test|spec|config)\.tsx?$/

/** Имя файла без расширений и путь по сегментам. */
function readPlace(filename) {
  const segments = filename.split(separator)
  const file = basename(filename)
  const stem = file.split('.')[0] ?? file
  return { segments, file, stem }
}

const isReal = (filename) => filename !== '<input>' && filename !== '<text>'

export const noDumpFile = {
  meta: {
    type: 'problem',
    docs: { description: 'No dumping-ground files or directories' },
    schema: [],
    messages: {
      file: 'GRAIN: "{{stem}}" is a dumping ground by definition. Split it by role: {{roles}}. Pure computations go to <domain>.pure.ts.',
      dir: 'GRAIN: directory "{{dir}}" describes a technique, not a domain. Split by domain.',
    },
  },
  create(context) {
    return {
      Program(node) {
        if (!isReal(context.filename)) return
        const { segments, stem } = readPlace(context.filename)
        const dumped = segments.slice(0, -1).find((folder) => grain.dirsBanned.has(folder))
        if (dumped !== undefined) {
          context.report({ node, messageId: 'dir', data: { dir: dumped } })
          return
        }
        if (!grain.filesBanned.has(stem)) return
        context.report({
          node,
          messageId: 'file',
          data: { stem, roles: [...grain.fileRoles].join(' ') },
        })
      },
    }
  },
}

export const dirDepth = {
  meta: {
    type: 'problem',
    docs: { description: 'Directory hierarchy no deeper than the limit' },
    schema: [],
    messages: {
      depth: 'GRAIN: nesting {{depth}} exceeds the limit of {{max}} — nobody looks deeper, move it a level up.',
    },
  },
  create(context) {
    return {
      Program(node) {
        if (!isReal(context.filename)) return
        const { segments } = readPlace(context.filename)
        const sourceIndex = segments.lastIndexOf('src')
        if (sourceIndex === -1) return
        const inside = segments.slice(sourceIndex + 1, -1)
        // why: под деревом роутов фреймворка вложенность — это URL, а не выбор автора
        if (inside.some((folder) => grain.dirsFramework.has(folder))) return
        const depth = inside.length
        if (depth <= grain.maxDirDepth) return
        context.report({ node, messageId: 'depth', data: { depth, max: grain.maxDirDepth } })
      },
    }
  },
}

export const fileRole = {
  meta: {
    type: 'problem',
    docs: { description: 'A file carries one role from a closed list' },
    schema: [],
    messages: {
      role: 'GRAIN: "{{stem}}" has no role. Format: <domain>.<role>.ts, roles: {{roles}}.',
      kebab: 'GRAIN: "{{stem}}" — file names are kebab-case.',
    },
  },
  create(context) {
    return {
      Program(node) {
        if (!isReal(context.filename)) return
        const { file, stem } = readPlace(context.filename)
        if (skipExtension.test(file) || grain.filesFramework.has(stem)) return
        if (!kebab.test(stem)) {
          context.report({ node, messageId: 'kebab', data: { stem } })
          return
        }
        if (stem === grain.filePublic || !/\.ts$/.test(file)) return
        const parts = file.split('.')
        const role = parts.length >= 3 ? parts[parts.length - 2] : null
        if (role !== null && grain.fileRoles.has(role)) return
        context.report({
          node,
          messageId: 'role',
          data: { stem, roles: [...grain.fileRoles].join(' ') },
        })
      },
    }
  },
}
