import { atom, read, update } from 'claude-code'
import type { Register, SessionRateLimit } from 'claude-code'

import type { CacheKeeperGauge } from '../types'

// Cache Keeper: сколько осталось жить кэшу промпта, насколько забит контекст,
// сколько съедено лимитов, и кнопка «перенести сессию» в новый чат.
// Claude Code на подписке держит кэш час; на API по умолчанию 5 минут
const CACHE_TTL_MS = 60 * 60 * 1000
const WARN_MS = 5 * 60 * 1000

const lastTurnAt = atom({ plugin: 'cache-keeper', key: 'lastTurnAt' } as const, null)
const now = atom({ plugin: 'cache-keeper', key: 'now' } as const, 0)
const gauge = atom({ plugin: 'cache-keeper', key: 'gauge' } as const, null)

const HANDOFF =
  'Подготовь перенос сессии. Запиши в HANDOFF.md в корне проекта: цель, что уже сделано, ' +
  'какие файлы менялись, на чём остановились, следующие 3 шага и важные решения. ' +
  'Пиши так, чтобы новый чат продолжил работу, прочитав только этот файл.'

function percentOf(limits: SessionRateLimit[], kind: string): number | null {
  return limits.find(l => l.kind === kind)?.percentUsed ?? null
}

function kilo(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n)
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export const register: Register = on => {
  let isWarned = false

  on('session.start', async ($, e, next) => {
    $.clock.every(5000, async () => {
      const t = await $.clock.now()
      await update($, now, () => t)
      const last = await read($, lastTurnAt)
      const left = last === null ? null : CACHE_TTL_MS - (t - last)
      if (left !== null && left <= WARN_MS && !isWarned) {
        isWarned = true
        $.ui.toast('Cache Keeper: кэш остынет через 5 минут - продолжи, сожми (/compact) или перенеси сессию')
      }
    })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const g: CacheKeeperGauge = {
      contextPercent: e.context.percent ?? null,
      contextTokens: e.context.tokens ?? null,
      fiveHour: percentOf(e.rateLimits, 'five_hour'),
      sevenDay: percentOf(e.rateLimits, 'seven_day'),
      costUsd: e.cost?.usd ?? null,
    }
    await update($, gauge, () => g)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      const t = await $.clock.now()
      isWarned = false
      await update($, lastTurnAt, () => t)
      await update($, now, () => t)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const g = await read($, gauge)
    const last = await read($, lastTurnAt)
    if (e.props.hasSurvey || (g === null && last === null)) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const left = last === null ? null : CACHE_TTL_MS - ((await read($, now)) - last)

    // точка светофором: зелёная - кэш тёплый, жёлтая - скоро остынет, красная - остыл
    const isWarm = e.props.isWorking || left === null || left > WARN_MS
    const dot = isWarm ? 'success' : left > 0 ? 'warning' : 'error'
    const cache = isWarm
      ? left === null || e.props.isWorking ? 'кэш тёплый' : `кэш тёплый ${Math.ceil(left / 60000)}м`
      : left > 0 ? `кэш остывает ${mmss(left)}` : 'кэш остыл'

    const limits = [
      g?.fiveHour != null ? `5ч ${g.fiveHour}%` : null,
      g?.sevenDay != null ? `неделя ${g.sevenDay}%` : null,
    ].filter(Boolean)
    const parts = [
      g?.contextTokens != null
        ? `контекст ${kilo(g.contextTokens)}`
        : g?.contextPercent != null ? `контекст ${Math.round(g.contextPercent)}%` : null,
      limits.length ? limits.join(' · ') : null,
      g?.costUsd != null ? `сессия $${g.costUsd.toFixed(2)}` : null,
    ].filter((p): p is string => p !== null)

    const mine = (
      <Box flexDirection="row" justifyContent="space-between" width="100%">
        <Box flexDirection="row" flexShrink={1}>
          <Text color={dot}>● {cache}</Text>
          {parts.map(p => (
            <Text dimColor wrap="truncate">{`  │  ${p}`}</Text>
          ))}
        </Box>
        <Button
          key="handoff"
          plain
          hotkey="h"
          label="перенести сессию"
          onPress={() => $.prompt.submit({ text: HANDOFF })}
        />
      </Box>
    )

    // место над полем ввода общее: дорисовываем под собой строки других модов
    return (
      <Box flexDirection="column">
        {mine}
        {await next(e)}
      </Box>
    )
  })
}
