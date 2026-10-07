export type CacheKeeperGauge = {
  contextPercent: number | null
  contextTokens: number | null
  fiveHour: number | null
  sevenDay: number | null
  costUsd: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'cache-keeper': { lastTurnAt: number | null; now: number; gauge: CacheKeeperGauge | null }
  }
}
