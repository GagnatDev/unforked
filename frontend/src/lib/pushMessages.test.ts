import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onPushMessage, startPushMessages, type InPagePushPayload } from './pushMessages'

type MessageHandler = (event: { data: unknown }) => void

function wireServiceWorkerMessages(): MessageHandler {
  let handler: MessageHandler | undefined
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      addEventListener: (_type: string, fn: MessageHandler) => {
        handler = fn
      },
    },
    configurable: true,
  })
  startPushMessages()
  if (!handler) throw new Error('startPushMessages did not register a listener')
  return handler
}

describe('pushMessages', () => {
  let emit: MessageHandler

  beforeEach(() => {
    emit = wireServiceWorkerMessages()
  })

  it('dispatches focused-window push payloads to subscribers', () => {
    const received: InPagePushPayload[] = []
    const unsubscribe = onPushMessage((p) => received.push(p))

    const payload = { title: 'Hi', body: 'There', url: '/shopping-list' }
    emit({ data: { type: 'push', payload } })
    expect(received).toEqual([payload])

    unsubscribe()
    emit({ data: { type: 'push', payload } })
    expect(received).toHaveLength(1)
  })

  it('ignores malformed messages', () => {
    const listener = vi.fn()
    const unsubscribe = onPushMessage(listener)
    emit({ data: null })
    emit({ data: 'string' })
    emit({ data: { type: 'push', payload: { nope: true } } })
    emit({ data: { type: 'other' } })
    expect(listener).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('routes push-navigate deep links client-side via history + popstate', () => {
    const popstate = vi.fn()
    window.addEventListener('popstate', popstate)
    emit({ data: { type: 'push-navigate', url: '/shopping-list?week=2026-W30' } })
    expect(window.location.pathname + window.location.search).toBe(
      '/shopping-list?week=2026-W30'
    )
    expect(popstate).toHaveBeenCalledOnce()
    window.removeEventListener('popstate', popstate)
  })
})
