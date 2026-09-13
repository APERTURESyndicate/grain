import { describe, expect, test } from 'bun:test'
import { RuleTester } from 'eslint'
import tsParser from '@typescript-eslint/parser'
import { grainPlugin } from '../src/public.js'
import { listMobileFindings } from '../src/check-mobile.pure.ts'
import { listRustFindings } from '../src/check-rust.pure.ts'
import { formatExplain, formatUnitStat } from '../src/report.pure.ts'
import { listSqlFindings } from '../src/check-sql.pure.ts'
import { listSynxCanonFindings } from '../src/check-synx-canon.pure.ts'
import { listSynxFindings } from '../src/check-synx.pure.ts'
import { listTextFindings } from '../src/check-text.pure.ts'
import { isIgnoredPath, listPathFindings } from '../src/check-path.pure.ts'
import {
  countRepaid,
  formatBaseline,
  listExcess,
  parseBaseline,
} from '../src/baseline.pure.ts'
import { listDeadExports } from '../src/check-export.pure.ts'
import { listEventFindings } from '../src/check-event.pure.ts'
import { grain, findRuleLevel } from '../src/vocabulary.js'
import { listUnallowed } from '../src/allow.pure.ts'

const tester = new RuleTester({ languageOptions: { parser: tsParser } })

describe('typescript', () => {
  tester.run('verb-lexicon', grainPlugin.rules['verb-lexicon'], {
    valid: [
      'function findTrack(id: string) {}',
      'const makeCover = () => 1',
      'function TrackCard() {}',
      'function isReserved(name: string): boolean { return false }',
      'const hasCover = (track: Track) => true',
      'function isTrack(value: unknown): value is Track { return true }',
    ],
    invalid: [
      { code: 'function handleClick() {}', errors: 1 },
      { code: 'const processQueue = () => {}', errors: 1 },
      { code: 'function coverUrl() {}', errors: 1 },
      { code: 'function isTrackTitle(id: string): string { return id }', errors: 1 },
    ],
  })

  tester.run('find-get-contract', grainPlugin.rules['find-get-contract'], {
    valid: [
      'function findTrack(id: string): Track | null { return null }',
      'function getTrack(id: string): Track { return t }',
    ],
    invalid: [
      { code: 'function findTrack(id: string): Track { return t }', errors: 1 },
      { code: 'function getTrack(id: string): Track | null { return null }', errors: 1 },
    ],
  })

  tester.run('unit-suffix', grainPlugin.rules['unit-suffix'], {
    valid: ['const refreshTtlSec = 900', 'const priceCents = 500', 'const port = 7000'],
    invalid: [{ code: 'const timeout = 900', errors: 1 }, { code: 'const price = 5', errors: 1 }],
  })

  tester.run('no-vague-name', grainPlugin.rules['no-vague-name'], {
    valid: ['const track = 1', 'const coverUrl = "x"'],
    invalid: [
      { code: 'const userData = 1', errors: 1 },
      { code: 'const cfg = 1', errors: 1 },
      { code: 'const enhancedTrack = 1', errors: 1 },
    ],
  })

  tester.run('comment-form', grainPlugin.rules['comment-form'], {
    valid: [
      '// why: Stripe шлёт webhook раньше объекта\nconst a = 1',
      '// grain:allow unit-suffix — внешний контракт\nconst a = 1',
    ],
    invalid: [
      { code: '// increment the counter\nconst a = 1', errors: 1 },
      { code: '// TODO: доделать\nconst a = 1', errors: 1 },
      { code: '// ===============\nconst a = 1', errors: 1 },
    ],
  })

  tester.run('catch-must-act', grainPlugin.rules['catch-must-act'], {
    valid: ['try { start() } catch (error) { throw error }'],
    invalid: [{ code: 'try { start() } catch (error) { console.log(error) }', errors: 1 }],
  })
  tester.run('no-redundant-temp', grainPlugin.rules['no-redundant-temp'], {
    valid: ['function makeId() { return 1 }'],
    invalid: [
      {
        code: 'function makeId() { const value = compute(); return value }',
        errors: 1,
        output: 'function makeId() { return compute() }',
      },
    ],
  })
})

