/** Whether the draft holds the keyword, for the note above the prompt. */
export type Drafted = boolean

declare module 'claude-code' {
  interface PluginState {
    retardmax: { isDrafted: Drafted }
  }
}
