# GRAIN 1.2 — Kotlin и Swift

Дополнение к [ядру стандарта](README.md). Оболочки Resonance — Android (Kotlin) и iOS (Swift) — держат тот же стандарт, что и веб: словарь глаголов, булевы префиксы, единицы измерения, запрет пустых слов. Разница только в том, что диктует платформа.

## Что диктует платформа, а не автор

**Имя файла — PascalCase и совпадает с именем типа.** `PlayerService.kt`, `AccountSheet.kt`. Это требование языка, а не выбор: kebab-case здесь невозможен. Роль в имени файла не пишется — её несёт пакет.

**Путь под `src/<sourceSet>/kotlin/` — это имя пакета.** `com/aperturesyndicate/resonance/ui/account/` не «глубокая иерархия», а `package com.aperturesyndicate.resonance.ui.account`. Предел глубины там не считается (`dirs_framework`). То же для `Sources/` в SPM.

**Методы жизненного цикла не переименовываются.** `onCreate`, `onDestroy`, `onStartCommand`, `viewDidLoad`, `body`, `makeUIView` — их зовёт платформа по имени. Список в `check-mobile.pure.ts`; если платформа добавит свой — он дописывается туда, а не обходится через `grain:allow`.

**`@Composable` и SwiftUI-вью — существительные в PascalCase**, как компоненты React: `TrackCard`, `AccountSheet`. Глагол от них не требуется.

## Что не меняется

```kotlin
suspend fun findTrack(trackId: String): Track?      // может вернуть null
suspend fun getTrack(trackId: String): Track        // гарантирует значение
fun isReady(): Boolean                              // предикат — префикс, не глагол
val bufferMs: Long = 2_500                          // число несёт единицу
val catalogCount: Int = 0                           // не catalogSize
var isMuted: Boolean = false                        // булево — is/has/can/should/was/will/must
```

Запрещены те же глаголы: `handleTap` → `submitTap`, `updateSetting` → `saveSetting`, `buildShell` → `makeShell`, `checkAccess` → `isAllowed`. Пустые слова (`data`, `info`, `result`, `manager`) запрещены и здесь.

## Комментарии

Те же пять тегов — `why: perf: safety: spec: ref:`. Комментарий, объясняющий обход платформенной особенности, — это `why:`, и он ценнее любого другого: следующий человек не полезет чинить «странный» код.

```kotlin
// why: ExoPlayer теряет позицию при смене аудиофокуса — держим её сами
```

## Зеркало логики

Правило продукта пишется один раз в ядре, оболочка только рисует. Если код в Kotlin повторяет логику ядра, это ошибка архитектуры, а не стиля — GRAIN такого не ловит, ловит ревью. Зеркало допустимо там, где возможность платформенная (медиасессия, системный пикер, файлы устройства), и помечается комментарием `why:`, объясняющим, почему оно зеркало.