describe('границы (1.1)', () => {
  tester.run('boundary-effect', grainPlugin.rules['boundary-effect'], {
    valid: [
      { code: 'const nowMs = Date.now()', filename: 'src/track/track.entry.ts' },
      { code: 'export function deriveAge(nowMs: number) { return nowMs }', filename: 'src/track/track.pure.ts' },
    ],
    invalid: [
      { code: 'const nowMs = Date.now()', filename: 'src/track/track.pure.ts', errors: 1 },
      { code: 'const key = process.env.SECRET', filename: 'src/track/track.policy.ts', errors: 1 },
      { code: 'const at = new Date()', filename: 'src/track/track.store.ts', errors: 1 },
    ],
  })

  tester.run('inward-import', grainPlugin.rules['inward-import'], {
    valid: [
      { code: "import { Track } from './track.shape'", filename: 'src/track/track.pure.ts' },
      { code: "import { saveTrack } from './track.store'", filename: 'src/track/track.route.ts' },
    ],
    invalid: [
      { code: "import { saveTrack } from './track.store'", filename: 'src/track/track.pure.ts', errors: 1 },
      { code: "import { readCover } from './cover.wire'", filename: 'src/track/track.policy.ts', errors: 1 },
    ],
  })

  tester.run('explicit-parallel', grainPlugin.rules['explicit-parallel'], {
    valid: [
      'async function loadPage() { const track = await findTrack(1); const cover = await readCover(track) }',
    ],
    invalid: [
      {
        code: 'async function loadPage() { const track = await findTrack(1); const genres = await listGenres() }',
        errors: 1,
      },
    ],
  })
})

describe('уровни и мёртвые экспорты (1.1)', () => {
  test('правило знает свой уровень', () => {
    expect(findRuleLevel('verb-lexicon')).toBe(1)
    expect(findRuleLevel('inward-import')).toBe(2)
    expect(grain.levelRules[1].length + grain.levelRules[2].length).toBeGreaterThan(20)
  })

  test('экспорт без потребителя', () => {
    const sources = new Map([
      ['src/track/track.pure.ts', 'export function deriveAge() {}\nexport function makeSlug() {}'],
      ['src/track/track.route.ts', 'import { makeSlug } from "./track.pure"'],
    ])
    const dead = listDeadExports(sources)
    expect(dead.map((finding) => finding.line)).toEqual([1])
  })
})

describe('rust', () => {
    const findings = listRustFindings(
    'a.rs',
    ['fn handle_event() {}', 'fn find_track() {}', 'let timeout = 30;', 'let is_ready = true;'].join('\n'),
  )
  expect(findings.map((finding) => finding.line)).toEqual([1, 3])
})

describe('sql', () => {
    const findings = listSqlFindings(
    'a.sql',
    [
      'create table tracks (',
      '  created_at timestamptz not null,',
      '  updated timestamptz not null,',
      '  price_cents integer not null,',
      '  duration integer not null,',
      '  published boolean not null',
      ');',
      'create index tracks_author on tracks (author_id);',
    ].join('\n'),
  )
  expect(findings.map((finding) => finding.line)).toEqual([3, 5, 6, 8])
})

describe('файлы и текст', () => {
    expect(listPathFindings('apps/as-music/src/track/utils.ts')).toHaveLength(1)
  expect(listPathFindings('apps/as-music/src/app/api/auth/twofa/route.ts')).toHaveLength(0)
  expect(listPathFindings('apps/as-music/src/track/one/two/three/track.store.ts')).toHaveLength(1)
  expect(listPathFindings('apps/as-music/src/track/track.store.ts')).toHaveLength(0)
  expect(listPathFindings('apps/as-music/src/helpers/track.store.ts')).toHaveLength(1)
    expect(listTextFindings('a.ts', '// why: причина\n//   продолжение', '//')).toHaveLength(0)
  expect(listTextFindings('a.ts', '// просто мысль', '//')).toHaveLength(1)
})

