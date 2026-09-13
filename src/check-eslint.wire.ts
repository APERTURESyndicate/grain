import { makeFinding, type Finding } from './finding.shape.ts'

type Loaded = {
  Linter: new () => { verify: (text: string, config: object, file: string) => Message[] }
  parser: object
  config: { plugins: object; rules: Record<string, unknown> }
  known: Set<string>
}

type Message = {
  ruleId: string | null
  line?: number
  message: string
  fatal?: boolean
}

/**
 * ESLint нужен только здесь и подгружается лениво: pre-commit обязан работать
 * в свежем клоне до bun install, а без него остаются проверки по тексту.
 */
async function findToolchain(level: number): Promise<Loaded | null> {
  try {
    const [eslint, parser, own] = await Promise.all([
      import('eslint'),
      import('@typescript-eslint/parser'),
      import('./public.js'),
    ])
    const config = own.makeGrainConfig(level)
    // why: длину файла считает текстовый чекер — иначе одно нарушение приезжает дважды
    // и с разными числами: ESLint не считает пустые строки и комментарии
    const rules = Object.fromEntries(
      Object.entries(config.rules).filter(([rule]) => rule !== 'max-lines'),
    )
    return {
      Linter: eslint.Linter,
      parser: parser.default ?? parser,
      config: { ...config, rules },
      known: new Set(Object.keys(rules)),
    }
  } catch {
    return null
  }
}

const jsx = { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } }
const shapes = ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs']

// why: файлы писались под конфиги приложений — их eslint-disable ссылаются на правила,
// которых здесь нет, и ESLint отвечает «Definition for rule … was not found». Это не
// находка GRAIN, а шум чужой настройки
function listMessageFindings(file: string, messages: Message[], known: Set<string>): Finding[] {
  return messages.flatMap((message) => {
    if (message.fatal === true) {
      return [makeFinding([file, message.line ?? 1], 'parse', `parse failed: ${message.message}`)]
    }
    if (message.ruleId === null || !known.has(message.ruleId)) return []
    const rule = message.ruleId.replace(/^grain\//, '')
    return [makeFinding([file, message.line ?? 1], rule, message.message.replace(/^GRAIN: /, ''))]
  })
}

/** Правила по AST: словарь глаголов, единицы, контракты, границы, форма функции. */
export async function listAstFindings(
  sources: Map<string, string>,
  level: number,
): Promise<{ findings: Finding[]; isRun: boolean }> {
  const loaded = await findToolchain(level)
  if (loaded === null) return { findings: [], isRun: false }
  const linter = new loaded.Linter()
  const config = {
    ...loaded.config,
    files: shapes,
    languageOptions: { parser: loaded.parser, parserOptions: jsx },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
  }
  const findings = [...sources].flatMap(([file, text]) =>
    listMessageFindings(file, linter.verify(text, config, file), loaded.known),
  )
  return { findings, isRun: true }
}
