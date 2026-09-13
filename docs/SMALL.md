# Small GRAIN

Копируется в промт целиком. Это не весь стандарт — только законы, которые
переживают любую модель и любой язык. Полный стандарт — для человека и линтера.
Собирается из `grain.synx` (`bun run docs`).

```
GRAIN — минимальный свод правил кода. Соблюдай буквально. Если правило не покрывает
случай, действуй по смыслу правила, а не по своей привычке. Новых правил не выдумывай.

1. ИМЯ ФУНКЦИИ — ДЕЙСТВИЕ. Начинается с глагола из списка:
   find get list count read write load save make derive resolve parse format encode decode normalize sign verify hash create delete archive restore ensure assert apply set emit send start stop use with render
   Предикат называется префиксом: is has can should was will must.
   ЗАПРЕЩЕНО: handle process manage do perform execute check init update fetch retrieve calculate compute generate build setup validate transform convert prepare determine deal run trigger
2. КОНТРАКТ В ИМЕНИ. find* может вернуть null и никогда не бросает. get* гарантирует
   значение. list* — всегда коллекция. count* — число.
3. ЧИСЛО НЕСЁТ ЕДИНИЦУ: At Ms Sec Min Hours Days Bytes Kb Mb Gb Cents Ratio Pct Count Index Px Deg Hz Bpm Db (refreshTtlSec, priceCents,
   sizeBytes). Без единицы допустимо только безразмерное: x y z id width height depth port page limit offset version priority.
4. БУЛЕВО — только с префиксом: is has can should was will must.
5. СЛОВА-ПУСТЫШКИ ЗАПРЕЩЕНЫ В ИМЕНАХ: data info obj object temp tmp stuff misc thing things res ret arr str num flag val result helper handler manager wrapper util utils.
   Сокращения пишутся целиком: request, response, message, error, index, config.
6. КОММЕНТАРИЙ ОТВЕЧАЕТ «ПОЧЕМУ» и начинается с тега: why: perf: safety: spec: ref:.
   Пересказ кода, TODO, эмодзи, ASCII-разделители, «шаг 1» — не писать.
7. ФАЙЛ = ОДНА РОЛЬ, роль в имени: <домен>.entry.ts <домен>.route.ts <домен>.rpc.ts <домен>.store.ts <домен>.wire.ts <домен>.policy.ts <домен>.shape.ts <домен>.event.ts <домен>.job.ts <домен>.pure.ts.
   store — единственное место с SQL. pure — ноль I/O. Запрещены: utils util helpers helper common shared misc lib main types constants service manager handler index.
8. CATCH ОБЯЗАН ДЕЙСТВОВАТЬ: пробросить дальше или вернуть типизированный отказ.
   Записать в лог и продолжить — нельзя.
9. НЕДЕТЕРМИНИЗМ ТОЛЬКО НА ГРАНИЦЕ: Date.now Math.random crypto.randomUUID process.env performance.now — только в
   ролях entry route rpc job wire. В домен приходят аргументом.
10. НЕЗАВИСИМЫЕ AWAIT — ЧЕРЕЗ Promise.all. Последовательность только там, где второй
    вызов использует результат первого.
11. ТОЛЬКО ИМЕНОВАННЫЕ ЭКСПОРТЫ. any не существует: внешнее приходит как unknown и
    разбирается схемой.
12. СОБЫТИЕ — СВЕРШИВШИЙСЯ ФАКТ: v1.{домен}.{предмет}.{что произошло} (verified,
    granted, paid), не команда (не payInvoice).

Если сомневаешься в имени — возьми ближайший глагол из списка. Не изобретай синоним,
не добавляй «улучшений» к правилам и не объясняй правила в коде.
```
