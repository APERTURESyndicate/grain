# Разбор: один эндпоинт до и после GRAIN

Самый честный способ проверить стандарт — взять код, который пишут все, и переписать его по правилам, считая цену каждого изменения. Задача простая и настоящая: **опубликовать трек**. Проверить права, проверить готовность, проставить дату публикации, вернуть результат.

Ничего в поведении не изменится. Изменится то, сколько нужно держать в голове, чтобы это поведение проверить.

---

## Как это выглядит обычно

Один файл, одна функция, всё внутри. Так пишет и новичок, и языковая модель без стандарта — потому что это самый вероятный способ, а не самый лучший.

```ts
// src/utils/trackUtils.ts

// Handle track publishing
export default async function handleTrackPublish(req: any, res: any) {
  try {
    const data = req.body
    // Check if user is authorized
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const result = await db.query('SELECT * FROM tracks WHERE id = $1', [data.id])
    const track = result.rows[0]
    if (track) {
      if (track.owner_id === req.user.id || req.user.role === 'admin') {
        // Check if track can be published
        if (track.duration > 30 && track.cover_url) {
          const now = Date.now()
          const updated = await db.query(
            'UPDATE tracks SET published_at = $1, updated = $2 WHERE id = $3 RETURNING *',
            [now, now, data.id],
          )
          console.log('✅ Track published!', data.id)
          res.json(updated.rows[0])
        } else {
          res.status(400).json({ error: 'Invalid track' })
        }
      } else {
        res.status(403).json({ error: 'Forbidden' })
      }
    } else {
      res.status(404).json({ error: 'Not found' })
    }
  } catch (error) {
    console.log('Error publishing track', error)
    res.status(500).json({ error: 'Something went wrong' })
  }
}
```

Код работает. С ним всё в порядке ровно до первого вопроса, который ему зададут.

## Что здесь стоит денег

| Строка | Правило GRAIN | Что сломается |
|---|---|---|
| `utils/trackUtils.ts` | роли файлов | Через полгода здесь окажется ещё пять несвязанных функций, и файл нельзя будет ни удалить, ни понять |
| `handleTrackPublish` | словарь глаголов | `handle` не сообщает действия. Функция публикует — так и называется |
| `export default` | именованные экспорты | На другом конце импорта имя можно написать любое; поиск по коду перестаёт находить вызовы |
| `req: any, res: any` | нет `any` | Компилятор выключен ровно там, где данные приходят снаружи |
| `const data = req.body` | пустые слова | `data` не сообщает, что внутри. Это черновик трека — `draft` |
| `track.duration > 30` | единицы + магические числа | Секунды или миллисекунды? Через год никто не вспомнит, а ошибка проявится один раз на проде |
| `Date.now()` внутри домена | границы | Правило «опубликовать можно» невозможно протестировать, не подменяя системное время |
| `// Check if user is authorized` | комментарии | Пересказ следующей строки. Он устареет раньше кода и начнёт врать |
| `console.log('✅ …')` | логи | Эмодзи в логе, который будут читать `grep` и алерты |
| `catch` → `console.log` + 500 | модель отказов | Любая ошибка превращается в «что-то пошло не так». Расследовать нечего |
| вложенность `try/if/if/if` | форма | Чтобы понять условие успеха, нужно удержать в голове четыре уровня |
| `'Unauthorized'`, `'Not found'` | коды отказа | Клиент вынужден разбирать текст на английском вместо кода |
| SQL прямо в обработчике | роли файлов | Схема БД теперь известна HTTP-слою; смена колонки ломает эндпоинт |

Тринадцать пунктов — и ни один из них не «некрасиво». Каждый — конкретная будущая работа для того, кто откроет файл после автора.

---

## Как это выглядит по GRAIN

Одна ответственность на файл. Домен посередине, границы по краям.

### `track.shape.ts` — форма данных, ничего исполняемого

```ts
export type Track = {
  id: string
  ownerId: string
  durationSec: number
  coverUrl: string | null
  publishedAt: Date | null
}

export type Fail<Code extends string> = { isOk: false; code: Code; message: string }
export type Ok<Value> = { isOk: true; value: Value }
export type Outcome<Value, Code extends string> = Ok<Value> | Fail<Code>

export function makeFail<Code extends string>(code: Code, message: string): Fail<Code> {
  return { isOk: false, code, message }
}
```

### `track.policy.ts` — правила. Чисто, без I/O, без времени

```ts
import type { Track } from './track.shape'

const MIN_PUBLISHABLE_DURATION_SEC = 30

export function canPublish(track: Track, actorId: string, isAdmin: boolean): boolean {
  return track.ownerId === actorId || isAdmin
}

export function isReadyToPublish(track: Track): boolean {
  return track.durationSec >= MIN_PUBLISHABLE_DURATION_SEC && track.coverUrl !== null
}
```

Два правила, две строки логики, ноль зависимостей. Тест на них не требует ни базы, ни сети, ни подмены времени — и пишется за минуту.

### `track.pure.ts` — вычисление нового состояния

```ts
import type { Track } from './track.shape'

export function derivePublishedTrack(track: Track, nowMs: number): Track {
  return { ...track, publishedAt: new Date(nowMs) }
}
```

