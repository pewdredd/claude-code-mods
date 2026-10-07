export type RecordingModeOn = boolean

declare module 'claude-code' {
  interface PluginState {
    'recording-mode': { isOn: RecordingModeOn }
  }
}
