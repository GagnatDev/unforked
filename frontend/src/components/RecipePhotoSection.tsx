import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { api, recipePhotoUrl, uploadPhotoBlob } from '@/api'
import { Button } from '@/components/ui/button'
import { compressRecipePhoto } from '@/lib/recipePhoto'
import { setRecipePhoto } from '@/local/mutations'
import type { RecipePhoto } from '@/types'

interface RecipePhotoSectionProps {
  recipeId: string
  /** Current photo from the form's doc; null/undefined when the recipe has none. */
  photo: RecipePhoto | null | undefined
  /** Fired after a successful attach/remove so the form doc stays in sync. */
  onPhotoChange: (photo: RecipePhoto | null) => void
  /** Alt text for the rendered photo (the recipe name). */
  alt: string
}

/**
 * Photo management on the recipe page: take a new photo with the phone camera
 * (`capture` input) or pick one from the gallery, compress it client-side,
 * upload straight to the bucket via presigned PUTs, then attach it to the
 * recipe. Renders nothing when the backend has no bucket configured (dev) —
 * availability is probed once per mount, mirroring the web-push pattern.
 */
export function RecipePhotoSection({ recipeId, photo, onPhotoChange, alt }: RecipePhotoSectionProps) {
  const { t } = useTranslation()
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState<'uploading' | 'removing' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    api.recipePhotos
      .availability()
      .then((r) => {
        if (!cancelled) setAvailable(r.available)
      })
      .catch(() => {
        // Offline or older backend: photos just aren't offered.
        if (!cancelled) setAvailable(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!available) return null

  const handleFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0]
    // Reset so picking the same file again re-fires the change event.
    input.value = ''
    if (!file) return
    setBusy('uploading')
    setError(null)
    try {
      const compressed = await compressRecipePhoto(file)
      const target = await api.recipePhotos.mintUploads(recipeId, compressed.contentType)
      if (compressed.full.size > target.maxBytes || compressed.thumb.size > target.maxBytes) {
        throw new Error(t('recipeForm.photoTooLarge'))
      }
      await Promise.all([
        uploadPhotoBlob(target.uploadUrl, compressed.full, target.headers),
        uploadPhotoBlob(target.thumbUploadUrl, compressed.thumb, target.headers),
      ])
      const recipe = await setRecipePhoto(recipeId, {
        key: target.key,
        thumbKey: target.thumbKey,
      })
      onPhotoChange(recipe.doc.photo ?? null)
    } catch (e) {
      setError((e as Error).message || t('recipeForm.photoUploadFailed'))
    } finally {
      setBusy(null)
    }
  }

  const handleRemove = async () => {
    if (!confirm(t('recipeForm.photoRemoveConfirm'))) return
    setBusy('removing')
    setError(null)
    try {
      await setRecipePhoto(recipeId, null)
      onPhotoChange(null)
    } catch (e) {
      setError((e as Error).message || t('recipeForm.photoUploadFailed'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mb-4">
      <p className="mb-2 block font-medium">{t('recipeForm.photo')}</p>
      {photo && (
        <img
          src={recipePhotoUrl(recipeId, 'full', photo.key)}
          crossOrigin="anonymous"
          alt={alt}
          className="mb-2 w-full max-w-md rounded-lg border border-border object-cover"
        />
      )}
      {/* `capture` opens the camera directly on phones; the plain input opens the gallery/file picker. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="photo-camera-input"
        onChange={(e) => void handleFile(e.currentTarget)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="photo-gallery-input"
        onChange={(e) => void handleFile(e.currentTarget)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => cameraInputRef.current?.click()}
        >
          {t('recipeForm.photoTake')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy !== null}
          onClick={() => galleryInputRef.current?.click()}
        >
          {t('recipeForm.photoChoose')}
        </Button>
        {photo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => void handleRemove()}
          >
            {t('recipeForm.photoRemove')}
          </Button>
        )}
      </div>
      {busy === 'uploading' && (
        <p className="mt-2 text-sm text-muted-foreground">{t('recipeForm.photoUploading')}</p>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
