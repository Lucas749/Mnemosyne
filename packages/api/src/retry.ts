const TRANSIENT_CODES = new Set([
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'ECONNREFUSED',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_SOCKET',
])

export function isLikelyTransientNetworkError(err: unknown): boolean {
  if (err == null) return false
  const e = err as { cause?: unknown; code?: string | number; message?: string; status?: number; statusCode?: number }

  const inner = e.cause
  if (inner && isLikelyTransientNetworkError(inner)) return true

  if (e.code != null && TRANSIENT_CODES.has(String(e.code))) return true

  const msg = (e.message ?? String(err)).toLowerCase()
  const transportHints = [
    'fetch failed',
    'network error',
    'failed to fetch',
    'socket',
    'timeout',
    'timed out',
    'econnreset',
    'enotfound',
    'connection reset',
    'temporarily unavailable',
    'service unavailable',
    'bad gateway',
    'gateway timeout',
    'rate limit',
    'too many requests',
  ]
  if (transportHints.some(h => msg.includes(h))) return true

  const status = e.status ?? e.statusCode
  if (status === 408 || status === 425 || status === 429 || status === 500
    || status === 502 || status === 503 || status === 504) return true

  const noRetry = ['insufficient funds', 'execution reverted', 'revert', 'nonce too low', 'replacement']
  if (noRetry.some(h => msg.includes(h))) return false

  return false
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retries only on likely transport / RPC flake. Does not substitute data on failure.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3)
  const baseDelayMs = options.baseDelayMs ?? 400
  const label = options.label

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastErr = err
      if (!isLikelyTransientNetworkError(err) || attempt === maxAttempts) throw err
      const waitMs = baseDelayMs * 2 ** (attempt - 1)
      if (label) {
        console.warn(`${label} transient error (attempt ${attempt}/${maxAttempts}), ${waitMs}ms:`, (err as Error).message?.slice(0, 120))
      }
      await sleep(waitMs)
    }
  }
  throw lastErr
}

const PERMANENT_ERR_HINTS = [
  'insufficient funds',
  'nonce too low',
  'replacement',
  'user rejected',
  'user denied',
  'reject the request',
  'action rejected',
]

/** True when retrying almost certainly wastes round-trips / gas assumptions. */
export function isProbablyPermanentFailure(err: unknown): boolean {
  if (err == null) return false
  const e = err as { cause?: unknown; message?: string; shortMessage?: string }
  const msg = `${e.shortMessage ?? ''} ${e.message ?? ''}`.toLowerCase()
  if (PERMANENT_ERR_HINTS.some(h => msg.includes(h))) return true
  const c = e.cause
  return c !== undefined ? isProbablyPermanentFailure(c) : false
}

/**
 * Retries on transport flakes and unspecified RPC errors — stops on likely wallet / signer failures.
 */
export async function withRetryBroad<T>(
  operation: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; label?: string } = {},
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 4)
  const baseDelayMs = options.baseDelayMs ?? 500
  const label = options.label

  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation()
    } catch (err) {
      lastErr = err
      const transient = isLikelyTransientNetworkError(err)
      const permanent = isProbablyPermanentFailure(err)
      if (permanent || (!transient && attempt === maxAttempts)) throw err
      const waitMs = baseDelayMs * 2 ** (attempt - 1)
      const kind = transient ? 'transient/unknown (likely)' : 'non-transient (speculative)'
      console.warn(`${label ?? '[retryBroad]'} ${kind} (attempt ${attempt}/${maxAttempts}), ${waitMs}ms:`, (err as Error)?.message?.slice?.(0, 140))
      await sleep(waitMs)
    }
  }
  throw lastErr
}
