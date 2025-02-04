export const logger = {
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.debug(...args)
    }
  },
  error: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') {
      console.error(...args)
    }
  },
}