Время пришло аргументом. Функцию можно вызвать с любым моментом и проверить результат — включая границу суток, високосный год и часовой пояс, в котором никто из авторов не живёт.

### `track.store.ts` — единственное место, где есть SQL

```ts
import type { Track } from './track.shape'

export async function findTrack(trackId: string): Promise<Track | null> {
  const rows = await db.query<Track>('select * from tracks where id = $1', [trackId])
  return rows[0] ?? null
}

export async function saveTrack(track: Track): Promise<void> {
  await db.query('update tracks set published_at = $1, updated_at = $2 where id = $3', [
    track.publishedAt,
    new Date(),
    track.id,
  ])
}
```

`findTrack` возвращает `Track | null` — контракт виден в имени, вызывающий обязан разобрать оба исхода.

### `track.policy.ts` + `track.pure.ts` собираются в действие

```ts
import { canPublish, isReadyToPublish } from './track.policy'
import { derivePublishedTrack } from './track.pure'
import { findTrack, saveTrack } from './track.store'
import { makeFail, type Outcome, type Track } from './track.shape'

type PublishFail =
  | 'music.track.missing'
  | 'music.track.forbidden'
  | 'music.track.incomplete'

export async function publishTrack(
  trackId: string,
  actor: { id: string; isAdmin: boolean },
  nowMs: number,
): Promise<Outcome<Track, PublishFail>> {
  const track = await findTrack(trackId)
  if (track === null) return makeFail('music.track.missing', 'Трек не найден')
  if (!canPublish(track, actor.id, actor.isAdmin)) {
    return makeFail('music.track.forbidden', 'Публиковать может только владелец')
  }
  if (!isReadyToPublish(track)) {
    return makeFail('music.track.incomplete', 'Нужны обложка и длительность от 30 секунд')
  }

  const published = derivePublishedTrack(track, nowMs)
  await saveTrack(published)
  return { isOk: true, value: published }
}
```

Четыре такта воронки видны глазом: `acquire` → три `guard` → `derive` → `effect`. Вложенность — один уровень. Все исходы перечислены в типе `PublishFail`, поэтому вызывающий не может забыть про один из них — компилятор не даст.

### `track.route.ts` — граница. Только перевод HTTP ↔ домен

```ts
export async function routePublishTrack(request: Request): Promise<Response> {
  const actor = getActor(request)
  const outcome = await publishTrack(readTrackId(request), actor, Date.now())

  if (outcome.isOk) return Response.json(outcome.value)
  return Response.json({ code: outcome.code, message: outcome.message }, {
    status: FAIL_STATUS[outcome.code],
  })
}

const FAIL_STATUS: Record<PublishFail, number> = {
  'music.track.missing': 404,
  'music.track.forbidden': 403,
  'music.track.incomplete': 422,
}
```

`Date.now()` вызывается здесь — это граница, ей можно. Соответствие кода отказа HTTP-статусу задано таблицей: добавится новый исход — TypeScript потребует добавить строку.

---

## Что изменилось в цифрах

| | Обычный вариант | По GRAIN |
|---|---|---|
| Максимальная вложенность | 5 | 1 |
| Строк в самой длинной функции | 34 | 18 |
| Мест, где есть SQL | 1 из 1 файла — он же HTTP-слой | 1 выделенный файл |
| Что тестируется без базы и без моков | ничего | правила, вычисление, соответствие статусов |
| Исходов, видимых в типе | 0 | 3 |
| Строк, которые нужно прочитать, чтобы узнать условие публикации | все 34 | 4 в `track.policy.ts` |

Файлов стало больше — пять вместо одного. Это цена, и её стоит назвать честно. Взамен каждый файл отвечает на один вопрос, и на большинство вопросов о поведении можно ответить, открыв ровно один из них.

---

## Что из этого поймает машина

Из тринадцати пунктов линтер ловит одиннадцать без участия человека:

```
src/utils/trackUtils.ts
   1  L1  no-dump-file      "utils" — свалка по определению; разложи по ролям
   4  L1  comment-form      комментарий без тега — или это пересказ кода
   5  L1  verb-lexicon      глагол "handle" запрещён — назови действие: publishTrack
   5  L2  no-default-export только именованные экспорты
   7  L2  no-vague-name     "data" ничего не сообщает. Назови по домену
   9  L1  comment-form      комментарий без тега — или это пересказ кода
  21  L1  unit-suffix       "duration" — число без единицы (Sec, Ms, Bytes, …)
  22  L2  boundary-effect   Date.now() внутри policy-файла — приходит аргументом
  28  L1  no-emoji-log      эмодзи в логе. Лог читает grep, а не человек
  35  L2  catch-must-act    catch только логирует и продолжает — отказ уходит в тишину
  12  L2  max-depth         вложенность 5 при пределе 2
```

Оставшиеся два — `any` в сигнатуре и SQL в обработчике — ловятся компилятором в `strict`-режиме и ролью файла соответственно.

Дальше: [глоссарий](glossary.md) · [ядро стандарта](README.md) · [как включить проверку](enforcement.md)
