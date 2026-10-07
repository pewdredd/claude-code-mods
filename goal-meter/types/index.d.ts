export type GoalMeterGoal = {
  text: string
  steps: Array<{ text: string; isDone: boolean }>
}

declare module 'claude-code' {
  interface PluginState {
    'goal-meter': { goal: GoalMeterGoal | null }
  }
}
