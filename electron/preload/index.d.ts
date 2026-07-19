export {}

declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
      once: (channel: string, callback: (...args: unknown[]) => void) => void
    }
  }
}
