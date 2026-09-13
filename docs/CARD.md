# GRAIN 1.2 — карточка

Сгенерировано из `grain.synx` (`bun run docs`). Не править руками.
Полный стандарт — `docs/`. Проверка — `bun grain`.

## Глаголы: имя функции начинается с одного из них

- **Чтение:** `find` `get` `list` `count`
- **Ввод-вывод:** `read` `write`
- **Хранилище:** `load` `save`
- **Вычисление:** `make` `derive` `resolve`
- **Преобразование:** `parse` `format` `encode` `decode` `normalize` `sign` `verify` `hash`
- **Мутация домена:** `create` `delete` `archive` `restore`
- **Состояние:** `ensure` `assert` `apply` `set`
- **Связь:** `emit` `send`
- **Жизненный цикл:** `start` `stop`
- **Только UI:** `use` `with` `render`

Контракты: `find*` может вернуть `null` и никогда не бросает; `get*` гарантирует значение;
`list*` всегда коллекция; `count*` число. Предикат называется булевым префиксом, а не глаголом:
`is* has* can* should* was* will* must*`.

**Запрещены:** `handle*` → назови действие: submitLogin, retryPayout; `process*` → derive / apply / transform-глагол по существу; `manage*` → разбей на конкретные действия; `do*` → назови действие; `perform*` → назови действие; `execute*` → apply / start; `check*` → is* для ответа, assert* для инварианта; `init*` → start (процесс) / make (значение); `update*` → save / apply / set; `fetch*` → read (I/O) / load (агрегат); `retrieve*` → get / find; `calculate*` → derive; `compute*` → derive; `generate*` → make; `build*` → make; `setup*` → ensure / start; `validate*` → assert (бросает) / parse (возвращает разбор); `transform*` → derive / format; `convert*` → format / encode; `prepare*` → make; `determine*` → resolve; `deal*` → назови действие; `run*` → start / apply; `trigger*` → emit / send

## Имена

- **Единицы (число без суффикса — ошибка):** `At` `Ms` `Sec` `Min` `Hours` `Days` `Bytes` `Kb` `Mb` `Gb` `Cents` `Ratio` `Pct` `Count` `Index` `Px` `Deg` `Hz` `Bpm` `Db`
- **Безразмерные:** `x` `y` `z` `id` `width` `height` `depth` `port` `page` `limit` `offset` `version` `priority`
- **Булевы префиксы:** `is` `has` `can` `should` `was` `will` `must`
- **Слова-пустышки в именах:** `data` `info` `obj` `object` `temp` `tmp` `stuff` `misc` `thing` `things` `res` `ret` `arr` `str` `num` `flag` `val` `result` `helper` `handler` `manager` `wrapper` `util` `utils`
- **Самопохвала:** `enhanced` `advanced` `comprehensive` `ultimate` `robust` `powerful` `seamless` `smart` `intelligent` `optimized` `improved` `modern` `simple` `easy` `quick`
- **Разрешённые сокращения:** `id` `url` `uri` `db` `io` `rpc` `ttl` `utc` `api` `sql` `css` `html` `json` `jwt` `s3` `ip` `dns` `cdn` `ui` `ms`
- **Сокращение → слово:** `cfg`→`config` `usr`→`user` `req`→`request` `res`→`response` `msg`→`message` `err`→`error` `idx`→`index` `btn`→`button` `img`→`image` `src`→`source` `dst`→`target` `dest`→`target` `val`→`value` `arr`→`list` `str`→`text` `num`→`number` `cnt`→`count` `prev`→`previous` `curr`→`current` `attr`→`attribute` `elem`→`element` `evt`→`event` `fn`→`action` `cb`→`action` `opts`→`options` `args`→`arguments` `desc`→`description` `doc`→`document` `acc`→`accumulator`

Порядок слов: домен → уточнение → единица (`refreshTtlSec`, `priceCents`).
Типы без префиксов и суффиксов: `Track`, не `ITrack`/`TrackDTO`. `any` не существует.

## Файлы и каталоги

`*.entry.ts` — точка входа процесса; `*.route.ts` — HTTP; `*.rpc.ts` — gRPC; `*.store.ts` — единственное место с SQL/ORM; `*.wire.ts` — клиент к чужому API; `*.policy.ts` — правила доступа, чисто; `*.shape.ts` — типы и схемы; `*.event.ts` — контракты событий; `*.job.ts` — фон и крон, идемпотентно; `*.pure.ts` — чистые вычисления, ноль I/O
- **Запрещённые имена файлов:** `utils` `util` `helpers` `helper` `common` `shared` `misc` `lib` `main` `types` `constants` `service` `manager` `handler` `index`
- **Запрещённые каталоги:** `utils` `helpers` `common` `shared` `misc` `lib` `core` `stuff` `services` `controllers` `managers` `handlers`
- **Имена от фреймворка (оставить как есть):** `page` `layout` `template` `loading` `error` `not-found` `global-error` `route` `middleware` `sitemap` `robots` `opengraph-image` `icon` `apple-icon` `manifest` `default` `instrumentation` `mod` `build`

Каталог называется по домену, не по технике. Глубина внутри `src` — не больше 3
(под `app`/`pages`/`kotlin`/`java`/`Sources` не считается: там иерархия это URL).
Публичный вход пакета — `public.ts`. Только именованные экспорты.

## Провод

Событие — свершившийся факт: `v1.{домен}.{предмет}.{что произошло}`, причастие из закрытого списка
(`activated` `added` `approved` `archived` `banned` `cancelled` `changed` `created` `decided` `deleted` `enrolled` `executed`, …). Не команда: `v1.invoice.paid`, не `v1.payInvoice`.
Живой сабджект не переименовывают — это миграция, а не рефакторинг.

## Комментарии

Пять тегов, ничего кроме: `why:` `perf:` `safety:` `spec:` `ref:`.
Комментарий отвечает «почему», а не «что». Запрещены `TODO`, ASCII-разделители, эмодзи,
нумерация шагов, JSDoc, повторяющий сигнатуру.

## Форма

- вложенность ≤ 2, аргументов ≤ 3, функция ≤ 40 строк, файл ≤ 400
- воронка: guard → acquire → derive → effect, всегда в этом порядке
- `catch` обязан пробросить дальше или вернуть типизированный отказ
- код отказа — `домен.предмет.причина` (`auth.token.expired`)
- независимые `await` — через `Promise.all`

## Границы

Время, случайность и `process.env` берутся только в ролях `entry` `route` `rpc` `job` `wire` —
внутрь домена они приходят аргументом. Зависимости направлены внутрь:
`pure` → pure, shape; `policy` → pure, shape, policy; `shape` → shape; `store` → shape, pure, store; `wire` → shape, pure, wire; `event` → shape, pure, event.

## Осознанное исключение

`// grain:allow <правило> — <причина>` — причина обязательна.
Долг легаси записан в `baseline.synx`: гейт валит только новое.
