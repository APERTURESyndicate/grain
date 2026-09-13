#!/usr/bin/env bun
import { writeFileSync } from 'node:fs'
import { abbrevFix, grain } from '../src/vocabulary.js'

const formatLine = (label: string, words: Iterable<string>) => `- **${label}:** \`${[...words].join('` `')}\``

function formatVerbs(): string {
  const groups: [string, string][] = [
    ['Чтение', 'verbs_query'],
    ['Ввод-вывод', 'verbs_io'],
    ['Хранилище', 'verbs_store'],
    ['Вычисление', 'verbs_build'],
    ['Преобразование', 'verbs_transform'],
    ['Мутация домена', 'verbs_mutate'],
    ['Состояние', 'verbs_state'],
    ['Связь', 'verbs_signal'],
    ['Жизненный цикл', 'verbs_life'],
    ['Только UI', 'verbs_ui'],
  ]
  return groups.map(([label, key]) => formatLine(label, grain.verbGroups[key] ?? [])).join('\n')
}

// why: подсказки чекера на английском, а карточка — на русском: словарь один,
// а язык подписи задаёт документ
const replacementsRu: Record<string, string> = {
  handle: 'назови действие: submitLogin, retryPayout',
  process: 'derive / apply / transform-глагол по существу',
  manage: 'разбей на конкретные действия',
  do: 'назови действие',
  perform: 'назови действие',
  execute: 'apply / start',
  check: 'is* для ответа, assert* для инварианта',
  init: 'start (процесс) / make (значение)',
  update: 'save / apply / set',
  fetch: 'read (I/O) / load (агрегат)',
  retrieve: 'get / find',
  calculate: 'derive',
  compute: 'derive',
  generate: 'make',
  build: 'make',
  setup: 'ensure / start',
  validate: 'assert (бросает) / parse (возвращает разбор)',
  transform: 'derive / format',
  convert: 'format / encode',
  prepare: 'make',
  determine: 'resolve',
  deal: 'назови действие',
  run: 'start / apply',
  trigger: 'emit / send',
}

function formatBanned(): string {
  return [...grain.verbsBanned]
    .map((verb) => `\`${verb}*\` → ${replacementsRu[verb] ?? 'назови действие по существу'}`)
    .join('; ')
}

function formatRoles(): string {
  const meaning: Record<string, string> = {
    entry: 'точка входа процесса',
    route: 'HTTP',
    rpc: 'gRPC',
    store: 'единственное место с SQL/ORM',
    wire: 'клиент к чужому API',
    policy: 'правила доступа, чисто',
    shape: 'типы и схемы',
    event: 'контракты событий',
    job: 'фон и крон, идемпотентно',
    pure: 'чистые вычисления, ноль I/O',
  }
  return [...grain.fileRoles].map((role) => `\`*.${role}.ts\` — ${meaning[role] ?? role}`).join('; ')
}

const card = `# GRAIN ${grain.version} — карточка

Сгенерировано из \`grain.synx\` (\`bun run docs\`). Не править руками.
Полный стандарт — \`docs/\`. Проверка — \`bun grain\`.

## Глаголы: имя функции начинается с одного из них

${formatVerbs()}

Контракты: \`find*\` может вернуть \`null\` и никогда не бросает; \`get*\` гарантирует значение;
\`list*\` всегда коллекция; \`count*\` число. Предикат называется булевым префиксом, а не глаголом:
\`is* has* can* should* was* will* must*\`.

**Запрещены:** ${formatBanned()}

## Имена

${formatLine('Единицы (число без суффикса — ошибка)', grain.units)}
${formatLine('Безразмерные', grain.unitsExempt)}
${formatLine('Булевы префиксы', grain.boolPrefixes)}
${formatLine('Слова-пустышки в именах', grain.nounsBanned)}
${formatLine('Самопохвала', grain.adjectivesBanned)}
${formatLine('Разрешённые сокращения', grain.abbreviations)}
- **Сокращение → слово:** ${[...abbrevFix].map(([short, full]) => `\`${short}\`→\`${full}\``).join(' ')}

