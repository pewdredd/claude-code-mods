import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { GoalMeterGoal } from '../types'

// Goal Meter: /goal-meter <цель> — цель разбивается на шаги, над полем ввода
// рисуется прогресс-бар, после каждого ответа модель отмечает готовые шаги.
const goal = atom({ plugin: 'goal-meter', key: 'goal' } as const, null)

function jsonArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const list = JSON.parse(match[0])
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

const BAR_WIDTH = 24

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'goal-meter',
      description: 'Поставить цель с прогресс-баром (/goal-meter off — убрать)',
      argumentHint: '<цель> | off',
    })
    return next(e)
  })

  on('command.run', { command: 'goal-meter' }, async ($, e) => {
    const text = e.args.trim()
    if (text === '' || text === 'off') {
      await update($, goal, () => null)
      return { text: 'Цель снята.' }
    }

    const split = await $.model.complete({
      model: 'claude-haiku-4-5-20251001',
      prompt:
        `Break this goal into 3-7 concrete, checkable steps. Answer in the goal's language. ` +
        `Reply with a JSON array of short strings and nothing else.\n\nGoal: ${text}`,
      maxTokens: 500,
    })
    const steps = split.isAnswered
      ? jsonArray(split.text).filter((s): s is string => typeof s === 'string').slice(0, 7)
      : []
    const value: GoalMeterGoal = { text, steps: steps.map(s => ({ text: s, isDone: false })) }
    await update($, goal, () => value)

    const plan = value.steps.map((s, i) => `${i + 1}. ${s.text}`).join('\n')
    $.clock.after(0, () => void $.prompt.submit({ text: `Цель: ${text}\n\nШаги:\n${plan}\n\nВыполни их по порядку.` }))
    return { text: `Цель поставлена, шагов: ${value.steps.length}.` }
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    const current = await read($, goal)
    if (e.agentId || e.reason !== 'answer' || current === null || current.steps.length === 0) return result

    $.clock.after(0, async () => {
      const list = current.steps.map((s, i) => `${i}. ${s.text}`).join('\n')
      const answer = await $.model.fork({
        prompt:
          `Which of these steps are fully done in this conversation so far?\n${list}\n\n` +
          `Reply with a JSON array of the done step numbers and nothing else.`,
      })
      if (!answer.isAnswered) return
      const done = new Set(jsonArray(answer.text).filter((n): n is number => typeof n === 'number'))
      await update($, goal, g =>
        g === null ? g : { ...g, steps: g.steps.map((s, i) => ({ ...s, isDone: s.isDone || done.has(i) })) },
      )
    })
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, goal)
    if (e.props.hasSurvey || current === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const done = current.steps.filter(s => s.isDone).length
    const total = current.steps.length
    const next_ = current.steps.find(s => !s.isDone)

    const filled = total === 0 ? 0 : Math.round((done / total) * BAR_WIDTH)
    const mine = (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text dimColor>цель: </Text>
          <Text bold>{current.text}</Text>
        </Text>
        <Text>
          <Text color="success">{'━'.repeat(filled)}</Text>
          <Text dimColor>{'━'.repeat(BAR_WIDTH - filled)}</Text>
          <Text color={done === total ? 'success' : undefined}>{`  ${done}/${total}`}</Text>
        </Text>
        {next_ && <Text dimColor>{`сейчас: ${next_.text}`}</Text>}
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
