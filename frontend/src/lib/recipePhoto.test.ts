import { describe, expect, it } from 'vitest'
import { fitWithin } from './recipePhoto'

describe('fitWithin', () => {
  it('leaves images already within the bound untouched', () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('never upscales small images', () => {
    expect(fitWithin(100, 50, 320)).toEqual({ width: 100, height: 50 })
  })

  it('scales landscape images by width', () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('scales portrait images by height', () => {
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 })
  })

  it('keeps at least one pixel on extreme aspect ratios', () => {
    expect(fitWithin(10000, 1, 320).height).toBe(1)
    expect(fitWithin(10000, 1, 320).width).toBe(320)
  })
})
