// Production logging utility
// Only log in development, suppress in production except for errors

const isDev = process.env.NODE_ENV !== 'production'

export const logger = {
  log: (...args: any[]) => {
    if (isDev) {
      console.log(...args)
    }
  },
  error: (...args: any[]) => {
    console.error(...args)
  },
  warn: (...args: any[]) => {
    if (isDev) {
      console.warn(...args)
    }
  },
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args)
    }
  }
}
