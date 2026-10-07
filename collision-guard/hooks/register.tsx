import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CollisionGuardMark } from '../types'

// Collision Guard: каждый чат отмечает в общем хранилище, какие файлы он правил.
// Если файл недавно правил ДРУГОЙ чат — первая попытка правки останавливается
// с предупреждением, вторая проходит (пользователь сказал «продолжай»).
const WINDOW_MS = 30 * 60 * 1000
const warned = atom({ plugin: 'collision-guard', key: 'warned' } as const, [])

const keyOf = (path: string) => `edit:${path}`

async function guard($: EngineInterface, path: string): Promise<string | null> {
  const mark = (await $.store.get(keyOf(path))) as CollisionGuardMark | undefined
  if (!mark) return null
  const me = await $.session.id()
  const age = (await $.clock.now()) - mark.at
  if (mark.sessionId === me || age > WINDOW_MS) return null
  if ((await read($, warned)).includes(path)) return null

  await update($, warned, list => [...list, path])
  const minutes = Math.max(1, Math.round(age / 60000))
  $.ui.toast(`Collision Guard: ${path} менял другой чат ${minutes} мин назад`)
  return (
    `Collision Guard: файл ${path} ${minutes} мин назад правил другой чат Claude Code. ` +
    `Правка остановлена. Перечитай файл, скажи пользователю, что изменилось, и спроси, продолжать ли. ` +
    `Если пользователь скажет продолжать — повтори правку, второй раз она пройдёт.`
  )
}

async function remember($: EngineInterface, path: string) {
  const value: CollisionGuardMark = { sessionId: await $.session.id(), at: await $.clock.now() }
  await $.store.set(keyOf(path), value)
}

export const register: Register = on => {
  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const deny = await guard($, e.file_path)
    if (deny) return { deny }
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) await remember($, e.file_path)
    return ran
  })

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const deny = await guard($, e.file_path)
    if (deny) return { deny }
    const ran = await next(e)
    if (ran.deny === undefined && !ran.isError) await remember($, e.file_path)
    return ran
  })
}
