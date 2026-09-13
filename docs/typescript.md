# GRAIN 1.2 — TypeScript

Дополнение к [ядру стандарта](README.md). Здесь только то, что специфично для TypeScript.

## Типы

**Типы не префиксуются и не суффиксуются.** `Track`, не `ITrack`, не `TrackType`, не `TrackDTO`. Если два типа про одно и то же различаются формой, различие пишется словом: `Track`, `TrackDraft`, `TrackSummary`, `TrackRow`.

**`any` не существует.** Внешние данные входят через `unknown` и разбираются схемой в `*.shape.ts`. `as` допустим только сразу после проверки, доказавшей тип.

**Параметры дженериков называются по роли:** `<Item>`, `<Payload>`, `<Fail>`. Однобуквенные `T`, `K`, `V` — только в контейнере, где тип действительно ничего не означает (`Box<T>`).

**`Async` в имени не пишется.** Асинхронность видна по `await` на месте вызова и по типу.

## Отказы

Ожидаемый отказ — значение, а не исключение:

```ts
// track.shape.ts
export type Fail<Code extends string = string> = { isOk: false; code: Code; message: string }
export type Ok<Value> = { isOk: true; value: Value }
export type Outcome<Value, Code extends string = string> = Ok<Value> | Fail<Code>

export function makeFail<Code extends string>(code: Code, message: string): Fail<Code> {
  return { isOk: false, code, message }
}
```

```ts
export async function loadTrackForActor(
  trackId: string,
  actorId: string,
): Promise<Outcome<Track, 'music.track.missing' | 'music.track.forbidden'>> {
  const track = await findTrack(trackId)
  if (track === null) return makeFail('music.track.missing', 'Трек не найден')
  if (!canRead(track, actorId)) return makeFail('music.track.forbidden', 'Нет доступа')
  return { isOk: true, value: track }
}
```

Коды перечисляются в сигнатуре — вызывающий видит полный набор исходов, не читая тело. Неожиданный отказ по-прежнему бросается и ловится только на границе процесса.

## Файлы

```
src/track/track.route.ts     HTTP: разбор запроса, вызов домена, коды ответов
src/track/track.store.ts     единственное место с SQL/ORM для домена track
src/track/track.policy.ts    canRead, assertCanPublish — чисто, тестируется без БД
src/track/track.shape.ts     Track, TrackDraft, схемы валидации
src/track/track.pure.ts      deriveDuration, formatTrackTitle — ноль I/O
src/track/track.event.ts     сабджекты и продюсеры событий домена
```

`import type` для типов обязателен — иначе сборщик тянет модуль в рантайм. Импорты стандартной библиотеки — с префиксом `node:`.

## React

**Компонент** — существительное в `PascalCase`, файл в `kebab-case`: `TrackCard` в `track-card.tsx`. Роль в имени файла компонента не пишется.

**Хук** начинается с `use` и дальше следует словарю: `useTrackList`, не `useTrackData`.

**Обработчик события** называется действием: `submitLogin`, `toggleTheme`, `retryUpload`. `handleSubmit` запрещён.

```tsx
function LoginForm() {
  const [isPending, setPending] = useState(false)

  async function submitLogin(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    ...
  }

  return <form onSubmit={submitLogin}>…</form>
}
```

Префикс `on*` — только у свойств: это контракт UI-библиотеки, а не имя действия. Свойство, принимающее действие, называется по событию (`onSubmit`), а не по обработчику.

**Пропсы** объявляются типом `<Component>Props` рядом с компонентом. Булевы пропсы подчиняются общим префиксам: `isDisabled`, не `disabled`.

## Границы

Каждое значение, пришедшее снаружи процесса (HTTP-тело, env, ответ чужого API, строка из очереди), проходит через `parse*` в `*.shape.ts` и дальше живёт типизированным. Внутри домена проверок формы больше нет — они уже сделаны на границе, и повторять их значит не доверять собственным типам.
