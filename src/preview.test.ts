import { describe, expect, it } from 'vitest'
import {
  PREVIEW_MAX_LONG_SIDE,
  PREVIEW_SHORT_SIDE,
  getPreviewSize,
} from './preview'

describe('getPreviewSize', () => {
  it('scales a landscape phone photo to 480 on the short side', () => {
    expect(getPreviewSize(4032, 3024)).toEqual({ width: 640, height: 480 })
  })

  it('scales a portrait phone photo to 480 on the short side', () => {
    expect(getPreviewSize(3024, 4032)).toEqual({ width: 480, height: 640 })
  })

  it('scales a large square image to 480 × 480', () => {
    expect(getPreviewSize(2000, 2000)).toEqual({ width: 480, height: 480 })
  })

  it.each([
    [300, 200],
    [480, 480],
    [480, 1000],
    [1, 1],
  ])('never enlarges a %i × %i image', (width, height) => {
    expect(getPreviewSize(width, height)).toEqual({ width, height })
  })

  it('keeps a wide image whose short side is already small', () => {
    expect(getPreviewSize(1800, 300)).toEqual({ width: 1800, height: 300 })
  })

  it('caps the long side of an extreme panorama', () => {
    const size = getPreviewSize(12000, 1000)
    expect(size).toEqual({ width: PREVIEW_MAX_LONG_SIDE, height: 160 })
  })

  it('caps the long side of an extremely tall image', () => {
    const size = getPreviewSize(1000, 12000)
    expect(size).toEqual({ width: 160, height: PREVIEW_MAX_LONG_SIDE })
  })

  it.each([
    [4032, 3024],
    [3024, 4032],
    [5000, 2813],
    [1234, 4567],
    [12000, 1000],
  ])('preserves the aspect ratio of %i × %i', (width, height) => {
    const size = getPreviewSize(width, height)
    // The width matches the original proportions to within one pixel.
    expect(
      Math.abs(size.width - (size.height * width) / height),
    ).toBeLessThanOrEqual(1)
    expect(Math.min(size.width, size.height)).toBeLessThanOrEqual(
      PREVIEW_SHORT_SIDE,
    )
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(
      PREVIEW_MAX_LONG_SIDE,
    )
  })

  it('never produces a zero-sized side', () => {
    const size = getPreviewSize(100000, 10)
    expect(size.width).toBe(PREVIEW_MAX_LONG_SIDE)
    expect(size.height).toBe(1)
  })
})
