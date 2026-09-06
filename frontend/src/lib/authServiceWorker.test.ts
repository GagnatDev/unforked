import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('routes live identity probes (including unique queries) NetworkOnly before cached settings', () => {
  const config = readFileSync('vite.config.ts', 'utf8')
  const rule = config.match(/urlPattern: (\/[^\n]+auth[^\n]+\/),\s*handler: 'NetworkOnly'/)
  expect(rule).not.toBeNull()
  const pattern = new RegExp(rule![1].slice(1, -1))
  expect(pattern.test('https://app.example/api/auth/me?probe=unique')).toBe(true)
  expect(pattern.test('https://app.example/api/auth/me')).toBe(true)
  expect(config.indexOf(rule![0])).toBeLessThan(config.indexOf('api\\/(users|family)'))
  expect(config).not.toContain('(auth|users|family)')
  expect(config).not.toContain('ignoreSearch: true')
})