Порядок слов: домен → уточнение → единица (\`refreshTtlSec\`, \`priceCents\`).
Типы без префиксов и суффиксов: \`Track\`, не \`ITrack\`/\`TrackDTO\`. \`any\` не существует.

## Файлы и каталоги

${formatRoles()}
${formatLine('Запрещённые имена файлов', grain.filesBanned)}
${formatLine('Запрещённые каталоги', grain.dirsBanned)}
${formatLine('Имена от фреймворка (оставить как есть)', grain.filesFramework)}

Каталог называется по домену, не по технике. Глубина внутри \`src\` — не больше ${String(grain.maxDirDepth)}
(под \`${[...grain.dirsFramework].join('`/`')}\` не считается: там иерархия это URL).
Публичный вход пакета — \`${grain.filePublic}.ts\`. Только именованные экспорты.

## Провод

Событие — свершившийся факт: \`v1.{домен}.{предмет}.{что произошло}\`, причастие из закрытого списка
(\`${[...grain.eventVerbs].slice(0, 12).join('` `')}\`, …). Не команда: \`v1.invoice.paid\`, не \`v1.payInvoice\`.
Живой сабджект не переименовывают — это миграция, а не рефакторинг.

## Комментарии

Пять тегов, ничего кроме: ${grain.commentTags.map((tag) => `\`${tag}:\``).join(' ')}.
Комментарий отвечает «почему», а не «что». Запрещены \`TODO\`, ASCII-разделители, эмодзи,
нумерация шагов, JSDoc, повторяющий сигнатуру.

## Форма

- вложенность ≤ ${String(grain.maxNesting)}, аргументов ≤ ${String(grain.maxParams)}, функция ≤ ${String(grain.maxFunctionLines)} строк, файл ≤ ${String(grain.maxFileLines)}
- воронка: guard → acquire → derive → effect, всегда в этом порядке
- \`catch\` обязан пробросить дальше или вернуть типизированный отказ
- код отказа — \`домен.предмет.причина\` (\`auth.token.expired\`)
- независимые \`await\` — через \`Promise.all\`

## Границы

Время, случайность и \`process.env\` берутся только в ролях ${[...grain.rolesBoundary].map((role) => `\`${role}\``).join(' ')} —
внутрь домена они приходят аргументом. Зависимости направлены внутрь:
${[...grain.importsAllowed].map(([role, allowed]) => `\`${role}\` → ${[...allowed].join(', ')}`).join('; ')}.

## Осознанное исключение

\`// ${grain.commentEscape} <правило> — <причина>\` — причина обязательна.
Долг легаси записан в \`baseline.synx\`: гейт валит только новое.
`

writeFileSync('docs/CARD.md', card, 'utf-8')
process.stdout.write(`GRAIN ${grain.version}: карточка собрана — docs/CARD.md\n`)

const small = `# Small GRAIN

Копируется в промт целиком. Это не весь стандарт — только законы, которые
переживают любую модель и любой язык. Полный стандарт — для человека и линтера.
Собирается из \`grain.synx\` (\`bun run docs\`).

\`\`\`
GRAIN — минимальный свод правил кода. Соблюдай буквально. Если правило не покрывает
случай, действуй по смыслу правила, а не по своей привычке. Новых правил не выдумывай.

1. ИМЯ ФУНКЦИИ — ДЕЙСТВИЕ. Начинается с глагола из списка:
   ${[...grain.verbs].join(' ')}
   Предикат называется префиксом: is has can should was will must.
   ЗАПРЕЩЕНО: ${[...grain.verbsBanned].join(' ')}
2. КОНТРАКТ В ИМЕНИ. find* может вернуть null и никогда не бросает. get* гарантирует
   значение. list* — всегда коллекция. count* — число.
3. ЧИСЛО НЕСЁТ ЕДИНИЦУ: ${[...grain.units].join(' ')} (refreshTtlSec, priceCents,
   sizeBytes). Без единицы допустимо только безразмерное: ${[...grain.unitsExempt].join(' ')}.
4. БУЛЕВО — только с префиксом: ${grain.boolPrefixes.join(' ')}.
5. СЛОВА-ПУСТЫШКИ ЗАПРЕЩЕНЫ В ИМЕНАХ: ${[...grain.nounsBanned].join(' ')}.
   Сокращения пишутся целиком: request, response, message, error, index, config.
6. КОММЕНТАРИЙ ОТВЕЧАЕТ «ПОЧЕМУ» и начинается с тега: ${grain.commentTags.map((tag) => `${tag}:`).join(' ')}.
   Пересказ кода, TODO, эмодзи, ASCII-разделители, «шаг 1» — не писать.
7. ФАЙЛ = ОДНА РОЛЬ, роль в имени: ${[...grain.fileRoles].map((role) => `<домен>.${role}.ts`).join(' ')}.
   store — единственное место с SQL. pure — ноль I/O. Запрещены: ${[...grain.filesBanned].join(' ')}.
8. CATCH ОБЯЗАН ДЕЙСТВОВАТЬ: пробросить дальше или вернуть типизированный отказ.
   Записать в лог и продолжить — нельзя.
9. НЕДЕТЕРМИНИЗМ ТОЛЬКО НА ГРАНИЦЕ: ${grain.effectsNondeterministic.join(' ')} — только в
   ролях ${[...grain.rolesBoundary].join(' ')}. В домен приходят аргументом.
10. НЕЗАВИСИМЫЕ AWAIT — ЧЕРЕЗ Promise.all. Последовательность только там, где второй
    вызов использует результат первого.
11. ТОЛЬКО ИМЕНОВАННЫЕ ЭКСПОРТЫ. any не существует: внешнее приходит как unknown и
    разбирается схемой.
12. СОБЫТИЕ — СВЕРШИВШИЙСЯ ФАКТ: v1.{домен}.{предмет}.{что произошло} (verified,
    granted, paid), не команда (не payInvoice).

Если сомневаешься в имени — возьми ближайший глагол из списка. Не изобретай синоним,
не добавляй «улучшений» к правилам и не объясняй правила в коде.
\`\`\`
`

writeFileSync('docs/SMALL.md', small, 'utf-8')
process.stdout.write(`GRAIN ${grain.version}: Small GRAIN собран — docs/SMALL.md\n`)
