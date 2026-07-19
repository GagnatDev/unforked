/**
 * Client-side recipe photo compression. Photos go straight from the browser to
 * the bucket (presigned PUT), so shrinking happens here: the camera's 4000px+
 * multi-MB original becomes a ~1600px JPEG plus a small list thumbnail —
 * typically a 10–20× storage saving before anything is uploaded.
 */

export const PHOTO_CONTENT_TYPE = 'image/jpeg'

const FULL_MAX_PX = 1600
const FULL_QUALITY = 0.82
const THUMB_MAX_PX = 320
const THUMB_QUALITY = 0.75

export interface CompressedRecipePhoto {
  full: Blob
  thumb: Blob
  contentType: typeof PHOTO_CONTENT_TYPE
}

/** Scale (w, h) to fit within `max` on the longest side; never upscales. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const scale = max / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  // Preferred: honors EXIF orientation, so portrait phone shots stay upright.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Fall through to the <img> decoder (e.g. HEIC unsupported by bitmap path).
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function sourceSize(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  return { width: source.width, height: source.height }
}

function encode(
  source: ImageBitmap | HTMLImageElement,
  maxPx: number,
  quality: number,
): Promise<Blob> {
  const { width, height } = sourceSize(source)
  const target = fitWithin(width, height, maxPx)
  const canvas = document.createElement('canvas')
  canvas.width = target.width
  canvas.height = target.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D is not supported in this browser')
  // JPEG has no alpha: flatten onto white instead of default black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, target.width, target.height)
  ctx.drawImage(source, 0, 0, target.width, target.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Failed to encode the photo')),
      PHOTO_CONTENT_TYPE,
      quality,
    )
  })
}

/** Decode + downscale a picked/captured image into upload-ready blobs. */
export async function compressRecipePhoto(file: Blob): Promise<CompressedRecipePhoto> {
  const source = await decodeImage(file)
  try {
    const { width, height } = sourceSize(source)
    if (width === 0 || height === 0) throw new Error('Could not read the selected image')
    const full = await encode(source, FULL_MAX_PX, FULL_QUALITY)
    const thumb = await encode(source, THUMB_MAX_PX, THUMB_QUALITY)
    return { full, thumb, contentType: PHOTO_CONTENT_TYPE }
  } finally {
    if ('close' in source) source.close()
  }
}
