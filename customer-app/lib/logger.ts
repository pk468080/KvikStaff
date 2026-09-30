type LogContext = Record<string, unknown>

const SENSITIVE_KEYS = new Set([
  'otp',
  'password',
  'passcode',
  'token',
  'access_token',
  'refresh_token',
  'authorization',
  'cookie',
  'secret',
  'api_key',
  'apikey',
])

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase())
}

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: __DEV__ ? value.stack : undefined,
    }
  }

  if (typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return '[Circular]'
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen))
  }

  const result: Record<string, unknown> = {}

  for (const [key, nestedValue] of Object.entries(value)) {
    result[key] = isSensitiveKey(key)
      ? '[REDACTED]'
      : sanitize(nestedValue, seen)
  }

  return result
}

function sanitizeContext(
  context?: LogContext,
): LogContext | undefined {
  if (!context) {
    return undefined
  }

  return sanitize(context) as LogContext
}

function writeLog(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: LogContext,
): void {
  const safeContext = sanitizeContext(context)

  if (safeContext) {
    console[level](message, safeContext)
  } else {
    console[level](message)
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (!__DEV__) {
      return
    }

    writeLog('debug', message, context)
  },

  info(message: string, context?: LogContext): void {
    if (!__DEV__) {
      return
    }

    writeLog('info', message, context)
  },

  warn(message: string, context?: LogContext): void {
    writeLog('warn', message, context)
  },

  error(message: string, context?: LogContext): void {
    writeLog('error', message, context)
  },
}

export default logger