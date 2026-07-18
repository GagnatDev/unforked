import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
import {
  getPushSubscription,
  isIosSafariNotInstalled,
  isPushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  urlBase64ToUint8Array,
} from './push'

const vapidKey = vi.mocked(api.push.vapidKey)
const apiSubscribe = vi.mocked(api.push.subscribe)
const apiUnsubscribe = vi.mocked(api.push.unsubscribe)

interface FakeSubscription {
  endpoint: string
  toJSON: () => { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  unsubscribe: ReturnType<typeof vi.fn>
}

function fakeSubscription(endpoint: string): FakeSubscription {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'client-p256dh', auth: 'client-auth' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

let currentSubscription: FakeSubscription | null
const pushManager = {
  getSubscription: vi.fn(() => Promise.resolve(currentSubscription)),
  subscribe: vi.fn((_opts: unknown) => {
    currentSubscription = fakeSubscription('https://push.example/device-1')
    return Promise.resolve(currentSubscription)
  }),
}

function definePushGlobals(): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager }), addEventListener: vi.fn() },
    configurable: true,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', {
    permission: 'default',
    requestPermission: vi.fn().mockResolvedValue('granted'),
  })
}

beforeEach(() => {
  currentSubscription = null
  definePushGlobals()
  vapidKey.mockResolvedValue({ publicKey: 'AQIDBA' }) // url-safe base64 of [1,2,3,4]
  apiSubscribe.mockResolvedValue({ id: 'sub-1', endpoint: '', locale: 'en' })
  apiUnsubscribe.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('urlBase64ToUint8Array', () => {
  it('decodes URL-safe base64 without padding', () => {
    // "AQIDBA" is base64url for bytes 1,2,3,4 (needs re-padding to decode).
    expect(Array.from(urlBase64ToUint8Array('AQIDBA'))).toEqual([1, 2, 3, 4])
  })

  it('maps the URL-safe alphabet back to standard base64', () => {
    // 0xfb 0xef 0xbe encodes to "----" in base64url ("++++" in standard).
    expect(Array.from(urlBase64ToUint8Array('----'))).toEqual([0xfb, 0xef, 0xbe])
  })
})

describe('isPushSupported / isIosSafariNotInstalled', () => {
  it('is supported with serviceWorker + PushManager + Notification present', () => {
    expect(isPushSupported()).toBe(true)
  })

  it('is unsupported without PushManager', () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('Notification', { permission: 'default' })
    expect(isPushSupported()).toBe(false)
  })

  it('gates non-installed iOS Safari, but not an installed PWA or desktop', () => {
    const iphoneUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1'
    Object.defineProperty(navigator, 'userAgent', { value: iphoneUa, configurable: true })
    expect(isIosSafariNotInstalled()).toBe(true)

    // Home-Screen-installed: navigator.standalone is true.
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })
    expect(isIosSafariNotInstalled()).toBe(false)
    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true })

    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120.0',
      configurable: true,
    })
    expect(isIosSafariNotInstalled()).toBe(false)
  })
})

describe('subscribeToPush', () => {
  it('prompts, subscribes with the decoded VAPID key, and registers with the backend', async () => {
    const result = await subscribeToPush('nb')
    expect(result).toBe('subscribed')

    expect(Notification.requestPermission).toHaveBeenCalledOnce()
    expect(pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    })
    const call = pushManager.subscribe.mock.calls[0][0] as {
      applicationServerKey: Uint8Array
    }
    expect(Array.from(call.applicationServerKey)).toEqual([1, 2, 3, 4])

    expect(apiSubscribe).toHaveBeenCalledWith(
      {
        endpoint: 'https://push.example/device-1',
        keys: { p256dh: 'client-p256dh', auth: 'client-auth' },
      },
      'nb'
    )
  })

  it('returns denied (without subscribing) when the permission is not granted', async () => {
    vi.mocked(Notification.requestPermission).mockResolvedValue('denied')
    expect(await subscribeToPush('en')).toBe('denied')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(apiSubscribe).not.toHaveBeenCalled()
  })

  it('returns unavailable when the server has no VAPID key (404)', async () => {
    vapidKey.mockRejectedValue(new Error('HTTP 404'))
    expect(await subscribeToPush('en')).toBe('unavailable')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('rolls back a browser subscription the server cannot use', async () => {
    pushManager.subscribe.mockImplementationOnce(() => {
      currentSubscription = {
        ...fakeSubscription('https://push.example/broken'),
        toJSON: () => ({ endpoint: 'https://push.example/broken' }), // no keys
      }
      return Promise.resolve(currentSubscription)
    })
    expect(await subscribeToPush('en')).toBe('unavailable')
    expect(currentSubscription?.unsubscribe).toHaveBeenCalledOnce()
    expect(apiSubscribe).not.toHaveBeenCalled()
  })
})

describe('unsubscribeFromPush', () => {
  it('drops the browser subscription first, then the server row', async () => {
    currentSubscription = fakeSubscription('https://push.example/device-1')
    const sub = currentSubscription
    await unsubscribeFromPush()
    expect(sub.unsubscribe).toHaveBeenCalledOnce()
    expect(apiUnsubscribe).toHaveBeenCalledWith('https://push.example/device-1')
  })

  it('is a no-op without a subscription', async () => {
    await unsubscribeFromPush()
    expect(apiUnsubscribe).not.toHaveBeenCalled()
  })
})

describe('getPushSubscription', () => {
  it('returns the registration subscription when present', async () => {
    currentSubscription = fakeSubscription('https://push.example/device-1')
    expect(await getPushSubscription()).toBe(currentSubscription)
  })

  it('returns null when push is unsupported', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('Notification', { permission: 'default' })
    expect(await getPushSubscription()).toBeNull()
  })
})
