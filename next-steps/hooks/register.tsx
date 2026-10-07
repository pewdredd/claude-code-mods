import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// Next Steps: после каждого ответа спрашиваем модель (через fork, из кэша)
// о трёх следующих шагах и рисуем их кнопками над полем ввода.
const steps = atom({ plugin: 'next-steps', key: 'steps' } as const, [])
const isHidden = atom({ plugin: 'next-steps', key: 'isHidden' } as const, false)

const ASK =
  'Based on this conversation, suggest exactly 3 short next steps the user would most likely ask you to do next. ' +
  'Answer in the language of the conversation. Each step is an imperative phrase under 60 characters. ' +
  'Reply with a JSON array of 3 strings and nothing else.'

function parse(text: string): string[] {
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) return []
  try {
    const list = JSON.parse(match[0])
    return Array.isArray(list) ? list.filter(s => typeof s === 'string').slice(0, 3) : []
  } catch {
    return []
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'next-steps', description: 'Показать или спрятать кнопки следующих шагов' })
    return next(e)
  })

  on('command.run', { command: 'next-steps' }, async $ => {
    const hidden = await update($, isHidden, v => !v)
    return { text: hidden ? 'Next Steps выключен.' : 'Next Steps включён.' }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, steps, () => [])
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId || e.reason !== 'answer' || (await read($, isHidden))) return result

    // fork живёт дольше хука, поэтому запускаем его таймером
    $.clock.after(0, async () => {
      try {
        const answer = await $.model.fork({ prompt: ASK })
        if (!answer.isAnswered) {
          $.ui.log(`next-steps: модель не ответила (${answer.reason})`)
          return
        }
        const list = parse(answer.text)
        if (list.length === 0) $.ui.log(`next-steps: не разобрал ответ: ${answer.text.slice(0, 120)}`)
        await update($, steps, () => list)
      } catch (err) {
        $.ui.log(`next-steps: ошибка ${String(err).slice(0, 160)}`)
      }
    })
    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, steps)
    if (e.props.hasSurvey || e.props.isWorking || list.length === 0 || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const mine = (
      <Box flexDirection="column" marginTop={1}>
        <Text dimColor>дальше:</Text>
        <Box flexDirection="column" paddingLeft={2}>
          {list.map((step, i) => (
            <Button
              key={`step-${i}`}
              plain
              hotkey={String(i + 1)}
              label={step}
              onPress={async () => {
                await update($, steps, () => [])
                await $.prompt.submit({ text: step })
              }}
            />
          ))}
          <Button key="dismiss" plain dimColor hotkey="0" label="скрыть" onPress={() => update($, steps, () => [])} />
        </Box>
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