describe('правила без покрытия (1.2)', () => {
  tester.run('boolean-prefix', grainPlugin.rules['boolean-prefix'], {
    valid: ['const isReady: boolean = true', 'const hasCover = track !== null'],
    invalid: [{ code: 'const ready = true', errors: 1 }],
  })

  tester.run('fail-code', grainPlugin.rules['fail-code'], {
    valid: ["const fail = { code: 'auth.token.expired' }"],
    invalid: [{ code: "const fail = { code: 'BAD_TOKEN' }", errors: 1 }],
  })

  tester.run('no-default-export', grainPlugin.rules['no-default-export'], {
    valid: ['export const findTrack = () => null'],
    invalid: [{ code: 'export default function findTrack() {}', errors: 1 }],
  })

  tester.run('no-emoji-log', grainPlugin.rules['no-emoji-log'], {
    valid: ["console.log('ready')"],
    invalid: [{ code: "console.log('✅ ready')", errors: 1 }],
  })

  tester.run('unit-suffix', grainPlugin.rules['unit-suffix'], {
    valid: [
      'function stopAfter(delaySec: number) {}',
      'const DEADLINE_MS = 5000',
      'const box = { style: { fontSize: 12 } }',
      'const trackId = 4',
    ],
    invalid: [
      { code: 'function stopAfter(delay: number) {}', errors: 1 },
      { code: 'const DEADLINE = 5000', errors: 1 },
    ],
  })

  tester.run('catch-must-act', grainPlugin.rules['catch-must-act'], {
    valid: ['try { start() } catch (error) { if (isFatal) throw error }'],
    invalid: [
      { code: 'try { start() } catch (error) { if (isFatal) console.log(error) }', errors: 1 },
    ],
  })

  tester.run('comment-form', grainPlugin.rules['comment-form'], {
    valid: ['#!/usr/bin/env bun\nconst count = 1'],
    invalid: [{ code: '// пересказ строки ниже\nconst count = 1', errors: 1 }],
  })
})

describe('пути и долг (1.2)', () => {
  test('сгенерированный код вне стандарта', () => {
    expect(isIgnoredPath('apps/as-profile/src/db/migrations/0021_badge.sql')).toBe(true)
    expect(isIgnoredPath('apps/as-profile/src/badge/badge.store.ts')).toBe(false)
    expect(isIgnoredPath('apps/as-site/.next/server/page.js')).toBe(true)
  })

  test('долг пропускает записанное и валит новое', () => {
    const fail = (file: string, rule: string) => ({ file, line: 1, rule, message: 'x' })
    const debt = [fail('a.ts', 'verb-lexicon'), fail('a.ts', 'verb-lexicon'), fail('b.ts', 'unit-suffix')]
    const ledger = parseBaseline(formatBaseline(debt, '1.2'))
    expect(listExcess(debt, ledger)).toHaveLength(0)
    expect(listExcess([...debt, fail('a.ts', 'verb-lexicon')], ledger)).toHaveLength(1)
    expect(countRepaid([fail('a.ts', 'verb-lexicon')], ledger)).toBe(2)
  })
})

describe('kotlin и swift (1.2)', () => {
  test('глаголы, единицы и булевы — те же', () => {
    const findings = listMobileFindings(
      'Player.kt',
      [
        'suspend fun findTrack(trackId: String): Track? = null',
        'fun isReady(): Boolean = true',
        'override fun onCreate(bundle: Bundle) {}',
        'fun handleTap() {}',
        'val bufferMs: Long = 2_500',
        'val catalogSize: Int = 0',
        'var muted: Boolean = false',
      ].join('\n'),
    )
    expect(findings.map((finding) => finding.line)).toEqual([4, 6, 7])
  })

  test('имя файла — PascalCase, роль не нужна', () => {
    expect(listPathFindings('apps/as-resonance-native/android/src/main/kotlin/com/as/PlayerService.kt')).toHaveLength(0)
    expect(listPathFindings('apps/as-resonance-native/android/src/main/kotlin/com/as/player-service.kt')).toHaveLength(1)
  })
})

