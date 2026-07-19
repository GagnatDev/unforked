import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

vi.mock('@/api', () => ({
  api: {
    recipePhotos: {
      availability: vi.fn(),
      mintUploads: vi.fn(),
      attach: vi.fn(),
      remove: vi.fn(),
    },
  },
  recipePhotoUrl: (id: string, variant: string, key: string) =>
    `/api/recipes/${id}/photo/${variant}?v=${encodeURIComponent(key)}`,
  uploadPhotoBlob: vi.fn(),
}))

vi.mock('@/lib/recipePhoto', () => ({
  compressRecipePhoto: vi.fn(),
}))

vi.mock('@/local/mutations', () => ({
  setRecipePhoto: vi.fn(),
}))

import { api, uploadPhotoBlob } from '@/api'
import { compressRecipePhoto } from '@/lib/recipePhoto'
import { setRecipePhoto } from '@/local/mutations'
import type { Recipe } from '@/types'
import { RecipePhotoSection } from './RecipePhotoSection'

const availability = vi.mocked(api.recipePhotos.availability)
const mintUploads = vi.mocked(api.recipePhotos.mintUploads)
const upload = vi.mocked(uploadPhotoBlob)
const compress = vi.mocked(compressRecipePhoto)
const setPhoto = vi.mocked(setRecipePhoto)

const RECIPE_ID = '11111111-2222-3333-4444-555555555555'
const KEYS = {
  key: `recipes/${RECIPE_ID}/u1-full.jpg`,
  thumbKey: `recipes/${RECIPE_ID}/u1-thumb.jpg`,
}

function renderSection(photo: { key: string; thumbKey: string } | null = null) {
  const onPhotoChange = vi.fn()
  render(
    <RecipePhotoSection recipeId={RECIPE_ID} photo={photo} onPhotoChange={onPhotoChange} alt="Pancakes" />,
  )
  return { onPhotoChange }
}

beforeEach(() => {
  vi.clearAllMocks()
  availability.mockResolvedValue({ available: true })
})

afterEach(cleanup)

describe('RecipePhotoSection', () => {
  it('renders nothing when photo storage is unavailable', async () => {
    availability.mockResolvedValue({ available: false })
    renderSection()
    await waitFor(() => expect(availability).toHaveBeenCalled())
    expect(screen.queryByText('Take photo')).toBeNull()
  })

  it('renders nothing while offline (availability probe fails)', async () => {
    availability.mockRejectedValue(new Error('offline'))
    renderSection()
    await waitFor(() => expect(availability).toHaveBeenCalled())
    expect(screen.queryByText('Take photo')).toBeNull()
  })

  it('shows camera and gallery buttons once storage is available', async () => {
    renderSection()
    expect(await screen.findByText('Take photo')).toBeTruthy()
    expect(screen.getByText('Choose from gallery')).toBeTruthy()
    // No photo yet: nothing to remove or render.
    expect(screen.queryByText('Remove photo')).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('renders the current photo and a remove button', async () => {
    renderSection(KEYS)
    const img = (await screen.findByAltText('Pancakes')) as HTMLImageElement
    expect(img.src).toContain(`/api/recipes/${RECIPE_ID}/photo/full`)
    expect(img.src).toContain(encodeURIComponent(KEYS.key))
    expect(screen.getByText('Remove photo')).toBeTruthy()
  })

  it('compresses, uploads both variants to presigned URLs, then attaches', async () => {
    const full = new Blob(['full'], { type: 'image/jpeg' })
    const thumb = new Blob(['thumb'], { type: 'image/jpeg' })
    compress.mockResolvedValue({ full, thumb, contentType: 'image/jpeg' })
    mintUploads.mockResolvedValue({
      ...KEYS,
      uploadUrl: 'https://bucket.test/full',
      thumbUploadUrl: 'https://bucket.test/thumb',
      headers: { 'Content-Type': 'image/jpeg' },
      maxBytes: 10_000_000,
    })
    upload.mockResolvedValue(undefined)
    const attached: Recipe = {
      id: RECIPE_ID,
      doc: {
        name: 'Pancakes',
        description: '',
        sourceUrl: null,
        sourceName: null,
        ingredients: [],
        steps: [],
        servings: 4,
        tags: [],
        photo: KEYS,
      },
      version: 2,
    }
    setPhoto.mockResolvedValue(attached)

    const { onPhotoChange } = renderSection()
    await screen.findByText('Take photo')
    const file = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('photo-gallery-input'), { target: { files: [file] } })

    await waitFor(() => expect(onPhotoChange).toHaveBeenCalledWith(KEYS))
    expect(compress).toHaveBeenCalledWith(file)
    expect(mintUploads).toHaveBeenCalledWith(RECIPE_ID, 'image/jpeg')
    expect(upload).toHaveBeenCalledWith('https://bucket.test/full', full, {
      'Content-Type': 'image/jpeg',
    })
    expect(upload).toHaveBeenCalledWith('https://bucket.test/thumb', thumb, {
      'Content-Type': 'image/jpeg',
    })
    expect(setPhoto).toHaveBeenCalledWith(RECIPE_ID, KEYS)
  })

  it('surfaces upload failures without attaching', async () => {
    compress.mockResolvedValue({
      full: new Blob(['full']),
      thumb: new Blob(['thumb']),
      contentType: 'image/jpeg',
    })
    mintUploads.mockResolvedValue({
      ...KEYS,
      uploadUrl: 'https://bucket.test/full',
      thumbUploadUrl: 'https://bucket.test/thumb',
      headers: {},
      maxBytes: 10_000_000,
    })
    upload.mockRejectedValue(new Error('Photo upload failed (HTTP 403)'))

    renderSection()
    await screen.findByText('Take photo')
    const file = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByTestId('photo-camera-input'), { target: { files: [file] } })

    expect(await screen.findByText('Photo upload failed (HTTP 403)')).toBeTruthy()
    expect(setPhoto).not.toHaveBeenCalled()
  })

  it('removes the photo after confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true))
    const detached: Recipe = {
      id: RECIPE_ID,
      doc: {
        name: 'Pancakes',
        description: '',
        sourceUrl: null,
        sourceName: null,
        ingredients: [],
        steps: [],
        servings: 4,
        tags: [],
        photo: null,
      },
      version: 3,
    }
    setPhoto.mockResolvedValue(detached)

    const { onPhotoChange } = renderSection(KEYS)
    fireEvent.click(await screen.findByText('Remove photo'))

    await waitFor(() => expect(onPhotoChange).toHaveBeenCalledWith(null))
    expect(setPhoto).toHaveBeenCalledWith(RECIPE_ID, null)
    vi.unstubAllGlobals()
  })
})
