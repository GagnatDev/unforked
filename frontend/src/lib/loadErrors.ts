import type { TFunction } from 'i18next'

/** i18n key returned by {@link mapAsyncCatchError} for transport-level fetch failures. */
export const COULD_NOT_REACH_SERVER_I18N_KEY = 'errors.couldNotReachServer' as const

function isLikelyFetchNetworkFailure(e: unknown): boolean {
  if (!(e instanceof TypeError)) return false
  const m = e.message
  if (m === 'Failed to fetch') return true
  if (m === 'NetworkError when attempting to fetch resource.') return true
  if (m === 'Load failed') return true
  return false
}

/**
 * Maps errors from async loaders / fetch to a short string for UI state.
 * Network-layer failures become {@link COULD_NOT_REACH_SERVER_I18N_KEY}; pass through
 * HTTP and other errors as their message.
 */
export function mapAsyncCatchError(e: unknown): string {
  if (isLikelyFetchNetworkFailure(e)) return COULD_NOT_REACH_SERVER_I18N_KEY
  return e instanceof Error ? e.message : String(e)
}

/** Renders a load error: translates known i18n keys, otherwise shows the message as-is. */
export function formatLoadErrorMessage(message: string, t: TFunction): string {
  return message === COULD_NOT_REACH_SERVER_I18N_KEY ? t(message) : message
}
