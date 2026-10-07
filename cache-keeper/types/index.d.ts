export type CacheKeeperGauge = {
  contextPercent: number | null
  contextTokens: number | null
  fiveHour: number | null
  sevenDay: number | null
  costUsd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': {
      lastTurnAt: number | null
      now: number
      gauge: CacheKeeperGauge | null
      // текст переноса из последнего ответа Claude; null - кнопку «Очистить и продолжить» не показываем
      handoff: string | null
    }
    // чужое значение, только чтение: включён ли режим записи у recording-mode
    'recording-mode': { isOn: boolean }
  }
}