describe('отчёты (1.2)', () => {
  test('карта долга группируется по юнитам монорепо', () => {
    const fail = (file: string, rule: string) => ({ file, line: 1, rule, message: 'x' })
    const stat = formatUnitStat([
      fail('apps/as-ai/src/one.ts', 'comment-form'),
      fail('apps/as-ai/src/two.ts', 'comment-form'),
      fail('packages/style/src/one.ts', 'verb-lexicon'),
      fail('scripts/one.ts', 'file-role'),
    ])
    expect(stat).toContain('apps/as-ai')
    expect(stat).toContain('comment-form 2')
    expect(stat.indexOf('packages/style')).toBeLessThan(stat.indexOf('apps/as-ai'))
  })

  test('объяснение правила берётся из его же описания', () => {
    const own = { 'unit-suffix': 'Числовое имя несёт единицу измерения' }
    expect(formatExplain('unit-suffix', own, 'https://docs')).toContain('единицу измерения')
    expect(formatExplain('sql-column', own, 'https://docs')).toContain('snake_case')
    expect(formatExplain('нет-такого', own, 'https://docs')).toContain('Есть:')
  })
})

describe('synx (1.2)', () => {
  test('ключи конфига держат единицы и булевы префиксы', () => {
    const source = [
      '!active',
      '# Сервер',
      'port[type:int]:env:default:7001 PORT',
      'pool_max[type:int] 20',
      'refresh_ttl_sec[type:int] 900',
      'debug true',
      'is_verbose false',
    ].join('\n')
    expect(listSynxFindings('apps/as-auth/config/app.synx', source).map((one) => one.line)).toEqual([
      4, 6,
    ])
  })

  test('данные в том же формате не проверяются', () => {
    const source = ['moveCost 3', 'atk 12'].join('\n')
    expect(listSynxFindings('apps/as-frontier/public/game/graphics.synx', source)).toHaveLength(0)
  })
})

describe('провод (1.2)', () => {
  test('событие называется свершившимся фактом', () => {
    const source = [
      "emit('v1.user.email.verified', payload)",
      "emit('v1.iam.role.statusChanged', payload)",
      "emit('v1.billing.payInvoice', payload)",
      "const version = 'v1.2.3'",
      "subscribe('v1.billing.')",
    ].join('\n')
    expect(listEventFindings('a.event.ts', source).map((one) => one.line)).toEqual([3])
  })
})

describe('согласованность конфигов (1.2)', () => {
  test('одно значение платформы — одно имя во всех сервисах', () => {
    const first = ['redis', '  url:env REDIS_URL'].join('\n')
    const second = ['redis', '  url:env REDIS_URL'].join('\n')
    const third = 'redis_url:env REDIS_URL'
    const findings = listSynxCanonFindings(
      new Map([
        ['apps/as-a/config/app.synx', first],
        ['apps/as-b/config/app.synx', second],
        ['apps/as-c/config/app.synx', third],
      ]),
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]?.file).toBe('apps/as-c/config/app.synx')
    expect(findings[0]?.message).toContain('redis.url')
  })

  test('данные вне списка конфигов не сравниваются', () => {
    const findings = listSynxCanonFindings(
      new Map([
        ['apps/as-a/config/app.synx', 'redis_url:env REDIS_URL'],
        ['apps/as-b/content/cosmetics.synx', 'redis\n  url:env REDIS_URL'],
      ]),
    )
    expect(findings).toHaveLength(0)
  })
})

describe('осознанное исключение (1.2)', () => {
  const makeFinding = (lineIndex: number, rule: string) => ({
    file: 'one.pure.ts',
    line: lineIndex,
    rule,
    message: '',
  })

  test('grain:allow прикрывает свою строку и следующую, только названное правило', () => {
    const source = [
      'export function handleClick(): void {}',
      '// grain:allow verb-lexicon — имя из чужого SDK',
      'export function handleTap(): void {}',
      'export const timeout = 5 // grain:allow unit-suffix — поле чужого контракта',
    ].join('\n')
    const kept = listUnallowed(
      [
        makeFinding(1, 'verb-lexicon'),
        makeFinding(3, 'verb-lexicon'),
        makeFinding(4, 'unit-suffix'),
        makeFinding(4, 'verb-lexicon'),
      ],
      new Map([['one.pure.ts', source]]),
    )
    expect(kept.map((one) => [one.line, one.rule])).toEqual([
      [1, 'verb-lexicon'],
      [4, 'verb-lexicon'],
    ])
  })
})
