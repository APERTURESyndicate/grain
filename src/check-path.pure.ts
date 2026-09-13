import { basename } from 'node:path'
import { grain } from './vocabulary.js'
import { makeFinding, type Finding } from './finding.shape.ts'

// why: git отдаёт пути через прямой слэш и на Windows тоже — разбор по системному
//   разделителю там молча выключал правила о каталогах
const separator = /[\/]/
const kebab = /^[a-z0-9]+(-[a-z0-9]+)*$/
const snake = /^[a-z0-9]+(_[a-z0-9]+)*$/
const generated = /\.(d|test|spec|config)\.[cm]?tsx?$/
const roleless = /\.([cm]?js|tsx|jsx|rs|css|md|synx|sql|json|kt|swift)$/
const pascal = /^[A-Z][A-Za-z0-9]*$/

function findDumpedDir(file: string): string | null {
  const dumped = file
    .split(separator)
    .slice(0, -1)
    .find((folder) => grain.dirsBanned.has(folder))
  if (dumped === undefined) return null
  return `directory "${dumped}" describes a technique, not a domain — split by domain`
}

function findDepthFault(file: string): string | null {
  const folders = file.split(separator).slice(0, -1)
  const sourceIndex = folders.lastIndexOf('src')
  if (sourceIndex === -1) return null
  const inside = folders.slice(sourceIndex + 1)
  // why: под деревом роутов фреймворка вложенность — это URL, а не выбор автора
  if (inside.some((folder) => grain.dirsFramework.has(folder))) return null
  const depth = inside.length
  if (depth <= grain.maxDirDepth) return null
  return `nesting ${String(depth)} exceeds the limit of ${String(grain.maxDirDepth)} — move it a level up`
}

function findNameFault(file: string): string | null {
  const name = basename(file)
  const stem = name.split('.')[0] ?? name
  if (grain.filesFramework.has(stem) || stem === grain.filePublic) return null
  // why: свалка уже названа правилом no-dump-file — второй раз о том же не сообщаем
  if (grain.filesBanned.has(stem)) return null
  // why: в Kotlin и Swift имя файла обязано совпадать с именем типа — PascalCase диктует язык
  const isTyped = name.endsWith('.kt') || name.endsWith('.swift')
  const shape = isTyped ? pascal : name.endsWith('.rs') || name.endsWith('.sql') ? snake : kebab
  const shapeName = isTyped ? 'PascalCase' : shape === snake ? 'snake_case' : 'kebab-case'
  if (!shape.test(stem)) return `file name "${stem}" must be ${shapeName}`
  if (generated.test(name) || roleless.test(name)) return null
  const parts = name.split('.')
  const role = parts.length >= 3 ? parts[parts.length - 2] : null
  if (role !== null && grain.fileRoles.has(role)) return null
  return `no role in the name: <domain>.<role>.ts, roles: ${[...grain.fileRoles].join(' ')}`
}

function findDumpedFile(file: string): string | null {
  const stem = basename(file).split('.')[0] ?? ''
  if (!grain.filesBanned.has(stem)) return null
  return `"${stem}" is a dumping ground by definition; split it by role (${[...grain.fileRoles].join(' ')}), pure computations go to <domain>.pure.ts`
}

/** Путь, на котором стандарт неприменим: сборка, зависимости, генерируемый код. */
export function isIgnoredPath(file: string): boolean {
  const path = file.split(separator).join('/')
  const folders = path.split('/')
  return grain.pathsIgnored.some((part: string) =>
    part.includes('/') ? path.includes(part) : folders.includes(part),
  )
}

/** Имя файла и путь: роль, регистр, каталоги-свалки, глубина. */
export function listPathFindings(file: string): Finding[] {
  const checks: [string, string | null][] = [
    ['no-dump-file', findDumpedDir(file) ?? findDumpedFile(file)],
    ['dir-depth', findDepthFault(file)],
    ['file-role', findNameFault(file)],
  ]
  return checks
    .filter(([, fault]) => fault !== null)
    .map(([rule, fault]) => makeFinding([file, 1], rule, fault ?? ''))
}
