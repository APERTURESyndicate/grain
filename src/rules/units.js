import { grain, splitWords } from '../vocabulary.js'

const units = new Set([...grain.units].map((unit) => unit.toLowerCase()))

function hasUnit(name) {
  if (name.length <= 2) return true
  if (grain.unitsExempt.has(name)) return true
  const words = splitWords(name)
  const last = words[words.length - 1]
  if (last === undefined) return true
  return units.has(last) || grain.unitsExempt.has(last)
}

/** Имя свойства или JSX-атрибута, внутри которого лежит узел. */
function listHolders(ancestors) {
  return ancestors.flatMap((node) => {
    if (node.type === 'Property' && node.key?.type === 'Identifier') return [node.key.name]
    if (node.type === 'JSXAttribute' && node.name?.type === 'JSXIdentifier') return [node.name.name]
    return []
  })
}

const isNumberType = (annotation) => annotation?.typeAnnotation?.type === 'TSNumberKeyword'
const isNumberLiteral = (node) => node?.type === 'Literal' && typeof node.value === 'number'

export const unitSuffix = {
  meta: {
    type: 'problem',
    docs: { description: 'A numeric name carries its unit of measure' },
    schema: [],
    messages: {
      missing:
        'GRAIN: "{{name}}" is a number without a unit. Add a suffix ({{sample}}) or name it as a dimensionless quantity.',
    },
  },
  create(context) {
    const sample = [...grain.units].slice(0, 8).join(', ')
    const sourceCode = context.sourceCode
    // why: fontSize и gap — имена из CSS, переименовать их нельзя: единицу там задаёт чужой контракт
    const isForeign = (node) =>
      listHolders(sourceCode.getAncestors(node)).some((name) => grain.unitsForeign.has(name))
    const report = (target, name, node) => {
      if (hasUnit(name) || isForeign(node ?? target)) return
      context.report({ node: target, messageId: 'missing', data: { name, sample } })
    }
    return {
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier') return
        if (!isNumberType(node.id.typeAnnotation) && !isNumberLiteral(node.init)) return
        report(node.id, node.id.name, node)
      },
      TSPropertySignature(node) {
        if (node.computed || node.key.type !== 'Identifier') return
        if (!isNumberType(node.typeAnnotation)) return
        report(node.key, node.key.name, node)
      },
      PropertyDefinition(node) {
        if (node.computed || node.key.type !== 'Identifier') return
        if (!isNumberType(node.typeAnnotation) && !isNumberLiteral(node.value)) return
        report(node.key, node.key.name, node)
      },
      Property(node) {
        if (node.computed || node.key.type !== 'Identifier') return
        if (!isNumberLiteral(node.value)) return
        report(node.key, node.key.name, node)
      },
      // why: аргумент — главное место, где единица теряется: sleep(delay) читается
      // одинаково и про миллисекунды, и про секунды
      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSDeclareFunction'(node) {
        for (const parameter of node.params) {
          const target = parameter.type === 'AssignmentPattern' ? parameter.left : parameter
          if (target.type !== 'Identifier' || !isNumberType(target.typeAnnotation)) continue
          report(target, target.name, target)
        }
      },
    }
  },
}
