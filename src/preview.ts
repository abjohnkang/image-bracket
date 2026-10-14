// Lightweight previews for the setup grid. The original file is never
// changed; matches and the winner screen use it directly.

export const PREVIEW_SHORT_SIDE = 480 // covers the largest setup tiles at 2x density
export const PREVIEW_MAX_LONG_SIDE = 1920 // keeps extreme panoramas small
export const PREVIEW_QUALITY = 0.82
const PREVIEW_BACKGROUND = '#14121b' // --color-surface, shown behind transparency

export interface PreparedImage {
  url: string // the untouched original
  previewUrl: string
}

// Scales so the short side is at most PREVIEW_SHORT_SIDE and the long side at
// most PREVIEW_MAX_LONG_SIDE, keeping the aspect ratio. Never enlarges.
export function getPreviewSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const scale = Math.min(
    1,
    PREVIEW_SHORT_SIDE / Math.min(width, height),
    PREVIEW_MAX_LONG_SIDE / Math.max(width, height),
  )
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

// Decodes the file (rejecting if it cannot be displayed) and creates both the
// original and preview URLs. URLs are only created once everything succeeded.
export async function prepareImage(file: File): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image', // apply phone-camera rotation
  })
  const canvas = document.createElement('canvas')
  try {
    const { width, height } = getPreviewSize(bitmap.width, bitmap.height)
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D canvas is not available')
    context.fillStyle = PREVIEW_BACKGROUND
    context.fillRect(0, 0, width, height)
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, 0, 0, width, height)
  } finally {
    bitmap.close() // free the full-size decode right away
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', PREVIEW_QUALITY),
  )
  if (!blob) throw new Error('Could not encode the preview')

  return {
    url: URL.createObjectURL(file),
    previewUrl: URL.createObjectURL(blob),
  }
}

export function releasePreparedImage(image: PreparedImage) {
  URL.revokeObjectURL(image.url)
  URL.revokeObjectURL(image.previewUrl)
}
