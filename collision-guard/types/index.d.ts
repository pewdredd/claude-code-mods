export type CollisionGuardMark = { sessionId: string; at: number }

declare module 'claude-code' {
  interface PluginState {
    'collision-guard': { warned: string[] }
  }
}
