import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('routes live identity probes (including unique queries) NetworkOnly before server settings', () => {
  const config = readFileSync('vite.config.ts', 'utf8')
  const rule = config.match(/urlPattern: (\/[^\n]+auth[^\n]+\/),\s*handler: 'NetworkOnly'/)
  expect(rule).not.toBeNull()
  const pattern = new RegExp(rule![1].slice(1, -1))
  expect(pattern.test('https://app.example/api/auth/me?probe=unique')).toBe(true)
  expect(pattern.test('https://app.example/api/auth/me')).toBe(true)
  expect(config.indexOf(rule![0])).toBeLessThan(config.indexOf('api\\/(users|family|api-keys)'))
  expect(config).not.toContain('(auth|users|family)')
  expect(config).not.toContain('ignoreSearch: true')
})

it('never caches invitation tokens or API keys and removes the legacy cache on activation', () => {
  const config = readFileSync('vite.config.ts', 'utf8')
  const rule = config.match(/urlPattern: (\/[^\n]+users[^\n]+\/),\s*handler: 'NetworkOnly'/)
  expect(rule).not.toBeNull()
  const pattern = new RegExp(rule![1].slice(1, -1))
  expect(pattern.test('https://app.example/api/family?probe=unique')).toBe(true)
  expect(pattern.test('https://app.example/api/api-keys')).toBe(true)
  expect(config).not.toContain("handler: 'NetworkFirst'")
  expect(config).toContain("'settings-cache-cleanup-sw.js'")
  const cleanup = readFileSync('public/settings-cache-cleanup-sw.js', 'utf8')
  expect(cleanup).toContain("addEventListener('activate'")
  expect(cleanup).toContain("event.waitUntil(caches.delete('api-auth-sensitive'))")
})
