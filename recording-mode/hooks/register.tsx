import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// Recording Mode: пока идёт запись экрана, прячем в транскрипте почты, ключи,
// телефоны и суммы. Меняется только то, что нарисовано; модель видит оригинал.
const isOn = atom({ plugin: 'recording-mode', key: 'isOn' } as const, false)

const RULES: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '•••@•••'],
  [/\b(sk|pk|rk|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_-]{8,}/g, '••••••••'],
  [/\b[A-Fa-f0-9]{32,}\b/g, '••••••••'],
  [/\+?\d[\d ()-]{8,}\d/g, '••• ••• ••••'],
  [/[$€₽]\s?\d+(?:[\s,.]\d+)*|\d+(?:[\s,.]\d+)*\s?(?:₽|руб\.?|USD|EUR)/g, '•••'],
]

function mask(text: string): string {
  return RULES.reduce((t, [re, to]) => t.replace(re, to), text)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'record',
      description: 'Режим записи: /record on — прятать личное, /record off — показать',
      argumentHint: 'on|off',
    })
    return next(e)
  })

  on('command.run', { command: 'record' }, async ($, e) => {
    const want = e.args.trim() === 'off' ? false : true
    await update($, isOn, () => want)
    return { text: want ? 'Режим записи включён.' : 'Режим записи выключен.' }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) =>
    (await read($, isOn)) ? next({ ...e, props: { ...e.props, text: mask(e.props.text) } }) : next(e),
  )

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) =>
    (await read($, isOn)) ? next({ ...e, props: { ...e.props, text: mask(e.props.text) } }) : next(e),
  )

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) =>
    (await read($, isOn)) && typeof e.props.output === 'string'
      ? next({ ...e, props: { ...e.props, output: mask(e.props.output) } })
      : next(e),
  )
}
