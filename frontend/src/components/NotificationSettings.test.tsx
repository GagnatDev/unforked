import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/api', () => ({
  api: {
    push: {
      vapidKey: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      sendTest: vi.fn(),
    },
  },
}))

import { api } from '@/api'
import { startPushMessages } from '@/lib/pushMessages'
import { NotificationSettings } from './NotificationSettings'

const vapidKey = vi.mocked(api.push.vapidKey)
const apiSubscribe = vi.mocked(api.push.subscribe)
const apiUnsubscribe = vi.mocked(api.push.unsubscribe)
const sendTest = vi.mocked(api.push.sendTest)

interface FakeSubscription {
  endpoint: string
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } }
  unsubscribe: ReturnType<typeof vi.fn>
}

function fakeSubscription(endpoint: string): FakeSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh', auth: 'auth' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

let currentSubscription: FakeSubscription | null
type MessageHandler = (event: { data: unknown }) => void
let emitSwMessage: MessageHandler

const pushManager = {
  getSubscription: vi.fn(() => Promise.resolve(currentSubscription)),
  subscribe: vi.fn(() => {
    currentSubscription = fakeSubscription('https://push.example/device-1')
    return Promise.resolve(currentSubscription)
  }),
}

function definePushGlobals(): void {
  const handlers: MessageHandler[] = []
  Object.defineProperty(navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve({ pushManager }),
      addEventListener: (_type: string, fn: MessageHandler) => handlers.push(fn),
    },
    configurable: true,
  })
  emitSwMessage = (event) => handlers.forEach((fn) => fn(event))
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  })
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0',
    configurable: true,
  })
}

beforeEach(() => {
  currentSubscription = null
  definePushGlobals()
  vapidKey.mockResolvedValue({ publicKey: 'AQIDBA' })
  apiSubscribe.mockResolvedValue({ id: 'sub-1', endpoint: '', locale: 'en' })
  apiUnsubscribe.mockResolvedValue(undefined)
  sendTest.mockResolvedValue({ sent: 1, pruned: 0, failed: 0 })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('NotificationSettings', () => {
  it('renders nothing when the browser has no web push', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('Notification', { permission: 'default' })
    const { container } = render(<NotificationSettings />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the Home-Screen install hint on non-installed iOS Safari', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      configurable: true,
    })
    render(<NotificationSettings />)
    expect(await screen.findByText(/add the app to your Home Screen/)).toBeDefined()
    expect(screen.queryByRole('button', { name: 'Enable on this device' })).toBeNull()
  })

  it('enables on explicit tap: permission, subscribe, locale registration', async () => {
    render(<NotificationSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Enable on this device' }))

    await screen.findByText('Notifications are enabled on this device.')
    expect(Notification.requestPermission).toHaveBeenCalledOnce()
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    })
    expect(apiSubscribe).toHaveBeenCalledWith(
      { endpoint: 'https://push.example/device-1', keys: { p256dh: 'p256dh', auth: 'auth' } },
      'en'
    )
    expect(screen.getByRole('button', { name: 'Send test notification' })).toBeDefined()
  })

  it('shows the blocked message when the permission is denied', async () => {
    vi.mocked(Notification.requestPermission).mockResolvedValue('denied')
    render(<NotificationSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Enable on this device' }))
    await screen.findByText(/blocked for this app/)
    expect(apiSubscribe).not.toHaveBeenCalled()
  })

  it('shows unavailable when the server has no VAPID keys', async () => {
    vapidKey.mockRejectedValue(new Error('HTTP 404'))
    render(<NotificationSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Enable on this device' }))
    await screen.findByText(/not available right now/)
  })

  it('disables cleanly from the enabled state', async () => {
    currentSubscription = fakeSubscription('https://push.example/device-1')
    const sub = currentSubscription
    render(<NotificationSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Disable' }))

    await screen.findByRole('button', { name: 'Enable on this device' })
    expect(sub.unsubscribe).toHaveBeenCalledOnce()
    expect(apiUnsubscribe).toHaveBeenCalledWith('https://push.example/device-1')
  })

  it('sends a test push and reports the outcome', async () => {
    currentSubscription = fakeSubscription('https://push.example/device-1')
    render(<NotificationSettings />)

    fireEvent.click(await screen.findByRole('button', { name: 'Send test notification' }))
    await screen.findByText('Test notification sent.')

    sendTest.mockResolvedValue({ sent: 0, pruned: 1, failed: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Send test notification' }))
    await screen.findByText(/Nothing was sent/)
  })

  it('surfaces a focused-window push in-page (SW suppressed the notification)', async () => {
    currentSubscription = fakeSubscription('https://push.example/device-1')
    startPushMessages()
    render(<NotificationSettings />)
    await screen.findByText('Notifications are enabled on this device.')

    emitSwMessage({
      data: {
        type: 'push',
        payload: { title: 'Test notification', body: 'It works.', url: '/shopping-list' },
      },
    })

    await waitFor(() => {
      expect(screen.getByText('It works.')).toBeDefined()
    })
    expect(screen.getByText(/shows here instead of as a system notification/)).toBeDefined()
  })
})
