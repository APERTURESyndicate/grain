import { grain } from './vocabulary.js'
import { booleanPrefix, noVagueName, verbLexicon } from './rules/naming.js'
import {
  catchMustAct,
  failCode,
  findGetContract,
  noDefaultExport,
  noRedundantTemp,
} from './rules/contract.js'
import { commentForm, noEmojiLog } from './rules/comment.js'
import { unitSuffix } from './rules/units.js'
import { dirDepth, fileRole, noDumpFile } from './rules/file.js'
import { boundaryEffect, explicitParallel, inwardImport } from './rules/boundary.js'

const rules = {
  'verb-lexicon': verbLexicon,
  'boolean-prefix': booleanPrefix,
  'no-vague-name': noVagueName,
  'find-get-contract': findGetContract,
  'fail-code': failCode,
  'catch-must-act': catchMustAct,
  'no-redundant-temp': noRedundantTemp,
  'no-default-export': noDefaultExport,
  'comment-form': commentForm,
  'no-emoji-log': noEmojiLog,
  'unit-suffix': unitSuffix,
  'file-role': fileRole,
  'no-dump-file': noDumpFile,
  'dir-depth': dirDepth,
  'boundary-effect': boundaryEffect,
  'inward-import': inwardImport,
  'explicit-parallel': explicitParallel,
}

export const grainPlugin = {
  meta: { name: '@aperturesyndicate/grain', version: grain.version },
  rules,
}

/** Встроенные правила ESLint, которые держат форму функции. Пределы — из grain.synx. */
const formRules = {
  'max-depth': ['error', grain.maxNesting],
  'max-params': ['error', grain.maxParams],
  'max-lines-per-function': [
    'error',
    { max: grain.maxFunctionLines, skipBlankLines: true, skipComments: true },
  ],
  'max-lines': ['error', { max: grain.maxFileLines, skipBlankLines: true, skipComments: true }],
  'no-else-return': ['error', { allowElseIf: false }],
  'no-nested-ternary': 'error',
  'no-lonely-if': 'error',
}

/** Конфиг уровня: L1 — читаемость, L2 и выше — полный стандарт. */
export function makeGrainConfig(level) {
  const names = level >= 2 ? [...grain.levelRules[1], ...grain.levelRules[2]] : grain.levelRules[1]
  const own = Object.fromEntries(
    names.filter((name) => name in rules).map((name) => [`grain/${name}`, 'error']),
  )
  return {
    plugins: { grain: grainPlugin },
    rules: level >= 2 ? { ...own, ...formRules } : own,
  }
}

export const grainLevel1Config = makeGrainConfig(1)
export const grainConfig = makeGrainConfig(2)

/** Для миграции легаси: правила GRAIN остаются ошибками, ограничения формы — предупреждения. */
export const grainMigrationConfig = {
  ...grainConfig,
  rules: {
    ...grainConfig.rules,
    ...Object.fromEntries(
      Object.entries(formRules).map(([rule, level]) => [
        rule,
        Array.isArray(level) ? ['warn', ...level.slice(1)] : 'warn',
      ]),
    ),
  },
}

export { grain } from './vocabulary.js'
